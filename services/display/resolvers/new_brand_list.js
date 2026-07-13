const pool = require('../../../config/db');
const { P_STATUS, visibilityClause } = require('./_shared');
const newArrival = require('../../catalog/newArrival');

/**
 * new_brand_list — 신규 입점 브랜드 (로고·브랜드명·입점일·대표 상품 몇 개)
 *
 * 판정은 categories.onboarded_at 기준(services/catalog/newArrival). 입점일이 비어 있으면
 * 신규가 아니다 — 기존 브랜드 1,379곳은 입점일 근거 데이터가 없어 NULL 로 두었으므로,
 * 관리자가 입점일을 넣기 전까지 이 섹션은 비고, 비면 렌더를 건너뛴다.
 *
 * config:
 *   maxCount      브랜드 수 (기본 8)
 *   productCount  브랜드별 대표 상품 수 (기본 3, 0이면 상품 안 실음)
 *
 * 신규 입점 브랜드가 0곳이면 스킵.
 */
async function resolve({ shared, config, locals }) {
    const brandLimit = Math.min(Number(config.maxCount) || 8, 24);
    const productCount = Math.min(Number(config.productCount ?? 3), 6);
    const vis = visibilityClause(shared.hasUser);
    const mallId = shared.mallId || 1;

    const nb = newArrival.newBrandPredicate('c');
    const [brands] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, c.onboarded_at, c.description
        FROM categories c
        WHERE c.type = 'BRAND' AND c.is_active = 1 AND c.mall_id = ?
          AND ${nb.sql}
        ORDER BY c.onboarded_at DESC, c.id DESC
        LIMIT ?
    `, [mallId, ...nb.params, brandLimit]);

    if (!brands || !brands.length) return null;

    const items = [];
    for (const b of brands) {
        let products = [];
        if (productCount > 0) {
            // 대표 상품은 신상품 여부와 무관하다 — 갓 입점한 브랜드를 보여주는 게 목적이라
            // 그 브랜드의 얼굴이 될 상품이면 된다.
            const [rows] = await pool.query(`
                SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                       p.discount_rate, p.status, p.stock, p.provider,
                       p.product_badge, p.distribution_badge, p.sale_start_date
                FROM products p
                WHERE p.mall_id = ? AND p.brand_category_id = ?
                  AND ${P_STATUS} AND ${vis}
                ORDER BY ${newArrival.newProductOrder('p')}
                LIMIT ?
            `, [mallId, b.id, productCount]);
            products = rows;
        }

        items.push({
            id: b.id,
            name: b.name,
            logo: b.logo_image_path,
            description: b.description,
            onboardedAt: b.onboarded_at,
            products,
        });
    }

    locals.brands = items;
    return locals;
}

module.exports = { resolve };
