const pool = require('../../config/db');
const dealSvc = require('../deal/dealService');

/*
 * 추천 서비스 — 상품을 "왜 너에게 보여주는가" 로 조립한다.
 *
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md
 *
 * ── 왜 productController.getList 를 재사용하지 않는가 ──────────────
 * 추천 화면의 본질은 목록이 아니라 **근거**다. 같은 상품이라도
 * "최근 보신 «홍삼정»과 함께 많이 본 상품" 이라는 문구가 붙어야 베스트와 구별된다.
 * getList 는 필터·정렬·페이지네이션의 계약이지, 섹션별 근거 문구의 계약이 아니다.
 *
 * ── 데이터 소스 (새 테이블 없음) ────────────────────────────────
 *   개인화  recent_views(씨앗) → product_recommendations(연관)
 *   MD 추천 products.product_badge 에 'RECOMMEND'
 *   지금 뜨는 products.view_count
 *
 * ⚠️ product_recommendations 는 상품상세(PDP)용 item-to-item 데이터다.
 *    기준 상품 없이 단독으로 목록을 만들 수 없다. 여기서는 씨앗을 통해서만 쓴다.
 *
 * ── 협업 필터링을 하지 않는 이유 ────────────────────────────────
 * 주문 22건 · 좋아요 11건(2026-07 실측)으로 만든 추천은 추천이 아니라 난수다.
 * 데이터가 쌓이면 규칙형 → 개인화형으로 올린다(설계문서 §4-1).
 */

/** product_card.ejs 가 요구하는 컬럼 계약. 다른 서비스와 같은 집합을 쓴다. */
const CARD_COLS = `
    p.id, p.name, p.provider, p.main_image, p.price, p.original_price,
    p.discount_rate, p.status, p.stock, p.slug, p.product_badge, p.distribution_badge
`;

/** 고객에게 보여도 되는 상품인가. 전 섹션 공통. */
const VISIBLE = `p.visibility = 'PUBLIC' AND p.status <> 'OFF'`;

const SECTION_LIMIT = 12;

/** IN (?) 자리표시자. 빈 배열이면 호출하지 않는다(SQL 문법 오류 방지). */
const placeholders = (arr) => arr.map(() => '?').join(',');

/**
 * ① 개인화 — 최근 본 상품 → 그 상품의 연관 상품
 *
 * 씨앗(recent_views 최신 5건)의 연관 상품을 모으고, 이미 본 상품은 전부 뺀다.
 * 이미 본 것을 다시 추천하면 "추천"이 아니라 "히스토리"다.
 *
 * 정렬은 씨앗의 최신 순서를 먼저 따른다 — 가장 최근에 본 상품의 연관 상품이 위로 온다.
 *
 * @returns {{products: Array, seedName: string|null}} 비면 products = []
 */
async function getPersonalized(mallId, userId) {
    if (!userId) return { products: [], seedName: null };

    const [seeds] = await pool.query(`
        SELECT rv.product_id, p.name
          FROM recent_views rv
          JOIN products p ON p.id = rv.product_id
         WHERE rv.user_id = ? AND p.mall_id = ?
         ORDER BY rv.viewed_at DESC
         LIMIT 5
    `, [userId, mallId]);

    if (!seeds.length) return { products: [], seedName: null };

    const seedIds = seeds.map(s => s.product_id);
    const seedName = seeds[0].name;

    // 본 상품 전체(5건 씨앗이 아니라 전부)를 제외 대상으로 쓴다.
    const [viewed] = await pool.query(
        'SELECT product_id FROM recent_views WHERE user_id = ?', [userId]
    );
    const viewedIds = viewed.map(v => v.product_id);

    /*
     * FIELD(pr.product_id, ...) 로 씨앗의 최신 순서를 살린다.
     * 같은 상품이 여러 씨앗에서 나올 수 있으므로 MIN 으로 접고 GROUP BY 한다.
     */
    const [rows] = await pool.query(`
        SELECT ${CARD_COLS},
               MIN(FIELD(pr.product_id, ${placeholders(seedIds)})) AS seed_rank,
               MIN(pr.display_order) AS rec_order
          FROM product_recommendations pr
          JOIN products p ON p.id = pr.related_id
         WHERE pr.product_id IN (${placeholders(seedIds)})
           AND p.mall_id = ?
           AND ${VISIBLE}
           AND p.id NOT IN (${placeholders(viewedIds)})
         GROUP BY p.id
         ORDER BY seed_rank ASC, rec_order ASC, p.id ASC
         LIMIT ?
    `, [...seedIds, ...seedIds, mallId, ...viewedIds, SECTION_LIMIT]);

    if (rows.length) return { products: rows, seedName };

    /*
     * 폴백 — 연관 데이터가 없는 상품만 봤을 때.
     * 씨앗 상품과 같은 카테고리의 인기 상품으로 채운다. 근거 문구도 카테고리 기준으로 바뀐다.
     */
    const [fallback] = await pool.query(`
        SELECT ${CARD_COLS}
          FROM products p
         WHERE p.mall_id = ?
           AND ${VISIBLE}
           AND p.category_id IN (
                 SELECT category_id FROM products
                  WHERE id IN (${placeholders(seedIds)}) AND category_id IS NOT NULL
               )
           AND p.id NOT IN (${placeholders(viewedIds)})
         ORDER BY p.view_count DESC, p.id DESC
         LIMIT ?
    `, [mallId, ...seedIds, ...viewedIds, SECTION_LIMIT]);

    return { products: fallback, seedName, isCategoryFallback: true };
}

/**
 * ② MD 추천 — 관리자가 상품 폼에서 'RECOMMEND' 뱃지를 체크한 상품.
 *
 * 별도 큐레이션 테이블을 만들지 않는다. 운영자가 이미 쓰고 있는 뱃지가 곧 큐레이션이다
 * (오늘특가·베스트가 상품그룹으로 간 것과 달리, 추천은 상품 단위 플래그로 충분하다).
 */
async function getMdPicks(mallId, excludeIds = []) {
    const excl = excludeIds.length ? `AND p.id NOT IN (${placeholders(excludeIds)})` : '';
    const [rows] = await pool.query(`
        SELECT ${CARD_COLS}
          FROM products p
         WHERE p.mall_id = ?
           AND ${VISIBLE}
           AND FIND_IN_SET('RECOMMEND', p.product_badge)
           ${excl}
         ORDER BY p.view_count DESC, p.id DESC
         LIMIT ?
    `, [mallId, ...excludeIds, SECTION_LIMIT]);
    return rows;
}

/**
 * ③ 지금 많이 보는 상품 — view_count 상위.
 *
 * 베스트(판매·좋아요 가중 랭킹)와 다르다. 여기는 **조회**만 본다 —
 * "아직 안 팔렸지만 사람들이 보고 있는 것" 이 추천 맥락에서 의미가 있다.
 * 위 섹션에 이미 나온 상품은 뺀다(같은 화면에 같은 카드가 두 번 뜨면 큐레이션이 아니라 버그로 보인다).
 */
async function getTrending(mallId, excludeIds = []) {
    const excl = excludeIds.length ? `AND p.id NOT IN (${placeholders(excludeIds)})` : '';
    const [rows] = await pool.query(`
        SELECT ${CARD_COLS}
          FROM products p
         WHERE p.mall_id = ?
           AND ${VISIBLE}
           AND p.view_count > 0
           ${excl}
         ORDER BY p.view_count DESC, p.id DESC
         LIMIT ?
    `, [mallId, ...excludeIds, SECTION_LIMIT]);
    return rows;
}

/**
 * 추천 랜딩 한 판. 섹션은 위에서부터 채우고, 앞 섹션에 나온 상품은 뒤 섹션에서 뺀다.
 * @returns {{sections: Array<{key,title,reason,products}>, isEmpty: boolean}}
 */
async function getLanding(mallId, userId) {
    const sections = [];
    const seen = new Set();
    const take = (products) => products.forEach(p => seen.add(p.id));

    const personal = await getPersonalized(mallId, userId);
    if (personal.products.length) {
        sections.push({
            key: 'personal',
            title: '회원님을 위한 추천',
            reason: personal.isCategoryFallback
                ? `최근 보신 «${personal.seedName}»과 비슷한 상품`
                : `최근 보신 «${personal.seedName}»과 함께 많이 본 상품`,
            products: personal.products,
        });
        take(personal.products);
    }

    const md = await getMdPicks(mallId, [...seen]);
    if (md.length) {
        sections.push({
            key: 'md',
            title: 'MD 추천',
            reason: 'MD가 직접 고른 상품',
            products: md,
        });
        take(md);
    }

    const trending = await getTrending(mallId, [...seen]);
    if (trending.length) {
        sections.push({
            key: 'trending',
            title: '지금 많이 보는 상품',
            reason: '최근 조회가 많은 상품',
            products: trending,
        });
    }

    // 세 섹션 모두 CARD_COLS(정가)로 뽑았다 — 표시 직전에 특가가로 덮는다.
    for (const s of sections) await dealSvc.applyDeals(s.products);

    return { sections, isEmpty: sections.length === 0 };
}

module.exports = {
    SECTION_LIMIT,
    getPersonalized,
    getMdPicks,
    getTrending,
    getLanding,
};
