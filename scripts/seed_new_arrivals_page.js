/**
 * 신상품 랜딩(/new) SDUI 페이지 시드 (docs/사이트개선/new_arrivals_dev_plan.md §7)
 *
 * 구성: 상단 배너 → 이번 주 신상품(캐러셀) → 카테고리별 → 브랜드별 → 신규 입점 브랜드 → 전체 신상품
 *
 * 함께 하는 일:
 *   - 기존 '신상품' 상품그룹의 조건을 {"badge":"NEW"} → {"isNew":true} 로 전환한다.
 *     뱃지는 이제 '기간 무관 강제 노출' 수단일 뿐이고, 신상품 판정은 판매 시작일이 기준이다.
 *     (isNew 술어 안에 뱃지 OR 가 이미 들어 있어 뱃지 상품도 계속 나온다)
 *   - 정렬을 판매 시작일순(sale_start)으로 바꾼다.
 *
 * 멱등하다. 이미 시드된 페이지가 있으면 섹션을 지우고 다시 깐다(구성만 리셋, 페이지 id 는 유지).
 *
 * 실행: set -a; . /etc/environment; set +a; node scripts/seed_new_arrivals_page.js
 */
require('../config/env');
const pool = require('../config/db');

async function upgradeNewProductGroup(mallId) {
    const [rows] = await pool.query(
        "SELECT id, name FROM product_group WHERE mall_id = ? AND group_type = 'condition' AND name LIKE '%신상품%' ORDER BY id LIMIT 1",
        [mallId]
    );
    if (!rows.length) {
        const [r] = await pool.query(
            `INSERT INTO product_group (mall_id, name, group_type, sort_type, filter_condition_json, is_active)
             VALUES (?, '신상품', 'condition', 'sale_start', ?, 1)`,
            [mallId, JSON.stringify({ isNew: true })]
        );
        console.log(`[ok] mall ${mallId}: 신상품 상품그룹 생성 (id=${r.insertId})`);
        return r.insertId;
    }

    await pool.query(
        "UPDATE product_group SET filter_condition_json = ?, sort_type = 'sale_start' WHERE id = ?",
        [JSON.stringify({ isNew: true }), rows[0].id]
    );
    console.log(`[ok] mall ${mallId}: '${rows[0].name}'(id=${rows[0].id}) → isNew 조건 + 판매시작일순`);
    return rows[0].id;
}

async function ensurePage(mallId) {
    const [rows] = await pool.query(
        "SELECT id FROM page WHERE slug = 'new' AND mall_id = ? LIMIT 1",
        [mallId]
    );
    if (rows.length) {
        await pool.query("UPDATE page SET status = 'published', title = '신상품' WHERE id = ?", [rows[0].id]);
        await pool.query('DELETE FROM page_section WHERE page_id = ?', [rows[0].id]);
        console.log(`[ok] mall ${mallId}: 기존 /new 페이지(id=${rows[0].id}) 섹션 초기화`);
        return rows[0].id;
    }
    const [r] = await pool.query(
        `INSERT INTO page (mall_id, page_type, slug, title, layout_type, status, published_at)
         VALUES (?, 'feature', 'new', '신상품', 'main_basic', 'published', NOW())`,
        [mallId]
    );
    console.log(`[ok] mall ${mallId}: /new 페이지 생성 (id=${r.insertId})`);
    return r.insertId;
}

async function seedSections(pageId, groupId) {
    // 순서 = 계획서 §7-2. 각 섹션은 데이터가 0건이면 리졸버가 null 을 반환해 렌더에서 빠진다.
    const sections = [
        ['promotion_banner', '', 0, null, null, { groupKey: 'menu:NEW', maxCount: 4, layout: 'rect', columns: 2 }],
        ['product_carousel', '이번 주 신상품', 1, 'product_group', groupId, { maxCount: 12, columnsPerView: 4, moreLink: '/products?filter=new' }],
        ['new_by_category', '카테고리별 신상품', 2, null, null, { maxCount: 8, maxCategory: 6 }],
        ['new_by_brand', '브랜드별 신상품', 3, null, null, { maxCount: 6, maxBrand: 5 }],
        ['new_brand_list', '신규 입점 브랜드', 4, null, null, { maxCount: 8, productCount: 3 }],
        // product_grid 는 sectionClass/badgeText/moreHref 를 config 로 요구한다(홈과 같은 계약).
        ['product_grid', '전체 신상품', 5, 'product_group', groupId, {
            maxCount: 24,
            badgeText: 'NEW',
            badgeClass: 'inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white mb-2 ring-2 ring-white shadow',
            sectionClass: 'py-12 bg-white',
            moreHref: '/products?filter=new',
            moreBtnClass: 'inline-flex items-center gap-2 px-6 py-2.5 border border-gray-400 rounded-full text-sm font-medium text-gray-700 hover:border-[var(--gh-primary)] hover:text-[var(--gh-primary)] transition bg-white',
        }],
    ];

    for (const [type, title, order, dsType, dsId, config] of sections) {
        await pool.query(
            `INSERT INTO page_section
               (page_id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json,
                visible_on_pc, visible_on_mobile, is_active)
             VALUES (?, ?, 'main_content', ?, ?, ?, ?, ?, 1, 1, 1)`,
            [pageId, type, title || null, order, dsType, dsId, JSON.stringify(config)]
        );
    }
    console.log(`[ok]   섹션 ${sections.length}개 시드`);
}

/*
 * 홈의 신상품 그리드가 폐기된 테마 카테고리 6 을 더보기 링크로 쓰고 있었다(/products/category/6).
 * 그 URL 은 이제 301 로 /new 에 넘어가므로, 링크를 신상품 목록으로 바로 잡아준다.
 */
async function fixHomeNewGridLink() {
    const [rows] = await pool.query(
        `SELECT id, config_json FROM page_section
          WHERE section_type = 'product_grid'
            AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.moreHref')) LIKE '/products/category/%'`
    );
    for (const r of rows) {
        const cfg = typeof r.config_json === 'object' ? r.config_json : JSON.parse(r.config_json);
        if (!/\/products\/category\/[56]$/.test(cfg.moreHref || '')) continue;
        cfg.moreHref = cfg.moreHref.endsWith('/5') ? '/best' : '/products?filter=new';
        await pool.query('UPDATE page_section SET config_json = ? WHERE id = ?', [JSON.stringify(cfg), r.id]);
        console.log(`[ok] page_section ${r.id}: 더보기 링크 → ${cfg.moreHref} (폐기된 테마 URL 교체)`);
    }
}

async function report() {
    const [banners] = await pool.query(
        "SELECT COUNT(*) c FROM banners WHERE group_key = 'menu:NEW' AND is_active = 1"
    );
    console.log(`\n[info] 상단 배너(group_key='menu:NEW') 활성 ${banners[0].c}건`);
    if (!banners[0].c) {
        console.log('       → 0건이면 배너 섹션은 렌더되지 않는다. 관리자 > 배너 관리에서 등록하면 즉시 노출된다.');
    }
}

(async () => {
    try {
        for (const mallId of [1, 2]) {
            const groupId = await upgradeNewProductGroup(mallId);
            const pageId = await ensurePage(mallId);
            await seedSections(pageId, groupId);
        }
        await fixHomeNewGridLink();
        await report();
        console.log('\n완료. /new 로 확인하세요.');
    } catch (err) {
        console.error('[fail]', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
