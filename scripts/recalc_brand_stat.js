/**
 * brand_stat / brand_category_stat 재계산 배치.
 *
 *   set -a; . /etc/environment; set +a; node scripts/recalc_brand_stat.js
 *
 * 상품·주문·찜·혜택이 바뀌면 다시 돌린다. 전건 재계산(멱등).
 */
const bootstrap = require('./_bootstrap');
const pool = require('../config/db');
const brandStat = require('../services/brand/brandStatService');

(async () => {
    await bootstrap();
    const [malls] = await pool.query('SELECT id, name FROM mall WHERE is_active = 1 ORDER BY id');
    for (const m of malls) {
        const t = Date.now();
        const r = await brandStat.recalcMall(m.id);
        console.log(`몰 ${m.id} (${m.name}) — 브랜드 ${r.brands}건, 브랜드×카테고리 ${r.categories}건 (${Date.now() - t}ms)`);
    }
    await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
