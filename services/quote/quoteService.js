/*
 * 견적 도메인 (설계 §8).
 *
 * 견적은 주문의 임시 상태가 아니다. 별도 객체로 살면서 두 당사자가 단가·수량·조건을
 * 주고받고, 합의되면 그 스냅샷이 주문으로 복사된다.
 *
 * 핵심 규칙 두 가지:
 *  · 금액·조건이 바뀔 때마다 **리비전**을 남긴다. 덮어쓰지 않는다(§8.2).
 *  · 메시지(quote_message)는 커뮤니케이션, 리비전(quote_revision)은 금액 변경 기록.
 *    둘을 섞으면 "얼마에 합의했는지"를 대화에서 추론해야 한다(§17.4).
 */

const pool = require('../../config/db');
const b2bTaxService = require('../b2b/b2bTaxService');
const b2bContext = require('../../middleware/b2bContext');
const statusService = require('./quoteStatusService');

/** 견적번호. 주문(ORD-/B2B-)과 눈으로 구분된다(설계 §7.5). */
function generateQuoteNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 90000) + 10000);
    return `Q-${y}${m}${d}-${rand}`;
}

/** 기본 유효기간 = 오늘 + 설정일수. */
function defaultValidUntil() {
    const d = new Date();
    d.setDate(d.getDate() + b2bContext.getSettings().quoteValidDays);
    return d.toISOString().slice(0, 10);
}

/** 라인의 현재 유효 단가 — 확정 > 제안 > 요청 > 정가 순. */
function effectiveUnitPrice(item) {
    if (item.final_unit_price != null) return Number(item.final_unit_price);
    if (item.proposed_unit_price != null) return Number(item.proposed_unit_price);
    if (item.requested_unit_price != null) return Number(item.requested_unit_price);
    return Number(item.catalog_unit_price) || 0;
}

/** 견적 + 품목 + 메시지 + 리비전 + 첨부를 한 번에. */
async function findFull(quoteId) {
    const [[quote]] = await pool.query(
        `SELECT q.*, bp.company_name, bp.business_number, bp.representative_name,
                bp.tax_invoice_email, bp.company_address, bp.company_detailed_address,
                u.name AS requester_name, u.email AS requester_email
           FROM quote q
           JOIN business_profile bp ON bp.id = q.business_profile_id
           LEFT JOIN users u ON u.id = q.requested_by
          WHERE q.id = ?`,
        [quoteId]
    );
    if (!quote) return null;

    const [items] = await pool.query(
        'SELECT * FROM quote_item WHERE quote_id = ? ORDER BY display_order ASC, id ASC', [quoteId]
    );
    const [messages] = await pool.query(
        'SELECT * FROM quote_message WHERE quote_id = ? ORDER BY created_at ASC', [quoteId]
    );
    const [revisions] = await pool.query(
        'SELECT id, revision_number, changer_type, status_after, summary, pdf_path, created_at FROM quote_revision WHERE quote_id = ? ORDER BY revision_number DESC', [quoteId]
    );
    const [attachments] = await pool.query(
        'SELECT * FROM quote_attachment WHERE quote_id = ? ORDER BY created_at ASC', [quoteId]
    );
    return { quote, items, messages, revisions, attachments };
}

/** 합계를 다시 계산해 quote 에 반영한다. 단가가 바뀔 때마다 부른다. */
async function recalcTotals(quoteId, conn = null) {
    const db = conn || pool;
    const [[q]] = await db.query('SELECT shipping_amount, discount_amount FROM quote WHERE id = ?', [quoteId]);
    const [items] = await db.query('SELECT * FROM quote_item WHERE quote_id = ?', [quoteId]);

    const catalogTotal = items.reduce((s, i) => s + Number(i.catalog_unit_price) * i.quantity, 0);
    const lines = items.map((i) => ({
        price: effectiveUnitPrice(i),
        quantity: i.quantity,
        tax_type: i.tax_type_snapshot,
    }));
    const tax = b2bTaxService.calcOrderTax(lines);

    const shipping = Number(q.shipping_amount) || 0;
    const discount = Number(q.discount_amount) || 0;
    const finalTotal = Math.max(0, tax.grossAmount + shipping - discount);

    await db.query(
        `UPDATE quote SET catalog_total = ?, proposed_total = ?, final_total = ?,
                          supply_amount = ?, vat_amount = ?, tax_free_amount = ?
          WHERE id = ?`,
        [catalogTotal, tax.grossAmount, finalTotal, tax.supplyAmount, tax.vatAmount, tax.taxFreeAmount, quoteId]
    );
    return { catalogTotal, itemsTotal: tax.grossAmount, finalTotal, tax };
}

/**
 * 리비전 기록. **금액·조건이 바뀐 시점마다** 부른다.
 * 스냅샷은 그 시점의 quote + quote_item 전체다 — 나중에 "v3 는 얼마였나"를 재구성할 수 있어야 한다.
 */
async function recordRevision(quoteId, { changedBy = null, changerType, summary = null, conn = null }) {
    const db = conn || pool;
    const [[quote]] = await db.query('SELECT * FROM quote WHERE id = ?', [quoteId]);
    const [items] = await db.query('SELECT * FROM quote_item WHERE quote_id = ? ORDER BY id ASC', [quoteId]);

    const next = Number(quote.version) || 1;
    await db.query(
        `INSERT INTO quote_revision (quote_id, revision_number, changed_by, changer_type, status_after, summary, snapshot_json)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE snapshot_json = VALUES(snapshot_json), summary = VALUES(summary), status_after = VALUES(status_after)`,
        [quoteId, next, changedBy, changerType, quote.status, summary, JSON.stringify({ quote, items })]
    );
    await db.query('UPDATE quote SET version = version + 1 WHERE id = ?', [quoteId]);
    return next;
}

/**
 * 거래처가 견적을 요청한다. 장바구니 또는 상품 상세에서 진입한다.
 *
 * 단가는 요청 시점의 **정가와 전용가**를 함께 스냅샷으로 남긴다 — 나중에 상품가가 바뀌어도
 * "무엇을 기준으로 협상했는지"가 보존된다.
 */
async function createRequest({ b2b, mallId, lines, note = null, requestedDeliveryDate = null }) {
    if (!b2b || !b2b.active) return { ok: false, error: '승인된 사업자만 견적을 요청할 수 있습니다.' };
    if (!lines || lines.length === 0) return { ok: false, error: '견적 요청할 상품이 없습니다.' };

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const quoteNumber = generateQuoteNumber();
        const [ins] = await conn.query(
            `INSERT INTO quote (mall_id, quote_number, business_profile_id, requested_by, status,
                                valid_until, requested_delivery_date)
             VALUES (?,?,?,?, 'REQUESTED', ?, ?)`,
            [mallId || 1, quoteNumber, b2b.businessProfileId, b2b.userId, defaultValidUntil(), requestedDeliveryDate]
        );
        const quoteId = ins.insertId;

        for (let i = 0; i < lines.length; i += 1) {
            const l = lines[i];
            await conn.query(
                `INSERT INTO quote_item
                    (quote_id, product_id, sku_id, product_name_snapshot, sku_snapshot, tax_type_snapshot,
                     quantity, catalog_unit_price, requested_unit_price, display_order)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [quoteId, l.productId, l.skuId || null, l.productName, l.skuLabel || null,
                    l.taxType || 'TAXABLE', l.quantity, l.catalogUnitPrice,
                    l.requestedUnitPrice != null ? l.requestedUnitPrice : null, i]
            );
        }

        await recalcTotals(quoteId, conn);
        if (note) {
            await conn.query(
                'INSERT INTO quote_message (quote_id, sender_type, sender_id, message) VALUES (?, \'BUYER\', ?, ?)',
                [quoteId, b2b.userId, note]
            );
        }
        await recordRevision(quoteId, { changedBy: b2b.userId, changerType: 'BUYER', summary: '견적 요청', conn });

        await conn.commit();
        return { ok: true, quoteId, quoteNumber };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 판매자 제안 — 품목별 단가·수량·배송비·할인·유효기간·납기를 한 번에 갱신하고 리비전을 남긴다.
 */
async function sellerPropose(quoteId, { adminId, items = [], shipping = null, discount = null,
    validUntil = null, paymentTerms = null, deliveryTerms = null, message = null }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        for (const it of items) {
            await conn.query(
                `UPDATE quote_item
                    SET proposed_unit_price = ?, quantity = ?, item_note = ?
                  WHERE id = ? AND quote_id = ?`,
                [it.proposedUnitPrice != null ? it.proposedUnitPrice : null,
                    Math.max(1, Number(it.quantity) || 1), it.note || null, it.id, quoteId]
            );
        }

        const sets = [];
        const params = [];
        if (shipping != null) { sets.push('shipping_amount = ?'); params.push(Math.max(0, Number(shipping) || 0)); }
        if (discount != null) { sets.push('discount_amount = ?'); params.push(Math.max(0, Number(discount) || 0)); }
        if (validUntil) { sets.push('valid_until = ?'); params.push(validUntil); }
        if (paymentTerms != null) { sets.push('payment_terms = ?'); params.push(paymentTerms); }
        if (deliveryTerms != null) { sets.push('delivery_terms = ?'); params.push(deliveryTerms); }
        if (sets.length) {
            await conn.query(`UPDATE quote SET ${sets.join(', ')} WHERE id = ?`, [...params, quoteId]);
        }

        await recalcTotals(quoteId, conn);
        const r = await statusService.transition(quoteId, 'SELLER_PROPOSED', { actor: 'SELLER', conn });
        if (!r.ok) { await conn.rollback(); return r; }

        if (message) {
            await conn.query(
                'INSERT INTO quote_message (quote_id, sender_type, sender_id, message) VALUES (?, \'SELLER\', ?, ?)',
                [quoteId, adminId, message]
            );
        }
        await recordRevision(quoteId, { changedBy: adminId, changerType: 'SELLER', summary: '판매자 제안', conn });

        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** 고객 재제안 — 희망 단가·수량을 다시 제시한다. */
async function buyerCounter(quoteId, { userId, items = [], message = null }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        for (const it of items) {
            await conn.query(
                `UPDATE quote_item SET requested_unit_price = ?, quantity = ? WHERE id = ? AND quote_id = ?`,
                [it.requestedUnitPrice != null ? it.requestedUnitPrice : null,
                    Math.max(1, Number(it.quantity) || 1), it.id, quoteId]
            );
        }
        // 고객이 다시 제안하면 판매자 제안가는 무효다 — 남겨 두면 유효단가 계산이 제안가를 집는다.
        await conn.query('UPDATE quote_item SET proposed_unit_price = NULL WHERE quote_id = ?', [quoteId]);

        await recalcTotals(quoteId, conn);
        const r = await statusService.transition(quoteId, 'BUYER_COUNTERED', { actor: 'BUYER', conn });
        if (!r.ok) { await conn.rollback(); return r; }

        if (message) {
            await conn.query(
                'INSERT INTO quote_message (quote_id, sender_type, sender_id, message) VALUES (?, \'BUYER\', ?, ?)',
                [quoteId, userId, message]
            );
        }
        await recordRevision(quoteId, { changedBy: userId, changerType: 'BUYER', summary: '고객 재제안', conn });

        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 수락 — 그 시점의 유효 단가를 `final_unit_price` 로 **못 박는다.**
 * 이 값이 주문 전환의 유일한 근거다(설계 §8.3).
 */
async function accept(quoteId, { actor, actorId }) {
    const to = actor === 'BUYER' ? 'BUYER_ACCEPTED' : 'SELLER_ACCEPTED';
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [items] = await conn.query('SELECT * FROM quote_item WHERE quote_id = ?', [quoteId]);
        for (const it of items) {
            await conn.query('UPDATE quote_item SET final_unit_price = ? WHERE id = ?',
                [effectiveUnitPrice(it), it.id]);
        }
        await recalcTotals(quoteId, conn);

        const r = await statusService.transition(quoteId, to, { actor, conn });
        if (!r.ok) { await conn.rollback(); return r; }

        await recordRevision(quoteId, {
            changedBy: actorId, changerType: actor,
            summary: actor === 'BUYER' ? '고객 수락 — 단가 확정' : '판매자 수락 — 단가 확정', conn,
        });
        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** 반려·취소. */
async function close(quoteId, { to, actor, actorId, reason = null }) {
    const r = await statusService.transition(quoteId, to, { actor });
    if (!r.ok) return r;
    if (reason) {
        await pool.query(
            'INSERT INTO quote_message (quote_id, sender_type, sender_id, message) VALUES (?, ?, ?, ?)',
            [quoteId, actor === 'BUYER' ? 'BUYER' : 'SELLER', actorId, reason]
        );
    }
    await recordRevision(quoteId, { changedBy: actorId, changerType: actor, summary: statusService.STATUS[to] });
    return { ok: true };
}

async function addMessage(quoteId, { senderType, senderId, message, visibility = 'ALL' }) {
    if (!message || !message.trim()) return { ok: false, error: '내용을 입력하세요.' };
    await pool.query(
        'INSERT INTO quote_message (quote_id, sender_type, sender_id, message, visibility) VALUES (?,?,?,?,?)',
        [quoteId, senderType, senderId, message.trim(), visibility]
    );
    return { ok: true };
}

/** 목록. 거래처용(profileId)과 관리자용(전체)을 한 함수로 다룬다. */
async function list({ businessProfileId = null, status = null, keyword = null, limit = 20, offset = 0 }) {
    const where = ['1 = 1'];
    const params = [];
    if (businessProfileId) { where.push('q.business_profile_id = ?'); params.push(businessProfileId); }
    if (status) { where.push('q.status = ?'); params.push(status); }
    if (keyword) {
        where.push('(q.quote_number LIKE ? OR bp.company_name LIKE ?)');
        params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const [rows] = await pool.query(
        `SELECT q.*, bp.company_name,
                (SELECT COUNT(*) FROM quote_item qi WHERE qi.quote_id = q.id) AS item_count
           FROM quote q
           JOIN business_profile bp ON bp.id = q.business_profile_id
          WHERE ${where.join(' AND ')}
          ORDER BY q.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, Number(limit), Number(offset)]
    );
    const [[cnt]] = await pool.query(
        `SELECT COUNT(*) AS total FROM quote q
           JOIN business_profile bp ON bp.id = q.business_profile_id
          WHERE ${where.join(' AND ')}`,
        params
    );
    return { rows, total: cnt ? cnt.total : 0 };
}

module.exports = {
    generateQuoteNumber,
    defaultValidUntil,
    effectiveUnitPrice,
    findFull,
    recalcTotals,
    recordRevision,
    createRequest,
    sellerPropose,
    buyerCounter,
    accept,
    close,
    addMessage,
    list,
};
