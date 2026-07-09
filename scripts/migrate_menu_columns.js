#!/usr/bin/env node
/**
 * 메뉴 컬럼 보강 (멱등) — 관리자 M6(메뉴 관리 UI) 선행 작업
 *
 * 실행: node scripts/migrate_menu_columns.js
 *
 * 왜 지금인가: `custom_menu` 는 아직 0행이다. 지금 스키마를 확정하면 데이터
 * 마이그레이션 비용이 0이다. 관리자 UI 를 먼저 만들고 운영자가 메뉴를 넣기
 * 시작한 뒤에 컬럼을 추가하면 UI·서비스·시드를 모두 다시 손대야 한다.
 *
 * 추가:
 *   mall_feature_menu.badge_type   NEW / HOT / SALE 배지 (일반 메뉴 관리 UI 스펙)
 *   custom_menu.badge_type         동일
 *   custom_menu.link_target        내부 리소스 id (카테고리/브랜드/기획전/상품그룹)
 *
 * 변경:
 *   custom_menu.link_type          varchar(20) → varchar(30), 값 체계를 대문자 코드로 통일
 *   custom_menu.link_url           NOT NULL → NULL  (CATEGORY/BRAND 는 URL 을 파생하므로)
 *
 * 도입하지 않는 것 (YAGNI):
 *   categories.seo_config     — 카테고리 SEO 요구 없음. seoDefaults 미들웨어로 충분
 *   custom_menu.tracking_code — 캠페인 분석 소비처 없음
 */
require('../config/env');
const pool = require('../config/db');

/** 링크 유형 화이트리스트. 실제 라우트가 있는 것만 렌더된다(navigationService 참조). */
const LINK_TYPES = ['INTERNAL_PAGE', 'EXTERNAL_URL', 'CATEGORY', 'BRAND', 'EXHIBITION', 'PRODUCT_GROUP'];

/** 구값 → 신값 매핑 */
const LEGACY_LINK_TYPE = { internal: 'INTERNAL_PAGE', external: 'EXTERNAL_URL' };

async function columnExists(conn, table, column) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return r.length > 0;
}

async function columnMeta(conn, table, column) {
    const [r] = await conn.query(
        `SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return r[0] || null;
}

async function addColumnIfMissing(conn, table, column, ddl) {
    if (await columnExists(conn, table, column)) {
        console.log(`  = ${table}.${column} 이미 존재`);
        return;
    }
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    console.log(`  + ${table}.${column} 추가`);
}

const BADGE_DDL = "`badge_type` VARCHAR(20) NULL COMMENT '강조 배지: NEW / HOT / SALE (없으면 미표시)'";

(async () => {
    const conn = await pool.getConnection();
    try {
        console.log('\n[1] 배지 컬럼');
        await addColumnIfMissing(conn, 'mall_feature_menu', 'badge_type', `${BADGE_DDL} AFTER \`login_required\``);
        await addColumnIfMissing(conn, 'custom_menu', 'badge_type', `${BADGE_DDL} AFTER \`login_required\``);

        console.log('\n[2] custom_menu.link_target');
        await addColumnIfMissing(conn, 'custom_menu', 'link_target',
            "`link_target` BIGINT NULL COMMENT '내부 리소스 id (CATEGORY=categories.id, BRAND=categories.id, EXHIBITION/PRODUCT_GROUP=해당 id)' AFTER `link_type`");

        console.log('\n[3] custom_menu.link_url 널 허용 (CATEGORY/BRAND 는 URL 파생)');
        const urlMeta = await columnMeta(conn, 'custom_menu', 'link_url');
        if (urlMeta && urlMeta.IS_NULLABLE === 'YES') {
            console.log('  = link_url 이미 NULL 허용');
        } else {
            await conn.query(
                "ALTER TABLE `custom_menu` MODIFY COLUMN `link_url` VARCHAR(500) NULL COMMENT 'INTERNAL_PAGE/EXTERNAL_URL 일 때만 사용. 나머지는 link_target 으로 파생'"
            );
            console.log('  ~ link_url → NULL 허용');
        }

        console.log('\n[4] custom_menu.link_type 값 체계 통일');
        // 먼저 기존 소문자 값을 대문자 코드로 이관 (현재 0행이지만 멱등하게)
        for (const [oldV, newV] of Object.entries(LEGACY_LINK_TYPE)) {
            const [r] = await conn.query('UPDATE custom_menu SET link_type = ? WHERE link_type = ?', [newV, oldV]);
            if (r.affectedRows) console.log(`  · '${oldV}' → '${newV}' ${r.affectedRows}행`);
        }
        const typeMeta = await columnMeta(conn, 'custom_menu', 'link_type');
        if (typeMeta && typeMeta.COLUMN_TYPE === 'varchar(30)') {
            console.log('  = link_type 이미 varchar(30)');
        } else {
            await conn.query(
                "ALTER TABLE `custom_menu` MODIFY COLUMN `link_type` VARCHAR(30) NOT NULL DEFAULT 'INTERNAL_PAGE' " +
                "COMMENT 'INTERNAL_PAGE / EXTERNAL_URL / CATEGORY / BRAND / EXHIBITION / PRODUCT_GROUP'"
            );
            console.log("  ~ link_type → varchar(30), default 'INTERNAL_PAGE'");
        }

        console.log('\n[5] 현재 상태');
        const [[cm]] = await conn.query('SELECT COUNT(*) AS n FROM custom_menu');
        console.log(`  custom_menu 행수: ${cm.n} (0이면 스키마 변경 비용 없음)`);
        console.log(`  허용 link_type: ${LINK_TYPES.join(' / ')}`);

        console.log('\n✅ 마이그레이션 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();

module.exports = { LINK_TYPES };
