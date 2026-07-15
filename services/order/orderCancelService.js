/*
 * 주문 취소 시 자원 복원 (쿠폰 문서 C1, 배송비 문서 §6)
 *
 * 취소는 `status='CANCELLED'` UPDATE 하나로 끝나고 있었다. 재고·쿠폰·적립금 어느 것도
 * 되돌리지 않아, 취소하면 고객이 쓴 쿠폰과 적립금이 그대로 소멸했다.
 *
 * 복원 대상은 셋이다.
 *   1) 재고     — 결제 확정(PAID 이후)된 주문만. PENDING 은 차감 전이므로 되돌릴 것이 없다.
 *   2) 쿠폰     — used_at·order_id 해제. system_settings.coupon_restore_on_cancel 로 끌 수 있다.
 *   3) 적립금   — 사용분 환급 + 구매 적립분 회수. 두 번 실행돼도 중복되지 않게 이력으로 막는다.
 *
 * 배송비(`orders.shipping_fee`)는 별도 처리가 없다. 출고 전 전체 취소는 `total_amount` 를
 * 그대로 환불하는 것이고, 그 안에 이미 배송비가 들어 있다(배송비 문서 §6).
 * 반품 배송비 청구는 3차(반품 모듈)다.
 *
 * ⚠️ 실제 PG(토스) 결제 취소 API 는 여기서 호출하지 않는다. 현행 취소 경로 어디에도 없었고,
 *    이 작업의 범위 밖이다. 상태만 CANCELLED 로 바뀐다.
 */

const dealSvc = require('../deal/dealService');
const performanceService = require('../membership/performanceService');

const PAYMENT_CONFIRMED = new Set(['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED']);

function isCouponRestoreEnabled() {
    const v = global.systemSettings?.coupon_restore_on_cancel;
    if (v == null || v === '') return true; // 미설정이면 복원한다
    return !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase());
}

/**
 * 취소된 주문의 재고·쿠폰·적립금을 되돌린다.
 *
 * 호출측이 트랜잭션을 열고 `orders` 행을 `FOR UPDATE` 로 잠근 뒤 부른다.
 * `orders.status` 는 **취소 전 상태**를 넘겨야 한다(재고 복원 여부를 이걸로 판정한다).
 *
 * ⚠️ **멱등하다.** `orders.resources_restored_at` 이 채워져 있으면 아무것도 하지 않는다.
 *    복원 경로가 둘(관리자 상태 변경 · 클레임 승인)이 된 이상, 재고 `stock = stock + qty` 는
 *    가드 없이는 두 번 더해진다. 적립금 이력 검사만으로는 재고를 막지 못한다.
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{id:number, user_id:number|null, status:string, point_used:number}} order
 * @returns {Promise<boolean>} 실제로 복원했으면 true, 이미 복원된 주문이면 false
 */
async function restoreOrderResources(conn, order) {
    const orderId = order.id;
    const wasPaid = PAYMENT_CONFIRMED.has(order.status);

    // 0) 멱등 가드 — 조건부 UPDATE 의 affectedRows 로 "내가 첫 번째"임을 확보한다.
    //    호출측이 주문 행을 FOR UPDATE 로 잠갔더라도, 이 한 줄이 계약을 코드로 남긴다.
    const [claimed] = await conn.query(
        'UPDATE orders SET resources_restored_at = NOW() WHERE id = ? AND resources_restored_at IS NULL',
        [orderId]
    );
    if (claimed.affectedRows === 0) return false;

    // 1) 재고
    if (wasPaid) {
        const [items] = await conn.query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
            [orderId]
        );
        for (const item of items) {
            await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
        }

        // 특가 선착순 수량도 되돌린다. 소진은 결제 확정(PAID) 때만 일어나므로 wasPaid 안에 둔다.
        await dealSvc.restoreDealQuota(conn, orderId);
    }

    /*
     * 2) 쿠폰 — 사용(order_id)과 점유(reserved_order_id) 양쪽을 푼다.
     *    PENDING 주문을 취소하면 쿠폰은 `used_at` 이 아니라 `reserved_order_id` 로만 묶여 있다.
     *    `order_id` 만 보고 풀면 그 쿠폰은 영영 잠긴다.
     *
     *    만료된 쿠폰도 복원한다. 다만 조회 시 유효기간으로 걸러지므로 되살아나지는 않는다(§6-2).
     */
    if (isCouponRestoreEnabled()) {
        await conn.query(
            `UPDATE user_coupons
                SET used_at = NULL, order_id = NULL, reserved_order_id = NULL, reserved_at = NULL
              WHERE order_id = ? OR reserved_order_id = ?`,
            [orderId, orderId]
        );
    }

    // 멤버십 실적 역분개 (설계 §10.2). 확정 적립된 실적을 되돌린다(멱등). 등급 강등은 하지 않는다 —
    // "승급은 빠르게, 강등은 정기 평가"(§10.2). 다음 정기 평가가 강등을 판정한다.
    if (wasPaid) {
        await performanceService.reverseForOrder(conn, orderId);
    }

    // 3) 적립금 — PENDING 주문은 아직 정산되지 않았다
    if (!wasPaid || !order.user_id) return true;

    // 이력 검사는 위의 멱등 가드와 겹친다. 남겨 둔다 — 이 함수를 우회해 적립금만 되돌리는
    // 운영 스크립트가 생겨도 중복 환급을 막는다.
    const [[dup]] = await conn.query(
        `SELECT COUNT(*) AS c FROM point_transactions
          WHERE order_id = ? AND transaction_type IN ('ORDER_CANCEL_RESTORE','ORDER_CANCEL_REVOKE')`,
        [orderId]
    );
    if (Number(dup.c) > 0) return true; // 이미 되돌린 주문

    const userId = order.user_id;
    const pointUsed = Number(order.point_used) || 0;

    if (pointUsed > 0) {
        await conn.query('UPDATE users SET points_balance = points_balance + ? WHERE id = ?', [pointUsed, userId]);
        await conn.query(
            'INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description) VALUES (?, ?, ?, ?, ?)',
            [userId, pointUsed, 'ORDER_CANCEL_RESTORE', orderId, '주문 취소 - 사용 적립금 환급']
        );
    }

    const [[accRow]] = await conn.query(
        `SELECT COALESCE(SUM(amount), 0) AS acc FROM point_transactions
          WHERE order_id = ? AND transaction_type = 'PURCHASE_ACCUMULATE'`,
        [orderId]
    );
    const accumulated = Number(accRow.acc) || 0;
    if (accumulated > 0) {
        // 이미 써버린 적립금은 회수할 수 없다. 잔액을 음수로 만들지 않는다.
        const [[user]] = await conn.query('SELECT points_balance FROM users WHERE id = ? FOR UPDATE', [userId]);
        const revoke = Math.min(accumulated, Number(user?.points_balance) || 0);
        if (revoke > 0) {
            await conn.query('UPDATE users SET points_balance = points_balance - ? WHERE id = ?', [revoke, userId]);
            await conn.query(
                'INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description) VALUES (?, ?, ?, ?, ?)',
                [userId, -revoke, 'ORDER_CANCEL_REVOKE', orderId, '주문 취소 - 구매 적립 회수']
            );
        }
    }
    return true;
}

module.exports = { restoreOrderResources, PAYMENT_CONFIRMED };
