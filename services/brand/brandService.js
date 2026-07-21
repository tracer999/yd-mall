const pool = require('../../config/db');
const dealSvc = require('../deal/dealService');
const bestRanking = require('../best/bestRankingService');
const { INITIAL_BUCKETS, toChosung } = require('../../shared/hangul');

/**
 * 브랜드 허브 — 목록·검색·인기·상세.
 *
 * 화면은 brand_stat(집계 캐시)만 읽는다. 상품 테이블에 직접 조인하지 않는다.
 * 브랜드 1,354개(몰2) × 상품 9,677건을 요청마다 집계하면 화면이 죽는다.
 */

const P_LIVE = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')";
const vis = (hasUser) => hasUser ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')" : "p.visibility = 'PUBLIC'";

const PRODUCT_CARD = `p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                      p.discount_rate, p.status, p.stock, p.provider,
                      p.product_badge, p.distribution_badge`;

const PAGE_SIZE = 60;

const SORTS = {
    // 기본값. 가나다순을 기본으로 두면 몰2에서 상품 1개짜리 잡음(599개, 44%)이 첫 화면을 덮는다.
    count: 's.product_count DESC, s.popularity_score DESC, c.name ASC',
    popular: 's.popularity_score DESC, s.product_count DESC, c.name ASC',
    name: 'c.name ASC',
    new: 'c.onboarded_at DESC, s.last_product_at DESC'
};

const BRAND_COLS = `c.id, c.name, c.logo_image_path, c.onboarded_at,
                    bp.name_en, bp.tagline, bp.initial, bp.official_yn, bp.is_seller, bp.seller_name,
                    s.product_count, s.new_count, s.benefit_count, s.popularity_score,
                    s.rep_product_ids, s.top_category_id, s.min_price, s.max_price`;

const FROM_BRAND = `
    FROM brand_stat s
    JOIN categories c ON c.id = s.category_id AND c.is_active = 1
    LEFT JOIN brand_profile bp ON bp.category_id = c.id
`;

/**
 * 타일 썸네일 하이드레이션 — 이 허브의 핵심.
 *
 * 몰2는 브랜드 1,354개 중 로고가 0개다. 로고 그리드는 원리적으로 불가능하다.
 * 대신 브랜드의 대표 상품 이미지로 모자이크를 만든다(brand_stat.rep_product_ids).
 * 로고가 있으면 로고, 없으면 모자이크 — 타일 컴포넌트가 알아서 degrade 한다.
 */
async function attachRepImages(brands) {
    const ids = [];
    for (const b of brands) {
        const reps = parseJson(b.rep_product_ids) || [];
        b.repIds = reps;
        ids.push(...reps);
    }
    if (!ids.length) {
        brands.forEach(b => { b.repImages = []; });
        return brands;
    }
    const [rows] = await pool.query(
        `SELECT id, main_image, thumbnail_image FROM products WHERE id IN (?)`, [ids]
    );
    const imgOf = new Map(rows.map(r => [r.id, r.thumbnail_image || r.main_image]));
    for (const b of brands) {
        b.repImages = (b.repIds || []).map(id => imgOf.get(id)).filter(Boolean);
    }
    return brands;
}

function parseJson(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
}

/** 대표 카테고리명을 붙인다 (로고 없는 브랜드의 정체성 보조) */
async function attachTopCategory(brands) {
    const ids = [...new Set(brands.map(b => b.top_category_id).filter(Boolean))];
    if (!ids.length) return brands;
    const [rows] = await pool.query('SELECT id, name FROM categories WHERE id IN (?)', [ids]);
    const nameOf = new Map(rows.map(r => [r.id, r.name]));
    brands.forEach(b => { b.topCategoryName = nameOf.get(b.top_category_id) || null; });
    return brands;
}

async function decorate(brands) {
    await attachRepImages(brands);
    await attachTopCategory(brands);
    return brands;
}

/** 전체 브랜드 — 초성 인덱스 + 정렬 + 페이지네이션 */
async function listBrands(mallId, { initial, sort = 'count', page = 1 } = {}) {
    const order = SORTS[sort] || SORTS.count;
    const where = ['s.mall_id = ?'];
    const params = [mallId];
    if (initial && INITIAL_BUCKETS.includes(initial)) {
        where.push('bp.initial = ?');
        params.push(initial);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total ${FROM_BRAND} ${whereSql}`, params
    );
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const cur = Math.min(Math.max(1, Number(page) || 1), pages);

    const [rows] = await pool.query(
        `SELECT ${BRAND_COLS} ${FROM_BRAND} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
        [...params, PAGE_SIZE, (cur - 1) * PAGE_SIZE]
    );
    await decorate(rows);
    return { brands: rows, total, page: cur, pages, pageSize: PAGE_SIZE };
}

/** 초성 버킷별 브랜드 수 (인덱스 탭에 0건 버킷을 비활성으로 표시) */
async function getInitialCounts(mallId) {
    const [rows] = await pool.query(`
        SELECT bp.initial, COUNT(*) AS c
        FROM brand_stat s
        JOIN categories c ON c.id = s.category_id AND c.is_active = 1
        JOIN brand_profile bp ON bp.category_id = c.id
        WHERE s.mall_id = ? AND bp.initial IS NOT NULL
        GROUP BY bp.initial
    `, [mallId]);
    return new Map(rows.map(r => [r.initial, Number(r.c)]));
}

/**
 * 인기 브랜드 — 폴백 사다리.
 *
 * 주문 22건, 브랜드찜 0건, 몰2 조회수 0. 점수식을 그대로 쓰면 몰2는 전 브랜드가 0점이라
 * 섹션이 빈 화면이 된다. 점수가 있는 브랜드를 먼저 채우고, 모자라면 상품수 → 최근 등록순으로
 * 보충한다. 데이터가 쌓이면 자연스럽게 1단계가 지배한다.
 */
async function getPopular(mallId, limit = 12, rootCatId = null) {
    const picked = [];
    const seen = new Set();

    const push = (rows) => {
        for (const r of rows) {
            if (picked.length >= limit) break;
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            picked.push(r);
        }
    };

    const catJoin = rootCatId
        ? 'JOIN brand_category_stat bcs ON bcs.category_id = c.id AND bcs.mall_id = s.mall_id AND bcs.root_cat_id = ?'
        : '';
    const catParam = rootCatId ? [rootCatId] : [];

    // 1단계 — 실제 점수가 있는 브랜드
    const [scored] = await pool.query(`
        SELECT DISTINCT ${BRAND_COLS} ${FROM_BRAND} ${catJoin}
        WHERE s.mall_id = ? AND s.popularity_score > 0
        ORDER BY s.popularity_score DESC, s.product_count DESC LIMIT ?
    `, [...catParam, mallId, limit]);
    push(scored);

    // 2단계 — 상품 많은 순
    if (picked.length < limit) {
        const [byCount] = await pool.query(`
            SELECT DISTINCT ${BRAND_COLS} ${FROM_BRAND} ${catJoin}
            WHERE s.mall_id = ? AND s.product_count > 0
            ORDER BY s.product_count DESC, c.name ASC LIMIT ?
        `, [...catParam, mallId, limit * 2]);
        push(byCount);
    }

    // 3단계 — 최근 상품이 등록된 순
    if (picked.length < limit) {
        const [byRecent] = await pool.query(`
            SELECT DISTINCT ${BRAND_COLS} ${FROM_BRAND} ${catJoin}
            WHERE s.mall_id = ?
            ORDER BY s.last_product_at DESC LIMIT ?
        `, [...catParam, mallId, limit * 2]);
        push(byRecent);
    }

    await decorate(picked);
    return picked;
}

/** 신규 입점 브랜드 — categories.onboarded_at 기준 */
async function getNewBrands(mallId, limit = 8, days = 180) {
    const [rows] = await pool.query(`
        SELECT ${BRAND_COLS} ${FROM_BRAND}
        WHERE s.mall_id = ? AND c.onboarded_at IS NOT NULL
          AND c.onboarded_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND s.product_count > 0
        ORDER BY c.onboarded_at DESC, s.product_count DESC
        LIMIT ?
    `, [mallId, days, limit]);

    // 최근 입점이 없으면(입점일이 전부 오래됐으면) 최신 입점 순으로라도 채운다
    if (!rows.length) {
        const [fallback] = await pool.query(`
            SELECT ${BRAND_COLS} ${FROM_BRAND}
            WHERE s.mall_id = ? AND c.onboarded_at IS NOT NULL AND s.product_count > 0
            ORDER BY c.onboarded_at DESC, s.product_count DESC LIMIT ?
        `, [mallId, limit]);
        await decorate(fallback);
        return fallback;
    }
    await decorate(rows);
    return rows;
}

/** 카테고리별 브랜드 — 루트 카테고리 탭 */
async function getRootCategories(mallId) {
    const [rows] = await pool.query(`
        SELECT bcs.root_cat_id AS id, c.name,
               COUNT(DISTINCT bcs.category_id) AS brand_count
        FROM brand_category_stat bcs
        JOIN categories c ON c.id = bcs.root_cat_id AND c.is_active = 1
        WHERE bcs.mall_id = ?
        GROUP BY bcs.root_cat_id, c.name
        HAVING brand_count > 0
        ORDER BY brand_count DESC
        LIMIT 12
    `, [mallId]);
    return rows;
}

async function getBrandsByRootCategory(mallId, rootCatId, limit = 12) {
    const [rows] = await pool.query(`
        SELECT ${BRAND_COLS}, SUM(bcs.product_count) AS cat_product_count
        ${FROM_BRAND}
        JOIN brand_category_stat bcs ON bcs.category_id = c.id AND bcs.mall_id = s.mall_id
        WHERE s.mall_id = ? AND bcs.root_cat_id = ?
        GROUP BY c.id
        ORDER BY cat_product_count DESC, s.popularity_score DESC
        LIMIT ?
    `, [mallId, rootCatId, limit]);
    await decorate(rows);
    return rows;
}

/**
 * 브랜드 검색 — 한글명 · 영문명 · 별칭 · 초성.
 * 브랜드 1,379행 규모라 LIKE 로 충분하다(FULLTEXT 불필요).
 */
async function searchBrands(mallId, q, limit = 20) {
    const kw = String(q || '').trim();
    if (kw.length < 1) return [];
    const like = `%${kw}%`;
    // 입력이 초성만으로 이뤄졌으면 초성 검색으로 본다 ("ㄴㅇㅋ" → 나이키)
    const chosungOnly = /^[ㄱ-ㅎ]+$/.test(kw.replace(/\s/g, ''));
    const chosungKw = chosungOnly ? `%${kw.replace(/\s/g, '')}%` : `%${toChosung(kw)}%`;

    const [rows] = await pool.query(`
        SELECT ${BRAND_COLS}
        ${FROM_BRAND}
        WHERE s.mall_id = ?
          AND ( c.name LIKE ?
             OR bp.name_en LIKE ?
             OR bp.alias LIKE ?
             OR bp.initial_chosung LIKE ? )
        ORDER BY (c.name = ?) DESC, (c.name LIKE ?) DESC,
                 s.product_count DESC
        LIMIT ?
    `, [mallId, like, like, like, chosungKw, kw, `${kw}%`, limit]);
    await decorate(rows);
    return rows;
}

/** 브랜드 상세 헤더 */
async function getBrand(mallId, brandId) {
    const [[row]] = await pool.query(`
        SELECT c.id, c.name, c.logo_image_path, c.description, c.onboarded_at,
               bp.name_en, bp.alias, bp.tagline, bp.story, bp.country,
               bp.official_yn, bp.shop_enabled, bp.hero_image_url,
               bp.seo_title, bp.seo_description, bp.seller_name, bp.is_seller,
               s.product_count, s.new_count, s.benefit_count, s.top_category_id,
               s.min_price, s.max_price, s.rep_product_ids
        FROM categories c
        LEFT JOIN brand_profile bp ON bp.category_id = c.id
        LEFT JOIN brand_stat s ON s.category_id = c.id AND s.mall_id = ?
        WHERE c.id = ? AND c.type = 'BRAND' AND c.mall_id IN (0, ?) AND c.is_active = 1
    `, [mallId, brandId, mallId]);
    if (!row) return null;
    await decorate([row]);
    return row;
}

/*
 * 브랜드 쇼케이스 — 브랜드 한 줄 = 해시태그 + 특집전 제목 + 상품 캐러셀.
 *
 * 로고 타일 그리드는 브랜드를 '이름'으로만 보여준다. 몰2는 로고가 0개라 그 화면이 특히 빈약하다.
 * 쇼케이스는 브랜드를 **상품으로** 보여준다 — 로고가 없어도 화면이 채워진다.
 *
 * N+1 을 피한다: 브랜드 6개면 쿼리 6번이 아니라, 상품 1번 + 태그 1번이다.
 * 브랜드별 상위 N개는 윈도우 함수로 한 방에 자른다(MySQL 8).
 */
async function getShowcaseBrands(mallId, { limit = 6, perBrand = 10, hasUser = false } = {}) {
    // 인기 브랜드를 그대로 쓴다 — 폴백 사다리(점수 → 상품수 → 최근)가 이미 들어 있다.
    // 상품이 캐러셀을 채울 만큼 있어야 하므로 여유 있게 뽑아 거른다.
    const candidates = await getPopular(mallId, limit * 3);
    const brands = candidates.filter(b => Number(b.product_count) >= 4).slice(0, limit);
    if (!brands.length) return [];

    const ids = brands.map(b => b.id);

    // 브랜드별 상품 상위 perBrand개 — 노출 상품만, 품절은 뒤로.
    const [prodRows] = await pool.query(`
        SELECT * FROM (
            SELECT ${PRODUCT_CARD}, p.brand_category_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY p.brand_category_id
                       ORDER BY FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT'),
                                p.discount_rate DESC, p.view_count DESC, p.id DESC
                   ) AS rn
            FROM products p
            WHERE p.mall_id = ? AND p.brand_category_id IN (?) AND ${P_LIVE} AND ${vis(hasUser)}
        ) t
        WHERE t.rn <= ?
    `, [mallId, ids, perBrand]);

    await dealSvc.applyDeals(prodRows);

    // 해시태그 = 이 브랜드가 실제로 파는 카테고리 상위 3개. 지어내지 않고 데이터에서 뽑는다.
    const [tagRows] = await pool.query(`
        SELECT * FROM (
            SELECT bcs.category_id AS brand_id, c.name,
                   ROW_NUMBER() OVER (PARTITION BY bcs.category_id ORDER BY bcs.product_count DESC) AS rn
            FROM brand_category_stat bcs
            JOIN categories c ON c.id = bcs.cat_id
            WHERE bcs.mall_id = ? AND bcs.category_id IN (?)
        ) t
        WHERE t.rn <= 3
    `, [mallId, ids]);

    const productsOf = new Map();
    prodRows.forEach(p => {
        if (!productsOf.has(p.brand_category_id)) productsOf.set(p.brand_category_id, []);
        productsOf.get(p.brand_category_id).push(p);
    });
    const tagsOf = new Map();
    tagRows.forEach(t => {
        if (!tagsOf.has(t.brand_id)) tagsOf.set(t.brand_id, []);
        tagsOf.get(t.brand_id).push(t.name);
    });

    return brands
        .map(b => ({
            ...b,
            products: productsOf.get(b.id) || [],
            tags: tagsOf.get(b.id) || [],
            // "슐틸루스터 소형가전 특집전" — 브랜드명 + 대표 카테고리.
            // 대표 카테고리가 없으면 브랜드명만 쓴다(억지로 만들지 않는다).
            showcaseTitle: b.topCategoryName
                ? `${b.name} ${b.topCategoryName} 특집전`
                : `${b.name} 특집전`,
        }))
        // 상품을 못 채운 브랜드는 캐러셀이 성립하지 않는다. 빈 줄을 만드느니 뺀다.
        .filter(b => b.products.length >= 4);
}

/** 브랜드가 취급하는 카테고리 (상세관 필터) */
async function getBrandCategories(mallId, brandId) {
    const [rows] = await pool.query(`
        SELECT bcs.cat_id AS id, c.name, bcs.product_count
        FROM brand_category_stat bcs
        JOIN categories c ON c.id = bcs.cat_id
        WHERE bcs.mall_id = ? AND bcs.category_id = ?
        ORDER BY bcs.product_count DESC
        LIMIT 20
    `, [mallId, brandId]);
    return rows;
}

/** 브랜드 상품 — 전체/신상품 탭 + 카테고리 필터 + 페이지네이션 */
async function getBrandProducts(mallId, brandId, { hasUser, catId, sort = 'new', page = 1, size = 40 } = {}) {
    const order = {
        new: 'p.created_at DESC',
        popular: 'p.view_count DESC, p.created_at DESC',
        low: 'p.price ASC',
        high: 'p.price DESC'
    }[sort] || 'p.created_at DESC';

    const where = ['p.mall_id = ?', 'p.brand_category_id = ?', P_LIVE, vis(hasUser)];
    const params = [mallId, brandId];
    if (catId) { where.push('p.category_id = ?'); params.push(catId); }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, params);
    const pages = Math.max(1, Math.ceil(total / size));
    const cur = Math.min(Math.max(1, Number(page) || 1), pages);

    const [rows] = await pool.query(`
        SELECT ${PRODUCT_CARD} FROM products p ${whereSql}
        ORDER BY FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT'), ${order}
        LIMIT ? OFFSET ?
    `, [...params, size, (cur - 1) * size]);
    await dealSvc.applyDeals(rows);
    return { products: rows, total, page: cur, pages };
}

/**
 * 브랜드 베스트.
 *
 * best_group(group_type='BRAND') 이 있으면 랭킹 엔진 스냅샷을 그대로 쓴다(MD 핀 병합 포함).
 * 브랜드가 1,379개라 전건에 그룹을 만들 수는 없으므로, 그룹이 없는 브랜드는 조회수 순으로
 * 폴백한다(ranking_tabs 관례와 동일).
 */
async function getBrandBest(mallId, brandId, { hasUser, limit = 12 } = {}) {
    const [[group]] = await pool.query(`
        SELECT id FROM best_group
        WHERE mall_id = ? AND group_type = 'BRAND' AND ref_id = ? AND is_active = 1
        LIMIT 1
    `, [mallId, brandId]);

    if (group) {
        try {
            const ranked = await bestRanking.getRanking({ mallId, groupId: group.id, limit, hasUser });
            if (!ranked.isEmpty) {
                return { products: ranked.products, source: 'ranking', calculatedAt: ranked.calculatedAt };
            }
        } catch (e) {
            // 배치가 아직 안 돌았거나 그룹이 비었으면 조용히 폴백한다
            console.error('[brandService] 랭킹 조회 실패, 폴백', e.message);
        }
    }

    const [rows] = await pool.query(`
        SELECT ${PRODUCT_CARD} FROM products p
        WHERE p.mall_id = ? AND p.brand_category_id = ? AND ${P_LIVE} AND ${vis(hasUser)}
        ORDER BY FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT'),
                 p.view_count DESC, p.created_at DESC
        LIMIT ?
    `, [mallId, brandId, limit]);
    await dealSvc.applyDeals(rows);
    return { products: rows, source: 'fallback' };
}

/** 관련 브랜드 — 같은 대표 카테고리 + 유사 가격대 */
async function getRelatedBrands(mallId, brandId, limit = 6) {
    const [[base]] = await pool.query(
        'SELECT top_category_id, min_price, max_price FROM brand_stat WHERE mall_id = ? AND category_id = ?',
        [mallId, brandId]
    );
    if (!base?.top_category_id) return [];

    const [rows] = await pool.query(`
        SELECT ${BRAND_COLS} ${FROM_BRAND}
        WHERE s.mall_id = ? AND s.category_id <> ? AND s.top_category_id = ?
          AND s.product_count > 0
        ORDER BY ABS(COALESCE(s.max_price,0) - ?) ASC, s.popularity_score DESC, s.product_count DESC
        LIMIT ?
    `, [mallId, brandId, base.top_category_id, base.max_price || 0, limit]);
    await decorate(rows);
    return rows;
}

/** 로그인 사용자의 찜한 브랜드 id */
async function getLikedBrandIds(userId) {
    if (!userId) return [];
    const [rows] = await pool.query('SELECT category_id FROM brand_likes WHERE user_id = ?', [userId]);
    return rows.map(r => r.category_id);
}

module.exports = {
    listBrands, getInitialCounts, getPopular, getNewBrands, getShowcaseBrands,
    getRootCategories, getBrandsByRootCategory, searchBrands,
    getBrand, getBrandCategories, getBrandProducts, getBrandBest,
    getRelatedBrands, getLikedBrandIds, PAGE_SIZE
};
