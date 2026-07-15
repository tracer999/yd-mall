/*
 * 멤버십 등급 정기 평가 배치 (설계 §6.4, §10.3)
 *
 * 크론(membership_evaluate_cron.sh)이 5분/시간마다 --scheduled 로 부른다. "언제 돌릴지"는
 * 각 몰 활성 정책의 evaluation_cycle(MONTHLY/DAILY/MANUAL)이 정한다 — best_ranking 과 같은 방식.
 *
 * 사용:
 *   node scripts/calc_membership_grade.js --scheduled          # 주기 도래한 몰만
 *   node scripts/calc_membership_grade.js --mall 12 --force     # 특정 몰 강제 실행
 *   node scripts/calc_membership_grade.js --all --force         # 전 몰 강제
 *
 * ⚠️ _bootstrap 먼저 호출(fail-open 방지). 종료코드: 실패 있으면 1.
 */

const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; }
function flag(name) { return argv.includes('--' + name); }

function isDue(cycle, lastRunAt) {
    if (cycle === 'MANUAL') return false;
    if (!lastRunAt) return true;
    const last = new Date(lastRunAt);
    const now = new Date();
    if (cycle === 'DAILY') return last.toDateString() !== now.toDateString();
    // MONTHLY (기본): 이번 달에 아직 성공 실행이 없으면 도래
    return last.getFullYear() !== now.getFullYear() || last.getMonth() !== now.getMonth();
}

(async () => {
    await require('./_bootstrap')();
    const pool = require('../config/db');
    const evaluationService = require('../services/membership/evaluationService');

    const mallArg = arg('mall');
    const scheduled = flag('scheduled');
    const force = flag('force');

    const [malls] = mallArg
        ? await pool.query('SELECT id, name FROM mall WHERE id = ?', [Number(mallArg)])
        : await pool.query('SELECT id, name FROM mall WHERE is_active = 1 ORDER BY id');

    let failed = 0, ran = 0, skipped = 0;
    for (const mall of malls) {
        const policy = await evaluationService.getActivePolicy(mall.id);
        if (!policy) { console.log(`[SKIP] mall=${mall.id} (${mall.name}) — 활성 정책 없음`); skipped++; continue; }

        if (scheduled && !force) {
            const [[last]] = await pool.query(
                "SELECT MAX(started_at) AS at FROM membership_evaluation_run WHERE mall_id = ? AND status = 'SUCCESS'",
                [mall.id]
            );
            if (!isDue(policy.evaluation_cycle, last.at)) {
                console.log(`[SKIP] mall=${mall.id} (${mall.name}) — 주기 미도래 (${policy.evaluation_cycle}, last=${last.at || 'never'})`);
                skipped++;
                continue;
            }
        }

        try {
            const result = await evaluationService.evaluateMall(mall.id, { mode: 'SCHEDULED', changedBy: 'CRON' });
            const s = result.summary;
            console.log(`[OK]   mall=${mall.id} (${mall.name}) — 대상 ${s.target}, 승급 ${s.upgrade}, 강등 ${s.downgrade}, 유지 ${s.maintain}, 실패 ${s.failure} (run ${result.runId})`);
            ran++;
        } catch (e) {
            console.error(`[FAIL] mall=${mall.id} (${mall.name}) — ${e.message}`);
            failed++;
        }
    }

    console.log(`[DONE] ran=${ran} skipped=${skipped} failed=${failed}`);
    await pool.end();
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
