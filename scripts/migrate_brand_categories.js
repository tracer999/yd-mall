require('../config/env');
const pool = require('../config/db');

async function hasColumn(tableName, columnName) {
    const [rows] = await pool.query(
        `SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [tableName, columnName]
    );
    return rows.length > 0;
}

async function ensureCategoryTypeEnum() {
    await pool.query(
        "ALTER TABLE categories MODIFY COLUMN type ENUM('NORMAL','THEME','BRAND') NOT NULL DEFAULT 'NORMAL'"
    );
    console.log('[ok] categories.type enum includes BRAND');
}

async function ensureBrandColumnOnProducts() {
    const exists = await hasColumn('products', 'brand_category_id');
    if (!exists) {
        await pool.query(
            "ALTER TABLE products ADD COLUMN brand_category_id INT NULL COMMENT '브랜드 카테고리 ID (FK)' AFTER category_id"
        );
        console.log('[ok] added products.brand_category_id');
    } else {
        console.log('[skip] products.brand_category_id already exists');
    }
}

async function ensureBrandIndexAndFk() {
    const [idxRows] = await pool.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'products'
           AND INDEX_NAME = 'idx_products_brand_category'
         LIMIT 1`
    );
    if (idxRows.length === 0) {
        await pool.query('ALTER TABLE products ADD INDEX idx_products_brand_category (brand_category_id)');
        console.log('[ok] added index idx_products_brand_category');
    } else {
        console.log('[skip] index idx_products_brand_category already exists');
    }

    const [fkRows] = await pool.query(
        `SELECT 1
         FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = DATABASE()
           AND TABLE_NAME = 'products'
           AND CONSTRAINT_NAME = 'fk_products_brand_category'
         LIMIT 1`
    );
    if (fkRows.length === 0) {
        await pool.query(
            'ALTER TABLE products ADD CONSTRAINT fk_products_brand_category FOREIGN KEY (brand_category_id) REFERENCES categories(id) ON DELETE SET NULL'
        );
        console.log('[ok] added fk fk_products_brand_category');
    } else {
        console.log('[skip] fk fk_products_brand_category already exists');
    }
}

async function main() {
    try {
        await ensureCategoryTypeEnum();
        await ensureBrandColumnOnProducts();
        await ensureBrandIndexAndFk();
        console.log('[done] brand category migration complete');
    } catch (err) {
        console.error('[error] brand category migration failed');
        console.error(err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
