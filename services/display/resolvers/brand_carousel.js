const pool = require('../../../config/db');
const { P_STATUS, visibilityClause } = require('./_shared');
const { GLOBAL_CATEGORY_MALL_ID, hiddenCategoryIdSet } = require('../../catalog/categoryScope');

/**
 * brand_carousel — categories(type='BRAND') 기반 브랜드 로고 목록.
 *
 * 브랜드는 전 몰 공통(글로벌, mall_id=0). 이 몰 스토어프론트에는
 * **이 몰(products.mall_id)에 등록된 상품이 걸린 브랜드만** 노출한다(−몰별 숨김).
 *
 * config:
 *   maxCount      최대 노출 수 (기본 20)
 *   onlyWithProducts  상품이 1건 이상인 브랜드만 (기본 true)
 *
 * 브랜드가 0건이면 스킵.
 */
async function resolve({ shared, config, locals }) {
    const limit = Math.min(Number(config.maxCount) || 20, 60);
    const onlyWithProducts = config.onlyWithProducts !== false;
    const vis = visibilityClause(shared.hasUser);
    const mallId = shared.mallId || 1;

    // 글로벌 브랜드 × 이 몰 상품. product_count 는 이 몰 상품만 센다(LEFT JOIN 의 p.mall_id).
    const having = onlyWithProducts ? 'HAVING product_count > 0' : '';
    const [rows] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p
               ON p.brand_category_id = c.id AND p.mall_id = ? AND ${P_STATUS} AND ${vis}
        WHERE c.type = 'BRAND' AND c.is_active = 1 AND c.mall_id = ?
        GROUP BY c.id, c.name, c.logo_image_path
        ${having}
        ORDER BY c.display_order ASC, c.id ASC
        LIMIT ?
    `, [mallId, GLOBAL_CATEGORY_MALL_ID, limit]);

    if (!rows || rows.length === 0) return null;

    // 몰별 '숨김' override 반영(스토어프론트 일관성).
    const hidden = await hiddenCategoryIdSet(mallId);
    const visibleRows = hidden.size ? rows.filter((r) => !hidden.has(r.id)) : rows;
    if (visibleRows.length === 0) return null;

    locals.brands = visibleRows;
    return locals;
}

module.exports = { resolve };
