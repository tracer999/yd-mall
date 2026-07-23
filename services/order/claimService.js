/*
 * 클레임 — 취소 · 반품 · 교환 (주문/클레임 문서 §2-2 · §5, O9)
 *
 * ── 복원 경로는 하나다 (§1-1)
 *    승인은 `restoreOrderResources` 를 **호출**한다. 재고·쿠폰·적립금을 다시 구현하지 않는다.
 *    그 함수는 `orders.resources_restored_at` 으로 멱등하다 — 두 번 승인돼도 재고는 한 번만 돌아온다.
 *
 * ── 주문 단위 · 품목 단위 둘 다 받는다
 *    `items` 를 넘기지 않으면 지금까지처럼 **주문 전건** 클레임이다(기존 동작 그대로).
 *    넘기면 그 품목·수량만 대상인 **부분 클레임**이고, 금액 안분 규칙은 partialClaimService 가 갖는다.
 *
 * ── 교환(EXCHANGE)
 *    회수와 재발송이 함께 일어난다. 환불이 없으므로 결제는 건드리지 않고, 재고도 되돌리지 않는다
 *    (같은 물건을 다시 보내므로 재고는 그대로다). 회수 송장은 반품과 같은 자리에서 관리한다.
 *
 * ── 출고 전 취소는 즉시 승인한다 (§7 미결 1 — 권장안 A)
 *    PENDING · PAID 는 고객이 취소하면 그 자리에서 완료된다. 상품 준비가 시작된 뒤(PREPARING)부터
 *    관리자 승인을 받는다. 반품(RETURN)은 언제나 승인 대상이다 — 물건을 회수해야 한다.
 */

const pool = require('../../config/db');
const { restoreOrderResources } = require('./orderCancelService');
const { refundOrder, calcReturnShippingFee } = require('./refundService');
const { transition } = require('./orderStatusService');
const partial = require('./partialClaimService');

const CLAIM_TYPES = ['CANCEL', 'RETURN', 'EXCHANGE'];
const REASON_TYPES = ['CHANGE_OF_MIND', 'DEFECT', 'WRONG_DELIVERY', 'OTHER'];

/** 취소 신청이 가능한 주문 상태. 출고되면 취소가 아니라 반품이다. */
const CANCELLABLE = new Set(['PENDING', 'PAID', 'PREPARING']);
/** 반품 신청이 가능한 주문 상태. 상품이 고객 손에 있거나 가는 중이어야 회수할 수 있다. */
const RETURNABLE = new Set(['SHIPPED', 'DELIVERED']);
/** 출고 전이면 관리자 승인 없이 즉시 완료한다. */
const AUTO_APPROVE = new Set(['PENDING', 'PAID']);

/** 수령 후 반품 가능 기간 (guide.ejs: "수령 후 7일 이내"). */
const RETURN_WINDOW_DAYS = 7;

/** 귀책 자동 판정 — 불량·오배송은 판매자, 단순 변심은 고객. 관리자가 승인 시 뒤집을 수 있다. */
function defaultResponsible(reasonType) {
    return (reasonType === 'DEFECT' || reasonType === 'WRONG_DELIVERY') ? 'SELLER' : 'CUSTOMER';
}

/**
 * 이 주문에 지금 신청할 수 있는 클레임 유형과 그 이유.
 * `type` 은 대표 유형(취소 또는 반품)이고, 반품 가능 구간에서는 **교환도 함께** 열린다.
 */
function claimability(order, shipment) {
    if (order.claim_status === 'REQUESTED') return { type: null, types: [], reason: '이미 처리 중인 클레임이 있습니다.' };
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        return { type: null, types: [], reason: '이미 취소된 주문입니다.' };
    }
    if (CANCELLABLE.has(order.status)) return { type: 'CANCEL', types: ['CANCEL'], reason: null };

    if (RETURNABLE.has(order.status)) {
        const deliveredAt = shipment && shipment.delivered_at ? new Date(shipment.delivered_at) : null;
        if (deliveredAt) {
            const days = (Date.now() - deliveredAt.getTime()) / 86400000;
            if (days > RETURN_WINDOW_DAYS) {
                return { type: null, types: [], reason: `반품·교환은 수령 후 ${RETURN_WINDOW_DAYS}일 이내에만 신청할 수 있습니다.` };
            }
        }
        // 반품이 되는 구간이면 교환도 된다 — 회수한다는 점이 같고, 다른 것은 "돈을 돌려주느냐 물건을 다시 보내느냐" 뿐이다.
        return { type: 'RETURN', types: ['RETURN', 'EXCHANGE'], reason: null };
    }
    return { type: null, types: [], reason: '이 주문 상태에서는 취소·반품·교환을 신청할 수 없습니다.' };
}

const TYPE_LABEL = { CANCEL: '취소', RETURN: '반품', EXCHANGE: '교환' };

/**
 * 클레임 신청. 출고 전이면 그 자리에서 승인·환불까지 끝낸다.
 *
 * @returns {Promise<{ok:boolean, claimId?:number, autoApproved?:boolean, refund?:object, reason?:string}>}
 */
async function requestClaim({ orderId, userId = null, claimType, reasonType, reasonDetail, requestedBy = 'CUSTOMER', mallId = 1, items = null }) {
    if (!CLAIM_TYPES.includes(claimType)) return { ok: false, reason: '알 수 없는 클레임 유형입니다.' };
    if (!REASON_TYPES.includes(reasonType)) reasonType = 'OTHER';

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            `SELECT id, user_id, status, payment_status, claim_status, point_used, total_amount,
                    subtotal_amount, coupon_discount, grade_discount,
                    shipping_fee, shipping_discount, payment_key, order_type
               FROM orders WHERE id = ? FOR UPDATE`,
            [orderId]
        );
        if (!order) { await conn.rollback(); return { ok: false, reason: '주문을 찾을 수 없습니다.' }; }
        // 고객 신청이면 소유자여야 한다. 관리자 직권 신청은 userId 를 넘기지 않는다.
        if (userId != null && Number(order.user_id) !== Number(userId)) {
            await conn.rollback();
            return { ok: false, reason: '주문을 찾을 수 없습니다.' };
        }

        const [[shipment]] = await conn.query(
            "SELECT delivered_at FROM shipments WHERE order_id = ? AND direction = 'OUTBOUND'", [orderId]);
        const allowed = claimability(order, shipment);
        if (!allowed.types.includes(claimType)) {
            await conn.rollback();
            return { ok: false, reason: allowed.reason || `지금은 ${TYPE_LABEL[claimType]}을(를) 신청할 수 없습니다.` };
        }

        /*
         * 부분 클레임이면 담긴 품목을 검증한다.
         * `items` 는 [{orderItemId, quantity}]. 잔여 수량을 넘기면 거절한다 —
         * 여기서 막지 않으면 2개 산 물건을 3개 반품해 돈을 더 받아 가는 길이 열린다.
         */
        let pick = null;
        let amounts = null;
        if (Array.isArray(items) && items.length) {
            const all = await partial.getClaimableItems(conn, orderId);
            const byId = new Map(all.map((i) => [Number(i.id), i]));
            pick = new Map();
            for (const raw of items) {
                const itemId = Number(raw.orderItemId);
                const qty = Number(raw.quantity);
                const target = byId.get(itemId);
                if (!target) { await conn.rollback(); return { ok: false, reason: '주문에 없는 상품이 포함됐습니다.' }; }
                if (!Number.isFinite(qty) || qty <= 0) continue;
                if (qty > target.remaining_qty) {
                    await conn.rollback();
                    return { ok: false, reason: `'${target.product_name}' 은(는) ${target.remaining_qty}개까지만 신청할 수 있습니다.` };
                }
                pick.set(itemId, qty);
            }
            if (!pick.size) { await conn.rollback(); return { ok: false, reason: '신청할 상품을 하나 이상 선택하세요.' }; }
            amounts = partial.calcPartialAmounts(all, pick, order, 0);
        }

        const isPartial = !!(amounts && !amounts.isLast);
        const responsible = defaultResponsible(reasonType);
        const [ins] = await conn.query(
            `INSERT INTO order_claims (order_id, claim_type, is_partial, status, reason_type, reason_detail, responsible, requested_by)
             VALUES (?, ?, ?, 'REQUESTED', ?, ?, ?, ?)`,
            [orderId, claimType, isPartial ? 1 : 0, reasonType, (reasonDetail || '').slice(0, 500) || null, responsible, requestedBy]
        );
        const claimId = ins.insertId;

        // 담긴 품목은 신청 시점에 기록해 둔다(환불 몫은 승인 때 다시 계산해 덮어쓴다).
        if (amounts) await partial.saveClaimItems(conn, claimId, amounts);

        await transition(conn, orderId, { claim_status: 'REQUESTED' }, {
            actorType: requestedBy === 'ADMIN' ? 'ADMIN' : 'CUSTOMER',
            actorId: userId,
            memo: `${TYPE_LABEL[claimType]} 신청${isPartial ? ' (일부 상품)' : ''}`,
        });
        await conn.query('UPDATE orders SET cancel_reason = ? WHERE id = ?', [(reasonDetail || '').slice(0, 255) || null, orderId]);

        // 출고 전 취소는 즉시 승인 (§7 미결 1)
        if (claimType === 'CANCEL' && AUTO_APPROVE.has(order.status)) {
            const result = await approveInTransaction(conn, {
                claimId, order, claimType, responsible, mallId, isPartial, pick,
                actorType: 'SYSTEM', actorId: null, memo: '출고 전 취소 — 자동 승인',
            });
            await conn.commit();
            return { ok: true, claimId, autoApproved: true, refund: result.refund };
        }

        await conn.commit();
        return { ok: true, claimId, autoApproved: false };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 승인 본체. 복원 → 환불 → 상태 전이를 한 트랜잭션에서 한다.
 * 호출측이 트랜잭션과 주문 행 잠금을 소유한다.
 */
async function approveInTransaction(conn, { claimId, order, claimType, responsible, returnShippingFee, mallId, actorType, actorId, memo, isPartial = false, pick = null }) {
    const fee = returnShippingFee != null
        ? Number(returnShippingFee)
        : await calcReturnShippingFee({ mallId, responsible, claimType });

    /*
     * 교환은 돈이 오가지 않는다.
     * 물건을 회수하고 같은 물건을 다시 보내므로 **재고도 그대로**다(빠졌다 채워진다).
     * 결제·환불을 건드리면 실제로는 없던 환불 이력이 남아 정산이 어긋난다.
     * 남는 일은 회수 송장 등록과 재발송이며, 그건 배송 관리에서 이어서 한다.
     */
    if (claimType === 'EXCHANGE') {
        await conn.query(
            `UPDATE order_claims SET status = 'COMPLETED', responsible = ?, return_shipping_fee = ?,
                    processed_at = NOW(), processed_by = ?, admin_memo = COALESCE(?, admin_memo)
              WHERE id = ?`,
            [responsible, fee, actorType === 'ADMIN' ? actorId : null, memo || null, claimId]
        );
        await transition(conn, order.id, { claim_status: 'COMPLETED' },
            { actorType, actorId, memo: memo || '교환 승인 — 회수 후 재발송' });
        return { refund: { ok: true, method: 'NONE', exchange: true } };
    }

    // ── 부분 클레임 ────────────────────────────────────────────
    if (pick && pick.size) {
        const all = await partial.getClaimableItems(conn, order.id);
        let amounts = partial.calcPartialAmounts(all, pick, order, fee);
        if (!amounts) throw new Error('부분 클레임 대상 품목이 비어 있습니다.');
        amounts = await partial.absorbRounding(conn, order, amounts);

        // 1) 재고·포인트를 이 품목 몫만 되돌린다(쿠폰은 복원하지 않는다 — partialClaimService 주석 참고).
        await partial.restorePartialResources(conn, order, amounts,
            { memo: claimType === 'RETURN' ? '부분 반품' : '부분 취소' });

        // 2) 환불 — 안분된 금액만. refundOrder 는 주문 전액을 기준으로 삼으므로
        //    금액을 직접 넘길 수 있게 `overrideAmount` 를 쓴다.
        const refund = await refundOrder(conn, {
            order, claimId,
            returnShippingFee: fee,
            overrideAmount: amounts.refundAmount,
            reason: claimType === 'RETURN' ? '부분 반품' : '부분 취소',
        });

        // 3) 확정된 환불 몫으로 품목 기록을 갱신한다(신청 때 적어 둔 값은 배송비·귀책 반영 전 값이다).
        await conn.query('DELETE FROM order_claim_items WHERE claim_id = ?', [claimId]);
        await partial.saveClaimItems(conn, claimId, amounts);

        await conn.query(
            `UPDATE order_claims SET status = 'COMPLETED', is_partial = ?, responsible = ?, return_shipping_fee = ?,
                    processed_at = NOW(), processed_by = ?, admin_memo = COALESCE(?, admin_memo)
              WHERE id = ?`,
            [amounts.isLast ? 0 : 1, responsible, fee, actorType === 'ADMIN' ? actorId : null, memo || null, claimId]
        );

        /*
         * 4) 상태 전이 — 여기가 부분 클레임의 핵심 차이다.
         *    남은 품목이 있으면 주문은 **살아 있다**. 상태를 CANCELLED 로 바꾸면 아직 보내야 할
         *    물건이 있는 주문이 배송 목록에서 사라진다. 결제 상태만 '부분환불'로 표시한다.
         */
        const refundStatus = refund.ok ? 'COMPLETED' : (refund.pending ? 'REQUESTED' : 'FAILED');
        if (amounts.isLast) {
            await transition(conn, order.id, {
                status: 'CANCELLED',
                payment_status: refund.ok ? 'REFUNDED' : 'CANCELLED',
                claim_status: 'COMPLETED',
                refund_status: refundStatus,
            }, { actorType, actorId, memo: memo || '마지막 품목 클레임 — 주문 종료' });
        } else {
            await transition(conn, order.id, {
                payment_status: 'PARTIAL_REFUNDED',
                claim_status: 'COMPLETED',
                refund_status: refundStatus,
            }, { actorType, actorId, memo: memo || `${TYPE_LABEL[claimType]} 승인 (일부 상품)` });
        }
        return { refund, amounts };
    }

    // ── 전건 클레임 (기존 동작) ────────────────────────────────
    // 1) 재고·쿠폰·적립금 — 멱등하다. 두 번 승인돼도 한 번만 돌아온다.
    await restoreOrderResources(conn, order);

    // 2) 환불 — PG 실패해도 클레임은 되돌리지 않는다 (§4)
    const refund = await refundOrder(conn, {
        order,
        claimId,
        returnShippingFee: fee,
        reason: claimType === 'RETURN' ? '반품' : '주문 취소',
    });

    await conn.query(
        `UPDATE order_claims SET status = 'COMPLETED', responsible = ?, return_shipping_fee = ?,
                processed_at = NOW(), processed_by = ?, admin_memo = COALESCE(?, admin_memo)
          WHERE id = ?`,
        [responsible, fee, actorType === 'ADMIN' ? actorId : null, memo || null, claimId]
    );

    // 3) 상태 전이 — 주문·결제·클레임·환불이 각각 움직인다.
    //    환불은 완료·대기·실패 셋이다. 대기(B2B 계좌 이체)를 실패로 적으면 운영자가 재시도 대상으로
    //    오인하고, 완료로 적으면 돈을 안 보냈는데 끝난 것으로 보인다.
    const refundStatus = refund.ok ? 'COMPLETED' : (refund.pending ? 'REQUESTED' : 'FAILED');
    await transition(conn, order.id, {
        status: 'CANCELLED',
        payment_status: refund.ok ? 'REFUNDED' : 'CANCELLED',
        claim_status: 'COMPLETED',
        refund_status: refundStatus,
    }, { actorType, actorId, memo: memo || (claimType === 'RETURN' ? '반품 승인' : '취소 승인') });

    return { refund };
}

/** 관리자 승인. 귀책·반품배송비를 여기서 확정한다. */
async function approveClaim({ claimId, adminId, responsible, returnShippingFee, memo, mallId = 1 }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[claim]] = await conn.query('SELECT * FROM order_claims WHERE id = ? FOR UPDATE', [claimId]);
        if (!claim) { await conn.rollback(); return { ok: false, reason: '클레임을 찾을 수 없습니다.' }; }
        if (claim.status !== 'REQUESTED') { await conn.rollback(); return { ok: false, reason: '이미 처리된 클레임입니다.' }; }

        const [[order]] = await conn.query(
            `SELECT id, user_id, status, payment_status, point_used, total_amount,
                    subtotal_amount, coupon_discount, grade_discount,
                    shipping_fee, shipping_discount, payment_key, order_type
               FROM orders WHERE id = ? FOR UPDATE`,
            [claim.order_id]
        );

        // 신청 때 담아 둔 품목을 그대로 승인 대상으로 삼는다(관리자가 수량을 바꾸지는 못한다 —
        // 고객이 신청한 것과 다른 것을 처리하면 분쟁이 된다. 다르게 처리하려면 거절 후 재신청이다).
        const [claimItems] = await conn.query(
            'SELECT order_item_id, quantity FROM order_claim_items WHERE claim_id = ?', [claimId]);
        const pick = claimItems.length
            ? new Map(claimItems.map((r) => [Number(r.order_item_id), Number(r.quantity)]))
            : null;

        const result = await approveInTransaction(conn, {
            claimId,
            order,
            claimType: claim.claim_type,
            responsible: responsible || claim.responsible,
            returnShippingFee,
            mallId,
            pick,
            actorType: 'ADMIN',
            actorId: adminId,
            memo,
        });

        await conn.commit();
        return { ok: true, refund: result.refund };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** 거절. 주문 상태는 그대로 두고 클레임만 닫는다. */
async function rejectClaim({ claimId, adminId, memo }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[claim]] = await conn.query('SELECT * FROM order_claims WHERE id = ? FOR UPDATE', [claimId]);
        if (!claim) { await conn.rollback(); return { ok: false, reason: '클레임을 찾을 수 없습니다.' }; }
        if (claim.status !== 'REQUESTED') { await conn.rollback(); return { ok: false, reason: '이미 처리된 클레임입니다.' }; }

        await conn.query(
            "UPDATE order_claims SET status = 'REJECTED', processed_at = NOW(), processed_by = ?, admin_memo = ? WHERE id = ?",
            [adminId, (memo || '').slice(0, 500) || null, claimId]
        );
        await transition(conn, claim.order_id, { claim_status: 'REJECTED' },
            { actorType: 'ADMIN', actorId: adminId, memo: memo || '클레임 거절' });

        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** 고객 철회. 아직 승인되지 않은 클레임만. */
async function withdrawClaim({ claimId, userId }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[claim]] = await conn.query(
            `SELECT c.*, o.user_id FROM order_claims c JOIN orders o ON o.id = c.order_id
              WHERE c.id = ? FOR UPDATE`, [claimId]);
        if (!claim || Number(claim.user_id) !== Number(userId)) {
            await conn.rollback();
            return { ok: false, reason: '클레임을 찾을 수 없습니다.' };
        }
        if (claim.status !== 'REQUESTED') { await conn.rollback(); return { ok: false, reason: '이미 처리된 클레임입니다.' }; }

        await conn.query("UPDATE order_claims SET status = 'WITHDRAWN', processed_at = NOW() WHERE id = ?", [claimId]);
        await transition(conn, claim.order_id, { claim_status: 'NONE' },
            { actorType: 'CUSTOMER', actorId: userId, memo: '클레임 철회' });

        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    requestClaim, approveClaim, rejectClaim, withdrawClaim,
    claimability, defaultResponsible,
    CLAIM_TYPES, REASON_TYPES, RETURN_WINDOW_DAYS, TYPE_LABEL,
};
