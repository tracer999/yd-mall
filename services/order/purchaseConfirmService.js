/*
 * 구매확정
 *
 * ── 무엇인가
 * `배송완료` 는 "물건이 도착했다"일 뿐이다. 고객이 물건을 확인하고 받아들였다는 뜻은 아니며,
 * 그 사이가 반품 가능 기간(7일)이다. 구매확정은 고객이 그 기간을 스스로 끝내는 행위다.
 *
 * 확정 시점이 두 가지를 가른다.
 *   1) **적립금을 실제로 주는 시점**
 *   2) **반품을 더 받지 않는 시점**
 *
 * ── 적립을 왜 여기서 주나
 * 결제 즉시 적립하면 반품하는 고객에게도 일단 줬다가 도로 뺏어야 한다. 이미 써 버렸으면
 * 회수할 수도 없다(취소 복원이 "잔액만큼만" 깎는 이유가 이것이다). 확정 시 지급하면
 * 그 문제 자체가 없어진다.
 *
 * ── 구매확정 도입 전 주문
 * 예전 주문은 결제 시점에 이미 적립을 받았다. 그 주문을 지금 확정해도 **다시 주지 않는다** —
 * `PURCHASE_ACCUMULATE` 이력이 있으면 지급을 건너뛴다. 이 가드가 없으면 옛 주문을 확정하는
 * 것만으로 포인트가 두 번 들어온다.
 *
 * ── 멱등하다
 * `orders.confirmed_at` 을 조건부 UPDATE 해 "내가 첫 번째"임을 확보한 뒤에만 적립한다.
 * 고객이 버튼을 두 번 누르거나 자동 확정과 겹쳐도 포인트는 한 번만 나간다.
 */

const pool = require('../../config/db');
const pointExpiry = require('../point/pointExpiryService');

/** 구매확정할 수 있는 주문 상태. 물건을 받은 뒤에만 확정한다. */
const CONFIRMABLE = new Set(['DELIVERED']);

function getNumberSetting(key, fallback) {
    const raw = global.systemSettings ? global.systemSettings[key] : null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * 이 주문을 지금 확정할 수 있는가.
 * @returns {{ok: boolean, reason?: string}}
 */
function confirmability(order) {
    if (!order) return { ok: false, reason: '주문을 찾을 수 없습니다.' };
    if (order.confirmed_at) return { ok: false, reason: '이미 구매확정된 주문입니다.' };
    if (['CANCELLED', 'REFUNDED'].includes(order.status)) return { ok: false, reason: '취소된 주문입니다.' };
    if (order.claim_status === 'REQUESTED') {
        return { ok: false, reason: '취소·반품 신청이 처리 중입니다. 결과를 기다려 주세요.' };
    }
    if (!CONFIRMABLE.has(order.status)) {
        return { ok: false, reason: '배송이 완료된 뒤에 구매확정할 수 있습니다.' };
    }
    return { ok: true };
}

/**
 * 이 주문으로 지급할 적립금.
 *
 * 적립은 **상품 결제액**에만 붙인다(배송비에 적립을 주면 배송비를 내고 포인트를 버는 셈).
 * 부분 취소·반품이 있었다면 **돌려준 금액을 뺀 실제 결제액** 기준으로 준다 —
 * 반품한 물건 값까지 적립해 주면 안 된다.
 * 적립률은 주문 시점 스냅샷(등급 반영)을 쓰고, 없으면 시스템 기본률로 폴백한다.
 */
async function calcReward(conn, order) {
    const [[snap]] = await conn.query(
        'SELECT grade_point_rate FROM order_membership_benefit_snapshot WHERE order_id = ?', [order.id]);
    const baseRate = getNumberSetting('point_accumulate_rate', 0);
    const rate = snap && snap.grade_point_rate != null ? Number(snap.grade_point_rate) : baseRate;
    if (!(rate > 0)) return { amount: 0, rate };

    const [[refunded]] = await conn.query(
        `SELECT COALESCE(SUM(refund_amount), 0) AS amt FROM order_refunds
          WHERE order_id = ? AND status = 'COMPLETED'`, [order.id]);

    const netShipping = (Number(order.shipping_fee) || 0) - (Number(order.shipping_discount) || 0);
    const base = Math.max(0,
        (Number(order.total_amount) || 0) - netShipping - (Number(refunded.amt) || 0));
    return { amount: Math.floor((base * rate) / 100), rate };
}

/**
 * 구매확정 실행.
 *
 * @param {number} orderId
 * @param {{source?: 'CUSTOMER'|'AUTO'|'ADMIN', userId?: number|null, actorId?: number|null}} opts
 * @returns {Promise<{ok:boolean, reason?:string, reward?:number}>}
 */
async function confirmPurchase(orderId, { source = 'CUSTOMER', userId = null, actorId = null } = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            `SELECT id, user_id, status, claim_status, confirmed_at, total_amount,
                    shipping_fee, shipping_discount, order_type
               FROM orders WHERE id = ? FOR UPDATE`, [orderId]);

        // 고객 요청이면 소유자여야 한다. 자동·관리자는 userId 를 넘기지 않는다.
        if (userId != null && order && Number(order.user_id) !== Number(userId)) {
            await conn.rollback();
            return { ok: false, reason: '주문을 찾을 수 없습니다.' };
        }

        const verdict = confirmability(order);
        if (!verdict.ok) { await conn.rollback(); return verdict; }

        /*
         * 멱등 가드 — 조건부 UPDATE 의 affectedRows 로 "내가 첫 번째"임을 확보한다.
         * 버튼 두 번 클릭·자동 확정과의 경합에서 적립이 두 번 나가는 것을 막는다.
         */
        const [claimed] = await conn.query(
            `UPDATE orders SET confirmed_at = NOW(), confirm_source = ?
              WHERE id = ? AND confirmed_at IS NULL`,
            [source, orderId]
        );
        if (claimed.affectedRows === 0) {
            await conn.rollback();
            return { ok: false, reason: '이미 구매확정된 주문입니다.' };
        }

        let reward = 0;
        if (order.user_id) {
            /*
             * 구매확정 도입 전 주문은 결제 시점에 이미 적립을 받았다. 다시 주지 않는다.
             * (이 가드가 없으면 옛 주문을 확정하는 것만으로 포인트가 두 번 들어온다)
             */
            const [[already]] = await conn.query(
                `SELECT COUNT(*) AS c FROM point_transactions
                  WHERE order_id = ? AND transaction_type IN ('PURCHASE_ACCUMULATE','PURCHASE_CONFIRM')`,
                [orderId]
            );
            if (Number(already.c) === 0) {
                const calc = await calcReward(conn, order);
                reward = calc.amount;
                if (reward > 0) {
                    await conn.query('UPDATE users SET points_balance = points_balance + ? WHERE id = ?',
                        [reward, order.user_id]);
                    await conn.query(
                        `INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description, expires_at)
                         VALUES (?, ?, 'PURCHASE_CONFIRM', ?, ?, ${pointExpiry.expiresAtSql()})`,
                        [order.user_id, reward, orderId, `구매확정 적립 (${calc.rate}%)`]
                    );
                }
            }
        }

        // 이력에 남긴다. 상태(status)는 그대로 DELIVERED 다 — 구매확정은 별도 축이다.
        await conn.query(
            `INSERT INTO order_status_logs (order_id, actor_type, actor_id, field, old_value, new_value, memo)
             VALUES (?, ?, ?, 'confirmed_at', NULL, NOW(), ?)`,
            [orderId, source === 'CUSTOMER' ? 'CUSTOMER' : (source === 'ADMIN' ? 'ADMIN' : 'SYSTEM'),
             source === 'CUSTOMER' ? userId : actorId,
             reward > 0 ? `구매확정 (적립 ${reward}P)` : '구매확정']
        ).catch(() => {});   // 로그 스키마가 달라도 확정 자체는 막지 않는다

        await conn.commit();
        return { ok: true, reward };
    } catch (err) {
        await conn.rollback();
        console.error('[purchaseConfirm] 실패 order=' + orderId + ':', err.message);
        return { ok: false, reason: '처리 중 오류가 발생했습니다.' };
    } finally {
        conn.release();
    }
}

/**
 * 배송완료 후 N일이 지난 주문을 자동으로 구매확정한다.
 * `auto_confirm_days` 가 0/미설정이면 돌지 않는다(기본 꺼짐).
 *
 * 반품 가능 기간보다 짧게 잡으면 고객이 반품할 시간을 뺏기므로,
 * 최소 반품 기간(7일) 이상으로만 동작시킨다.
 */
async function autoConfirmDue() {
    /*
     * 기본값이 **7일로 켜져 있다**(다른 자동화와 달리 기본 꺼짐이 아니다).
     * 적립금은 구매확정 때 지급되므로, 이 잡이 꺼져 있고 고객도 버튼을 누르지 않으면
     * 포인트가 영영 나가지 않는다. 그 편이 고객에게 훨씬 나쁘다.
     * 끄고 싶으면 사이트 설정에서 0 으로 두면 된다.
     */
    const days = getNumberSetting('auto_confirm_days', 7);
    if (!days) return { skipped: true, done: 0 };

    const { RETURN_WINDOW_DAYS } = require('./claimService');
    const effective = Math.max(days, RETURN_WINDOW_DAYS);

    const [rows] = await pool.query(`
        SELECT o.id
          FROM orders o
          JOIN shipments s ON s.order_id = o.id AND s.direction = 'OUTBOUND'
         WHERE o.status = 'DELIVERED'
           AND o.confirmed_at IS NULL
           AND o.claim_status <> 'REQUESTED'
           AND s.delivered_at IS NOT NULL
           AND s.delivered_at <= DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT 500
    `, [effective]);

    let done = 0;
    for (const r of rows) {
        const res = await confirmPurchase(r.id, { source: 'AUTO' });
        if (res.ok) done++;
    }
    return { checked: rows.length, done, days: effective };
}

module.exports = { confirmPurchase, confirmability, autoConfirmDue, calcReward, CONFIRMABLE };
