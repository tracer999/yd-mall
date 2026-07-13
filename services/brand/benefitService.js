const pool = require('../../config/db');

/**
 * 브랜드 혜택 통합 조회 — 쿠폰 · 기획전 · 쇼핑특가 · 공동구매.
 *
 * exhibition_product / deal_item / group_buy_product 가 전부 product_id 를 갖고 있어,
 * 상품 → brand_category_id 역추적만으로 "이 브랜드의 진행 중 혜택"이 나온다.
 * 매핑 테이블을 새로 만들 필요가 없다.
 *
 * 라이브 방송은 테이블·코드가 아직 없다(3차).
 */

/** 브랜드 하나의 진행 중 혜택 */
async function getBrandBenefits(mallId, brandId) {
    const [coupons, exhibitions, deals, groupBuys] = await Promise.all([
        getBrandCoupons(mallId, brandId),
        getBrandExhibitions(mallId, brandId),
        getBrandDeals(mallId, brandId),
        getBrandGroupBuys(mallId, brandId)
    ]);
    return {
        coupons, exhibitions, deals, groupBuys,
        total: coupons.length + exhibitions.length + deals.length + groupBuys.length
    };
}

/** scope_json.include.brandIds 에 이 브랜드가 있는 활성 쿠폰 */
async function getBrandCoupons(mallId, brandId) {
    const [rows] = await pool.query(`
        SELECT id, name, summary, thumbnail_url, benefit_type, discount_amount, discount_rate,
               max_discount_amount, min_order_amount, valid_to, issue_method, scope_json
        FROM coupons
        WHERE (mall_id = ? OR mall_id IS NULL)
          AND status = 'ACTIVE' AND is_active = 1
          AND valid_from <= NOW() AND valid_to >= NOW()
          AND scope_json IS NOT NULL
    `, [mallId]);

    // JSON 컬럼이라 인덱스를 못 탄다. 쿠폰은 몰당 수십 건 규모라 메모리 필터로 충분하다.
    return rows.filter(c => {
        const scope = typeof c.scope_json === 'string' ? JSON.parse(c.scope_json) : c.scope_json;
        const ids = scope?.include?.brandIds;
        return Array.isArray(ids) && ids.map(Number).includes(Number(brandId));
    }).map(({ scope_json, ...c }) => c);
}

/** 브랜드 기획전 — 명시 지정 우선, 없으면 편성 상품의 브랜드로 역추적 */
async function getBrandExhibitions(mallId, brandId) {
    const [rows] = await pool.query(`
        SELECT DISTINCT e.id, e.title, e.slug, e.summary, e.list_thumbnail_url,
               e.exhibition_type, e.start_at, e.end_at
        FROM exhibition e
        LEFT JOIN exhibition_product ep ON ep.exhibition_id = e.id AND ep.visible = 1
        LEFT JOIN products p ON p.id = ep.product_id
        WHERE e.mall_id = ? AND e.status = 'PUBLISHED' AND e.list_visible = 1
          AND e.start_at <= NOW() AND (e.end_at IS NULL OR e.end_at >= NOW())
          AND (e.brand_category_id = ? OR p.brand_category_id = ?)
        ORDER BY (e.brand_category_id = ?) DESC, e.start_at DESC
        LIMIT 12
    `, [mallId, brandId, brandId, brandId]);
    return rows;
}

/** 이 브랜드 상품이 편성된 진행 중 쇼핑특가 */
async function getBrandDeals(mallId, brandId) {
    const [rows] = await pool.query(`
        SELECT d.id, d.title, d.subtitle, d.starts_at, d.ends_at,
               COUNT(DISTINCT di.product_id) AS item_count,
               MIN(di.deal_price) AS min_deal_price
        FROM deal d
        JOIN deal_item di ON di.deal_id = d.id
        JOIN products p ON p.id = di.product_id
        WHERE d.mall_id = ? AND d.is_active = 1
          AND d.starts_at <= NOW() AND d.ends_at >= NOW()
          AND p.brand_category_id = ?
        GROUP BY d.id
        ORDER BY d.priority DESC, d.ends_at ASC
        LIMIT 12
    `, [mallId, brandId]);
    return rows;
}

/** 이 브랜드 상품이 편성된 진행 중 공동구매 */
async function getBrandGroupBuys(mallId, brandId) {
    const [rows] = await pool.query(`
        SELECT DISTINCT g.id, g.title, g.slug, g.summary, g.list_thumbnail_url,
               g.start_at, g.end_at, g.participant_count
        FROM group_buy g
        JOIN group_buy_product gp ON gp.group_buy_id = g.id
        JOIN products p ON p.id = gp.product_id
        WHERE g.mall_id = ? AND g.status = 'PUBLISHED' AND g.list_visible = 1
          AND g.start_at <= NOW() AND g.end_at >= NOW()
          AND p.brand_category_id = ?
        ORDER BY g.end_at ASC
        LIMIT 12
    `, [mallId, brandId]);
    return rows;
}

/**
 * 브랜드 홈 "이번 주 브랜드 혜택" 슬라이더.
 *
 * brand_stat.benefit_count 로 후보 브랜드를 좁힌 뒤 상세를 채운다.
 * 브랜드당 대표 혜택 1건만 담는다 — 혜택 많은 브랜드 하나가 슬라이더를 독점하면
 * "여러 브랜드가 행사 중"이라는 정보가 사라진다.
 *
 * 슬라이드는 이미지가 필요하다. 기획전·공동구매는 list_thumbnail_url, 쿠폰은
 * thumbnail_url 을 쓰고, 특가처럼 이미지가 없는 혜택은 그 브랜드의 대표 상품
 * 이미지로 채운다(brand_stat.rep_product_ids).
 */
async function getWeeklyBenefits(mallId, limit = 10) {
    const [brands] = await pool.query(`
        SELECT s.category_id, c.name, c.logo_image_path, s.benefit_count, s.rep_product_ids
        FROM brand_stat s
        JOIN categories c ON c.id = s.category_id AND c.is_active = 1
        WHERE s.mall_id = ? AND s.benefit_count > 0
        ORDER BY s.benefit_count DESC, s.popularity_score DESC, s.product_count DESC
        LIMIT ?
    `, [mallId, limit]);
    if (!brands.length) return [];

    // 대표 상품 이미지 (이미지 없는 혜택의 폴백)
    const repIds = [];
    for (const b of brands) {
        const ids = typeof b.rep_product_ids === 'string' ? JSON.parse(b.rep_product_ids) : (b.rep_product_ids || []);
        b._repIds = Array.isArray(ids) ? ids : [];
        repIds.push(...b._repIds);
    }
    let imgOf = new Map();
    if (repIds.length) {
        const [rows] = await pool.query(
            'SELECT id, main_image, thumbnail_image FROM products WHERE id IN (?)', [repIds]
        );
        imgOf = new Map(rows.map(r => [r.id, r.main_image || r.thumbnail_image]));
    }

    const out = [];
    for (const b of brands) {
        const ben = await getBrandBenefits(mallId, b.category_id);
        const repImage = b._repIds.map(id => imgOf.get(id)).find(Boolean) || null;

        const ex = ben.exhibitions[0], dl = ben.deals[0], gb = ben.groupBuys[0], cp = ben.coupons[0];
        const pick = ex
            ? { kind: 'EXHIBITION', label: '기획전', title: ex.title, summary: ex.summary,
                url: `/exhibition/${ex.slug}`, image: ex.list_thumbnail_url || repImage, endAt: ex.end_at }
            : dl
            ? { kind: 'DEAL', label: '특가', title: dl.title, summary: dl.subtitle || `이 브랜드 상품 ${dl.item_count}개 특가`,
                url: '/deals', image: repImage, endAt: dl.ends_at }
            : gb
            ? { kind: 'GROUP_BUY', label: '공동구매', title: gb.title, summary: gb.summary || `${gb.participant_count}명 참여 중`,
                url: `/group-buy/${gb.slug}`, image: gb.list_thumbnail_url || repImage, endAt: gb.end_at }
            : cp
            ? { kind: 'COUPON', label: '쿠폰', title: cp.name, summary: cp.summary || couponLabel(cp),
                url: `/coupon?brand=${b.category_id}`, image: cp.thumbnail_url || repImage, endAt: cp.valid_to }
            : null;

        if (pick) {
            const { rep_product_ids, _repIds, ...brandInfo } = b;
            out.push({ brand: brandInfo, ...pick, total: ben.total });
        }
    }
    return out;
}

/** 쿠폰 혜택을 한 줄로 ("3,000원 할인" / "10% 할인") */
function couponLabel(c) {
    if (c.benefit_type === 'PERCENT') return `${Number(c.discount_rate || 0)}% 할인`;
    if (c.benefit_type === 'SHIPPING_FREE') return '무료배송';
    return `${Number(c.discount_amount || 0).toLocaleString()}원 할인`;
}

module.exports = {
    getBrandBenefits, getBrandCoupons, getBrandExhibitions,
    getBrandDeals, getBrandGroupBuys, getWeeklyBenefits
};
