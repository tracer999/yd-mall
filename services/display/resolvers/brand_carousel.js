const pool = require('../../../config/db');
const dealSvc = require('../../deal/dealService');
const { P_STATUS, STOCK_COL, visibilityClause } = require('./_shared');
const { GLOBAL_CATEGORY_MALL_ID, hiddenCategoryIdSet } = require('../../catalog/categoryScope');

/**
 * brand_carousel — "베스트 브랜드": 브랜드별 실제 상품 리스트.
 *
 * 브랜드는 전 몰 공통(글로벌, mall_id=0). 이 몰 스토어프론트에는
 * **이 몰(products.mall_id)에 등록된 상품이 걸린 브랜드만** 노출한다(−몰별 숨김).
 * 각 브랜드마다 로고+이름 헤더와 그 브랜드 상품 N개를 함께 보여준다(상품 카운트 대신).
 *
 * config:
 *   maxCount      최대 노출 브랜드 수 (기본 8)
 *   productCount  브랜드당 상품 수 (기본 12 — 상품줄이 스와이프 캐러셀이라 한 화면보다 넉넉히 담는다)
 *
 * 상품이 걸린 브랜드가 0곳이면 스킵.
 */
async function resolve({ shared, config, locals }) {
    const brandLimit = Math.min(Number(config.maxCount) || 8, 30);
    const productLimit = Math.min(Number(config.productCount) || 12, 20);
    const vis = visibilityClause(shared.hasUser);
    const mallId = shared.mallId || 1;

    // 1) 이 몰에 상품이 걸린 브랜드만 추린다(브랜드 × 이 몰 상품).
    //    브랜드 범위는 글로벌(0) + 이 몰 소유분 — 샘플 시더로 찍어낸 몰은 자기 브랜드를 갖는다.
    //    글로벌만 보면 그런 몰에서 "상품이 등록된 브랜드 카테고리가 없습니다"로 섹션이 사라진다.
    const [rows] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, COUNT(p.id) AS product_count
        FROM categories c
        JOIN products p
               ON p.brand_category_id = c.id AND p.mall_id = ? AND ${P_STATUS} AND ${vis}
        WHERE c.type = 'BRAND' AND c.is_active = 1 AND c.mall_id IN (?, ?)
        GROUP BY c.id, c.name, c.logo_image_path
        HAVING product_count > 0
        ORDER BY c.display_order ASC, c.id ASC
        LIMIT ?
    `, [mallId, GLOBAL_CATEGORY_MALL_ID, mallId, brandLimit]);

    if (!rows || rows.length === 0) return null;

    // 몰별 '숨김' override 반영(스토어프론트 일관성).
    const hidden = await hiddenCategoryIdSet(mallId);
    const visibleRows = hidden.size ? rows.filter((r) => !hidden.has(r.id)) : rows;
    if (visibleRows.length === 0) return null;

    // 2) 브랜드별 상품 채우기 (view_count DESC — loadHomeCategoryBests 관례와 동일).
    const brands = [];
    for (const b of visibleRows) {
        const [products] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                   p.discount_rate, p.status, ${STOCK_COL}, p.provider,
                   p.product_badge, p.distribution_badge
            FROM products p
            WHERE p.mall_id = ? AND p.brand_category_id = ? AND ${P_STATUS} AND ${vis}
            ORDER BY FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT','OFF'),
                     p.view_count DESC, p.created_at DESC
            LIMIT ?
        `, [mallId, b.id, productLimit]);

        if (!products.length) continue;
        await dealSvc.applyDeals(products); // 다른 상품 카드와 특가 표시 일관성
        brands.push({
            id: b.id,
            name: b.name,
            logo_image_path: b.logo_image_path,
            product_count: b.product_count,
            products,
        });
    }

    if (!brands.length) return null;

    locals.brands = brands;
    return locals;
}

module.exports = { resolve };
