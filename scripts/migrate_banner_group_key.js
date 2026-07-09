#!/usr/bin/env node
/**
 * CT-5 — banners.group_key 컬럼 추가 (멱등)
 *
 * 실행: node scripts/migrate_banner_group_key.js
 *
 * promotion_banner 섹션이 배너를 그룹 단위로 묶어 가져올 수 있도록 한다.
 * 신규 테이블(banner_group)을 만들지 않고 기존 banners 에 그룹 키만 추가한다.
 *
 * 설계: docs/사이트개선/frontend_dev_plan.md §6
 */
require('../config/env');
const pool = require('../config/db');

async function columnExists(conn, table, column) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return r.length > 0;
}

async function indexExists(conn, table, indexName) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, indexName]
    );
    return r.length > 0;
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (await columnExists(conn, 'banners', 'group_key')) {
            console.log('  = banners.group_key 이미 존재');
        } else {
            await conn.query(
                "ALTER TABLE `banners` ADD COLUMN `group_key` VARCHAR(50) NULL COMMENT '배너 그룹 키(promotion_banner 등 섹션 데이터소스)' AFTER `banner_type`"
            );
            console.log('  + banners.group_key 추가');
        }

        if (await indexExists(conn, 'banners', 'idx_banners_group_key')) {
            console.log('  = idx_banners_group_key 이미 존재');
        } else {
            await conn.query('ALTER TABLE `banners` ADD INDEX `idx_banners_group_key` (`group_key`, `display_order`)');
            console.log('  + idx_banners_group_key 추가');
        }

        console.log('\n✅ 마이그레이션 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
