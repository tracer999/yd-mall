const pool = require('../../../config/db');
const { P_STATUS, STOCK_COL, visibilityClause } = require('./_shared');
const newArrival = require('../../catalog/newArrival');

/**
 * new_by_brand — 브랜드별 신상품 (브랜드 로고 + 그 브랜드의 신상품 가로 스크롤)
 *
 * 신상품을 가진 브랜드만 나온다. 브랜드를 먼저 나열하고 상품을 채우는 방식이면
 * 빈 줄이 대부분이 된다(브랜드는 1,379개, 신상품은 수백 건).
 *
 * 브랜드 정렬은 '신상품이 많은 순' — 신상품을 활발히 넣는 브랜드가 위로 온다.
 *
 * config:
 *   maxCount   브랜드별 상품 수 (기본 6)
 *   maxBrand   브랜드 최대 수 (기본 5)
 *
 * 신상품 보유 브랜드가 0곳이면 스킵.
 */
async function resolve({ shared, config, locals }) {
    const productLimit = Math.min(Number(config.maxCount) || 6, 20);
    const brandLimit = Math.min(Number(config.maxBrand) || 5, 12);
    const vis = visibilityClause(shared.hasUser);
    const mallId = shared.mallId || 1;

    // 1) 신상품을 가진 브랜드 추리기
    const npB = newArrival.newProductPredicate('p');
    const [brands] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, c.onboarded_at, COUNT(p.id) AS new_count
        FROM categories c
        JOIN products p
          ON p.brand_category_id = c.id AND p.mall_id = ?
         AND ${P_STATUS} AND ${vis} AND ${npB.sql}
        WHERE c.type = 'BRAND' AND c.is_active = 1 AND c.mall_id IN (0, ?)
        GROUP BY c.id, c.name, c.logo_image_path, c.onboarded_at
        ORDER BY new_count DESC, c.display_order ASC, c.id ASC
        LIMIT ?
    `, [mallId, ...npB.params, mallId, brandLimit]);

    if (!brands || !brands.length) return null;

    // 2) 브랜드별 신상품 채우기
    const groups = [];
    for (const b of brands) {
        const np = newArrival.newProductPredicate('p');
        const [products] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                   p.discount_rate, p.status, ${STOCK_COL}, p.provider,
                   p.product_badge, p.distribution_badge, p.sale_start_date
            FROM products p
            WHERE p.mall_id = ? AND p.brand_category_id = ?
              AND ${P_STATUS} AND ${vis} AND ${np.sql}
            ORDER BY ${newArrival.newProductOrder('p')}
            LIMIT ?
        `, [mallId, b.id, ...np.params, productLimit]);

        if (!products.length) continue;
        groups.push({
            id: b.id,
            name: b.name,
            logo: b.logo_image_path,
            isNewBrand: newArrival.isNewBrand(b),
            newCount: b.new_count,
            products,
        });
    }

    if (!groups.length) return null;

    locals.groups = groups;
    return locals;
}

module.exports = { resolve };
