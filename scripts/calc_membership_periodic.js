/*
 * 정기(월) 쿠폰 발급 배치 (설계 §7.1, 2차) — 매월 실행
 *
 * 등급을 보유한 활성 회원에게, 그 회원 현재 등급의 정기(PERIODIC) 쿠폰을 발급한다.
 * 월 1회 발급은 membership_periodic_issue_log 가 보장한다(멱등).
 *
 * 사용:
 *   node scripts/calc_membership_periodic.js            # 이번 달
 *   node scripts/calc_membership_periodic.js --ym 2026-08
 *
 * ⚠️ _bootstrap 먼저. 종료코드: 실패 있으면 1.
 */

const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; }

(async () => {
    await require('./_bootstrap')();
    const pool = require('../config/db');
    const gradeCouponService = require('../services/membership/gradeCouponService');

    const now = new Date();
    let ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ymArg = arg('ym');
    if (ymArg && /^\d{4}-\d{2}$/.test(ymArg)) ym = ymArg;

    // 등급 보유 활성 회원 (몰별 등급 행 단위)
    const [rows] = await pool.query(
        `SELECT cm.user_id, cm.mall_id, cm.current_grade_id
           FROM customer_membership cm
           JOIN users u ON u.id = cm.user_id
          WHERE u.is_active = 1 AND cm.current_grade_id IS NOT NULL`
    );

    let issued = 0, skipped = 0, failed = 0, targets = 0;
    for (const r of rows) {
        targets++;
        try {
            const res = await gradeCouponService.issuePeriodicCoupons(r.user_id, r.mall_id, r.current_grade_id, ym);
            issued += res.issued;
            skipped += res.skipped;
        } catch (e) {
            failed++;
            console.error(`[FAIL] user=${r.user_id} mall=${r.mall_id} — ${e.message}`);
        }
    }

    console.log(`[DONE] ym=${ym} 대상 ${targets} · 발급 ${issued} · 건너뜀 ${skipped} · 실패 ${failed}`);
    await pool.end();
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
