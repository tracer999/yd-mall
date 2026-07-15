/*
 * 회원 인정 실적 원장 (customer_performance_ledger) — 설계 §2.3, §6.2, §10.1/10.2
 *
 * 구매확정 시 인정 실적을 적립(ORDER_CONFIRMED)하고, 취소·환불 시 역분개(ORDER_REVERSED, 음수)한다.
 * 누적 실적은 두 이벤트의 합으로 자연히 상계된다. 원장은 append-only 다(행을 지우지 않는다).
 *
 * ⚠️ 실적 확정 시점(MVP): 결제확정(status='PAID')에 적립한다. 설계 §2.3 은 배송완료/구매확정을
 *    권장하나, 이 몰에는 일반주문 CONFIRMED 상태가 없고 기존 적립도 PAID 에 붙는다(부록 A.3).
 *    취소·환불이 status 전이로 처리되므로 reverseForOrder 로 역분개해 정합을 맞춘다.
 */

const pool = require('../../config/db');

/**
 * 인정 구매금액 산식(설계 §6.2). 주문 1건에서 인정 금액을 구한다.
 * MVP 기본은 B_NET(상품 결제액, 배송비 제외) — 기존 적립 기준(payAmount)과 동일.
 */
function recognizedAmountOf(order, amountBasis = 'B_NET') {
    const total = Number(order.total_amount) || 0;
    const shippingFee = Number(order.shipping_fee) || 0;
    const shippingDiscount = Number(order.shipping_discount) || 0;
    const subtotal = Number(order.subtotal_amount) || 0;
    const couponDiscount = Number(order.coupon_discount) || 0;
    const netShipping = shippingFee - shippingDiscount;
    switch (amountBasis) {
        case 'A_GROSS':
            return Math.max(0, subtotal); // 상품 판매가 합계(쿠폰/포인트 전)
        case 'C_PAID':
            return Math.max(0, total - netShipping); // 실결제 상품액(포인트 사용까지 반영된 total 기준)
        case 'D_NET_PLUS_SHIP':
            return Math.max(0, total); // 배송비 포함 실결제액
        case 'B_NET':
        default:
            return Math.max(0, subtotal - couponDiscount); // 상품 - 쿠폰
    }
}

/**
 * 구매확정 실적 적립. 멱등 — 같은 주문의 ORDER_CONFIRMED 이 이미 있으면 건너뛴다.
 * @param {import('mysql2/promise').PoolConnection|null} conn
 */
async function appendConfirmed(conn, { userId, mallId, orderId, amount, count = 1, occurredAt = null }) {
    const db = conn || pool;
    if (!userId || !mallId) return { skipped: true };
    const [[dup]] = await db.query(
        `SELECT COUNT(*) AS c FROM customer_performance_ledger
          WHERE source_type = 'ORDER' AND source_id = ? AND event_type = 'ORDER_CONFIRMED'`,
        [orderId]
    );
    if (Number(dup.c) > 0) return { skipped: true };
    await db.query(
        `INSERT INTO customer_performance_ledger
            (user_id, mall_id, source_type, source_id, event_type, recognized_amount, recognized_order_count, occurred_at, memo)
         VALUES (?, ?, 'ORDER', ?, 'ORDER_CONFIRMED', ?, ?, ?, ?)`,
        [userId, mallId, orderId, Math.max(0, Number(amount) || 0), count, occurredAt || new Date(), '구매확정 실적']
    );
    return { skipped: false };
}

/**
 * 주문 실적 역분개. 확정 원장이 있고 아직 역분개되지 않았으면 음수 행을 넣는다. 멱등.
 * @param {import('mysql2/promise').PoolConnection|null} conn
 */
async function reverseForOrder(conn, orderId) {
    const db = conn || pool;
    const [[confirmed]] = await db.query(
        `SELECT * FROM customer_performance_ledger
          WHERE source_type = 'ORDER' AND source_id = ? AND event_type = 'ORDER_CONFIRMED'
          ORDER BY id ASC LIMIT 1`,
        [orderId]
    );
    if (!confirmed) return { skipped: true };
    const [[rev]] = await db.query(
        `SELECT COUNT(*) AS c FROM customer_performance_ledger
          WHERE reversal_of_ledger_id = ?`,
        [confirmed.id]
    );
    if (Number(rev.c) > 0) return { skipped: true };
    await db.query(
        `INSERT INTO customer_performance_ledger
            (user_id, mall_id, source_type, source_id, event_type, recognized_amount, recognized_order_count, reversal_of_ledger_id, occurred_at, memo)
         VALUES (?, ?, 'ORDER', ?, 'ORDER_REVERSED', ?, ?, ?, NOW(), ?)`,
        [confirmed.user_id, confirmed.mall_id, orderId,
         -Math.abs(Number(confirmed.recognized_amount) || 0),
         -Math.abs(Number(confirmed.recognized_order_count) || 0),
         confirmed.id, '주문 취소/환불 역분개']
    );
    return { skipped: false, userId: confirmed.user_id, mallId: confirmed.mall_id };
}

/**
 * 최근 N개월 인정 실적 집계(확정-역분개 상계). months<=0 이면 전체 누적.
 * @returns {Promise<{amount:number, count:number}>}
 */
async function aggregate(userId, mallId, months = 12) {
    let sql = `SELECT COALESCE(SUM(recognized_amount),0) AS amount,
                      COALESCE(SUM(recognized_order_count),0) AS count
                 FROM customer_performance_ledger
                WHERE user_id = ? AND mall_id = ?`;
    const params = [userId, mallId];
    if (months && months > 0) {
        sql += ' AND occurred_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)';
        params.push(months);
    }
    const [[row]] = await pool.query(sql, params);
    return { amount: Math.max(0, Number(row.amount) || 0), count: Math.max(0, Number(row.count) || 0) };
}

module.exports = {
    recognizedAmountOf,
    appendConfirmed,
    reverseForOrder,
    aggregate,
};
