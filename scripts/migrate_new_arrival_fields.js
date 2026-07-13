/**
 * 신상품 · 신규 입점 브랜드 재설계 마이그레이션 (docs/사이트개선/new_arrivals_dev_plan.md)
 *
 *  1. products.sale_start_date   — 신상품 판정 앵커 (판매 시작일)
 *  2. categories.onboarded_at    — 브랜드 입점일 (type=BRAND 에서만 의미)
 *  3. system_settings            — new_product_days(100) / new_brand_days(180)
 *  4. 백필                       — mall 1 상품만 created_at 으로. mall 2 는 NULL 유지.
 *
 * 백필을 몰별로 가르는 이유: mall 2(9,677건)는 created_at 이 전부 임포트 당일 하루에
 * 몰려 있어 판매 시작일의 대리 지표가 되지 못한다. 그대로 복사하면 그 몰 전체가
 * 신상품이 된다. 근거 없는 날짜를 지어내느니 NULL(=신상품 아님)로 두고, 관리자
 * 일괄 지정으로 채운다.
 *
 * 멱등하다. 여러 번 실행해도 안전하며, 백필은 sale_start_date IS NULL 인 행만 건드린다.
 *
 * 실행: set -a; . /etc/environment; set +a; node scripts/migrate_new_arrival_fields.js
 */
require('../config/env');
const pool = require('../config/db');

const BACKFILL_MALL_IDS = [1]; // created_at 이 판매시작일의 대리 지표로 쓸 만한 몰

async function hasColumn(table, column) {
    const [rows] = await pool.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [table, column]
    );
    return rows.length > 0;
}

async function hasIndex(table, index) {
    const [rows] = await pool.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [table, index]
    );
    return rows.length > 0;
}

async function ensureSaleStartDate() {
    if (!await hasColumn('products', 'sale_start_date')) {
        await pool.query(
            "ALTER TABLE products ADD COLUMN sale_start_date DATE NULL COMMENT '판매 시작일 (신상품 판정 기준)' AFTER status"
        );
        console.log('[ok] added products.sale_start_date');
    } else {
        console.log('[skip] products.sale_start_date already exists');
    }

    if (!await hasIndex('products', 'idx_products_sale_start')) {
        await pool.query('ALTER TABLE products ADD INDEX idx_products_sale_start (mall_id, sale_start_date)');
        console.log('[ok] added index idx_products_sale_start');
    } else {
        console.log('[skip] index idx_products_sale_start already exists');
    }
}

async function ensureOnboardedAt() {
    if (!await hasColumn('categories', 'onboarded_at')) {
        await pool.query(
            "ALTER TABLE categories ADD COLUMN onboarded_at DATE NULL COMMENT '브랜드 입점일 (type=BRAND 에서만 의미)' AFTER logo_image_path"
        );
        console.log('[ok] added categories.onboarded_at');
    } else {
        console.log('[skip] categories.onboarded_at already exists');
    }

    if (!await hasIndex('categories', 'idx_categories_onboarded')) {
        await pool.query('ALTER TABLE categories ADD INDEX idx_categories_onboarded (mall_id, type, onboarded_at)');
        console.log('[ok] added index idx_categories_onboarded');
    } else {
        console.log('[skip] index idx_categories_onboarded already exists');
    }
}

async function ensureSettings() {
    const rows = [
        ['new_product_days', '100', '신상품 노출 기간(일) — 판매 시작일 기준'],
        ['new_brand_days', '180', '신규 입점 브랜드 노출 기간(일) — 입점일 기준'],
    ];
    for (const [key, value, desc] of rows) {
        // 이미 있으면 관리자가 조정한 값을 덮어쓰지 않는다.
        const [r] = await pool.query(
            'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
            [key, value, desc]
        );
        console.log(r.affectedRows ? `[ok] system_settings.${key} = ${value}` : `[skip] system_settings.${key} already set`);
    }
}

async function backfill() {
    const [r] = await pool.query(
        `UPDATE products SET sale_start_date = DATE(created_at)
         WHERE sale_start_date IS NULL AND mall_id IN (?) AND created_at IS NOT NULL`,
        [BACKFILL_MALL_IDS]
    );
    console.log(`[ok] backfilled sale_start_date for ${r.affectedRows} products (mall ${BACKFILL_MALL_IDS.join(',')})`);
    console.log('[info] 다른 몰과 브랜드 입점일은 근거 데이터가 없어 NULL 로 남긴다 (관리자가 채운다)');
}

async function report() {
    const [p] = await pool.query(
        `SELECT mall_id,
                COUNT(*) AS total,
                SUM(sale_start_date IS NOT NULL) AS dated,
                SUM(sale_start_date >= DATE_SUB(CURDATE(), INTERVAL 100 DAY) AND sale_start_date <= CURDATE()) AS auto_new,
                SUM(FIND_IN_SET('NEW', product_badge) > 0) AS badge_new
         FROM products GROUP BY mall_id`
    );
    console.table(p);
    const [c] = await pool.query(
        "SELECT mall_id, COUNT(*) AS brands, SUM(onboarded_at IS NOT NULL) AS dated FROM categories WHERE type='BRAND' GROUP BY mall_id"
    );
    console.table(c);
}

(async () => {
    try {
        await ensureSaleStartDate();
        await ensureOnboardedAt();
        await ensureSettings();
        await backfill();
        await report();
        console.log('\n완료.');
    } catch (err) {
        console.error('[fail]', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
