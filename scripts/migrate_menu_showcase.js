/*
 * 메뉴 쇼케이스 — product_group 에 메뉴 매핑 컬럼 추가.
 *
 *   menu_code      : 이 그룹을 어느 GNB 메뉴(feature_menu.feature_code) 상단에 띄울지. NULL = 일반 그룹.
 *   showcase_title : 캐러셀 섹션 제목(예: '추천 특가'). 비면 그룹명을 쓴다.
 *   UNIQUE(mall_id, menu_code) — 한 메뉴에 쇼케이스 그룹은 하나만.
 *
 * 새 테이블을 만들지 않은 이유: 수동 큐레이션 저장소가 이미 product_group_item 이다.
 * 메뉴는 그 그룹을 **참조**만 하면 되므로 컬럼 2개로 충분하다.
 *
 * 실행: set -a; . /etc/environment; set +a; node scripts/migrate_menu_showcase.js
 * (tables.sql 에는 product_group 정의 자체가 없다 — 기존 스키마 드리프트)
 */
const pool = require('../config/db');

async function hasColumn(name) {
    const [[row]] = await pool.query(`
        SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_group' AND COLUMN_NAME = ?`, [name]);
    return Number(row.c) > 0;
}

async function hasIndex(name) {
    const [[row]] = await pool.query(`
        SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_group' AND INDEX_NAME = ?`, [name]);
    return Number(row.c) > 0;
}

(async () => {
    if (await hasColumn('menu_code')) {
        console.log('[migrate] menu_code 이미 존재 — 건너뜁니다.');
    } else {
        await pool.query(`
            ALTER TABLE product_group
              ADD COLUMN menu_code VARCHAR(50) DEFAULT NULL
                COMMENT '메뉴 쇼케이스 대상 feature_menu.feature_code (NULL=일반 상품그룹)' AFTER name,
              ADD COLUMN showcase_title VARCHAR(100) DEFAULT NULL
                COMMENT '메뉴 쇼케이스 섹션 제목 (예: 추천 특가)' AFTER menu_code`);
        console.log('[migrate] menu_code · showcase_title 컬럼 추가');
    }

    if (await hasIndex('uk_pg_menu')) {
        console.log('[migrate] uk_pg_menu 이미 존재 — 건너뜁니다.');
    } else {
        await pool.query('ALTER TABLE product_group ADD UNIQUE KEY uk_pg_menu (mall_id, menu_code)');
        console.log('[migrate] UNIQUE(mall_id, menu_code) 추가');
    }

    console.log('[migrate] 완료. 다음: node scripts/seed_menu_showcase.js [mallId]');
    await pool.end();
})().catch(async (e) => {
    console.error('[migrate] 실패:', e.message);
    await pool.end();
    process.exit(1);
});
