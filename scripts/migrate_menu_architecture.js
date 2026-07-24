#!/usr/bin/env node
/**
 * M1/M2 — 통제된 동적 메뉴 아키텍처 마이그레이션
 * (docs/사이트개선/frontend_dev_plan.md 반영)
 *
 * 실행: node scripts/migrate_menu_architecture.js [--dry-run]
 *
 * 생성:
 *   feature_menu       기능/시스템 메뉴 카탈로그 (position 고정, module_ready 게이트)
 *   mall_feature_menu  몰별 ON/OFF·표시명·순서
 *   custom_menu        몰별 커스텀 메뉴 (위치 선택 가능, 슬롯 제한)
 *   navigation_config  몰별 헤더/카테고리 정책 (카테고리 최대 3뎁스)
 *   brand_likes        찜한 브랜드 (categories.type='BRAND')
 *
 * 보강:
 *   categories += mall_id, slug, depth, is_active, pc_visible, mobile_visible
 *
 * 이관:
 *   (완료) storefront_menu(7행) → mall_feature_menu 이관. 원본 테이블은 M7에서 DROP.
 *                          쇼핑라이브·공동구매는 모듈 미구현으로 비활성, TV편성표는 폐기)
 *
 * 멱등(idempotent): 재실행해도 안전하다.
 */
require('../config/env');
const pool = require('../config/db');

const isDryRun = process.argv.includes('--dry-run');

const POSITIONS = ['gnb', 'right_rail', 'header_util', 'footer', 'mobile_quick'];

/** feature_menu 카탈로그. position 은 고정(운영자 변경 불가), module_ready=0 이면 렌더에서 제외 */
const FEATURE_CATALOG = [
    // ── GNB (일반 기능 메뉴) ────────────────────────────────────────────────
    ['CATEGORY',            '카테고리',      null,               'gnb',         null,          1, 1, 1,  1, '전체 카테고리 드롭다운(고정)'],
    ['TODAY_DEAL',          '오늘특가',      '/deal/today',      'gnb',         'deal',        0, 0, 0,  2, '기간 한정 특가'],
    ['BEST',                '베스트',        '/best',            'gnb',         'best',        0, 0, 0,  3, '인기 상품'],
    ['NEW_PRODUCT',         '신상품',        '/new',             'gnb',         'new',         0, 0, 0,  4, '최근 등록 상품'],
    ['EVENT',               '이벤트&혜택',   '/event',           'gnb',         'event',       0, 0, 0,  5, '이벤트·쿠폰·혜택'],
    ['EXHIBITION',          '기획전',        '/exhibition',      'gnb',         'exhibition',  0, 0, 0,  6, '시즌·브랜드·테마전'],
    ['BRAND',               '브랜드',        '/brands',          'gnb',         'brand',       1, 0, 0,  7, '브랜드별 상품 탐색'],
    // RANKING(랭킹)은 폐기됐다 — 베스트(BEST)가 랭킹 엔진을 흡수했고 /ranking 은 /best 로 301 한다.
    // 카탈로그에 되살리지 말 것. (제거: scripts/migrations/20260722_drop_ranking_feature_menu.sql)
    ['OUTLET',              '아울렛',        '/outlet',          'gnb',         'outlet',      0, 0, 0,  9, '할인/재고 소진'],
    ['COUPON',              '쿠폰',          '/coupon',          'gnb',         'coupon',      0, 0, 0, 10, '다운로드 쿠폰'],
    ['MEMBERSHIP',          '멤버십',        '/membership',      'gnb',         'membership',  0, 0, 0, 11, '등급·적립·혜택'],
    ['GROUP_BUY',           '공동구매',      '/group-buy',       'gnb',         'group_buy',   0, 0, 0, 12, '목표수량 기반 공동구매'],
    ['LIVE',                '쇼핑라이브',    '/live',            'gnb',         'live',        0, 0, 0, 13, '라이브 방송(P6 미디어)'],

    // ── 우측 레이어(바로접속) ──────────────────────────────────────────────
    ['RAIL_CART',           '장바구니',      '/cart',            'right_rail',  null,          1, 1, 0,  1, '장바구니 바로가기'],
    ['RAIL_WISHLIST',       '찜',            '/mypage/likes',    'right_rail',  null,          1, 1, 0,  2, '찜한 상품'],
    // 찜한 브랜드는 이 자리에서 빠졌다 — 찜 화면(/mypage/likes)의 탭으로 들어간다.
    // (교체: scripts/migrate_rail_orders.js)
    ['RAIL_ORDERS',         '주문내역',      '/mypage/orders',   'right_rail',  null,          1, 1, 0,  3, '주문내역 바로가기'],
    ['RAIL_RECENT',         '최근본상품',    null,               'right_rail',  null,          1, 0, 0,  4, '최근 본 상품(클라이언트)'],
    ['RAIL_TOP',            'TOP',           null,               'right_rail',  null,          1, 1, 1,  5, '맨 위로'],

    // ── 헤더 유틸 ──────────────────────────────────────────────────────────
    ['HEADER_SEARCH',       '검색',          '/search',          'header_util', null,          1, 1, 1,  1, '통합 검색창'],
    ['HEADER_LOGIN',        '로그인',        '/auth/login',      'header_util', null,          1, 1, 1,  2, '인증 모듈'],
    ['HEADER_MYPAGE',       '마이쇼핑',      '/mypage',          'header_util', null,          1, 1, 1,  3, '마이페이지'],
    ['HEADER_CART',         '장바구니',      '/cart',            'header_util', null,          1, 1, 1,  4, '장바구니'],
    ['HEADER_CS',           '고객센터',      '/boards/notice',   'header_util', null,          1, 1, 0,  5, '고객센터(ON/OFF 가능)'],
];
// 컬럼 순서: code, default_name, default_path, position, required_module,
//            module_ready, is_system, is_required, default_sort_order, description

/**
 * 실제 라우트/모듈이 구현된 기능 코드.
 * 렌더 조건은 `is_enabled AND module_ready` 이므로, 미구현 메뉴는 켜도 노출되지 않는다(죽은 링크 방지).
 * 모듈을 새로 구현하면 여기에 추가하고 이 스크립트를 재실행한다.
 */
const READY_MODULES = new Set([
    'CATEGORY',
    'TODAY_DEAL',        // routes/feature.js  /deal/today
    'BEST',              // routes/feature.js  /best
    'NEW_PRODUCT',       // routes/feature.js  /new
    'EVENT',             // routes/feature.js  /event (→ /boards/notice 별칭)
    'BRAND',             // routes/brands.js   /brands
    // 아래 3종은 전용 모듈 대신 '준비 중' 랜딩 페이지를 제공한다(routes/feature.js).
    // '#' 죽은 링크가 아니라 실제 200 페이지(noindex)이므로 GNB 에 노출해도 된다.
    'EXHIBITION',        // routes/feature.js  /exhibition  (준비 중)
    'GROUP_BUY',         // routes/feature.js  /group-buy   (준비 중)
    'LIVE',              // routes/feature.js  /live        (준비 중)
    'RAIL_CART', 'RAIL_WISHLIST', 'RAIL_ORDERS', 'RAIL_RECENT', 'RAIL_TOP',
    'HEADER_SEARCH', 'HEADER_LOGIN', 'HEADER_MYPAGE', 'HEADER_CART', 'HEADER_CS',
]);
// 미구현(module_ready=0): RANKING, OUTLET, COUPON, MEMBERSHIP

/** mall_id=1 초기 ON/OFF. 현행 GNB(오늘특가/베스트/이벤트&혜택)를 보존하고 신상품을 추가. */
const ENABLED_FOR_MALL1 = new Set([
    'CATEGORY', 'TODAY_DEAL', 'BEST', 'NEW_PRODUCT', 'EVENT',
    'RAIL_CART', 'RAIL_WISHLIST', 'RAIL_ORDERS', 'RAIL_RECENT', 'RAIL_TOP',
    'HEADER_SEARCH', 'HEADER_LOGIN', 'HEADER_MYPAGE', 'HEADER_CART', 'HEADER_CS',
]);

async function columnExists(conn, table, column) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return r.length > 0;
}

async function addColumnIfMissing(conn, table, column, ddl) {
    if (await columnExists(conn, table, column)) {
        console.log(`  = ${table}.${column} 이미 존재`);
        return;
    }
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    console.log(`  + ${table}.${column} 추가`);
}

async function migrateCategories(conn) {
    console.log('\n[1] categories 컬럼 보강');
    await addColumnIfMissing(conn, 'categories', 'mall_id',
        "`mall_id` BIGINT NOT NULL DEFAULT 1 COMMENT '몰 ID(멀티몰 대비)' AFTER `id`");
    await addColumnIfMissing(conn, 'categories', 'slug',
        "`slug` VARCHAR(255) NULL COMMENT 'URL 슬러그' AFTER `name`");
    await addColumnIfMissing(conn, 'categories', 'depth',
        "`depth` INT NOT NULL DEFAULT 1 COMMENT '계층 뎁스(1~3, 최상위=1)' AFTER `parent_id`");
    await addColumnIfMissing(conn, 'categories', 'is_active',
        "`is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '노출 여부' AFTER `depth`");
    await addColumnIfMissing(conn, 'categories', 'pc_visible',
        "`pc_visible` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'PC 노출' AFTER `is_active`");
    await addColumnIfMissing(conn, 'categories', 'mobile_visible',
        "`mobile_visible` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '모바일 노출' AFTER `pc_visible`");

    // 기존 데이터는 전부 평면(parent_id IS NULL) → depth=1
    const [r] = await conn.query('UPDATE categories SET depth = 1 WHERE parent_id IS NULL AND depth <> 1');
    console.log(`  · depth=1 백필: ${r.affectedRows}행`);
}

async function createTables(conn) {
    console.log('\n[2] 신규 테이블 생성');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`feature_menu\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`feature_code\` VARCHAR(50) NOT NULL COMMENT '기능 코드(고정 식별자)',
      \`default_name\` VARCHAR(100) NOT NULL COMMENT '기본 메뉴명',
      \`default_path\` VARCHAR(255) NULL COMMENT '표준 URL(운영자 변경 불가). null=클라이언트 동작',
      \`position\` VARCHAR(30) NOT NULL COMMENT '고정 위치: gnb/right_rail/header_util/footer/mobile_quick',
      \`required_module\` VARCHAR(50) NULL COMMENT '필요 기능 모듈',
      \`module_ready\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=모듈 구현됨(렌더 허용). 0이면 켜도 미노출',
      \`is_system\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=시스템 메뉴(삭제 불가)',
      \`is_required\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=항상 노출(끌 수 없음)',
      \`default_sort_order\` INT NOT NULL DEFAULT 0,
      \`description\` VARCHAR(255) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_feature_code\` (\`feature_code\`),
      KEY \`idx_feature_position\` (\`position\`, \`default_sort_order\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기능/시스템 메뉴 카탈로그(위치 고정)'`);
    console.log('  + feature_menu');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`mall_feature_menu\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`mall_id\` BIGINT NOT NULL DEFAULT 1,
      \`feature_code\` VARCHAR(50) NOT NULL,
      \`display_name\` VARCHAR(100) NULL COMMENT 'null이면 feature_menu.default_name 사용',
      \`sort_order\` INT NOT NULL DEFAULT 0 COMMENT '같은 position 내 순서',
      \`is_enabled\` TINYINT(1) NOT NULL DEFAULT 0,
      \`pc_visible\` TINYINT(1) NOT NULL DEFAULT 1,
      \`mobile_visible\` TINYINT(1) NOT NULL DEFAULT 1,
      \`login_required\` TINYINT(1) NOT NULL DEFAULT 0,
      \`visible_start_at\` DATETIME NULL,
      \`visible_end_at\` DATETIME NULL,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_mall_feature\` (\`mall_id\`, \`feature_code\`),
      CONSTRAINT \`fk_mfm_feature\` FOREIGN KEY (\`feature_code\`) REFERENCES \`feature_menu\` (\`feature_code\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 기능 메뉴 ON/OFF'`);
    console.log('  + mall_feature_menu');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`custom_menu\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`mall_id\` BIGINT NOT NULL DEFAULT 1,
      \`display_name\` VARCHAR(100) NOT NULL,
      \`link_type\` VARCHAR(20) NOT NULL DEFAULT 'internal' COMMENT 'internal / external',
      \`link_url\` VARCHAR(500) NOT NULL,
      \`location\` VARCHAR(30) NOT NULL DEFAULT 'gnb' COMMENT '커스텀 메뉴만 위치 선택 가능',
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`is_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`pc_visible\` TINYINT(1) NOT NULL DEFAULT 1,
      \`mobile_visible\` TINYINT(1) NOT NULL DEFAULT 1,
      \`login_required\` TINYINT(1) NOT NULL DEFAULT 0,
      \`new_window\` TINYINT(1) NOT NULL DEFAULT 0,
      \`visible_start_at\` DATETIME NULL,
      \`visible_end_at\` DATETIME NULL,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_custom_mall_loc\` (\`mall_id\`, \`location\`, \`sort_order\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 커스텀 메뉴(슬롯 제한)'`);
    console.log('  + custom_menu');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`navigation_config\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`mall_id\` BIGINT NOT NULL DEFAULT 1,
      \`header_layout_type\` VARCHAR(50) NOT NULL DEFAULT 'main_right_utility_v1',
      \`category_display_type\` VARCHAR(50) NOT NULL DEFAULT 'dropdown' COMMENT 'dropdown / mega',
      \`max_gnb_items\` INT NOT NULL DEFAULT 8 COMMENT 'GNB 최대 노출 수(카테고리 버튼 제외)',
      \`max_custom_items\` INT NOT NULL DEFAULT 3 COMMENT 'GNB 커스텀 메뉴 슬롯 수',
      \`category_max_depth\` INT NOT NULL DEFAULT 3 COMMENT '카테고리 최대 뎁스(앱 레이어 강제)',
      \`use_mega_menu\` TINYINT(1) NOT NULL DEFAULT 0,
      \`use_search_bar\` TINYINT(1) NOT NULL DEFAULT 1,
      \`config_json\` JSON NULL,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_navconfig_mall\` (\`mall_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 내비게이션 정책'`);
    console.log('  + navigation_config');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS \`brand_likes\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`category_id\` INT NOT NULL COMMENT 'categories.id (type=BRAND)',
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_brand_like\` (\`user_id\`, \`category_id\`),
      KEY \`idx_bl_user\` (\`user_id\`),
      CONSTRAINT \`fk_bl_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='찜한 브랜드'`);
    console.log('  + brand_likes');
}

async function seedFeatureCatalog(conn) {
    console.log('\n[3] feature_menu 카탈로그 시드');
    const sql = `
    INSERT INTO feature_menu
      (feature_code, default_name, default_path, position, required_module, module_ready, is_system, is_required, default_sort_order, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      default_name = VALUES(default_name),
      default_path = VALUES(default_path),
      position = VALUES(position),
      required_module = VALUES(required_module),
      module_ready = VALUES(module_ready),
      is_system = VALUES(is_system),
      is_required = VALUES(is_required),
      default_sort_order = VALUES(default_sort_order),
      description = VALUES(description)`;

    for (const row of FEATURE_CATALOG) {
        if (!POSITIONS.includes(row[3])) throw new Error(`알 수 없는 position: ${row[3]} (${row[0]})`);
        // module_ready 는 READY_MODULES 를 단일 소스로 삼는다.
        const values = [...row];
        values[5] = READY_MODULES.has(row[0]) ? 1 : 0;
        await conn.query(sql, values);
    }
    const [[{ ready }]] = await conn.query('SELECT COUNT(*) AS ready FROM feature_menu WHERE module_ready = 1');
    console.log(`  · ${FEATURE_CATALOG.length}건 upsert (module_ready=1: ${ready}건)`);
}

async function seedMallFeatureMenu(conn) {
    console.log('\n[4] mall_feature_menu(mall_id=1) 시드');
    for (const row of FEATURE_CATALOG) {
        const [code, , , , , , , isRequired, sortOrder] = row;
        const enabled = ENABLED_FOR_MALL1.has(code) || isRequired === 1 ? 1 : 0;
        await conn.query(
            `INSERT INTO mall_feature_menu (mall_id, feature_code, display_name, sort_order, is_enabled)
             VALUES (1, ?, NULL, ?, ?)
             ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
            [code, sortOrder, enabled]
        );
    }
    const [[{ n }]] = await conn.query(
        'SELECT COUNT(*) AS n FROM mall_feature_menu WHERE mall_id = 1 AND is_enabled = 1'
    );
    console.log(`  · 활성 ${n}건`);
}

async function seedNavigationConfig(conn) {
    console.log('\n[5] navigation_config 시드');
    await conn.query(
        `INSERT INTO navigation_config (mall_id, header_layout_type, category_display_type, max_gnb_items, max_custom_items, category_max_depth)
         VALUES (1, 'main_right_utility_v1', 'dropdown', 8, 3, 3)
         ON DUPLICATE KEY UPDATE header_layout_type = VALUES(header_layout_type)`
    );
    console.log('  · mall_id=1 설정 완료 (카테고리 최대 3뎁스, 커스텀 슬롯 3)');
}

async function reportLegacy(conn) {
    console.log('\n[6] 기존 storefront_menu 이관 매핑(참고)');
    try {
        const [rows] = await conn.query('SELECT id, name, menu_type, url, is_fixed FROM storefront_menu ORDER BY sort_order');
        const map = {
            '카테고리': 'CATEGORY (활성)',
            '오늘특가': 'TODAY_DEAL (활성, /deal/today)',
            '베스트': 'BEST (활성, /best)',
            '이벤트&혜택': 'EVENT (활성, /event)',
            '쇼핑라이브': 'LIVE (비활성 — 모듈 없음)',
            '공동구매': 'GROUP_BUY (비활성 — 모듈 없음)',
            'TV편성표': '폐기 (카탈로그에 없음, 죽은 링크)',
        };
        for (const r of rows) console.log(`  · ${r.name.padEnd(12)} → ${map[r.name] || '미매핑'}`);
        console.log('  ※ storefront_menu 는 M7에서 제거 완료. 백업: scripts/backup_storefront_menu.sql');
    } catch (e) {
        console.log(`  (storefront_menu 없음: ${e.message})`);
    }
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (isDryRun) { console.log('[DRY RUN] 실제 변경 없음'); return; }
        await migrateCategories(conn);
        await createTables(conn);
        await seedFeatureCatalog(conn);
        await seedMallFeatureMenu(conn);
        await seedNavigationConfig(conn);
        await reportLegacy(conn);
        console.log('\n✅ 마이그레이션 완료');
    } catch (err) {
        console.error('\n❌ 마이그레이션 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
