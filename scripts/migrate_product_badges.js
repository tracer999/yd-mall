require('../config/env');
const pool = require('../config/db');

async function hasColumn(columnName) {
    const [rows] = await pool.query(
        `SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'products'
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [columnName]
    );
    return rows.length > 0;
}

async function addColumnIfMissing(columnName, definitionSql) {
    const exists = await hasColumn(columnName);
    if (exists) {
        console.log(`[skip] products.${columnName} already exists`);
        return;
    }

    await pool.query(`ALTER TABLE products ADD COLUMN ${definitionSql}`);
    console.log(`[ok] added products.${columnName}`);
}

async function main() {
    try {
        await addColumnIfMissing(
            'distribution_badge',
            "`distribution_badge` enum('ONLINE_ONLY','OFFLINE_ONLY') NULL COMMENT '유통채널 구분 뱃지' AFTER `slug`"
        );
        await addColumnIfMissing(
            'product_badge',
            "`product_badge` enum('BEST','NEW','RECOMMEND') NULL COMMENT '상품구분 뱃지' AFTER `distribution_badge`"
        );
        console.log('[done] product badge migration complete');
    } catch (err) {
        console.error('[error] product badge migration failed');
        console.error(err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
