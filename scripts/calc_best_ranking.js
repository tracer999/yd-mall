#!/usr/bin/env node
/*
 * 베스트/랭킹 집계 배치
 *
 * 사용법
 *   set -a; . /etc/environment; set +a
 *   node scripts/calc_best_ranking.js                 # 전 몰 · 전 기간 (강제 실행)
 *   node scripts/calc_best_ranking.js --mall 2        # 특정 몰
 *   node scripts/calc_best_ranking.js --period DAILY  # 특정 기간
 *   node scripts/calc_best_ranking.js --scheduled     # 주기가 된 기간만 (cron 용)
 *
 * cron 은 이 스크립트를 직접 부르지 않는다. scripts/best_ranking_cron.sh 를 5분마다 부르고,
 * **무엇을 언제 돌릴지는 관리자 화면(best_ranking_schedule 테이블)이 정한다.**
 * 크론 라인은 한 줄이고 영원히 안 바뀐다:
 *
 *   *\/5 * * * * /data/yd-mall/scripts/best_ranking_cron.sh
 *
 * ⚠️ _bootstrap 을 먼저 부른다. 없으면 isShopifySyncEnabled() 가 fail-open 으로
 *    true 가 되어 실제 Shopify API 를 호출한다(CLAUDE.md).
 */

const argv = process.argv.slice(2);

function arg(name) {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
function flag(name) {
    return argv.includes(`--${name}`);
}

/**
 * --scheduled 모드에서 "지금 돌 차례인 기간"을 고른다.
 *
 * best_ranking_schedule(관리자가 편집) 과 best_ranking_run(마지막 성공 시각)을 대조한다.
 * 마지막 성공으로부터 interval_minutes 가 지났으면 due.  한 번도 안 돌았으면 무조건 due.
 *
 * 판정을 **여기(node)에 두는 게 핵심**이다. 쉘 스크립트가 DB 를 직접 보게 하면
 * 크론 스크립트에 DB 비밀번호를 박아야 한다. node 는 ENCRYPTION_KEY 로 이미 복호화한다.
 */
async function duePeriods(pool, mallId) {
    const [rows] = await pool.query(
        `SELECT s.period, s.interval_minutes,
                (SELECT MAX(r.finished_at) FROM best_ranking_run r
                  WHERE r.mall_id = ? AND r.period = s.period AND r.status = 'SUCCESS') AS last_ok
           FROM best_ranking_schedule s
          WHERE s.enabled = 1`,
        [mallId]
    );
    const now = Date.now();
    return rows
        .filter(r => {
            if (!r.last_ok) return true;                       // 한 번도 안 돌았다
            const elapsedMin = (now - new Date(r.last_ok).getTime()) / 60000;
            return elapsedMin >= Number(r.interval_minutes);
        })
        .map(r => r.period);
}

(async () => {
    await require('./_bootstrap')();

    const pool = require('../config/db');
    const svc = require('../services/best/bestRankingService');

    const mallArg = arg('mall');
    const periodArg = arg('period');
    const scheduled = flag('scheduled');

    const [malls] = mallArg
        ? await pool.query('SELECT id, name FROM mall WHERE id = ?', [Number(mallArg)])
        : await pool.query('SELECT id, name FROM mall ORDER BY id');

    const fixedPeriods = periodArg
        ? [svc.normalizePeriod(periodArg)]
        : svc.PERIOD_KEYS;

    let failed = 0;
    let ran = 0;

    for (const mall of malls) {
        // --scheduled: 몰마다 due 를 따로 판정한다. 마지막 성공 시각이 몰별로 다르기 때문이다.
        const periods = scheduled ? await duePeriods(pool, mall.id) : fixedPeriods;

        if (scheduled && !periods.length) {
            console.log(`[SKIP] mall=${mall.id}(${mall.name}) — 아직 주기가 안 됐습니다`);
            continue;
        }

        for (const period of periods) {
            const t0 = Date.now();
            try {
                const r = await svc.calculateMall(mall.id, period);
                ran += 1;
                console.log(
                    `[OK]   mall=${mall.id}(${mall.name}) period=${period} ` +
                    `groups=${r.groupCount} rows=${r.rowCount} ${Date.now() - t0}ms`
                );
            } catch (e) {
                failed += 1;
                console.error(`[FAIL] mall=${mall.id} period=${period} — ${e.message}`);
            }
        }
    }

    if (scheduled) console.log(`[DONE] 실행 ${ran}건 · 실패 ${failed}건`);

    await pool.end();
    process.exit(failed ? 1 : 0);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
