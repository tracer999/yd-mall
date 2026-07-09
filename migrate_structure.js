const pool = require('./config/db');

async function migrate() {
    try {
        console.log('Starting DB Migration...');

        // 1. Add short_description column to products
        try {
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN short_description TEXT NULL COMMENT '상품 기본 설명 (3-4줄 요약)' AFTER description
            `);
            console.log('Added short_description column to products.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('short_description column already exists.');
            } else {
                throw err;
            }
        }

        // 2. Create product_themes table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS product_themes (
                id INT NOT NULL AUTO_INCREMENT COMMENT 'ID (PK)',
                product_id INT NOT NULL COMMENT '상품 ID (FK)',
                category_id INT NOT NULL COMMENT '테마 카테고리 ID (FK)',
                PRIMARY KEY (id) USING BTREE,
                UNIQUE INDEX unique_product_theme (product_id, category_id) USING BTREE,
                CONSTRAINT fk_product_themes_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_product_themes_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE ON UPDATE CASCADE
            ) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB COMMENT='상품과 테마 카테고리 연결 테이블'
        `);
        console.log('Created product_themes table.');
        
        // 3. Migrate existing theme_category_id data to product_themes
        // This is a one-time migration to move existing theme selection to the new table
        const [products] = await pool.query('SELECT id, theme_category_id FROM products WHERE theme_category_id IS NOT NULL');
        if (products.length > 0) {
            console.log(`Migrating ${products.length} existing product themes...`);
            for (const p of products) {
                try {
                    await pool.query('INSERT IGNORE INTO product_themes (product_id, category_id) VALUES (?, ?)', [p.id, p.theme_category_id]);
                } catch (e) {
                    console.error(`Failed to migrate theme for product ${p.id}:`, e.message);
                }
            }
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
