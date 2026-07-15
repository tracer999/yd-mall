/*
 * 생일 쿠폰 발급 배치 (설계 §7.1, 2차) — 일일 실행
 *
 * 오늘 생일인 활성 회원에게, 그 회원의 **현재 등급에 연결된 생일 쿠폰**을 발급한다.
 * 연 1회 발급은 membership_birthday_issue_log 가 보장한다(멱등).
 *
 * 사용:
 *   node scripts/calc_membership_birthday.js               # 오늘 생일자
 *   node scripts/calc_membership_birthday.js --date 03-15  # 특정 월-일(테스트)
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
    const year = now.getFullYear();
    let month = now.getMonth() + 1;
    let day = now.getDate();
    const dateArg = arg('date'); // MM-DD
    if (dateArg && /^\d{1,2}-\d{1,2}$/.test(dateArg)) {
        const [m, d] = dateArg.split('-').map(Number);
        month = m; day = d;
    }

    // 오늘 생일 + 등급 보유 회원 (몰별 등급 행 단위)
    const [rows] = await pool.query(
        `SELECT cm.user_id, cm.mall_id, cm.current_grade_id
           FROM customer_membership cm
           JOIN users u ON u.id = cm.user_id
          WHERE u.is_active = 1 AND u.birthdate IS NOT NULL
            AND MONTH(u.birthdate) = ? AND DAY(u.birthdate) = ?
            AND cm.current_grade_id IS NOT NULL`,
        [month, day]
    );

    let issued = 0, skipped = 0, failed = 0, targets = 0;
    for (const r of rows) {
        targets++;
        try {
            const res = await gradeCouponService.issueBirthdayCoupons(r.user_id, r.mall_id, r.current_grade_id, year);
            issued += res.issued;
            skipped += res.skipped;
        } catch (e) {
            failed++;
            console.error(`[FAIL] user=${r.user_id} mall=${r.mall_id} — ${e.message}`);
        }
    }

    console.log(`[DONE] date=${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 대상 ${targets} · 발급 ${issued} · 건너뜀 ${skipped} · 실패 ${failed}`);
    await pool.end();
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
