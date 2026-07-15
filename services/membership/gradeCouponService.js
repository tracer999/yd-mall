/*
 * 등급 쿠폰(쿠폰팩·생일) — 설계 §7.1, 멤버십 2차
 *
 * 등급에 연결된 쿠폰을 두 시점에 자동 발급한다.
 *   ENTRY    — 회원이 그 등급에 진입(승급/수동 상향)할 때 (gradeCouponService.issueEntryCoupons)
 *   BIRTHDAY — 회원 생일에, 그 회원 현재 등급의 생일 쿠폰 (issueBirthdayCoupons, 일일 배치)
 * 발급은 기존 couponIssueService.issueCoupon 을 재사용한다. 생일은 연 1회 발급 로그로 멱등 보장.
 */

const pool = require('../../config/db');
const couponIssueService = require('../coupon/couponIssueService');

const ISSUE_ON = ['ENTRY', 'BIRTHDAY', 'PERIODIC'];
function normOn(issueOn) { return ISSUE_ON.includes(issueOn) ? issueOn : 'ENTRY'; }

/** 등급에 연결된 coupon_id 배열 (시점별). */
async function getLinkedCouponIds(gradeId, issueOn = 'ENTRY') {
    const [rows] = await pool.query(
        'SELECT coupon_id FROM membership_grade_coupon WHERE grade_id = ? AND issue_on = ?',
        [gradeId, normOn(issueOn)]
    );
    return rows.map((r) => Number(r.coupon_id));
}

/** 몰에서 연결 가능한 쿠폰(활성) 목록. mall_id NULL(전몰 공용) 포함. */
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

/** 등급의 특정 시점 쿠폰 연결을 교체한다(전달된 coupon_id 집합으로 replace). */
async function setGradeCoupons(gradeId, couponIds, issueOn = 'ENTRY') {
    const on = normOn(issueOn);
    const ids = (Array.isArray(couponIds) ? couponIds : [couponIds])
        .map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        if (ids.length === 0) {
            await conn.query('DELETE FROM membership_grade_coupon WHERE grade_id = ? AND issue_on = ?', [gradeId, on]);
        } else {
            const placeholders = ids.map(() => '?').join(',');
            await conn.query(
                `DELETE FROM membership_grade_coupon WHERE grade_id = ? AND issue_on = ? AND coupon_id NOT IN (${placeholders})`,
                [gradeId, on, ...ids]
            );
            for (const cid of ids) {
                await conn.query(
                    `INSERT INTO membership_grade_coupon (grade_id, coupon_id, issue_on, is_active)
                     VALUES (?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE is_active = 1`,
                    [gradeId, cid, on]
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

/** 등급의 특정 시점 활성 쿠폰 행(coupons 조인) 로드. */
async function loadGradeCoupons(gradeId, issueOn) {
    const [coupons] = await pool.query(
        `SELECT c.*
           FROM membership_grade_coupon gc
           JOIN coupons c ON c.id = gc.coupon_id
          WHERE gc.grade_id = ? AND gc.issue_on = ? AND gc.is_active = 1 AND c.status = 'ACTIVE'`,
        [gradeId, normOn(issueOn)]
    );
    return coupons;
}

/**
 * 등급 진입 쿠폰 발급 (승급/수동 상향 직후). 이미 미사용 보유 중이면 건너뜀(skipIfHeld).
 * @returns {Promise<{issued:number, skipped:number}>}
 */
async function issueEntryCoupons(userId, gradeId) {
    if (!userId || !gradeId) return { issued: 0, skipped: 0 };
    const coupons = await loadGradeCoupons(gradeId, 'ENTRY');
    let issued = 0, skipped = 0;
    for (const coupon of coupons) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const r = await couponIssueService.issueCoupon(conn, { userId, coupon, issuedBy: 'EVENT', skipIfHeld: true });
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

/**
 * 생일 쿠폰 발급. 회원 현재 등급의 BIRTHDAY 쿠폰을 발급하되 **연 1회**만(로그 가드).
 * 한 트랜잭션에서 로그 선점 → 발급. 발급 실패 시 롤백으로 로그도 되돌려 재시도 가능하게 한다.
 * @returns {Promise<{issued:number, skipped:number}>}
 */
async function issueBirthdayCoupons(userId, mallId, gradeId, year) {
    if (!userId || !gradeId) return { issued: 0, skipped: 0 };
    const yr = Number(year) || new Date().getFullYear();
    const coupons = await loadGradeCoupons(gradeId, 'BIRTHDAY');
    let issued = 0, skipped = 0;
    for (const coupon of coupons) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            // 연 1회 가드: 이미 올해 발급 로그가 있으면 affectedRows=0 → 건너뜀.
            const [logRes] = await conn.query(
                'INSERT IGNORE INTO membership_birthday_issue_log (user_id, mall_id, coupon_id, issue_year) VALUES (?, ?, ?, ?)',
                [userId, mallId || null, coupon.id, yr]
            );
            if (logRes.affectedRows === 0) {
                await conn.commit();
                skipped++;
                continue;
            }
            const r = await couponIssueService.issueCoupon(conn, { userId, coupon, issuedBy: 'EVENT', skipIfHeld: false });
            if (r.ok) {
                await conn.commit();
                issued++;
            } else {
                await conn.rollback(); // 로그도 되돌린다 → 다음 실행에서 재시도
                skipped++;
            }
        } catch (e) {
            await conn.rollback();
            skipped++;
            console.error('[membership] birthday coupon issue failed (coupon ' + coupon.id + '):', e.message);
        } finally {
            conn.release();
        }
    }
    return { issued, skipped };
}

/**
 * 정기(월) 쿠폰 발급. 회원 현재 등급의 PERIODIC 쿠폰을 **월 1회**만 발급(로그 가드).
 * @param {string} periodYm 'YYYY-MM'
 * @returns {Promise<{issued:number, skipped:number}>}
 */
async function issuePeriodicCoupons(userId, mallId, gradeId, periodYm) {
    if (!userId || !gradeId || !periodYm) return { issued: 0, skipped: 0 };
    const coupons = await loadGradeCoupons(gradeId, 'PERIODIC');
    let issued = 0, skipped = 0;
    for (const coupon of coupons) {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [logRes] = await conn.query(
                'INSERT IGNORE INTO membership_periodic_issue_log (user_id, mall_id, coupon_id, period_ym) VALUES (?, ?, ?, ?)',
                [userId, mallId || null, coupon.id, periodYm]
            );
            if (logRes.affectedRows === 0) { await conn.commit(); skipped++; continue; }
            const r = await couponIssueService.issueCoupon(conn, { userId, coupon, issuedBy: 'EVENT', skipIfHeld: false });
            if (r.ok) { await conn.commit(); issued++; }
            else { await conn.rollback(); skipped++; }
        } catch (e) {
            await conn.rollback();
            skipped++;
            console.error('[membership] periodic coupon issue failed (coupon ' + coupon.id + '):', e.message);
        } finally {
            conn.release();
        }
    }
    return { issued, skipped };
}

module.exports = {
    getLinkedCouponIds,
    listLinkableCoupons,
    setGradeCoupons,
    issueEntryCoupons,
    issueBirthdayCoupons,
    issuePeriodicCoupons,
};
