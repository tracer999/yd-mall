/*
 * 배송완료 처리 공통 계층
 *
 * 배송완료는 세 곳에서 일어난다 — 관리자 개별 버튼, 관리자 일괄 처리, 자동 처리(스케줄러).
 * 셋이 각자 UPDATE 를 쓰면 `delivered_at` 이 빠지거나 안내 메일이 안 나가는 구멍이 생긴다.
 * `delivered_at` 은 **반품 가능 기간의 기준**이라 하나라도 빠지면 클레임 판정이 틀어진다.
 */

const pool = require('../../config/db');
const { transition } = require('../order/orderStatusService');
const orderMailer = require('../email/orderMailer');

/**
 * 주문 하나를 배송완료로 넘긴다. 이미 완료됐거나 넘길 수 없는 상태면 이유를 담아 돌려준다.
 * @returns {{ok: boolean, reason?: string, orderNumber?: string}}
 */
async function markDelivered(orderId, { actorType = 'ADMIN', actorId = null, memo = '배송완료 처리' } = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[order]] = await conn.query(
            'SELECT id, order_number, order_type, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (!order) { await conn.rollback(); return { ok: false, reason: '주문 없음' }; }

        const info = { orderNumber: order.order_number };
        if (order.order_type === 'B2B') { await conn.rollback(); return { ok: false, reason: '기업주문', ...info }; }
        if (order.status === 'DELIVERED') { await conn.rollback(); return { ok: false, reason: '이미 배송완료', ...info }; }
        if (order.status !== 'SHIPPED') { await conn.rollback(); return { ok: false, reason: '배송중이 아님', ...info }; }

        await conn.query(
            "UPDATE shipments SET status = 'DELIVERED', delivered_at = NOW() WHERE order_id = ?", [orderId]);
        await transition(conn, Number(orderId), { status: 'DELIVERED' }, { actorType, actorId, memo });
        await conn.commit();

        orderMailer.notifyOrderDelivered(Number(orderId))
            .catch((e) => console.error('[mail] 배송완료 안내 실패 (order ' + orderId + '):', e.message));

        return { ok: true, ...info };
    } catch (err) {
        await conn.rollback();
        console.error('[delivery] markDelivered:', err.message);
        return { ok: false, reason: '오류: ' + err.message };
    } finally {
        conn.release();
    }
}

/**
 * 발송 후 N일이 지난 배송중 주문을 자동으로 배송완료 처리한다.
 * 택배사 API 계약이 없어도 주문이 `배송중`에 영원히 머무르지 않게 하는 안전장치다.
 * N=0 이면 끈 것으로 본다.
 */
async function autoCompleteDelivered(days) {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return { checked: 0, done: 0 };

    const [rows] = await pool.query(`
        SELECT o.id
        FROM orders o
        JOIN shipments s ON s.order_id = o.id
        WHERE o.order_type = 'B2C'
          AND o.status = 'SHIPPED'
          AND s.shipped_at IS NOT NULL
          AND s.shipped_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
        LIMIT 500
    `, [n]);

    let done = 0;
    for (const r of rows) {
        const res = await markDelivered(r.id, { actorType: 'SYSTEM', actorId: null, memo: `발송 ${n}일 경과 자동 배송완료` });
        if (res.ok) done++;
    }
    return { checked: rows.length, done };
}

module.exports = { markDelivered, autoCompleteDelivered };
