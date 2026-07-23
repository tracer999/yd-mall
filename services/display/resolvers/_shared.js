const pool = require('../../../config/db');
const dealSvc = require('../../deal/dealService');
const { sellableStockSql } = require('../../catalog/sellableStock');

/**
 * 카드 SELECT 절에 그대로 넣는 판매가능재고 컬럼(products 별칭이 `p` 인 쿼리용).
 * products.stock 은 옵션상품에서 stale 해 카드가 SOLD OUT 으로 잘못 뜬다 — 섹션 리졸버는 전부 이걸 쓴다.
 */
const STOCK_COL = `${sellableStockSql('p')} AS stock`;
const { GLOBAL_CATEGORY_MALL_ID, visibleCategoryIdSet } = require('../../catalog/categoryScope');

/*
 * 리졸버 공용 쿼리/헬퍼 (CT-0)
 *
 * 리졸버 계약:
 *   async resolve(ctx) → locals | null
 *   ctx = { section, shared, config, locals }
 *     section : page_section 행 (또는 발행 스냅샷 행)
 *     shared  : 요청 단위 공유 컨텍스트 { hasUser, heroData, kakaoUrl, ... }
 *     config  : config_json 파싱 결과
 *     locals  : { ...config, title } 기본 로컬 (리졸버가 보강해서 반환)
 *   null 을 반환하면 해당 섹션은 렌더에서 스킵된다(빈 데이터 처리 규약).
 */

/** 전시 가능한 상품 상태 */
const P_STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";

/** 비로그인 사용자에게는 PUBLIC 상품만 노출 */
function visibilityClause(hasUser) {
    return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

/**
 * 홈 카테고리 탭용: 이 몰에 상품이 1건 이상 있는 NORMAL 카테고리.
 * NORMAL 카테고리는 전 몰 공통(글로벌)이라 상품(products.mall_id) 기준으로 이 몰 것만 집계한다.
 *
 * 카테고리 범위는 `mall_id IN (0, 이 몰)` 이다. 원칙은 글로벌 한 벌이고, 샘플 시더도 이제
 * 공용 카테고리를 가리키기만 한다(2026-07-20). 그런데도 `IN (0, 이 몰)` 을 유지하는 이유는
 * **그 전에 찍어낸 몰**에 몰 스코프 NORMAL 행이 남아 있어서다 — 글로벌만 보면 그런 몰에서
 * 섹션이 통째로 사라진다("상품이 담긴 카테고리가 없습니다").
 * 정리 후에도 THEME/OUTLET 은 여전히 몰 소유라 이 범위는 그대로 두는 게 맞다.
 * (정리: scripts/migrations/20260720_cleanup_mall_scoped_sample_categories.sql)
 */
async function loadHomeCategories(hasUser, mallId = 1) {
    const vis = visibilityClause(hasUser);
    const [rows] = await pool.query(`
    SELECT c.id, c.name, COUNT(p.id) AS product_count
    FROM categories c
    JOIN products p ON p.category_id = c.id AND p.mall_id = ? AND ${P_STATUS} AND ${vis}
    WHERE c.type = 'NORMAL' AND c.mall_id IN (?, ?) AND c.is_active = 1
    GROUP BY c.id, c.name
    HAVING product_count > 0
    ORDER BY c.display_order ASC
  `, [mallId, GLOBAL_CATEGORY_MALL_ID, mallId]);
    return rows;
}

/**
 * 홈 "카테고리별 베스트" 섹션용 (CT category_showcase 신규):
 * 최상위(depth-1, parent_id NULL) NORMAL 카테고리마다 서브트리 전체에서 베스트 상품 N개.
 *
 * - 최상위 카테고리는 직접 상품이 0이어도 자식에 상품이 있을 수 있으므로(예: 여성패션),
 *   반드시 서브트리(자신+모든 후손) 기준으로 상품을 집계한다.
 * - best = view_count DESC (ranking_tabs 관례와 동일). 시드 데이터의 view_count 가 평평하면
 *   created_at DESC 로 자연 degrade.
 * - 상품이 1건도 없는 최상위 카테고리는 스킵.
 *
 * opts: { productLimit=5, categoryLimit=20 }
 * 반환: [{ id, name, products: [...] }]
 */
async function loadHomeCategoryBests(hasUser, mallId = 1, opts = {}) {
    const productLimit = Math.min(Number(opts.productLimit) || 5, 12);
    const categoryLimit = Math.min(Number(opts.categoryLimit) || 20, 40);
    const vis = visibilityClause(hasUser);

    // NORMAL 카테고리는 전 몰 공통(글로벌). 이 몰에 노출할 카테고리 =
    // 이 몰(products.mall_id) 상품이 걸린 카테고리(+조상) − 몰별 숨김.
    const visible = await visibleCategoryIdSet(mallId);
    if (!visible.size) return [];

    // 트리 구성용 NORMAL 카테고리 전체 — 쿼리 1회.
    // 글로벌(0) + 이 몰 소유분. 샘플 시더로 만든 몰은 후자를 쓴다(위 loadHomeCategories 주석 참고).
    const [cats] = await pool.query(`
        SELECT id, name, parent_id
        FROM categories
        WHERE type = 'NORMAL' AND mall_id IN (?, ?) AND is_active = 1
        ORDER BY display_order ASC, id ASC
    `, [GLOBAL_CATEGORY_MALL_ID, mallId]);
    if (!cats.length) return [];

    // parent_id → children 맵 (parent_id NULL 은 키 0)
    const childrenOf = new Map();
    for (const c of cats) {
        const p = c.parent_id || 0;
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p).push(c);
    }
    // 이 몰에 상품이 있는(노출) 최상위 카테고리만
    const roots = (childrenOf.get(0) || []).filter((r) => visible.has(r.id)).slice(0, categoryLimit);

    // 최상위 root 별 서브트리 id (BFS, 순환 가드) — 노출 대상 id 만 담는다.
    const subtreeIds = (rootId) => {
        const ids = [];
        const seen = new Set();
        const queue = [rootId];
        while (queue.length) {
            const cur = queue.shift();
            if (seen.has(cur)) continue;
            seen.add(cur);
            if (visible.has(cur)) ids.push(cur); // 숨김·무상품 하위 제외
            (childrenOf.get(cur) || []).forEach(ch => queue.push(ch.id));
        }
        return ids;
    };

    const result = [];
    for (const root of roots) {
        const ids = subtreeIds(root.id);
        if (!ids.length) continue;
        const placeholders = ids.map(() => '?').join(',');
        const [products] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                   p.discount_rate, p.status, ${STOCK_COL}, p.provider,
                   p.product_badge, p.distribution_badge
            FROM products p
            WHERE p.mall_id = ? AND p.category_id IN (${placeholders}) AND ${P_STATUS} AND ${vis}
            ORDER BY FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT','OFF'),
                     p.view_count DESC, p.created_at DESC
            LIMIT ?
        `, [mallId, ...ids, productLimit]);
        if (products.length === 0) continue; // 빈 최상위 카테고리는 스킵
        await dealSvc.applyDeals(products); // 카테고리별 베스트 카드도 특가가로 표시
        result.push({ id: root.id, name: root.name, products });
    }
    return result;
}

module.exports = { P_STATUS, STOCK_COL, visibilityClause, loadHomeCategories, loadHomeCategoryBests };
