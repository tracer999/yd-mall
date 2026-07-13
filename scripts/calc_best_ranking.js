#!/usr/bin/env node
/*
 * 베스트/랭킹 집계 배치
 *
 * 사용법
 *   set -a; . /etc/environment; set +a
 *   node scripts/calc_best_ranking.js                 # 전 몰 · 전 기간
 *   node scripts/calc_best_ranking.js --mall 2        # 특정 몰
 *   node scripts/calc_best_ranking.js --period DAILY  # 특정 기간
 *
 * cron 권장 (기간별로 주기가 다르다 — 월간을 10분마다 돌릴 이유가 없다)
 *   *\/10 * * * *  node scripts/calc_best_ranking.js --period REALTIME
 *   5 * * * *      node scripts/calc_best_ranking.js --period DAILY
 *   20 3 * * *     node scripts/calc_best_ranking.js --period WEEKLY
 *   40 3 * * *     node scripts/calc_best_ranking.js --period MONTHLY
 *
 * ⚠️ _bootstrap 을 먼저 부른다. 없으면 isShopifySyncEnabled() 가 fail-open 으로
 *    true 가 되어 실제 Shopify API 를 호출한다(CLAUDE.md).
 */

const argv = process.argv.slice(2);

function arg(name) {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

(async () => {
    await require('./_bootstrap')();

    const pool = require('../config/db');
    const svc = require('../services/best/bestRankingService');

    const mallArg = arg('mall');
    const periodArg = arg('period');

    const [malls] = mallArg
        ? await pool.query('SELECT id, name FROM mall WHERE id = ?', [Number(mallArg)])
        : await pool.query('SELECT id, name FROM mall ORDER BY id');

    const periods = periodArg
        ? [svc.normalizePeriod(periodArg)]
        : svc.PERIOD_KEYS;

    let failed = 0;

    for (const mall of malls) {
        for (const period of periods) {
            const t0 = Date.now();
            try {
                const r = await svc.calculateMall(mall.id, period);
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

    await pool.end();
    process.exit(failed ? 1 : 0);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
