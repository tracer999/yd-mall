/*
 * 강등 사전 안내 배치 (설계 §14, 2차) — 월 배치(정기 평가 며칠 전 실행 권장)
 *
 * 다음 평가에서 강등될 회원에게 이메일로 사전 안내한다. 월 1회 발송을 로그로 보장한다.
 * SMTP 미설정이면 발송은 실패하고 로그를 남기지 않아 다음 실행에서 재시도한다.
 *
 * 사용: node scripts/calc_membership_demotion_notice.js [--mall 12] [--ym 2026-08]
 * ⚠️ _bootstrap 먼저. 종료코드: 실패 있으면 1.
 */

const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; }

(async () => {
    await require('./_bootstrap')();
    const pool = require('../config/db');
    const evaluationService = require('../services/membership/evaluationService');
    const emailService = require('../services/emailService');

    const now = new Date();
    let ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ymArg = arg('ym'); if (ymArg && /^\d{4}-\d{2}$/.test(ymArg)) ym = ymArg;
    const mallArg = arg('mall');

    const [malls] = mallArg
        ? await pool.query('SELECT id, name FROM mall WHERE id = ?', [Number(mallArg)])
        : await pool.query('SELECT id, name FROM mall WHERE is_active = 1 ORDER BY id');

    let notified = 0, skipped = 0, failed = 0, targets = 0;
    for (const mall of malls) {
        const { candidates } = await evaluationService.getDowngradeCandidates(mall.id);
        for (const c of candidates) {
            targets++;
            if (!c.email) { skipped++; continue; }
            // 월 1회 가드
            const [logRes] = await pool.query(
                'INSERT IGNORE INTO membership_demotion_notice_log (user_id, mall_id, period_ym, from_grade_id, to_grade_id, channel) VALUES (?, ?, ?, ?, ?, ?)',
                [c.userId, mall.id, ym, c.fromGradeId, c.toGradeId, 'EMAIL']
            );
            if (logRes.affectedRows === 0) { skipped++; continue; }
            try {
                await emailService.sendEmail({
                    to: c.email,
                    subject: `[${mall.name}] 멤버십 등급 변경 예정 안내`,
                    text: `${c.userName || '회원'}님, 안녕하세요.\n\n최근 구매 실적 기준으로 다음 등급 평가 시 회원님의 등급이 `
                        + `${c.fromGradeName || ''} 등급에서 ${c.toGradeName || ''} 등급으로 조정될 예정입니다.\n`
                        + `등급 유지를 원하시면 다음 평가 전 유지 기준을 확인해 주세요.\n\n감사합니다.`,
                });
                notified++;
            } catch (e) {
                // 발송 실패 → 로그 삭제해 다음 실행에서 재시도
                await pool.query('DELETE FROM membership_demotion_notice_log WHERE user_id = ? AND mall_id = ? AND period_ym = ?', [c.userId, mall.id, ym]);
                failed++;
                console.error(`[FAIL] user=${c.userId} — ${e.message}`);
            }
        }
    }

    console.log(`[DONE] ym=${ym} 대상 ${targets} · 발송 ${notified} · 건너뜀 ${skipped} · 실패 ${failed}`);
    await pool.end();
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
