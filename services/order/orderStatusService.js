/*
 * 주문 상태 전이 + 변경 이력 (주문/클레임 문서 §1-2, O2·O4)
 *
 * 레퍼런스(주문배송관리.md §4)는 상태를 여섯 축으로 나눈다. 이 저장소는 실제로 구동하는 넷만 둔다.
 *
 *      orders.status          주문 전체 상태 — **정본**. 옛 코드가 이걸 읽는다
 *      orders.payment_status  결제 상태
 *      orders.claim_status    취소·반품 진행 상태
 *      orders.refund_status   환불(금액 반환) 상태
 *
 * 주문 상태와 결제 상태는 다르다. "주문접수 + 결제완료 + 상품준비중"이 동시에 성립한다.
 * 그래서 `status` 를 바꿀 때 `payment_status` 를 자동으로 끌고 가지 **않는다** — 취소·환불처럼
 * 둘이 함께 움직이는 경우에만 호출측이 명시한다.
 *
 * 모든 변경은 `order_status_logs` 에 남긴다(레퍼런스 §2.1 "주문 변경 이력").
 */

const TRACKED_FIELDS = ['status', 'payment_status', 'claim_status', 'refund_status'];

/**
 * 주문의 상태 필드를 바꾸고 이력을 남긴다. 값이 같으면 아무것도 하지 않는다.
 *
 * @param {import('mysql2/promise').PoolConnection} conn  트랜잭션 커넥션
 * @param {number} orderId
 * @param {Object} changes  { status?, payment_status?, claim_status?, refund_status? }
 * @param {{actorType?:'CUSTOMER'|'ADMIN'|'SYSTEM', actorId?:number|null, memo?:string}} actor
 */
async function transition(conn, orderId, changes, actor = {}) {
    const fields = Object.keys(changes).filter((f) => TRACKED_FIELDS.includes(f));
    if (fields.length === 0) return;

    const [[current]] = await conn.query(
        `SELECT ${TRACKED_FIELDS.join(', ')} FROM orders WHERE id = ?`,
        [orderId]
    );
    if (!current) return;

    const changed = fields.filter((f) => String(current[f]) !== String(changes[f]));
    if (changed.length === 0) return;

    await conn.query(
        `UPDATE orders SET ${changed.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        [...changed.map((f) => changes[f]), orderId]
    );

    const { actorType = 'SYSTEM', actorId = null, memo = null } = actor;
    for (const f of changed) {
        await conn.query(
            `INSERT INTO order_status_logs (order_id, field, old_value, new_value, actor_type, actor_id, memo)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [orderId, f, current[f], changes[f], actorType, actorId, memo]
        );
    }
}

/** 이력을 남기지만 주문 필드는 건드리지 않는다 (송장 등록·메모 등). */
async function log(conn, orderId, { field, oldValue = null, newValue = null, actorType = 'SYSTEM', actorId = null, memo = null }) {
    await conn.query(
        `INSERT INTO order_status_logs (order_id, field, old_value, new_value, actor_type, actor_id, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, field, oldValue, newValue, actorType, actorId, memo]
    );
}

/** 주문의 변경 이력 (최신순). */
async function history(pool, orderId, limit = 100) {
    const [rows] = await pool.query(
        `SELECT * FROM order_status_logs WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
        [orderId, limit]
    );
    return rows;
}

module.exports = { transition, log, history, TRACKED_FIELDS };
