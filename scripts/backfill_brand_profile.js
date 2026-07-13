/**
 * brand_profile 백필 + categories.onboarded_at 추정 백필.
 *
 *   set -a; . /etc/environment; set +a; node scripts/backfill_brand_profile.js
 *
 * - brand_profile 행이 없는 BRAND 카테고리에 행을 만든다(초성/초성검색/영문명/셀러명).
 * - 입점일(onboarded_at)은 전 몰 0건이라 "브랜드 최초 상품의 created_at" 으로 추정한다.
 *   실제 입점일이 아니므로 관리자가 덮어쓸 수 있다.
 * - 재실행 안전(idempotent): 이미 채워진 값은 건드리지 않는다.
 */
const bootstrap = require('./_bootstrap');
const pool = require('../config/db');
const { toInitial, toChosung, stripCorpPrefix } = require('../shared/hangul');

const isAscii = (s) => /^[\x20-\x7E]+$/.test(s);

(async () => {
    await bootstrap();

    const [brands] = await pool.query(`
        SELECT c.id, c.mall_id, c.name
        FROM categories c
        WHERE c.type = 'BRAND'
        ORDER BY c.mall_id, c.id
    `);
    console.log(`브랜드 ${brands.length}건`);

    // 브랜드별 대표 provider(최빈) — 입점 셀러명 후보
    const [providers] = await pool.query(`
        SELECT brand_category_id AS bid, provider, COUNT(*) c
        FROM products
        WHERE brand_category_id IS NOT NULL AND provider IS NOT NULL AND provider <> ''
        GROUP BY brand_category_id, provider
        ORDER BY brand_category_id, c DESC
    `);
    const providerOf = new Map();
    for (const r of providers) if (!providerOf.has(r.bid)) providerOf.set(r.bid, r.provider);

    let inserted = 0;
    for (const b of brands) {
        const clean = stripCorpPrefix(b.name);
        const nameEn = isAscii(clean) ? clean : null;
        const seller = providerOf.get(b.id) || null;

        // 이미 있으면 비어 있는 파생값만 채운다 (관리자가 입력한 값은 보존)
        const [r] = await pool.query(`
            INSERT INTO brand_profile
                (category_id, mall_id, name_en, initial, initial_chosung, seller_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                initial         = COALESCE(brand_profile.initial, VALUES(initial)),
                initial_chosung = COALESCE(brand_profile.initial_chosung, VALUES(initial_chosung)),
                name_en         = COALESCE(brand_profile.name_en, VALUES(name_en)),
                seller_name     = COALESCE(brand_profile.seller_name, VALUES(seller_name))
        `, [b.id, b.mall_id, nameEn, toInitial(b.name), toChosung(b.name), seller]);
        if (r.affectedRows === 1) inserted++;
    }
    console.log(`brand_profile 신규 ${inserted}건 / 갱신 ${brands.length - inserted}건`);

    // 입점일 추정 — 실제 입점일 데이터가 없다. 최초 상품 등록일로 대체한다.
    const [ob] = await pool.query(`
        UPDATE categories c
        JOIN (
            SELECT brand_category_id AS bid, DATE(MIN(created_at)) AS first_at
            FROM products
            WHERE brand_category_id IS NOT NULL
            GROUP BY brand_category_id
        ) f ON f.bid = c.id
        SET c.onboarded_at = f.first_at
        WHERE c.type = 'BRAND' AND c.onboarded_at IS NULL
    `);
    console.log(`onboarded_at 추정 백필 ${ob.affectedRows}건`);

    await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
