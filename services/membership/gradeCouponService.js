/*
 * 등급 진입 쿠폰(쿠폰팩) — 설계 §7.1, 멤버십 2차
 *
 * 등급에 연결된 쿠폰을 회원이 그 등급에 **진입(승급/수동 상향)** 할 때 자동 발급한다.
 * 발급은 기존 couponIssueService.issueCoupon 을 그대로 재사용한다(선착순·유효기간·중복 보유 판정 일원화).
 */

const pool = require('../../config/db');
const couponIssueService = require('../coupon/couponIssueService');

/** 등급에 연결된 쿠폰(활성) 목록 — 관리자 표시용. */
async function getGradeCoupons(gradeId) {
    const [rows] = await pool.query(
        `SELECT gc.id, gc.coupon_id, gc.is_active, c.name, c.status AS coupon_status
           FROM membership_grade_coupon gc
           JOIN coupons c ON c.id = gc.coupon_id
          WHERE gc.grade_id = ? AND gc.issue_on = 'ENTRY'
          ORDER BY gc.id`,
        [gradeId]
    );
    return rows;
}

/** 등급에 연결된 coupon_id 배열. */
async function getLinkedCouponIds(gradeId) {
    const [rows] = await pool.query(
        "SELECT coupon_id FROM membership_grade_coupon WHERE grade_id = ? AND issue_on = 'ENTRY'",
        [gradeId]
    );
    return rows.map((r) => Number(r.coupon_id));
}

/** 몰에서 진입 쿠폰으로 연결 가능한 쿠폰(활성) 목록. mall_id NULL(전몰 공용) 포함. */
async function listLinkableCoupons(mallId) {
    const [rows] = await pool.query(
        `SELECT id, name, benefit_type, issue_method
           FROM coupons
          WHERE status = 'ACTIVE' AND (mall_id = ? OR mall_id IS NULL)
          ORDER BY id DESC`,
        [mallId]
    );
    return rows;
}

/** 등급의 진입 쿠폰 연결을 교체한다(전달된 coupon_id 집합으로 replace). */
async function setGradeCoupons(gradeId, couponIds) {
    const ids = (Array.isArray(couponIds) ? couponIds : [couponIds])
        .map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        if (ids.length === 0) {
            await conn.query("DELETE FROM membership_grade_coupon WHERE grade_id = ? AND issue_on = 'ENTRY'", [gradeId]);
        } else {
            const placeholders = ids.map(() => '?').join(',');
            await conn.query(
                `DELETE FROM membership_grade_coupon WHERE grade_id = ? AND issue_on = 'ENTRY' AND coupon_id NOT IN (${placeholders})`,
                [gradeId, ...ids]
            );
            for (const cid of ids) {
                await conn.query(
                    `INSERT INTO membership_grade_coupon (grade_id, coupon_id, issue_on, is_active)
                     VALUES (?, ?, 'ENTRY', 1)
                     ON DUPLICATE KEY UPDATE is_active = 1`,
                    [gradeId, cid]
                );
            }
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/**
 * 등급 진입 쿠폰을 회원에게 발급한다. 승급/수동 상향 직후 호출.
 * 이미 미사용 상태로 보유 중이면 건너뛴다(skipIfHeld) — 재평가로 중복 발급되지 않는다.
 * best-effort: 한 장이 마감/오류여도 나머지는 계속 발급한다.
 * @returns {Promise<{issued:number, skipped:number}>}
 */
async function issueEntryCoupons(userId, gradeId) {
    if (!userId || !gradeId) return { issued: 0, skipped: 0 };
    const [coupons] = await pool.query(
        `SELECT c.*
           FROM membership_grade_coupon gc
           JOIN coupons c ON c.id = gc.coupon_id
          WHERE gc.grade_id = ? AND gc.issue_on = 'ENTRY' AND gc.is_active = 1 AND c.status = 'ACTIVE'`,
        [gradeId]
    );
    if (coupons.length === 0) return { issued: 0, skipped: 0 };

    let issued = 0;
    let skipped = 0;
    for (const coupon of coupons) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const r = await couponIssueService.issueCoupon(conn, {
                userId, coupon, issuedBy: 'EVENT', skipIfHeld: true,
            });
            await conn.commit();
            if (r.ok) issued++; else skipped++;
        } catch (e) {
            await conn.rollback();
            skipped++;
            console.error('[membership] entry coupon issue failed (coupon ' + coupon.id + '):', e.message);
        } finally {
            conn.release();
        }
    }
    return { issued, skipped };
}

module.exports = {
    getGradeCoupons,
    getLinkedCouponIds,
    listLinkableCoupons,
    setGradeCoupons,
    issueEntryCoupons,
};
