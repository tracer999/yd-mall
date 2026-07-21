/*
 * 견적 → 주문 전환 (설계 §8.3).
 *
 * ⚠️ **현재 상품 가격을 다시 조회하지 않는다.** 확정된 견적 내용을 주문 스냅샷으로 복사한다.
 *    협상 결과가 절대적이며, 전환 시점에 상품가가 올랐든 내렸든 합의가를 청구한다(§17.3 예외).
 *
 * ⚠️ **중복 전환 방지.** 트랜잭션 안에서 견적 행을 `FOR UPDATE` 로 잠근 뒤 전환 여부를 본다.
 *    같은 견적으로 주문이 두 번 생기면 재고가 두 배로 빠지고 거래처는 한 번만 입금한다.
 */

const pool = require('../../config/db');
const skuService = require('../catalog/skuService');
const b2bTaxService = require('../b2b/b2bTaxService');
const b2bOrderService = require('../b2b/b2bOrderService');
const statusService = require('./quoteStatusService');

/** 전환 가능 여부를 미리 본다(버튼 노출·사전 안내용). */
async function checkConvertible(quoteId) {
    const [[q]] = await pool.query(
        `SELECT q.*, bp.status AS profile_status
           FROM quote q JOIN business_profile bp ON bp.id = q.business_profile_id
          WHERE q.id = ?`, [quoteId]
    );
    if (!q) return { ok: false, error: '견적을 찾을 수 없습니다.' };
    if (q.converted_order_id) return { ok: false, error: '이미 주문으로 전환된 견적입니다.' };
    if (!statusService.ACCEPTED.has(q.status)) return { ok: false, error: '수락된 견적만 주문으로 전환할 수 있습니다.' };
    if (q.profile_status !== 'APPROVED') return { ok: false, error: '거래처가 승인 상태가 아닙니다.' };

    const today = new Date().toISOString().slice(0, 10);
    if (q.valid_until && String(q.valid_until).slice(0, 10) < today) {
        return { ok: false, error: '견적 유효기간이 지났습니다.' };
    }

    const [items] = await pool.query('SELECT * FROM quote_item WHERE quote_id = ?', [quoteId]);
    if (items.length === 0) return { ok: false, error: '견적 품목이 없습니다.' };
    if (items.some((i) => i.final_unit_price == null)) {
        return { ok: false, error: '확정 단가가 없는 품목이 있습니다. 다시 수락해 주세요.' };
    }
    return { ok: true, quote: q, items };
}

/**
 * 견적을 주문으로 전환한다.
 *
 * 만들어지는 주문은 **접수 상태**(status=PENDING, approval=REQUESTED)다.
 * 견적이 합의됐다고 재고를 잡지 않는다 — 재고는 판매자 승인 시점에 차감한다(§7.3).
 *
 * @param {number} quoteId
 * @param {{ actor:'BUYER'|'SELLER', actorId:number, receiver:object }} opts
 * @returns {Promise<{ok:boolean, orderId?:number, orderNumber?:string, error?:string}>}
 */
async function convert(quoteId, { actor, actorId, receiver = {} }) {
    const pre = await checkConvertible(quoteId);
    if (!pre.ok) return pre;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        /*
         * 잠금 먼저 — 견적 행을 FOR UPDATE 로 잡는다.
         *
         * 동시에 두 번 눌러도 뒤에 온 트랜잭션은 여기서 대기했다가, 앞이 커밋한 뒤
         * converted_order_id 가 채워진 것을 보고 물러난다. 이 검사가 잠금 **안**에 있어야
         * 의미가 있다(밖에서 본 값은 이미 낡았을 수 있다).
         *
         * ⚠️ 예전엔 `SET converted_order_id = 0` 조건부 UPDATE 로 선점하려 했는데,
         *    이 컬럼은 orders(id) 를 참조하는 FK 라 0 을 넣는 순간 제약 위반이 난다.
         */
        const [[quote]] = await conn.query(
            `SELECT q.*, bp.id AS profile_id
               FROM quote q JOIN business_profile bp ON bp.id = q.business_profile_id
              WHERE q.id = ? FOR UPDATE`, [quoteId]
        );
        if (!quote) {
            await conn.rollback();
            return { ok: false, error: '견적을 찾을 수 없습니다.' };
        }
        if (quote.converted_order_id != null || quote.status === 'CONVERTED_TO_ORDER') {
            await conn.rollback();
            return { ok: false, error: '이미 주문으로 전환되었습니다.' };
        }
        const [items] = await conn.query('SELECT * FROM quote_item WHERE quote_id = ? ORDER BY display_order, id', [quoteId]);

        // 재고 가용성 확인 — 부족해도 주문은 만든다(접수 단계). 승인 때 다시 본다.
        // 여기서는 판매 SKU 만 확정한다.
        const lines = [];
        for (const it of items) {
            const sku = await skuService.resolveSkuForLine(it.product_id, it.sku_id);
            lines.push({
                ...it,
                sku_id: sku ? sku.id : it.sku_id,
                price: Number(it.final_unit_price),
                quantity: it.quantity,
                tax_type: it.tax_type_snapshot,
            });
        }

        const tax = b2bTaxService.calcOrderTax(lines);
        const shipping = Number(quote.shipping_amount) || 0;
        const discount = Number(quote.discount_amount) || 0;
        const subtotal = tax.grossAmount;
        const total = Math.max(0, subtotal + shipping - discount);

        const orderNumber = b2bOrderService.generateB2bOrderNumber();
        const [ins] = await conn.query(
            `INSERT INTO orders
                (user_id, mall_id, order_number, status, payment_status, order_type,
                 subtotal_amount, shipping_fee, coupon_discount, total_amount,
                 supply_amount, vat_amount, tax_free_amount,
                 receiver_name, receiver_phone, receiver_zipcode, receiver_address, receiver_detailed_address,
                 shipping_address, shipping_message)
             VALUES (?,?,?, 'PENDING','PENDING','B2B',
                     ?,?,?,?,
                     ?,?,?,
                     ?,?,?,?,?,
                     ?,?)`,
            [quote.requested_by, quote.mall_id, orderNumber,
                subtotal, shipping, discount, total,
                tax.supplyAmount, tax.vatAmount, tax.taxFreeAmount,
                receiver.receiver_name || null, receiver.receiver_phone || null,
                receiver.receiver_zipcode || null, receiver.receiver_address || null,
                receiver.receiver_detailed_address || null,
                [receiver.receiver_address, receiver.receiver_detailed_address].filter(Boolean).join(' ') || null,
                receiver.shipping_message || null]
        );
        const orderId = ins.insertId;

        for (let i = 0; i < lines.length; i += 1) {
            const l = lines[i];
            await conn.query(
                `INSERT INTO order_items
                    (order_id, product_id, sku_id, product_name, option_snapshot, product_price, quantity, total_price,
                     source_type, source_id, supply_price, vat_price, price_source, list_price)
                 VALUES (?,?,?,?,?,?,?,?, 'QUOTE', ?, ?,?, 'NEGOTIATED_QUOTE', ?)`,
                [orderId, l.product_id, l.sku_id || null, l.product_name_snapshot, l.sku_snapshot || null,
                    l.price, l.quantity, l.price * l.quantity,
                    quoteId, tax.lines[i].supplyPrice, tax.lines[i].vatPrice, l.catalog_unit_price]
            );
        }

        await conn.query(
            `INSERT INTO b2b_order_detail
                (order_id, business_profile_id, quote_id, quote_revision, requested_delivery_date,
                 approval_status, payment_terms, tax_invoice_required)
             VALUES (?,?,?,?,?, 'REQUESTED', 'PREPAY', 1)`,
            [orderId, quote.profile_id, quoteId, quote.version, quote.requested_delivery_date]
        );

        await conn.query('UPDATE quote SET converted_order_id = ? WHERE id = ?', [orderId, quoteId]);
        const st = await statusService.transition(quoteId, 'CONVERTED_TO_ORDER', { actor, conn });
        if (!st.ok) { await conn.rollback(); return st; }

        await conn.query(
            `INSERT INTO quote_revision (quote_id, revision_number, changed_by, changer_type, status_after, summary, snapshot_json)
             VALUES (?, ?, ?, ?, 'CONVERTED_TO_ORDER', ?, ?)
             ON DUPLICATE KEY UPDATE summary = VALUES(summary)`,
            [quoteId, Number(quote.version), actorId, actor, `주문 전환 (${orderNumber})`,
                JSON.stringify({ orderId, orderNumber, total })]
        );
        await conn.query('UPDATE quote SET version = version + 1 WHERE id = ?', [quoteId]);

        await conn.commit();

        b2bOrderService.notify(orderId, 'REQUESTED').catch((e) => console.warn('[quote] 전환 안내 실패:', e.message));
        return { ok: true, orderId, orderNumber };
    } catch (err) {
        // 롤백하면 잠금도 함께 풀린다 — 별도 정리가 필요 없다.
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { checkConvertible, convert };
