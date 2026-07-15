/*
 * 회원 등급 상태 관리 (customer_membership) + 변경 이력 (설계 §8, §10)
 *
 * 회원은 몰 전역이지만 등급은 (user_id, mall_id) 로 분리된다(설계 부록 A.7).
 * 등급 상태가 없으면 기본 가입 등급으로 지연 생성(ensureMembership)한다.
 */

const pool = require('../../config/db');
const gradeService = require('./gradeService');
const gradeCouponService = require('./gradeCouponService');

/**
 * (user, mall) 등급 상태를 보장한다. 없으면 기본 등급으로 생성 + SIGNUP 이력.
 * @returns {Promise<object>} customer_membership 행
 */
async function ensureMembership(userId, mallId) {
    const [[existing]] = await pool.query(
        'SELECT * FROM customer_membership WHERE user_id = ? AND mall_id = ?',
        [userId, mallId]
    );
    if (existing) return existing;

    const defaultGrade = await gradeService.getDefaultGrade(mallId);
    const gradeId = defaultGrade ? defaultGrade.id : null;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `INSERT INTO customer_membership (user_id, mall_id, current_grade_id, grade_started_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE user_id = user_id`,
            [userId, mallId, gradeId]
        );
        await conn.query(
            `INSERT INTO membership_grade_history (user_id, mall_id, from_grade_id, to_grade_id, change_type, reason_code, changed_by)
             VALUES (?, ?, NULL, ?, 'SIGNUP', 'AUTO', 'SYSTEM')`,
            [userId, mallId, gradeId]
        );
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
    const [[row]] = await pool.query(
        'SELECT * FROM customer_membership WHERE user_id = ? AND mall_id = ?',
        [userId, mallId]
    );
    return row;
}

/** 등급 정보까지 조인해 반환. 상태가 없으면 null(생성하지 않음 — 조회 전용). */
async function getMembershipWithGrade(userId, mallId) {
    const [[row]] = await pool.query(
        `SELECT cm.*, g.grade_code, g.grade_name, g.rank_order, g.color, g.badge_icon, g.mypage_note,
                b.discount_rate, b.max_discount_amount, b.min_order_amount,
                b.point_rate, b.point_rate_mode, b.free_shipping, b.free_ship_threshold,
                b.discount_enabled, b.point_enabled, b.shipping_enabled
           FROM customer_membership cm
           LEFT JOIN membership_grade g ON g.id = cm.current_grade_id
           LEFT JOIN membership_grade_benefit b ON b.grade_id = g.id
          WHERE cm.user_id = ? AND cm.mall_id = ?`,
        [userId, mallId]
    );
    return row || null;
}

/**
 * 등급을 변경하고 이력을 남긴다. 트랜잭션 conn 을 넘기면 그 안에서 실행한다.
 * @param {import('mysql2/promise').PoolConnection|null} conn
 * @param {object} p { userId, mallId, toGradeId, changeType, reasonCode, reasonText,
 *                      policyId, evaluationRunId, recognizedAmount, recognizedOrderCount,
 *                      changedBy, expiresAt }
 */
async function setGrade(conn, p) {
    const db = conn || pool;
    const [[cur]] = await db.query(
        'SELECT current_grade_id FROM customer_membership WHERE user_id = ? AND mall_id = ?',
        [p.userId, p.mallId]
    );
    const fromGradeId = cur ? cur.current_grade_id : null;

    await db.query(
        `INSERT INTO customer_membership
            (user_id, mall_id, current_grade_id, grade_started_at, grade_expires_at,
             recognized_amount, recognized_order_count, last_evaluated_at, next_evaluation_at)
         VALUES (?, ?, ?, NOW(), ?, ?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE
            current_grade_id = VALUES(current_grade_id),
            grade_started_at = IF(current_grade_id <> VALUES(current_grade_id), NOW(), grade_started_at),
            grade_expires_at = VALUES(grade_expires_at),
            recognized_amount = VALUES(recognized_amount),
            recognized_order_count = VALUES(recognized_order_count),
            last_evaluated_at = NOW(),
            next_evaluation_at = VALUES(next_evaluation_at)`,
        [
            p.userId, p.mallId, p.toGradeId, p.expiresAt || null,
            p.recognizedAmount != null ? p.recognizedAmount : 0,
            p.recognizedOrderCount != null ? p.recognizedOrderCount : 0,
            p.nextEvaluationAt || null,
        ]
    );

    // 등급이 실제로 바뀐 경우에만 변경 이력을 남긴다(유지는 상태 갱신만).
    const changed = Number(fromGradeId) !== Number(p.toGradeId);
    if (changed || p.forceHistory) {
        await db.query(
            `INSERT INTO membership_grade_history
                (user_id, mall_id, from_grade_id, to_grade_id, change_type, reason_code, reason_text,
                 policy_id, evaluation_run_id, recognized_amount, changed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                p.userId, p.mallId, fromGradeId, p.toGradeId, p.changeType || 'MANUAL',
                p.reasonCode || null, p.reasonText || null, p.policyId || null,
                p.evaluationRunId || null, p.recognizedAmount != null ? p.recognizedAmount : null,
                p.changedBy || 'SYSTEM',
            ]
        );
    }

    /*
     * 등급 진입 쿠폰 자동 발급 (설계 §7.1, 2차). 승급·수동 상향으로 새 등급에 진입할 때만.
     * 강등·가입(BASIC)에는 발급하지 않는다. best-effort — 발급 실패가 등급 변경을 되돌리지 않는다.
     * skipIfHeld 로 재평가 시 중복 발급되지 않는다.
     */
    if (changed && ['UPGRADE', 'MANUAL'].includes(p.changeType) && p.toGradeId) {
        try {
            await gradeCouponService.issueEntryCoupons(p.userId, p.toGradeId);
        } catch (e) {
            console.error('[membership] entry coupon issuance failed (user ' + p.userId + ', grade ' + p.toGradeId + '):', e.message);
        }
    }
    return { fromGradeId, toGradeId: p.toGradeId, changed };
}

/** 등급 고정/해제(설계 §8.3). */
async function setLock(userId, mallId, locked, { reason, expiresAt, changedBy } = {}) {
    await ensureMembership(userId, mallId);
    await pool.query(
        `UPDATE customer_membership
            SET is_locked = ?, lock_reason = ?, lock_expires_at = ?
          WHERE user_id = ? AND mall_id = ?`,
        [locked ? 1 : 0, locked ? reason || null : null, locked ? expiresAt || null : null, userId, mallId]
    );
    const [[cm]] = await pool.query(
        'SELECT current_grade_id FROM customer_membership WHERE user_id = ? AND mall_id = ?',
        [userId, mallId]
    );
    await pool.query(
        `INSERT INTO membership_grade_history (user_id, mall_id, from_grade_id, to_grade_id, change_type, reason_code, reason_text, changed_by)
         VALUES (?, ?, ?, ?, ?, 'LOCK', ?, ?)`,
        [userId, mallId, cm ? cm.current_grade_id : null, cm ? cm.current_grade_id : null,
         locked ? 'LOCK' : 'UNLOCK', reason || null, changedBy || 'SYSTEM']
    );
}

module.exports = {
    ensureMembership,
    getMembershipWithGrade,
    setGrade,
    setLock,
};
