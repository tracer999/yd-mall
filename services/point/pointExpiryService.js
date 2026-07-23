/*
 * 포인트 유효기간 · 소멸
 *
 * ── 왜 필요한가
 * 적립금이 소멸 없이 쌓이면 회계상 부채가 무한히 늘어난다. 그리고 나중에 도입하면
 * 이미 지급된 포인트에 소급 적용할 수 없다(고객에게 "어제까지 있던 포인트가 오늘 사라졌다"가 된다).
 *
 * ── 규칙
 *   1. `point_expiry_months` 가 0/미설정이면 **기능이 꺼진 것**이다. 아무것도 소멸하지 않는다.
 *   2. 유효기간은 **적립 시점**부터 센다. 적립 트랜잭션마다 `expires_at` 을 박아 둔다.
 *   3. 사용은 **먼저 만료될 것부터**(FIFO). 그래야 고객이 손해를 덜 본다.
 *   4. 소멸은 잔액을 넘지 않는다. 이미 써 버린 적립분은 소멸시킬 것이 없다.
 *
 * ── 잔액과의 관계
 * `users.points_balance` 가 진짜 잔액이고, `point_transactions` 는 이력이다.
 * 소멸은 "아직 안 쓴 적립분" 만큼만 잔액에서 뺀다 — 이력 합계로 잔액을 다시 계산하지 않는다
 * (관리자 수동 지급·차감이 섞여 있어 재계산하면 오히려 어긋난다).
 */

const pool = require('../../config/db');

/** 설정된 유효기간(개월). 0 이면 꺼짐. */
function expiryMonths() {
    const n = Number(global.systemSettings ? global.systemSettings.point_expiry_months : 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 적립 트랜잭션에 유효기간을 새긴다. 적립을 기록하는 쪽에서 호출한다.
 * 기능이 꺼져 있으면 NULL 로 두어 "기한 없음" 이 된다.
 */
function expiresAtSql() {
    const m = expiryMonths();
    return m ? `DATE_ADD(NOW(), INTERVAL ${m} MONTH)` : 'NULL';
}

/**
 * 기한이 지난 적립분을 소멸시킨다.
 *
 * 소멸 대상 = 적립 트랜잭션 중
 *   - expires_at 이 지났고
 *   - 아직 전부 소멸 처리되지 않은 것(expired_amount < amount)
 *
 * 실제로 얼마를 뺄지는 **회원 잔액**에 걸린다. 적립분이 100P 남아 있어도 잔액이 30P 뿐이면
 * 30P 만 소멸시킨다(이미 70P 는 쓴 것이다).
 */
async function expireDuePoints() {
    if (!expiryMonths()) return { skipped: true, users: 0, expired: 0 };

    // 만료 대상이 있는 회원부터 추린다(전 회원을 훑지 않는다).
    const [targets] = await pool.query(`
        SELECT user_id, SUM(amount - expired_amount) AS expirable
        FROM point_transactions
        WHERE transaction_type = 'PURCHASE_ACCUMULATE'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
          AND amount > expired_amount
        GROUP BY user_id
        HAVING expirable > 0
        LIMIT 500
    `);

    let totalExpired = 0;
    let touchedUsers = 0;

    for (const t of targets) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [[user]] = await conn.query('SELECT points_balance FROM users WHERE id = ? FOR UPDATE', [t.user_id]);
            if (!user) { await conn.rollback(); conn.release(); continue; }

            const balance = Number(user.points_balance) || 0;
            // 잔액을 넘겨 소멸시키지 않는다 — 음수 잔액은 어떤 화면에서도 설명할 수 없다.
            let toExpire = Math.min(Number(t.expirable) || 0, balance);
            const expiredNow = toExpire;

            // 오래된 적립분부터 채워 나간다(FIFO).
            const [rows] = await conn.query(`
                SELECT id, amount, expired_amount FROM point_transactions
                WHERE user_id = ? AND transaction_type = 'PURCHASE_ACCUMULATE'
                  AND expires_at IS NOT NULL AND expires_at <= NOW() AND amount > expired_amount
                ORDER BY expires_at ASC, id ASC
                FOR UPDATE
            `, [t.user_id]);

            for (const r of rows) {
                const left = Number(r.amount) - Number(r.expired_amount);
                const take = Math.min(left, toExpire);
                /*
                 * 기한이 지난 적립분은 `take` 만큼만 실제로 소멸하고, 나머지(left − take)는
                 * **이미 써 버린 몫**이라 소멸시킬 것이 없다. 둘 다 '처리 완료'로 닫는다 —
                 * 닫지 않으면 매 회차 같은 행이 다시 걸려 영원히 훑는다.
                 */
                await conn.query('UPDATE point_transactions SET expired_amount = amount WHERE id = ?', [r.id]);
                toExpire -= take;
            }

            if (expiredNow > 0) {
                await conn.query('UPDATE users SET points_balance = points_balance - ? WHERE id = ?', [expiredNow, t.user_id]);
                await conn.query(
                    `INSERT INTO point_transactions (user_id, amount, transaction_type, description)
                     VALUES (?, ?, 'POINT_EXPIRE', ?)`,
                    [t.user_id, -expiredNow, `유효기간 만료 소멸 (${expiryMonths()}개월)`]
                );
            }

            await conn.commit();
            totalExpired += expiredNow;
            if (expiredNow > 0) touchedUsers++;
        } catch (err) {
            await conn.rollback();
            console.error('[point] 소멸 처리 실패 user=' + t.user_id + ':', err.message);
        } finally {
            conn.release();
        }
    }

    return { users: touchedUsers, expired: totalExpired };
}

/**
 * 곧 소멸될 포인트 — 회원에게 보여 주거나 관리자가 규모를 파악할 때 쓴다.
 * @param {number} userId 없으면 전체 합계
 * @param {number} withinDays 앞으로 며칠 이내
 */
async function getExpiringSoon(userId = null, withinDays = 30) {
    const params = [withinDays];
    let where = `expires_at IS NOT NULL AND expires_at > NOW()
                 AND expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
                 AND transaction_type = 'PURCHASE_ACCUMULATE' AND amount > expired_amount`;
    if (userId) { where += ' AND user_id = ?'; params.push(userId); }

    const [[row]] = await pool.query(
        `SELECT COALESCE(SUM(amount - expired_amount), 0) AS total, MIN(expires_at) AS nearest
           FROM point_transactions WHERE ${where}`, params);
    return { total: Number(row.total) || 0, nearest: row.nearest || null };
}

module.exports = { expiryMonths, expiresAtSql, expireDuePoints, getExpiringSoon };
