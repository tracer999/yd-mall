/*
 * 부분 취소 · 부분 반품 — 금액 안분과 자원 복원
 *
 * ── 왜 어려운가
 * `orders` 의 할인은 전부 **주문 단위**다(coupon_discount · grade_discount · point_used · shipping_fee).
 * "3개 중 1개만 반품" 을 하려면 이 주문 단위 금액을 품목 몫으로 쪼개야 하는데, 그 규칙이 없으면
 * 환불액이 사람마다 다르게 계산되고 결국 돈이 맞지 않는다. 그 규칙을 한 곳에 못 박은 파일이다.
 *
 * ── 안분 규칙 (이것이 이 파일의 계약이다)
 *   1. 기준은 **상품금액 비율**이다.  ratio = 대상품목 상품금액 / 주문 전체 상품금액
 *   2. 쿠폰할인 · 등급할인 · 사용포인트를 각각 ratio 로 나눠 환불액에서 뺀다.
 *      → 할인받고 산 물건을 정가로 돌려받는 일이 없다.
 *   3. **배송비는 부분 클레임에서 돌려주지 않는다.** 나머지 품목이 여전히 그 배송으로 가기 때문이다.
 *      단 이번 클레임으로 주문의 **모든 품목이 소진되면** 사실상 전건 취소이므로 배송비도 환불한다.
 *   4. 반품 배송비(고객 귀책)는 환불액에서 뺀다. 전건 반품과 같은 규칙이다.
 *   5. **마지막 클레임은 잔액을 전부 가져간다.** 비율 계산의 반올림 오차(원 단위)가 쌓여
 *      "다 환불했는데 3원이 남는" 일을 막는다. 합계는 언제나 결제금액과 정확히 일치한다.
 *
 * ── 쿠폰은 되살리지 않는다
 * 부분 반품에서 쿠폰을 복원하면 "10만원 이상 1만원 할인" 쿠폰을 쓴 뒤 한 품목만 남겨
 * 조건을 깨면서 쿠폰은 돌려받는 구멍이 생긴다. 할인액을 비율만큼 덜 돌려주는 것으로 정산을 끝내고,
 * 쿠폰 자체는 소진된 것으로 둔다. (전건 취소는 지금처럼 쿠폰을 복원한다)
 */

const pool = require('../../config/db');
const skuService = require('../catalog/skuService');

/**
 * 품목별 클레임 가능 잔여 수량.
 * 이미 **승인된**(COMPLETED) 클레임의 수량만 소진으로 본다 — 신청 중이거나 거절된 건은 잠그지 않는다.
 * (신청 중 중복은 주문 단위 claim_status='REQUESTED' 가드가 따로 막는다)
 */
async function getClaimableItems(conn, orderId) {
    const [rows] = await conn.query(`
        SELECT oi.id, oi.product_id, oi.product_name, oi.option_snapshot,
               oi.product_price, oi.quantity, oi.total_price,
               COALESCE((
                   SELECT SUM(ci.quantity) FROM order_claim_items ci
                   JOIN order_claims c ON c.id = ci.claim_id
                   WHERE ci.order_item_id = oi.id AND c.status = 'COMPLETED'
               ), 0) AS claimed_qty
        FROM order_items oi
        WHERE oi.order_id = ?
        ORDER BY oi.id
    `, [orderId]);

    return rows.map((r) => ({
        ...r,
        claimed_qty: Number(r.claimed_qty) || 0,
        remaining_qty: Math.max(0, Number(r.quantity) - (Number(r.claimed_qty) || 0)),
    }));
}

/**
 * 부분 클레임 금액을 계산한다.
 *
 * @param {Array} allItems  getClaimableItems 결과(주문 전 품목)
 * @param {Map<number,number>} pick  order_items.id → 이번에 클레임할 수량
 * @param {object} order  orders 행
 * @param {number} returnShippingFee 반품 배송비(차감액)
 */
function calcPartialAmounts(allItems, pick, order, returnShippingFee = 0) {
    const orderSubtotal = allItems.reduce((s, it) => s + Number(it.total_price), 0);

    // 이번 클레임 대상의 상품금액
    let itemsSubtotal = 0;
    const lines = [];
    for (const it of allItems) {
        const qty = Number(pick.get(Number(it.id))) || 0;
        if (qty <= 0) continue;
        const amount = Number(it.product_price) * qty;
        itemsSubtotal += amount;
        lines.push({ orderItemId: Number(it.id), quantity: qty, itemAmount: amount, productName: it.product_name });
    }
    if (!lines.length) return null;

    // 이번 클레임 뒤 남는 수량이 0이면 = 마지막 클레임
    const isLast = allItems.every((it) => {
        const qty = Number(pick.get(Number(it.id))) || 0;
        return it.remaining_qty - qty <= 0;
    });

    const ratio = orderSubtotal > 0 ? itemsSubtotal / orderSubtotal : 0;
    const share = (v) => Math.round((Number(v) || 0) * ratio);

    const couponShare = share(order.coupon_discount);
    const gradeShare = share(order.grade_discount);
    const pointShare = share(order.point_used);
    // 배송비는 마지막 클레임에서만 돌려준다(그 전까지는 나머지 품목이 그 배송을 쓴다).
    const shippingRefund = isLast
        ? Math.max(0, (Number(order.shipping_fee) || 0) - (Number(order.shipping_discount) || 0))
        : 0;

    const fee = Math.max(0, Number(returnShippingFee) || 0);
    let refundAmount = Math.max(0, itemsSubtotal - couponShare - gradeShare - pointShare + shippingRefund - fee);

    return {
        lines, itemsSubtotal, orderSubtotal, ratio, isLast,
        couponShare, gradeShare, pointShare, shippingRefund,
        returnShippingFee: fee,
        refundAmount,
        pointRestore: pointShare,   // 고객이 쓴 포인트 중 이 몫은 포인트로 돌려준다
    };
}

/**
 * 마지막 클레임이면 반올림 잔여를 흡수해 합계를 결제금액과 정확히 맞춘다.
 * (앞선 부분 환불들의 합 + 이번 환불 = total_amount − 누적 반품배송비)
 */
async function absorbRounding(conn, order, amounts) {
    if (!amounts.isLast) return amounts;

    const [[prev]] = await conn.query(`
        SELECT COALESCE(SUM(refund_amount), 0) AS paid,
               COALESCE(SUM(return_shipping_fee_deducted), 0) AS fees
        FROM order_refunds
        WHERE order_id = ? AND status IN ('COMPLETED','REQUESTED')
    `, [order.id]);

    const alreadyRefunded = Number(prev.paid) || 0;
    const alreadyFees = Number(prev.fees) || 0;
    const settleTarget = Math.max(0, (Number(order.total_amount) || 0) - alreadyFees - amounts.returnShippingFee);
    const remainder = Math.max(0, settleTarget - alreadyRefunded);

    if (remainder !== amounts.refundAmount) {
        amounts.roundingAdjust = remainder - amounts.refundAmount;
        amounts.refundAmount = remainder;
    }
    return amounts;
}

/**
 * 부분 클레임의 자원 복원 — 재고와 포인트만. 쿠폰은 위 주석대로 복원하지 않는다.
 * 전건 복원(restoreOrderResources)과 달리 `resources_restored_at` 을 세우지 않는다.
 * 그 플래그는 "이 주문은 통째로 되돌아갔다"는 뜻이라, 부분 반품에서 세우면 남은 품목의
 * 나중 취소가 재고를 되돌리지 못한다.
 */
async function restorePartialResources(conn, order, amounts, { memo = '부분 취소' } = {}) {
    const wasPaid = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'].includes(order.status);

    // 1) 재고 — 결제 확정된 주문만(미결제는 애초에 깎지 않았다)
    if (wasPaid) {
        const qtyByItem = new Map(amounts.lines.map((l) => [l.orderItemId, l.quantity]));
        await skuService.restoreStockForItems(conn, order.id, qtyByItem);
    }

    if (!wasPaid || !order.user_id) return;

    // 2) 사용 포인트 — 안분한 몫만 돌려준다
    if (amounts.pointRestore > 0) {
        await conn.query('UPDATE users SET points_balance = points_balance + ? WHERE id = ?',
            [amounts.pointRestore, order.user_id]);
        await conn.query(
            `INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description)
             VALUES (?, ?, 'ORDER_PARTIAL_REFUND', ?, ?)`,
            [order.user_id, amounts.pointRestore, order.id, `${memo} - 사용 적립금 일부 환급`]
        );
    }

    // 3) 구매 적립분 회수 — 이 주문으로 적립된 포인트 중 같은 비율만큼
    const [[accRow]] = await conn.query(
        `SELECT COALESCE(SUM(amount), 0) AS acc FROM point_transactions
          WHERE order_id = ? AND transaction_type = 'PURCHASE_ACCUMULATE'`, [order.id]);
    const accumulated = Number(accRow.acc) || 0;
    if (accumulated > 0) {
        const target = Math.round(accumulated * amounts.ratio);
        const [[user]] = await conn.query('SELECT points_balance FROM users WHERE id = ? FOR UPDATE', [order.user_id]);
        // 이미 써 버린 적립금은 회수할 수 없다. 잔액을 음수로 만들지 않는다.
        const revoke = Math.min(target, Number(user?.points_balance) || 0);
        if (revoke > 0) {
            await conn.query('UPDATE users SET points_balance = points_balance - ? WHERE id = ?', [revoke, order.user_id]);
            await conn.query(
                `INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description)
                 VALUES (?, ?, 'ORDER_PARTIAL_REFUND', ?, ?)`,
                [order.user_id, -revoke, order.id, `${memo} - 구매 적립 일부 회수`]
            );
        }
    }
}

/** 클레임에 담긴 품목을 저장한다(승인 시점에 확정된 환불 몫과 함께). */
async function saveClaimItems(conn, claimId, amounts) {
    for (const l of amounts.lines) {
        // 품목별 환불 몫 — 안분 비율을 그대로 적용한다(리포트·명세서용 참고값).
        const itemRefund = amounts.itemsSubtotal > 0
            ? Math.round(amounts.refundAmount * (l.itemAmount / amounts.itemsSubtotal))
            : 0;
        await conn.query(
            `INSERT INTO order_claim_items (claim_id, order_item_id, quantity, refund_amount)
             VALUES (?, ?, ?, ?)`,
            [claimId, l.orderItemId, l.quantity, itemRefund]
        );
    }
}

/** 주문의 모든 품목이 소진됐는가(= 더 이상 클레임할 것이 없는가). */
async function isFullyClaimed(conn, orderId) {
    const items = await getClaimableItems(conn, orderId);
    return items.every((it) => it.remaining_qty <= 0);
}

module.exports = {
    getClaimableItems,
    calcPartialAmounts,
    absorbRounding,
    restorePartialResources,
    saveClaimItems,
    isFullyClaimed,
};
