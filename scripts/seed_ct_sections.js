#!/usr/bin/env node
/**
 * CT 트랙 컴포넌트 시드 (멱등)
 *
 * 실행: node scripts/seed_ct_sections.js [--reset]
 *   --reset  이 스크립트가 만든 섹션/그룹을 모두 제거한 뒤 다시 심는다.
 *
 * 홈(page id=1)에 CT 컴포넌트를 배치한다.
 * 각 섹션은 `config_json.seed_key` 로 식별해 중복 삽입을 막는다.
 *
 * 설계: docs/사이트개선/frontend_dev_plan.md §6
 */
require('../config/env');
const pool = require('../config/db');

const HOME_PAGE_ID = 1;
const doReset = process.argv.includes('--reset');

/** 조건 자동형 상품 그룹 (없으면 생성) */
const GROUPS = [
    {
        seedKey: 'ct_recommend',
        name: 'CT 추천 상품',
        group_type: 'condition',
        sort_type: 'views',
        filter: { badge: 'RECOMMEND' },
    },
    {
        seedKey: 'ct_deal',
        name: 'CT 오늘특가',
        group_type: 'condition',
        sort_type: 'discount',
        filter: { badge: 'DEADLINE_SALE' },
    },
];

/*
 * 프로모션 배너 그룹 (CT-5)
 * banner_type='CATEGORY' + category_id=NULL 로 심는다.
 * 기존 카테고리/브랜드 배너 조회는 category_id 로 필터하므로 이 행들은 절대 걸리지 않는다.
 * (MAIN=히어로, POPUP=팝업이라 그 타입은 쓰면 안 된다)
 */
const PROMO_GROUP_KEY = 'home_promo';
const PROMO_BANNERS = [
    { title: 'CT 프로모션 A', display_order: 1 },
    { title: 'CT 프로모션 B', display_order: 2 },
];

/** 홈에 배치할 섹션 (sort_order 는 아래 ORDER 로 일괄 재배치) */
const SECTIONS = [
    {
        seedKey: 'ct1_carousel_recommend',
        section_type: 'product_carousel',
        title: 'MD 추천 상품',
        groupSeedKey: 'ct_recommend',
        config: {
            maxCount: 12,
            columnsPerView: 4,
            moreLink: '/products?badge=RECOMMEND',
            badgeText: 'RECOMMEND',
            sectionClass: 'py-12 bg-white',
        },
    },
    {
        seedKey: 'ct1_carousel_deal',
        section_type: 'product_carousel',
        title: '오늘의 특가',
        groupSeedKey: 'ct_deal',
        config: {
            maxCount: 8,
            columnsPerView: 4,
            moreLink: '/deal/today',
            badgeText: '오늘특가',
            sectionClass: 'py-12 bg-[var(--gh-secondary)]',
        },
    },
    {
        seedKey: 'ct2_brand_carousel',
        section_type: 'brand_carousel',
        title: '브랜드관',
        groupSeedKey: null, // categories(type=BRAND) 고정 소스
        config: {
            maxCount: 20,
            columns: 6,
            shape: 'rect',
            moreLink: '/brands',
            sectionClass: 'py-12 bg-white',
        },
    },
    {
        seedKey: 'ct3_ranking_tabs',
        section_type: 'ranking_tabs',
        title: '카테고리 랭킹',
        groupSeedKey: null, // 카테고리 탭 고정 소스
        config: {
            maxTabs: 6,
            rankLimit: 8,
            sort: 'views',
            sectionClass: 'py-12 bg-[var(--gh-secondary)]',
        },
    },
    {
        seedKey: 'ct5_promotion_banner',
        section_type: 'promotion_banner',
        title: '진행 중인 프로모션',
        groupSeedKey: null, // banners.group_key 소스
        config: {
            groupKey: PROMO_GROUP_KEY,
            maxCount: 4,
            layout: 'rect',
            columns: 2,
            sectionClass: 'py-10 bg-white',
        },
    },
];

/** 최종 홈 섹션 순서 (section_type 또는 seed_key 기준) */
const ORDER = [
    { match: { section_type: 'hero' } },
    { match: { section_type: 'value_proposition' } },
    { match: { section_type: 'product_grid', data_source_id: 1 } },   // 베스트
    { match: { seedKey: 'ct1_carousel_recommend' } },
    { match: { section_type: 'product_grid', data_source_id: 2 } },   // 신상품
    { match: { seedKey: 'ct1_carousel_deal' } },
    { match: { seedKey: 'ct5_promotion_banner' } },
    { match: { seedKey: 'ct3_ranking_tabs' } },
    { match: { seedKey: 'ct2_brand_carousel' } },
    { match: { section_type: 'category_showcase' } },
    { match: { section_type: 'kakao_cta' } },
];

function parseJson(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return {}; }
}

async function findGroupBySeedKey(conn, seedKey) {
    const [rows] = await conn.query('SELECT id, filter_condition_json FROM product_group');
    return rows.find(r => parseJson(r.filter_condition_json).seed_key === seedKey) || null;
}

async function upsertGroups(conn) {
    const map = {};
    for (const g of GROUPS) {
        const existing = await findGroupBySeedKey(conn, g.seedKey);
        const filterJson = JSON.stringify(Object.assign({}, g.filter, { seed_key: g.seedKey }));
        if (existing) {
            await conn.query(
                'UPDATE product_group SET name=?, group_type=?, sort_type=?, filter_condition_json=?, is_active=1 WHERE id=?',
                [g.name, g.group_type, g.sort_type, filterJson, existing.id]
            );
            map[g.seedKey] = existing.id;
            console.log(`  = product_group '${g.name}' 갱신 (id=${existing.id})`);
        } else {
            const [r] = await conn.query(
                'INSERT INTO product_group (name, group_type, sort_type, filter_condition_json, is_active) VALUES (?,?,?,?,1)',
                [g.name, g.group_type, g.sort_type, filterJson]
            );
            map[g.seedKey] = r.insertId;
            console.log(`  + product_group '${g.name}' 생성 (id=${r.insertId})`);
        }
    }
    return map;
}

/** 프로모션 배너 그룹 시드. 이미지가 없으므로 기존 업로드 이미지를 재사용한다. */
async function upsertPromoBanners(conn) {
    const [existing] = await conn.query(
        'SELECT id, title FROM banners WHERE group_key = ?', [PROMO_GROUP_KEY]
    );
    if (existing.length >= PROMO_BANNERS.length) {
        console.log(`  = 프로모션 배너 ${existing.length}건 이미 존재 (group_key=${PROMO_GROUP_KEY})`);
        return existing.length;
    }

    // 기존 배너에서 실제 존재하는 이미지 경로를 빌려온다.
    const [srcs] = await conn.query(
        "SELECT image_url FROM banners WHERE image_url IS NOT NULL AND image_url <> '' LIMIT ?",
        [PROMO_BANNERS.length]
    );
    if (srcs.length === 0) {
        console.log('  ! 사용할 배너 이미지가 없어 프로모션 배너 시드를 건너뜁니다.');
        return 0;
    }

    let created = 0;
    for (let i = 0; i < PROMO_BANNERS.length; i++) {
        const b = PROMO_BANNERS[i];
        if (existing.some(e => e.title === b.title)) continue;
        const img = srcs[i % srcs.length].image_url;
        await conn.query(
            `INSERT INTO banners (banner_type, group_key, category_id, title, image_url, link_url, display_order, is_active)
             VALUES ('CATEGORY', ?, NULL, ?, ?, '/products', ?, 1)`,
            [PROMO_GROUP_KEY, b.title, img, b.display_order]
        );
        created++;
        console.log(`  + 배너 '${b.title}' 생성 (group_key=${PROMO_GROUP_KEY})`);
    }
    return created;
}

async function findSectionBySeedKey(conn, seedKey) {
    const [rows] = await conn.query('SELECT id, config_json FROM page_section WHERE page_id = ?', [HOME_PAGE_ID]);
    return rows.find(r => parseJson(r.config_json).seed_key === seedKey) || null;
}

async function upsertSections(conn, groupMap) {
    const map = {};
    for (const s of SECTIONS) {
        const cfg = JSON.stringify(Object.assign({}, s.config, { seed_key: s.seedKey }));
        // 상품 그룹을 쓰지 않는 섹션(brand_carousel 등)은 data_source_* 를 비운다.
        const dsId = s.groupSeedKey ? (groupMap[s.groupSeedKey] || null) : null;
        const dsType = dsId ? 'product_group' : null;

        const existing = await findSectionBySeedKey(conn, s.seedKey);
        if (existing) {
            await conn.query(
                `UPDATE page_section SET section_type=?, title=?, data_source_type=?,
                        data_source_id=?, config_json=?, is_active=1 WHERE id=?`,
                [s.section_type, s.title, dsType, dsId, cfg, existing.id]
            );
            map[s.seedKey] = existing.id;
            console.log(`  = page_section '${s.title}' 갱신 (id=${existing.id})`);
        } else {
            const [r] = await conn.query(
                `INSERT INTO page_section (page_id, section_type, position, title, sort_order,
                        data_source_type, data_source_id, config_json, is_active)
                 VALUES (?,?,'main_content',?,999,?,?,?,1)`,
                [HOME_PAGE_ID, s.section_type, s.title, dsType, dsId, cfg]
            );
            map[s.seedKey] = r.insertId;
            console.log(`  + page_section '${s.title}' 생성 (id=${r.insertId})`);
        }
    }
    return map;
}

async function reorder(conn, sectionMap) {
    const [rows] = await conn.query(
        'SELECT id, section_type, data_source_id, config_json FROM page_section WHERE page_id = ?',
        [HOME_PAGE_ID]
    );
    let order = 1;
    for (const spec of ORDER) {
        const m = spec.match;
        const row = rows.find((r) => {
            if (m.seedKey) return r.id === sectionMap[m.seedKey];
            if (r.section_type !== m.section_type) return false;
            if (m.data_source_id !== undefined) return Number(r.data_source_id) === m.data_source_id;
            return true;
        });
        if (!row) continue;
        await conn.query('UPDATE page_section SET sort_order = ? WHERE id = ?', [order, row.id]);
        console.log(`  · sort_order ${order} → [${row.id}] ${row.section_type}`);
        order++;
    }
}

async function reset(conn) {
    console.log('\n[reset] CT 시드 제거');
    const [secs] = await conn.query('SELECT id, config_json FROM page_section WHERE page_id = ?', [HOME_PAGE_ID]);
    const seedKeys = SECTIONS.map(s => s.seedKey);
    const toDelete = secs.filter(r => seedKeys.includes(parseJson(r.config_json).seed_key)).map(r => r.id);
    if (toDelete.length) {
        await conn.query('DELETE FROM page_section WHERE id IN (?)', [toDelete]);
        console.log(`  - page_section ${toDelete.length}건 삭제`);
    }
    for (const g of GROUPS) {
        const existing = await findGroupBySeedKey(conn, g.seedKey);
        if (existing) {
            await conn.query('DELETE FROM product_group WHERE id = ?', [existing.id]);
            console.log(`  - product_group id=${existing.id} 삭제`);
        }
    }
    const [b] = await conn.query('DELETE FROM banners WHERE group_key = ?', [PROMO_GROUP_KEY]);
    if (b.affectedRows) console.log(`  - 프로모션 배너 ${b.affectedRows}건 삭제`);
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (doReset) await reset(conn);

        console.log('\n[1] 상품 그룹');
        const groupMap = await upsertGroups(conn);

        console.log('\n[2] 프로모션 배너 그룹');
        await upsertPromoBanners(conn);

        console.log('\n[3] 홈 섹션');
        const sectionMap = await upsertSections(conn, groupMap);

        console.log('\n[4] 순서 재배치');
        await reorder(conn, sectionMap);

        console.log('\n✅ CT 시드 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
