/*
 * 정산 리포트 — 기간별 매출 집계
 *
 * ── 무엇을 매출로 보는가
 * 결제가 살아 있는 주문만 센다 — `PAID · PREPARING · SHIPPED · DELIVERED`.
 * 대기(미결제)는 돈이 들어오지 않았고, 취소·환불은 되돌아갔다.
 * 기준 시각은 **결제일(paid_at)** 이다. 주문일과 결제일이 갈릴 때 매출은 돈이 들어온 날에 잡혀야 한다.
 *
 * ── 환불은 따로 뺀다
 * 부분 환불이 도입된 뒤로 "취소된 주문을 빼면 끝" 이 아니다. 주문은 살아 있는데 일부만
 * 돌려준 건이 생긴다. 그래서 매출(결제 기준)과 환불(`order_refunds` 기준)을 **따로 집계해
 * 순매출 = 매출 − 환불** 로 낸다. 환불은 실제로 나간 날(completed_at)에 잡는다.
 *
 * 이 규칙 때문에 어떤 달의 순매출이 그 달 매출보다 작을 수 있다(지난달 주문이 이번 달 환불됨).
 * 그게 정산의 실제 모습이다.
 */

const pool = require('../../config/db');

const LIVE_STATUSES = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'];

/** 기본 기간 — 이번 달 1일 ~ 오늘. */
function defaultRange() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(from), to: iso(now) };
}

/*
 * 몰 필터가 걸렸는지 판정.
 * `Number(null)` 은 0 이라 `Number.isFinite` 만 쓰면 "전체 몰"이 `mall_id = 0` 으로 둔갑해
 * 조회가 통째로 0건이 된다. 값이 있는지를 먼저 본다.
 */
function hasMall(mallId) {
    return mallId !== null && mallId !== undefined && mallId !== '' && Number.isFinite(Number(mallId));
}

function buildScope({ from, to, mallId, orderType }) {
    const params = [`${from} 00:00:00`, `${to} 23:59:59`];
    let where = `o.paid_at BETWEEN ? AND ? AND o.status IN ('${LIVE_STATUSES.join("','")}')`;
    if (hasMall(mallId)) { where += ' AND o.mall_id = ?'; params.push(Number(mallId)); }
    if (orderType === 'B2C' || orderType === 'B2B') { where += ' AND o.order_type = ?'; params.push(orderType); }
    return { where, params };
}

/** 요약 — 건수·매출·할인·환불·순매출. */
async function getSummary({ from, to, mallId, orderType }) {
    const { where, params } = buildScope({ from, to, mallId, orderType });

    const [[sales]] = await pool.query(`
        SELECT COUNT(*) AS order_count,
               COALESCE(SUM(o.total_amount), 0)      AS gross,
               COALESCE(SUM(o.subtotal_amount), 0)   AS items_amount,
               COALESCE(SUM(o.shipping_fee), 0)      AS shipping_fee,
               COALESCE(SUM(o.shipping_discount), 0) AS shipping_discount,
               COALESCE(SUM(o.coupon_discount), 0)   AS coupon_discount,
               COALESCE(SUM(o.grade_discount), 0)    AS grade_discount,
               COALESCE(SUM(o.point_used), 0)        AS point_used
          FROM orders o
         WHERE ${where}
    `, params);

    // 환불은 실제로 나간 날 기준. 주문의 결제일이 이 기간 밖이어도 이번 기간의 지출이다.
    const refundParams = [`${from} 00:00:00`, `${to} 23:59:59`];
    let refundWhere = 'r.status = \'COMPLETED\' AND r.completed_at BETWEEN ? AND ?';
    if (hasMall(mallId)) { refundWhere += ' AND o.mall_id = ?'; refundParams.push(Number(mallId)); }
    if (orderType === 'B2C' || orderType === 'B2B') { refundWhere += ' AND o.order_type = ?'; refundParams.push(orderType); }

    const [[refund]] = await pool.query(`
        SELECT COUNT(*) AS refund_count,
               COALESCE(SUM(r.refund_amount), 0) AS refund_amount,
               COALESCE(SUM(r.return_shipping_fee_deducted), 0) AS return_fee
          FROM order_refunds r
          JOIN orders o ON o.id = r.order_id
         WHERE ${refundWhere}
    `, refundParams);

    const gross = Number(sales.gross) || 0;
    const refundAmount = Number(refund.refund_amount) || 0;

    return {
        orderCount: Number(sales.order_count) || 0,
        gross,
        itemsAmount: Number(sales.items_amount) || 0,
        shippingFee: Number(sales.shipping_fee) || 0,
        shippingDiscount: Number(sales.shipping_discount) || 0,
        couponDiscount: Number(sales.coupon_discount) || 0,
        gradeDiscount: Number(sales.grade_discount) || 0,
        pointUsed: Number(sales.point_used) || 0,
        refundCount: Number(refund.refund_count) || 0,
        refundAmount,
        returnFee: Number(refund.return_fee) || 0,
        net: gross - refundAmount,
        avgOrderValue: sales.order_count > 0 ? Math.round(gross / Number(sales.order_count)) : 0,
    };
}

/** 일자별 매출 — 그래프·표에 함께 쓴다. */
async function getDaily({ from, to, mallId, orderType }) {
    const { where, params } = buildScope({ from, to, mallId, orderType });
    const [rows] = await pool.query(`
        SELECT DATE(o.paid_at) AS day,
               COUNT(*) AS order_count,
               COALESCE(SUM(o.total_amount), 0) AS gross
          FROM orders o
         WHERE ${where}
         GROUP BY DATE(o.paid_at)
         ORDER BY day
    `, params);

    const refundParams = [`${from} 00:00:00`, `${to} 23:59:59`];
    let refundWhere = 'r.status = \'COMPLETED\' AND r.completed_at BETWEEN ? AND ?';
    if (hasMall(mallId)) { refundWhere += ' AND o.mall_id = ?'; refundParams.push(Number(mallId)); }
    if (orderType === 'B2C' || orderType === 'B2B') { refundWhere += ' AND o.order_type = ?'; refundParams.push(orderType); }
    const [refunds] = await pool.query(`
        SELECT DATE(r.completed_at) AS day, COALESCE(SUM(r.refund_amount), 0) AS refund_amount
          FROM order_refunds r JOIN orders o ON o.id = r.order_id
         WHERE ${refundWhere}
         GROUP BY DATE(r.completed_at)
    `, refundParams);

    const refundByDay = new Map(refunds.map((r) => [String(r.day), Number(r.refund_amount) || 0]));
    // 환불만 있고 매출이 없는 날도 표에 있어야 한다(그날 돈이 나갔다는 사실이 사라지면 안 된다).
    const days = new Map(rows.map((r) => [String(r.day), {
        day: r.day, orderCount: Number(r.order_count), gross: Number(r.gross), refund: 0, net: Number(r.gross),
    }]));
    for (const [day, amount] of refundByDay) {
        if (!days.has(day)) days.set(day, { day, orderCount: 0, gross: 0, refund: amount, net: -amount });
        else {
            const d = days.get(day);
            d.refund = amount;
            d.net = d.gross - amount;
        }
    }
    return [...days.values()].sort((a, b) => String(a.day) < String(b.day) ? -1 : 1);
}

/** 상품별 매출 — 무엇이 팔렸는지. 취소·환불된 주문은 애초에 집계에서 빠진다. */
async function getByProduct({ from, to, mallId, orderType, limit = 50 }) {
    const { where, params } = buildScope({ from, to, mallId, orderType });
    const [rows] = await pool.query(`
        SELECT oi.product_id, oi.product_name,
               SUM(oi.quantity) AS qty,
               COALESCE(SUM(oi.total_price), 0) AS amount,
               COUNT(DISTINCT o.id) AS order_count
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE ${where}
         GROUP BY oi.product_id, oi.product_name
         ORDER BY amount DESC
         LIMIT ?
    `, [...params, Number(limit)]);
    return rows.map((r) => ({ ...r, qty: Number(r.qty), amount: Number(r.amount), order_count: Number(r.order_count) }));
}

/** 결제수단별 — 정산 대사(對査)에 쓴다. */
async function getByPaymentMethod({ from, to, mallId, orderType }) {
    const { where, params } = buildScope({ from, to, mallId, orderType });
    const [rows] = await pool.query(`
        SELECT COALESCE(NULLIF(o.payment_method, ''), '미기재') AS method,
               COUNT(*) AS order_count,
               COALESCE(SUM(o.total_amount), 0) AS amount
          FROM orders o
         WHERE ${where}
         GROUP BY method
         ORDER BY amount DESC
    `, params);
    return rows.map((r) => ({ ...r, order_count: Number(r.order_count), amount: Number(r.amount) }));
}

module.exports = { defaultRange, getSummary, getDaily, getByProduct, getByPaymentMethod, LIVE_STATUSES };
