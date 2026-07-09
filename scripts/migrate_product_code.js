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

async function hasIndex(indexName) {
    const [rows] = await pool.query(
        `SELECT 1
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'products'
           AND INDEX_NAME = ?
         LIMIT 1`,
        [indexName]
    );
    return rows.length > 0;
}

async function main() {
    try {
        const columnExists = await hasColumn('product_code');
        if (!columnExists) {
            await pool.query(
                "ALTER TABLE products ADD COLUMN `product_code` VARCHAR(100) NULL COMMENT '상품코드 (관리자 입력)' AFTER `name`"
            );
            console.log('[ok] added products.product_code');
        } else {
            console.log('[skip] products.product_code already exists');
        }

        const indexExists = await hasIndex('idx_products_product_code');
        if (!indexExists) {
            await pool.query('ALTER TABLE products ADD INDEX idx_products_product_code (product_code)');
            console.log('[ok] added index idx_products_product_code');
        } else {
            console.log('[skip] index idx_products_product_code already exists');
        }

        console.log('[done] product_code migration complete');
    } catch (err) {
        console.error('[error] product_code migration failed');
        console.error(err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
