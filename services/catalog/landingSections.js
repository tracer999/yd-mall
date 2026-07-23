const pool = require('../../config/db');
const dealSvc = require('../deal/dealService');
const newArrival = require('./newArrival');
const { sellableStockSql } = require('./sellableStock');
const { GLOBAL_CATEGORY_MALL_ID, visibleCategoryIdSet } = require('./categoryScope');

/*
 * 카탈로그 랜딩(베스트/랭킹 · 신상품)의 "○○별 섹션" 데이터 공급자.
 *
 * 두 랜딩이 같은 뼈대를 쓴다 — 카테고리마다 한 줄, 브랜드마다 한 줄, 줄당 상품 최대 N개,
 * 더 있으면 [더보기]. 다른 건 **줄을 채우는 규칙**뿐이라 그 부분만 mode 로 가른다.
 *
 *   mode='best' 인기 점수순 (판매 × w + 좋아요 × w + 조회 × w) — 랭킹 엔진과 같은 가중치
 *   mode='new'  신상품만 + 최신순 (services/catalog/newArrival 의 판정을 그대로 쓴다)
 *
 * 왜 best_ranking 스냅샷을 안 읽는가:
 *   스냅샷은 관리자가 만든 best_group(탭) 단위로만 있다. 갓 찍어낸 몰은 '전체' 그룹 하나뿐이라
 *   카테고리별·브랜드별 줄을 만들 수 없다. 운영자가 카테고리마다 그룹을 만들어야만 화면이
 *   채워지는 구조는 몰 빌더에 맞지 않는다 — 그래서 조회 시점에 계산한다.
 *   대신 계산 범위가 카테고리/브랜드 하나로 좁고 LIMIT 이 걸려 있어 비싸지 않다.
 *
 * ⚠️ hasMore 는 COUNT(*) 로 세지 않는다. limit + 1 건을 읽어 넘치면 더 있는 것으로 본다
 *    (줄마다 COUNT 쿼리를 하나씩 더 쏘지 않기 위해서다).
 */

/** 전시 가능한 상품 상태 (리졸버 _shared 와 같은 규칙) */
const P_STATUS = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";

/** 카드에 필요한 컬럼. created_at 은 NEW 뱃지 판정(newArrival.isNewProduct)이 쓴다 */
const CARD_FIELDS = `
    p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
    p.discount_rate, p.status, ${sellableStockSql('p')} AS stock, p.provider,
    p.product_badge, p.distribution_badge, p.view_count,
    p.sale_start_date, p.created_at`;

const DEFAULT_PRODUCT_LIMIT = 10;
const DEFAULT_ROW_LIMIT = 8;

function visibilityClause(hasUser) {
    return hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";
}

/**
 * 인기 점수 가중치. 랭킹 엔진과 같은 설정(best_score_config)을 읽어
 * "베스트 10"과 "카테고리별 베스트"가 서로 다른 기준으로 줄 세우는 일이 없게 한다.
 */
async function scoreWeights(mallId) {
    try {
        const [[row]] = await pool.query(
            'SELECT weight_sales, weight_like, weight_view FROM best_score_config WHERE mall_id = ?',
            [mallId]
        );
        if (row) {
            return {
                ws: Number(row.weight_sales) || 0,
                wl: Number(row.weight_like) || 0,
                wv: Number(row.weight_view) || 0,
            };
        }
    } catch (e) {
        console.error('[landingSections] best_score_config 조회 실패 — 기본 가중치로 진행:', e.message);
    }
    return { ws: 5, wl: 3, wv: 0 };
}

/**
 * mode 별 (추가 WHERE, ORDER BY) 조각.
 * ⚠️ where.params 와 order.params 는 SQL 안에서 나오는 **순서 그대로** 넣어야 한다.
 */
function modeClauses(mode, weights) {
    if (mode === 'new') {
        const np = newArrival.newProductPredicate('p');
        return {
            whereSql: ` AND ${np.sql}`,
            whereParams: np.params,
            // 사용자 요구: "최신 등록기준". 판매 시작일이 없으면 적재일이 기준일이 된다.
            orderSql: newArrival.newProductOrder('p'),
            orderParams: [],
        };
    }
    // best — 점수 동점(실데이터가 희박한 몰에서는 대부분 0점)은 누적 조회수로 가른다.
    // tie-break 를 빼면 상품 id 순으로 줄 세운 무의미한 "베스트"가 된다(랭킹 엔진과 같은 이유).
    return {
        whereSql: '',
        whereParams: [],
        orderSql: `(
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.product_id = p.id) * ?
          + (SELECT COUNT(*) FROM likes l WHERE l.product_id = p.id) * ?
          + p.view_count * ?
        ) DESC, p.view_count DESC, p.id DESC`,
        orderParams: [weights.ws, weights.wl, weights.wv],
    };
}

/** 한 줄(카테고리/브랜드 하나)의 상품을 채운다. limit+1 건을 읽어 hasMore 를 판정한다. */
async function fetchRowProducts({ mallId, scopeSql, scopeParams, hasUser, mode, weights, limit }) {
    const m = modeClauses(mode, weights);
    const [rows] = await pool.query(`
        SELECT ${CARD_FIELDS}
          FROM products p
         WHERE p.mall_id = ? AND ${P_STATUS} AND ${visibilityClause(hasUser)}
           AND ${scopeSql}${m.whereSql}
         ORDER BY ${m.orderSql}
         LIMIT ?
    `, [mallId, ...scopeParams, ...m.whereParams, ...m.orderParams, limit + 1]);

    const hasMore = rows.length > limit;
    const products = hasMore ? rows.slice(0, limit) : rows;
    await dealSvc.applyDeals(products); // 카드 가격은 활성 특가가로 (목록·추천과 동일)
    return { products, hasMore };
}

/**
 * 카테고리별 줄.
 *
 * 최상위(depth 1) NORMAL 카테고리마다 **서브트리 전체**에서 상품을 뽑는다.
 * 상품 대부분이 2·3뎁스에 붙어 있어 최상위만 보면 전 줄이 비어 보인다.
 *
 * @returns {Promise<Array<{id,name,products,hasMore,moreUrl}>>}
 */
async function getCategoryRows(mallId, {
    hasUser = false,
    mode = 'best',
    productLimit = DEFAULT_PRODUCT_LIMIT,
    rowLimit = DEFAULT_ROW_LIMIT,
} = {}) {
    const visible = await visibleCategoryIdSet(mallId);
    if (!visible.size) return [];

    // 트리 구성용 NORMAL 카테고리 전체 — 쿼리 1회.
    // 글로벌(0) + 이 몰 소유분 둘 다 본다. 카테고리 글로벌화 이전에 찍어낸 몰에는
    // 몰 스코프 NORMAL 행이 남아 있어, 글로벌만 보면 그런 몰에서 섹션이 통째로 사라진다.
    const [cats] = await pool.query(`
        SELECT id, name, parent_id
          FROM categories
         WHERE type = 'NORMAL' AND mall_id IN (?, ?) AND is_active = 1
         ORDER BY display_order ASC, id ASC
    `, [GLOBAL_CATEGORY_MALL_ID, mallId]);
    if (!cats.length) return [];

    const childrenOf = new Map();
    for (const c of cats) {
        const p = c.parent_id || 0;
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p).push(c);
    }

    /** 서브트리 id (BFS, 순환 가드). 노출 대상만 담는다 */
    const subtreeIds = (rootId) => {
        const ids = [];
        const seen = new Set();
        const queue = [rootId];
        while (queue.length) {
            const cur = queue.shift();
            if (seen.has(cur)) continue;
            seen.add(cur);
            if (visible.has(cur)) ids.push(cur);
            (childrenOf.get(cur) || []).forEach(ch => queue.push(ch.id));
        }
        return ids;
    };

    const weights = await scoreWeights(mallId);
    const roots = (childrenOf.get(0) || []).filter(r => visible.has(r.id));

    const rows = [];
    for (const root of roots) {
        if (rows.length >= rowLimit) break;

        const ids = subtreeIds(root.id);
        if (!ids.length) continue;

        const { products, hasMore } = await fetchRowProducts({
            mallId, hasUser, mode, weights, limit: productLimit,
            scopeSql: `p.category_id IN (${ids.map(() => '?').join(',')})`,
            scopeParams: ids,
        });
        if (!products.length) continue; // 빈 줄은 만들지 않는다

        rows.push({
            id: root.id,
            name: root.name,
            products,
            hasMore,
            moreUrl: `/products/category/${root.id}${mode === 'new' ? '?filter=new' : '?sort=best'}`,
        });
    }
    return rows;
}

/**
 * 브랜드별 줄.
 *
 * 이 몰에 상품이 있는 브랜드만, 상품이 많은 순으로 세운다.
 * 브랜드를 먼저 나열하고 상품을 채우면 빈 줄이 대부분이 된다(브랜드 카탈로그는 1,000개 단위).
 *
 * ⚠️ 브랜드 카테고리는 전 몰 공통(mall_id=0)이다. `c.mall_id = ?` 로 좁히면 0건이 된다.
 */
async function getBrandRows(mallId, {
    hasUser = false,
    mode = 'best',
    productLimit = DEFAULT_PRODUCT_LIMIT,
    rowLimit = DEFAULT_ROW_LIMIT,
} = {}) {
    const hiddenOk = await visibleCategoryIdSet(mallId, { brand: true });
    if (!hiddenOk.size) return [];

    const vis = visibilityClause(hasUser);
    const [brands] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, COUNT(p.id) AS product_count
          FROM categories c
          JOIN products p ON p.brand_category_id = c.id
                         AND p.mall_id = ? AND ${P_STATUS} AND ${vis}
         WHERE c.type = 'BRAND' AND c.is_active = 1 AND c.mall_id IN (?, ?)
         GROUP BY c.id, c.name, c.logo_image_path
         ORDER BY product_count DESC, c.display_order ASC, c.id ASC
    `, [mallId, GLOBAL_CATEGORY_MALL_ID, mallId]);
    if (!brands.length) return [];

    const weights = await scoreWeights(mallId);

    const rows = [];
    for (const b of brands) {
        if (rows.length >= rowLimit) break;
        if (!hiddenOk.has(b.id)) continue; // 몰별 숨김(mall_category_visibility)

        const { products, hasMore } = await fetchRowProducts({
            mallId, hasUser, mode, weights, limit: productLimit,
            scopeSql: 'p.brand_category_id = ?',
            scopeParams: [b.id],
        });
        if (!products.length) continue;

        rows.push({
            id: b.id,
            name: b.name,
            logo: b.logo_image_path,
            products,
            hasMore,
            moreUrl: `/products/brand/${b.id}${mode === 'new' ? '?filter=new' : '?sort=best'}`,
        });
    }
    return rows;
}

module.exports = {
    P_STATUS,
    visibilityClause,
    getCategoryRows,
    getBrandRows,
    DEFAULT_PRODUCT_LIMIT,
};
