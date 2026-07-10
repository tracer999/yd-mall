/*
 * 환불 — 금액 반환 업무 (주문/클레임 문서 §4, O8)
 *
 * **반품과 환불은 다른 업무다.** 반품은 상품을 회수하는 물류 업무이고, 환불은 돈을 되돌리는
 * 금융 업무다. 배송 전 취소처럼 반품 없이 환불만 발생할 수도 있다.
 *
 * ── 이 저장소는 여태 결제 취소 API 를 **한 번도 호출하지 않았다.**
 *    `cancelTossPayment()` 는 결제 승인 직후 재고 부족 시에만 쓰였고, 주문 취소 경로 어디에도
 *    연결돼 있지 않았다. 상태만 CANCELLED 가 되고 돈은 그대로였다.
 *
 * ── PG 호출 여부는 `payment_key` 가 결정한다.
 *      있음  →  Toss `/v1/payments/{key}/cancel`
 *      없음  →  결제가 없던 주문(TEST·전액 적립금·무료). method='NONE', 즉시 완료
 *
 * ── 실패해도 클레임을 되돌리지 않는다 (§4).
 *    "재고는 돌아왔는데 취소가 안 된" 상태보다 "취소는 됐는데 환불이 안 된" 상태가 낫다.
 *    전자는 재고가 새고, 후자는 운영자가 처리할 수 있다.
 */

const pool = require('../../config/db');

function tossSecretKey() {
    return (global.systemSettings && global.systemSettings.tosspayments_secret_key)
        || process.env.TOSSPAYMENTS_SECRET_KEY;
}

/**
 * 환불 금액을 계산한다.
 *
 *   환불액 = total_amount − return_shipping_fee
 *
 * 적립금은 `restoreOrderResources` 가 환급·회수하므로 여기서 다시 빼지 않는다.
 * (사용한 적립금은 포인트로 돌려주고, 지급했던 구매적립은 회수한다.)
 */
function calcRefundAmount(order, returnShippingFee = 0) {
    const total = Number(order.total_amount) || 0;
    const deduct = Math.max(0, Number(returnShippingFee) || 0);
    return {
        refundAmount: Math.max(0, total - deduct),
        shippingFeeRefund: Math.max(0, (Number(order.shipping_fee) || 0) - (Number(order.shipping_discount) || 0)),
        deducted: Math.min(deduct, total),
    };
}

/** 반품 배송비 — 왕복. 귀책이 판매자면 0 (불량·오배송). */
async function calcReturnShippingFee({ mallId, responsible, claimType }) {
    if (claimType !== 'RETURN' || responsible !== 'CUSTOMER') return 0;
    const [rows] = await pool.query('SELECT base_fee FROM shipping_policy WHERE mall_id = ?', [mallId || 1]);
    const baseFee = rows.length ? Number(rows[0].base_fee) : 3000;
    return baseFee * 2; // guide.ejs: "단순 변심은 고객 부담(왕복 배송비)"
}

/** 토스 결제 취소. 반환값은 { ok, body }. */
async function cancelTossPayment(paymentKey, cancelReason, cancelAmount) {
    const secretKey = tossSecretKey();
    if (!secretKey) return { ok: false, body: 'TOSSPAYMENTS_SECRET_KEY not configured' };

    const auth = Buffer.from(secretKey + ':').toString('base64');
    const payload = { cancelReason: cancelReason || '주문 취소' };
    // 부분 취소(반품 배송비 차감)일 때만 금액을 명시한다. 전액이면 생략해야 안전하다.
    if (cancelAmount != null) payload.cancelAmount = cancelAmount;

    try {
        const resp = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await resp.text();
        return { ok: resp.ok, body };
    } catch (err) {
        return { ok: false, body: String(err && err.message) };
    }
}

/**
 * 환불을 실행하고 `order_refunds` 에 기록한다. 호출측 트랜잭션 안에서 돈다.
 *
 * ⚠️ **알려진 한계 (후속 과제).** 지금은 이 함수가 트랜잭션 안에서 토스 `fetch` 를 호출한다.
 *    claimService.approveInTransaction 이 주문 행을 `FOR UPDATE` 로 잠근 채 부르므로, PG 응답이
 *    느리면 그동안 그 주문 행 잠금과 DB 커넥션을 붙들고 있다. 주문 22건·저트래픽에선 문제되지 않지만,
 *    올바른 형태는 **환불 REQUESTED 로 커밋 → 트랜잭션 밖에서 PG 호출 → 짧은 2차 트랜잭션으로
 *    COMPLETED/FAILED** 다. 이렇게 하면 markRefundManual 이 노리는 재시도 표면도 자연스러워진다.
 *    이 리팩터링은 approveInTransaction 의 구조를 바꾸므로 별도 과제로 분리했다(문서 §6-3).
 *
 * @returns {Promise<{ok:boolean, refundId:number, method:string, reason?:string}>}
 */
async function refundOrder(conn, { order, claimId = null, returnShippingFee = 0, reason = '주문 취소' }) {
    const { refundAmount, shippingFeeRefund, deducted } = calcRefundAmount(order, returnShippingFee);

    // 결제가 없던 주문 — TEST 결제, 전액 적립금·쿠폰으로 0원 결제 등
    const noPayment = !order.payment_key || refundAmount === 0;
    const method = noPayment ? 'NONE' : 'PG';

    const [ins] = await conn.query(
        `INSERT INTO order_refunds (order_id, claim_id, refund_amount, shipping_fee_refund,
                                    return_shipping_fee_deducted, method, status)
         VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED')`,
        [order.id, claimId, refundAmount, shippingFeeRefund, deducted, method]
    );
    const refundId = ins.insertId;

    if (noPayment) {
        await conn.query(
            "UPDATE order_refunds SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?",
            [refundId]
        );
        return { ok: true, refundId, method };
    }

    // 전액 환불이면 cancelAmount 를 보내지 않는다(토스가 전액으로 처리).
    const partial = deducted > 0 ? refundAmount : null;
    const result = await cancelTossPayment(order.payment_key, reason, partial);

    if (result.ok) {
        await conn.query(
            "UPDATE order_refunds SET status = 'COMPLETED', completed_at = NOW(), pg_response = ? WHERE id = ?",
            [String(result.body).slice(0, 60000), refundId]
        );
        return { ok: true, refundId, method };
    }

    await conn.query(
        "UPDATE order_refunds SET status = 'FAILED', failed_reason = ?, pg_response = ? WHERE id = ?",
        [String(result.body).slice(0, 500), String(result.body).slice(0, 60000), refundId]
    );
    return { ok: false, refundId, method, reason: String(result.body).slice(0, 500) };
}

/** 실패한 환불을 운영자가 수동 처리했다고 표시한다. */
async function markRefundManual(refundId, adminMemo) {
    await pool.query(
        "UPDATE order_refunds SET status = 'COMPLETED', method = 'MANUAL', completed_at = NOW(), failed_reason = ? WHERE id = ?",
        [adminMemo || '수동 환불 처리', refundId]
    );
}

module.exports = { refundOrder, calcRefundAmount, calcReturnShippingFee, cancelTossPayment, markRefundManual };
