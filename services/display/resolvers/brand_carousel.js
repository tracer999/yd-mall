const pool = require('../../../config/db');
const { P_STATUS, visibilityClause } = require('./_shared');

/**
 * brand_carousel — categories(type='BRAND') 기반 브랜드 로고 목록.
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

    const having = onlyWithProducts ? 'HAVING product_count > 0' : '';
    const [rows] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p
               ON p.brand_category_id = c.id AND ${P_STATUS} AND ${vis}
        WHERE c.type = 'BRAND' AND c.is_active = 1
        GROUP BY c.id, c.name, c.logo_image_path
        ${having}
        ORDER BY c.display_order ASC, c.id ASC
        LIMIT ?
    `, [limit]);

    if (!rows || rows.length === 0) return null;

    locals.brands = rows;
    return locals;
}

module.exports = { resolve };
