/*
 * 클레임 — 취소 · 반품 · 교환 (주문/클레임 문서 §2-2 · §5, O9)
 *
 * ── 복원 경로는 하나다 (§1-1)
 *    승인은 `restoreOrderResources` 를 **호출**한다. 재고·쿠폰·적립금을 다시 구현하지 않는다.
 *    그 함수는 `orders.resources_restored_at` 으로 멱등하다 — 두 번 승인돼도 재고는 한 번만 돌아온다.
 *
 * ── 클레임은 주문 단위다
 *    상품별(부분) 클레임은 3차. 쿠폰 할인액 배분이 선행이다(쿠폰 문서 §13-3).
 *
 * ── 출고 전 취소는 즉시 승인한다 (§7 미결 1 — 권장안 A)
 *    PENDING · PAID 는 고객이 취소하면 그 자리에서 완료된다. 상품 준비가 시작된 뒤(PREPARING)부터
 *    관리자 승인을 받는다. 반품(RETURN)은 언제나 승인 대상이다 — 물건을 회수해야 한다.
 */

const pool = require('../../config/db');
const { restoreOrderResources } = require('./orderCancelService');
const { refundOrder, calcReturnShippingFee } = require('./refundService');
const { transition } = require('./orderStatusService');

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

/** 이 주문에 지금 신청할 수 있는 클레임 유형과 그 이유. */
function claimability(order, shipment) {
    if (order.claim_status === 'REQUESTED') return { type: null, reason: '이미 처리 중인 클레임이 있습니다.' };
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        return { type: null, reason: '이미 취소된 주문입니다.' };
    }
    if (CANCELLABLE.has(order.status)) return { type: 'CANCEL', reason: null };

    if (RETURNABLE.has(order.status)) {
        const deliveredAt = shipment && shipment.delivered_at ? new Date(shipment.delivered_at) : null;
        if (deliveredAt) {
            const days = (Date.now() - deliveredAt.getTime()) / 86400000;
            if (days > RETURN_WINDOW_DAYS) {
                return { type: null, reason: `반품은 수령 후 ${RETURN_WINDOW_DAYS}일 이내에만 신청할 수 있습니다.` };
            }
        }
        return { type: 'RETURN', reason: null };
    }
    return { type: null, reason: '이 주문 상태에서는 취소·반품을 신청할 수 없습니다.' };
}

/**
 * 클레임 신청. 출고 전이면 그 자리에서 승인·환불까지 끝낸다.
 *
 * @returns {Promise<{ok:boolean, claimId?:number, autoApproved?:boolean, refund?:object, reason?:string}>}
 */
async function requestClaim({ orderId, userId = null, claimType, reasonType, reasonDetail, requestedBy = 'CUSTOMER', mallId = 1 }) {
    if (!CLAIM_TYPES.includes(claimType)) return { ok: false, reason: '알 수 없는 클레임 유형입니다.' };
    if (claimType === 'EXCHANGE') return { ok: false, reason: '교환은 아직 지원하지 않습니다. 반품 후 재주문해 주세요.' };
    if (!REASON_TYPES.includes(reasonType)) reasonType = 'OTHER';

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            `SELECT id, user_id, status, payment_status, claim_status, point_used, total_amount,
                    shipping_fee, shipping_discount, payment_key
               FROM orders WHERE id = ? FOR UPDATE`,
            [orderId]
        );
        if (!order) { await conn.rollback(); return { ok: false, reason: '주문을 찾을 수 없습니다.' }; }
        // 고객 신청이면 소유자여야 한다. 관리자 직권 신청은 userId 를 넘기지 않는다.
        if (userId != null && Number(order.user_id) !== Number(userId)) {
            await conn.rollback();
            return { ok: false, reason: '주문을 찾을 수 없습니다.' };
        }

        const [[shipment]] = await conn.query('SELECT delivered_at FROM shipments WHERE order_id = ?', [orderId]);
        const allowed = claimability(order, shipment);
        if (allowed.type !== claimType) {
            await conn.rollback();
            return { ok: false, reason: allowed.reason || `지금은 ${claimType === 'CANCEL' ? '취소' : '반품'}를 신청할 수 없습니다.` };
        }

        const responsible = defaultResponsible(reasonType);
        const [ins] = await conn.query(
            `INSERT INTO order_claims (order_id, claim_type, status, reason_type, reason_detail, responsible, requested_by)
             VALUES (?, ?, 'REQUESTED', ?, ?, ?, ?)`,
            [orderId, claimType, reasonType, (reasonDetail || '').slice(0, 500) || null, responsible, requestedBy]
        );
        const claimId = ins.insertId;

        await transition(conn, orderId, { claim_status: 'REQUESTED' }, {
            actorType: requestedBy === 'ADMIN' ? 'ADMIN' : 'CUSTOMER',
            actorId: userId,
            memo: `${claimType === 'CANCEL' ? '취소' : '반품'} 신청`,
        });
        await conn.query('UPDATE orders SET cancel_reason = ? WHERE id = ?', [(reasonDetail || '').slice(0, 255) || null, orderId]);

        // 출고 전 취소는 즉시 승인 (§7 미결 1)
        if (claimType === 'CANCEL' && AUTO_APPROVE.has(order.status)) {
            const result = await approveInTransaction(conn, {
                claimId, order, claimType, responsible, mallId,
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
async function approveInTransaction(conn, { claimId, order, claimType, responsible, returnShippingFee, mallId, actorType, actorId, memo }) {
    const fee = returnShippingFee != null
        ? Number(returnShippingFee)
        : await calcReturnShippingFee({ mallId, responsible, claimType });

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

    // 3) 상태 전이 — 주문·결제·클레임·환불이 각각 움직인다
    await transition(conn, order.id, {
        status: 'CANCELLED',
        payment_status: refund.ok ? 'REFUNDED' : 'CANCELLED',
        claim_status: 'COMPLETED',
        refund_status: refund.ok ? 'COMPLETED' : 'FAILED',
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
            `SELECT id, user_id, status, point_used, total_amount, shipping_fee, shipping_discount, payment_key
               FROM orders WHERE id = ? FOR UPDATE`,
            [claim.order_id]
        );

        const result = await approveInTransaction(conn, {
            claimId,
            order,
            claimType: claim.claim_type,
            responsible: responsible || claim.responsible,
            returnShippingFee,
            mallId,
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
    CLAIM_TYPES, REASON_TYPES, RETURN_WINDOW_DAYS,
};
