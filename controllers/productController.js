const pool = require('../config/db');
const navigationService = require('../services/menu/navigationService');
const newArrival = require('../services/catalog/newArrival');
const dealSvc = require('../services/deal/dealService');
const outletService = require('../services/outlet/outletService');
const optionService = require('../services/catalog/optionService');
const compositeService = require('../services/catalog/compositeService');
const categoryScope = require('../services/catalog/categoryScope');
const facetService = require('../services/catalog/facetService');
const sellableStock = require('../services/catalog/sellableStock');
// B2B 전용가·수량규칙 (설계 §4). 컨텍스트가 비활성이면 전부 null 이라 화면이 바뀌지 않는다.
const b2bPricingService = require('../services/b2b/b2bPricingService');
const b2bTaxService = require('../services/b2b/b2bTaxService');
// 상세의 [배송·반품] 탭은 **결제가 실제로 청구하는 정책**을 그대로 보여준다.
// 같은 계산기를 쓰지 않으면 안내와 청구액이 언젠가 갈라진다.
const shippingCalculator = require('../services/shipping/shippingCalculator');

/**
 * 폐기된 THEME 카테고리 → 대체 기능 메뉴.
 *
 * 테마 5(베스트)·6(신규)은 각각 /best, /new 와 별도의 판정 로직을 갖고 있어 같은 이름으로
 * 다른 결과를 내던 잔재다. 기능 메뉴가 정본이므로 옛 URL 은 그리로 넘긴다.
 * (설계: docs/사이트개선/new_arrivals_dev_plan.md §9-1)
 */
const RETIRED_THEME_REDIRECTS = { 5: '/best', 6: '/new' };

/**
 * 카테고리 목록 정렬 6종.
 *
 * 판매량·상품평은 **ORDER BY 안의 상관 서브쿼리**로 넣는다. FROM 에 JOIN 하면
 * getList 의 `query.replace('SELECT *','SELECT COUNT(*)')` 카운트가 조인만큼 뻥튀기된다.
 */
const SORT_ORDERS = {
    best: 'view_count DESC, created_at DESC',
    price_asc: 'price ASC, created_at DESC',
    price_desc: 'price DESC, created_at DESC',
    sales: '(SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.product_id = products.id) DESC, created_at DESC',
    // 숨긴 리뷰(is_visible=0)는 집계에서 뺀다. 안 그러면 목록의 상품평 순위·건수와
    // 상세 리뷰 탭에 실제로 보이는 건수가 어긋난다.
    review: '(SELECT COALESCE(AVG(r.rating),0) FROM reviews r WHERE r.product_id = products.id AND r.is_visible = 1) DESC, '
        + '(SELECT COUNT(*) FROM reviews r WHERE r.product_id = products.id AND r.is_visible = 1) DESC, created_at DESC',
    new: 'created_at DESC',
    // 신상품 페이지 기본 정렬. 'new'(최근등록=적재순)와 다르다 — 이쪽은 판매 시작일 기준.
    sale_start: newArrival.NEW_PRODUCT_ORDER,
};

/** 정렬 탭(캡처 순서). value 는 SORT_ORDERS 키와 1:1. */
const SORT_TABS = [
    { value: 'best', label: '인기상품' },
    { value: 'price_asc', label: '낮은가격' },
    { value: 'price_desc', label: '높은가격' },
    { value: 'sales', label: '판매량' },
    { value: 'new', label: '최근등록' },
    { value: 'review', label: '상품평' },
];

/**
 * 상단 배너 묶음 고르기 — 개별 대상(category_id 가 찍힌) 배너가 하나라도 있으면 그것들만,
 * 없으면 전체 공통(group_key='common:…') 묶음을 쓴다.
 *
 * 둘을 섞으면 "이 카테고리에만 다른 배너를 걸겠다"는 개별 지정의 의미가 사라지므로,
 * 다건 슬라이드쇼가 된 뒤에도 tier 선택 규칙은 그대로 유지한다.
 */
function pickBannerTier(rows) {
    const individual = rows.filter(r => r.category_id != null);
    return individual.length ? individual : rows;
}

function buildKakaoChannelUrl(rawValue) {
    if (!rawValue) return '';
    const raw = String(rawValue).trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    if (raw.startsWith('/')) {
        return `https://pf.kakao.com${raw}`;
    }

    if (raw.startsWith('@')) {
        return `https://pf.kakao.com/${raw}`;
    }

    if (raw.startsWith('_')) {
        return `https://pf.kakao.com/${raw}`;
    }

    return `https://pf.kakao.com/_${raw}`;
}

exports.getList = async (req, res) => {
    // 기능 메뉴(/best, /new, /deal/today)가 프리셋을 주입한다. 사용자 쿼리스트링보다 우선.
    // Express 5의 req.query 는 getter 라 직접 변형하지 않고 병합해서 쓴다.
    const q = Object.assign({}, req.query, req.featurePreset || {});

    const categoryId = req.params.categoryId;
    const brandId = req.params.brandId;
    const queryCategoryId = q.categoryId;
    const queryBrandId = q.brandId;
    const distributionBadge = q.distributionBadge || '';
    const productBadge = q.badge || '';
    // 'B2B 상품' 필터 — 사업자 판매를 켠 상품만. 승인 사업자가 아니어도 걸 수 있다
    // (전용가는 안 보이지만 "사업자 구매가 되는 상품"을 고르는 것 자체는 공개 정보다).
    const b2bOnly = String(q.b2b || '') === '1';
    // 신상품 필터. 판매 시작일 기준 자동 판정 + NEW 뱃지 강제 노출(services/catalog/newArrival).
    // 옛 ?badge=NEW 는 '뱃지가 걸린 상품'만 보는 별개 필터로 남겨둔다(관리자·쿠폰이 뱃지 단위를 쓴다).
    const isNewFilter = String(q.filter || '') === 'new';
    // 신상품 목록은 판매 시작일순이 기본. 그 외에는 적재순('최근등록').
    const sort = SORT_ORDERS[q.sort] ? q.sort : (isNewFilter ? 'sale_start' : 'new');
    // 상품그룹 소스(오늘특가·베스트 등) — 관리자가 product_group_item 으로 수동 매핑한 상품만 노출.
    // 사용자 쿼리로는 못 바꾸게 featurePreset 에서만 읽는다.
    const groupId = Number(req.featurePreset && req.featurePreset.groupId) || 0;

    const selectedCategoryId = categoryId || queryCategoryId || null;
    const selectedBrandId = brandId || queryBrandId || null;

    const _visibilityFilter = req.user
        ? "visibility IN ('PUBLIC','MEMBER_ONLY')"
        : "visibility = 'PUBLIC'";
    // P5 몰 스코프 — 이 필터가 없으면 카테고리 없는 목록(/products)·검색에 다른 몰 상품이 샌다.
    const mallId = req.mallId || 1;
    let query = `SELECT * FROM products WHERE mall_id = ? AND status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND ${_visibilityFilter}`;
    const params = [mallId];

    /*
     * 아울렛 상품 분리 (outlet_setting.show_in_normal_list = 0).
     *
     * 몰이 "아울렛 상품은 아울렛에서만 판다"고 정하면 일반 상품 목록·검색에서 뺀다.
     * 이월·리퍼브가 신상품 옆에 섞여 브랜드 이미지를 깎는 것을 막는 장치다(설계서 §4-3).
     * 기본값은 1(병행 노출)이라 대부분의 몰에서 이 조건은 붙지 않는다.
     */
    const outletSetting = await outletService.getSetting(mallId);
    if (!outletSetting.show_in_normal_list) {
        query += ' AND id NOT IN (SELECT product_id FROM outlet_product WHERE mall_id = ?)';
        params.push(mallId);
    }

    let pageTitle = '전체상품';
    // 상단 배너 묶음(개별 우선 · 다건이면 슬라이드쇼). 뷰는 이 배열 하나만 본다.
    let categoryBanners = [];
    let categoryNav = null;
    // 카테고리 리스트 상단 베스트 슬라이드쇼용 상위 상품(최대 5개). 카테고리 진입 시에만 채운다.
    let categoryBest = [];
    // 메뉴 상단 쇼케이스(캐러셀)는 middleware/menuShowcase 가 경로로 판별해 주입하고
    // main_layout 이 body 위에 렌더한다 — 여기서 배너를 조회하지 않는다.

    try {
        if (selectedCategoryId) {
            const [catRows] = await pool.query('SELECT id, name, type FROM categories WHERE id = ?', [selectedCategoryId]);
            if (catRows.length > 0) {
                const selected = catRows[0];
                pageTitle = selected.name.endsWith('상품') ? selected.name : `${selected.name} 상품`;

                if (selected.type === 'THEME') {
                    // THEME 축은 폐기됐다. 옛 URL 은 정본 기능 메뉴로 넘긴다.
                    const dest = RETIRED_THEME_REDIRECTS[Number(selectedCategoryId)] || '/products';
                    return res.redirect(301, dest);
                }

                // NORMAL/BRAND: 서브트리 집계. 부모를 눌렀을 때 자식 상품까지 나와야 한다
                // (mall 2 는 상품 205건 중 171건이 depth 2·3 에 붙어 있다).
                categoryNav = await navigationService.getCategoryContext(mallId, selectedCategoryId);
                const ids = (categoryNav && categoryNav.descendantIds.length)
                    ? categoryNav.descendantIds
                    : [Number(selectedCategoryId)];
                query += ` AND category_id IN (${ids.map(() => '?').join(',')})`;
                params.push(...ids);

                // 개별 카테고리 배너가 있으면 그것을, 없으면 전체 공통 배너를 노출한다.
                // 여러 건이면 뷰가 슬라이드쇼로 그린다(순서는 관리자의 정렬 순서).
                const [bannerRows] = await pool.query(
                    `SELECT * FROM banners
                     WHERE is_active = 1
                       AND banner_type = 'CATEGORY'
                       AND mall_id = ?
                       AND (category_id = ? OR group_key = ?)
                     ORDER BY display_order ASC, id ASC`,
                    [mallId, selectedCategoryId, `common:CATEGORY:${mallId}`]
                );
                categoryBanners = pickBannerTier(bannerRows);

                /*
                 * 카테고리 베스트 슬라이드쇼 — 이 카테고리(하위 트리 포함) 인기 상품 상위 5개.
                 * 판매수·좋아요·조회수 가중 점수로 뽑는다(services/best 의 가중 랭킹과 같은 취지).
                 * 목록 필터(뱃지·정렬·페이지)와 무관하게 카테고리 전체에서 계산한 뒤 상단에 노출한다.
                 */
                let bestQuery = `SELECT * FROM products
                    WHERE mall_id = ?
                      AND status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
                      AND ${_visibilityFilter}
                      AND category_id IN (${ids.map(() => '?').join(',')})`;
                const bestParams = [mallId, ...ids];
                // 목록과 동일하게, 아울렛 상품을 일반 목록에서 빼는 몰이면 베스트에서도 뺀다.
                if (!outletSetting.show_in_normal_list) {
                    bestQuery += ' AND id NOT IN (SELECT product_id FROM outlet_product WHERE mall_id = ?)';
                    bestParams.push(mallId);
                }
                bestQuery += ` ORDER BY (
                      (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.product_id = products.id) * 3
                      + (SELECT COUNT(*) FROM likes l WHERE l.product_id = products.id) * 2
                      + products.view_count
                    ) DESC, products.view_count DESC, products.created_at DESC
                    LIMIT 5`;
                const [bestRows] = await pool.query(bestQuery, bestParams);
                // 카드 가격도 활성 특가가로 표시한다(목록/추천과 동일).
                await dealSvc.applyDeals(bestRows);
                await sellableStock.decorate(bestRows); // 품절 판정도 목록과 동일하게 SKU 기준
                categoryBest = bestRows;
            }
        }

        if (selectedBrandId) {
            // P5 몰 스코프 — 다른 몰 브랜드 id 로 접근하면 제목만 그 브랜드로 바뀌고 목록은 0건이 된다.
            const [brandRows] = await pool.query(
                "SELECT id, name FROM categories WHERE id = ? AND type = 'BRAND' AND mall_id IN (0, ?)",
                [selectedBrandId, mallId]
            );
            if (brandRows.length > 0) {
                const brandName = brandRows[0].name;
                pageTitle = selectedCategoryId ? `${pageTitle} · ${brandName}` : `${brandName} 브랜드`;
                query += ' AND brand_category_id = ?';
                params.push(selectedBrandId);

                if (!categoryBanners.length) {
                    // 개별 브랜드 배너 우선, 없으면 전체 공통 브랜드 배너. 다건이면 슬라이드쇼.
                    const [brandBannerRows] = await pool.query(
                        `SELECT * FROM banners
                         WHERE is_active = 1
                           AND banner_type = 'BRAND'
                           AND mall_id = ?
                           AND (category_id = ? OR group_key = ?)
                         ORDER BY display_order ASC, id ASC`,
                        [mallId, selectedBrandId, `common:BRAND:${mallId}`]
                    );
                    categoryBanners = pickBannerTier(brandBannerRows);
                }
            }
        }

        if (distributionBadge === 'ONLINE_ONLY') {
            query += " AND distribution_badge = 'ONLINE_ONLY'";
        }

        /*
         * B2B 상품만. 상관 서브쿼리로 붙인다 — FROM 에 JOIN 을 더하면 아래 카운트·파셋 쿼리의
         * 'SELECT *' 문자열 치환이 깨진다(§facet 주석 참고).
         * 해제는 행을 DELETE 하지만 표현이 갈리지 않도록 is_b2b_sale = 1 을 명시한다.
         */
        if (b2bOnly) {
            query += ' AND EXISTS (SELECT 1 FROM product_b2b_setting b'
                + ' WHERE b.product_id = products.id AND b.is_b2b_sale = 1)';
        }
        /* 오프라인판매전용 필터 — 기능 미사용으로 주석처리
        else if (distributionBadge === 'OFFLINE_ONLY') {
            query += " AND distribution_badge = 'OFFLINE_ONLY'";
        }
        */

        if (productBadge === 'BEST') {
            query += " AND FIND_IN_SET('BEST', product_badge)";
            if (pageTitle === '전체상품') pageTitle = '베스트 상품';
        } else if (productBadge === 'NEW') {
            query += " AND FIND_IN_SET('NEW', product_badge)";
            if (pageTitle === '전체상품') pageTitle = '신상품';
        } else if (productBadge === 'RECOMMEND') {
            query += " AND FIND_IN_SET('RECOMMEND', product_badge)";
            if (pageTitle === '전체상품') pageTitle = '추천 상품';
        } else if (productBadge === 'DEADLINE_SALE') {
            // 기간임박할인은 만료일이 지나면 노출을 멈춘다. 관리자가 badge_expire_date 를
            // 저장하지만 고객 화면이 검사하지 않아, 만료된 특가가 계속 걸려 있었다.
            query += " AND FIND_IN_SET('DEADLINE_SALE', product_badge)";
            query += " AND (badge_expire_date IS NULL OR badge_expire_date >= CURDATE())";
            if (pageTitle === '전체상품') pageTitle = '기간임박할인';
        } else if (productBadge === 'GREENHUB_SPECIAL') {
            query += " AND FIND_IN_SET('GREENHUB_SPECIAL', product_badge)";
            if (pageTitle === '전체상품') pageTitle = '와이디몰특가';
        }

        if (isNewFilter) {
            const np = newArrival.newProductPredicate('');
            query += ` AND ${np.sql}`;
            params.push(...np.params); // sql 조각과 params 는 같은 지점에서 함께 넣는다
            if (pageTitle === '전체상품') pageTitle = '신상품';
        }

        // 뱃지·신상품이 이미 제목을 정했으면 그쪽을 존중한다(B2B 는 축이 다른 필터라 뒤로 밀린다).
        if (b2bOnly && pageTitle === '전체상품') pageTitle = 'B2B 상품';

        // 상품그룹 소스: 관리자가 수동 매핑한 상품만. (오늘특가·베스트 등 manual 그룹)
        if (groupId > 0) {
            query += " AND id IN (SELECT product_id FROM product_group_item WHERE product_group_id = ?)";
            params.push(groupId);
        }

        /*
         * 필터(facet) — 가격대·속성 등. 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §6
         *
         * ⚠ facetService 는 EXISTS / IN 서브쿼리만 만든다.
         *   바로 아래 카운트 쿼리가 'SELECT *' 문자열 치환이라 FROM 에 JOIN 이 붙으면 깨진다.
         *
         * 필터 정의를 못 읽어도 목록 자체는 떠야 하므로 실패는 삼키고 로그만 남긴다.
         */
        let facets = [];
        let selectedFacets = {};
        let brandFacetOptions = [];
        try {
            const _preFacetQuery = query;          // 필터 적용 전 스냅샷(브랜드 파셋 카운트용)
            const _preFacetParams = [...params];

            const allFacets = await facetService.getFacetsForCategory(selectedCategoryId);
            // 술어는 정의 전체 기준으로 만든다. URL 로 들어온 필터는 화면에 안 보여도 적용돼야 한다.
            const fp = facetService.buildPredicates(allFacets, q);
            if (fp.sql) {
                query += ` AND ${fp.sql}`;
                params.push(...fp.params);
            }
            selectedFacets = fp.selected;

            /*
             * 브랜드 필터 후보 = "지금 조건에서 실제로 상품이 있는 브랜드" 상위 30개 + 건수.
             * 몰 전체 브랜드(1,300여 개)를 그대로 뿌리면 DOM 만 커지고 대부분 0건이다.
             * 자기 자신(BRAND)은 조건에서 빼야 다른 브랜드가 0 으로 접히지 않는다.
             */
            const fpNoBrand = facetService.buildPredicates(allFacets, q, { exclude: ['BRAND'] });
            let brandQuery = _preFacetQuery
                + (fpNoBrand.sql ? ` AND ${fpNoBrand.sql}` : '')
                + ' AND brand_category_id IS NOT NULL';
            brandQuery = brandQuery.replace('SELECT *', 'SELECT brand_category_id AS id, COUNT(*) AS cnt')
                + ' GROUP BY brand_category_id ORDER BY cnt DESC, brand_category_id ASC LIMIT 30';
            const [brandRows] = await pool.query(brandQuery, [..._preFacetParams, ...fpNoBrand.params]);
            if (brandRows.length) {
                const [nameRows] = await pool.query(
                    `SELECT id, name FROM categories WHERE id IN (${brandRows.map(() => '?').join(',')})`,
                    brandRows.map((r) => r.id)
                );
                const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
                brandFacetOptions = brandRows
                    .filter((r) => nameById.has(r.id))
                    .map((r) => ({ id: r.id, name: nameById.get(r.id), count: r.cnt }));
            }

            // 화면에는 값이 실제로 있는 것만 그린다(0건 필터로 화면을 채우지 않는다).
            const availability = await facetService.getAttributeAvailability(mallId);
            let attrCounts = null;
            if (availability.size) {
                // 속성 값별 건수. 속성 조건은 전부 빼고 센다(같은 그룹이 0 으로 접히는 것 방지).
                const fpNoAttr = facetService.buildPredicates(allFacets, q, { excludeSources: ['ATTRIBUTE'] });
                const idQuery = (_preFacetQuery + (fpNoAttr.sql ? ` AND ${fpNoAttr.sql}` : ''))
                    .replace('SELECT *', 'SELECT id');
                attrCounts = await facetService.getAttributeCounts(idQuery, [..._preFacetParams, ...fpNoAttr.params]);
            }
            facets = facetService.pruneUnavailable(allFacets, availability, attrCounts);
        } catch (facetErr) {
            console.error('[facet] 필터 해석 실패 — 필터 없이 목록만 렌더합니다.', facetErr);
        }

        // 페이지네이션
        const allowedSizes = [10, 20, 30, 50];
        const perPage = allowedSizes.includes(Number(req.query.perPage)) ? Number(req.query.perPage) : 30;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const offset = (page - 1) * perPage;

        // 전체 개수 조회
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [[{ total: rawTotal }]] = await pool.query(countQuery, params);

        // 기능 메뉴가 상한을 지정하면(예: 베스트 = 조회수 상위 100) 그 안에서만 페이징한다.
        // 사용자 쿼리로는 못 바꾸게 featurePreset 에서만 읽는다.
        const capLimit = Number((req.featurePreset || {}).capLimit) || 0;
        const total = capLimit ? Math.min(rawTotal, capLimit) : rawTotal;
        const totalPages = Math.ceil(total / perPage);

        const statusOrder = "FIELD(status,'ON','COMING_SOON','RESTOCK','SOLD_OUT','OFF')";
        if (groupId > 0) {
            // 상품그룹은 관리자 큐레이션 순서(product_group_item.sort_order)를 존중한다.
            // 이 서브쿼리 파라미터는 countQuery 실행 뒤에 추가되므로 count 에는 영향이 없다.
            query += ` ORDER BY ${statusOrder}, (SELECT sort_order FROM product_group_item`
                + ` WHERE product_group_id = ? AND product_id = products.id) ASC, created_at DESC`;
            params.push(groupId);
        } else {
            query += ` ORDER BY ${statusOrder}, ${SORT_ORDERS[sort]}`;
        }

        // 상한이 있으면 마지막 페이지가 상한을 넘지 않도록 LIMIT 을 조인다(초과분 노출 방지).
        let effPerPage = perPage;
        if (capLimit) effPerPage = Math.max(0, Math.min(perPage, capLimit - offset));
        query += ' LIMIT ? OFFSET ?';
        params.push(effPerPage, offset);

        const [products] = await pool.query(query, params);
        // 활성 특가를 read-time 으로 덮어쓴다. SELECT 절을 못 건드려서(카운트 쿼리가 문자열 치환) 후처리다.
        await dealSvc.applyDeals(products);
        // 재고도 같은 이유로 후처리 — products.stock 은 옵션상품에서 stale 해 카드가 SOLD OUT 으로 잘못 뜬다.
        await sellableStock.decorate(products);
        // 카테고리/브랜드는 글로벌 한 벌. 스토어프론트는 "이 몰에 상품이 있는(유효)" 것에서
        // 몰별 숨김(mall_category_visibility)을 뺀 것만 노출한다. 사이드바는 평면 목록이라 최상위(depth 1)만.
        const _validCat = await categoryScope.visibleCategoryIdSet(mallId);
        const _validBrand = await categoryScope.visibleCategoryIdSet(mallId, { brand: true });
        const [_allCats] = await pool.query(
            "SELECT * FROM categories WHERE type = 'NORMAL' AND mall_id IN (0, ?) AND is_active = 1 AND depth = 1 ORDER BY display_order ASC",
            [mallId]
        );
        const categories = _allCats.filter((c) => _validCat.has(c.id));
        const [_allBrands] = await pool.query(
            "SELECT id, name FROM categories WHERE type = 'BRAND' AND mall_id IN (0, ?) ORDER BY display_order ASC, id ASC",
            [mallId]
        );
        const brands = _allBrands.filter((b) => _validBrand.has(b.id));

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';
        const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

        let canonicalUrl = `${domain}/products`;
        if (categoryId) canonicalUrl = `${domain}/products/category/${categoryId}`;
        if (brandId) canonicalUrl = `${domain}/products/brand/${brandId}`;

        const seo = {
            title: `${pageTitle} | ${companyName}`,
            description: `${companyName}의 ${pageTitle} 페이지입니다.`,
            url: canonicalUrl,
            image: siteSettings.logo_url ? (siteSettings.logo_url.startsWith('http') ? siteSettings.logo_url : domain + siteSettings.logo_url) : '',
            type: 'website',
            siteName: companyName,
            robots: 'index,follow',
            jsonLd: null
        };

        // 찜 목록 조회 (로그인 사용자만)
        let likedProductIds = [];
        if (req.user) {
            const [likeRows] = await pool.query('SELECT product_id FROM likes WHERE user_id = ?', [req.user.id]);
            likedProductIds = likeRows.map(r => r.product_id);
        }

        // 카드에 기업 전용가를 얹는다. 비활성 컨텍스트면 아무 필드도 붙지 않는다(설계 §6.2).
        await b2bPricingService.decorateProducts(req.b2b, products);
        if (Array.isArray(categoryBest) && categoryBest.length) {
            await b2bPricingService.decorateProducts(req.b2b, categoryBest);
        }
        // 'B2B 상품' 뱃지용 플래그. 가격과 달리 컨텍스트와 무관하게 모두에게 붙인다.
        await b2bPricingService.markB2bProducts(products);
        if (Array.isArray(categoryBest) && categoryBest.length) {
            await b2bPricingService.markB2bProducts(categoryBest);
        }

        res.render('user/products/list', {
            title: pageTitle,
            products,
            categories,
            brands,
            currentCategory: selectedCategoryId,
            currentBrand: selectedBrandId,
            currentSort: sort,
            currentDistributionBadge: distributionBadge,
            currentProductBadge: productBadge,
            currentB2bOnly: b2bOnly,
            currentFilter: isNewFilter ? 'new' : '',
            currentUser: req.user,
            likedProductIds,
            categoryBanners,
            categoryNav,
            categoryBest,
            sortTabs: SORT_TABS,
            facets,
            selectedFacets,
            brandFacetOptions,
            // 뷰의 URL 빌더가 현재 쿼리를 그대로 이어붙이기 위해 필요하다.
            currentQuery: Object.assign({}, req.query),
            seo,
            pagination: { page, perPage, total, totalPages }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
exports.getDetail = async (req, res) => {
    const id = req.params.id;
    try {
        // Get Product
        const [rows] = await pool.query(`
            SELECT p.*, c.name as category_name, bc.name as brand_name
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            LEFT JOIN categories bc ON p.brand_category_id = bc.id
            WHERE p.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).render('user/404', {
                title: '상품을 찾을 수 없습니다',
                seo: { ...res.locals.seo, title: '상품을 찾을 수 없습니다', robots: 'noindex,follow' }
            });
        }
        const product = rows[0];

        // 사업자 전용가(승인된 사업자에게만 값이 온다). 아니면 null 이라 화면이 바뀌지 않는다.
        const b2bInfo = await b2bPricingService.resolveForProduct({ b2b: req.b2b, productId: product.id });

        // 노출 설정에 따른 접근 제어
        if (product.visibility === 'HIDDEN') {
            return res.status(404).render('user/404', {
                title: '상품을 찾을 수 없습니다',
                seo: { ...res.locals.seo, title: '상품을 찾을 수 없습니다', robots: 'noindex,follow' }
            });
        }
        if (product.visibility === 'MEMBER_ONLY' && !req.user) {
            return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
        }

        // If accessed via legacy /products/view/:id URL and slug exists, redirect to slug URL (301)
        if (product.slug && req.originalUrl && req.originalUrl.startsWith('/products/view/')) {
            return res.redirect(301, `/products/${product.slug}`);
        }

        // Update View Count (only when actually rendering the detail page)
        await pool.query('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [id]);

        // 최근 본 상품 기록 (로그인 사용자만)
        if (req.user) {
            pool.query(
                `INSERT INTO recent_views (user_id, product_id, viewed_at) VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE viewed_at = NOW()`,
                [req.user.id, id]
            ).catch(() => {});
        }

        // Get Sub Images
        const [images] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY display_order ASC', [id]);
        product.images = images;

        // 재고는 SKU 가 원천이다. products.stock 은 옵션상품에서 stale 하므로 판매가능재고로 덮는다
        // (품절 오버레이·수량 상한·JSON-LD availability 가 모두 이 값을 읽는다).
        // 아래 복합상품 분기는 구성 파생 가용수량으로 이 값을 다시 덮는다 — 순서가 중요하다.
        await sellableStock.decorate([product]);

        // 옵션상품이면 옵션·SKU 를 실어 상세페이지 옵션 선택 UI 를 그린다(설계 §26.5·26.6).
        let productOptions = [];
        let productSkus = [];
        if (product.product_type === 'OPTION') {
            const os = await optionService.getProductOptionsAndSkus(id);
            productOptions = os.options;
            productSkus = os.skus;
        } else if (compositeService.COMPOSITE_TYPES.includes(product.product_type)) {
            // 복합상품 대표 SKU 는 재고를 보유하지 않는다. 표시·구매수량은 구성에서 파생한 가용수량을 쓴다(설계 §20).
            product.stock = await compositeService.getAvailableQty(id);
        }

        // 활성 특가 반영 — SEO/JSON-LD 의 offerPrice 도 특가가를 쓰도록 여기서 먼저 덮는다.
        await dealSvc.applyDeals([product]);

        // Get Likes (Check if current user liked)
        let isLiked = false;
        if (req.user) {
            const [likeRows] = await pool.query('SELECT * FROM likes WHERE user_id = ? AND product_id = ?', [req.user.id, id]);
            if (likeRows.length > 0) isLiked = true;
        }

        // Get Reviews
        // is_visible = 0 은 관리자가 숨긴 리뷰다. 숨김이 화면에 그대로 나오면 관리 기능이 무의미해진다.
        const [reviews] = await pool.query(`
            SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = ? AND r.is_visible = 1
            ORDER BY r.created_at DESC
        `, [id]);

        // 평점 요약 — 리뷰 탭 머리말. 리뷰가 없으면 0건이라 화면이 평균을 그리지 않는다.
        const reviewAvg = reviews.length
            ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length
            : 0;

        // 배송비 정책(몰 스코프). 행이 없으면 계산기의 고지된 기본값이 온다.
        const shippingPolicy = await shippingCalculator.getPolicy(req.mallId || 1);

        // 함께 보면 좋은 상품 (수동 + 자동 하이브리드)
        const vFilterRec = req.user
            ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')"
            : "p.visibility = 'PUBLIC'";

        /*
         * 1) 수동 등록분 (판매중 상태만)
         *
         * 추천 카드는 목록에서 바로 [담기]·[찜]을 한다(설계: 상세 하단 추천 슬라이더).
         *  - product_type: 옵션상품은 옵션을 골라야 하므로 카드에서 담지 않고 상세로 보낸다.
         *    (상세페이지가 옵션 UI 를 그리는 판정과 같은 신호를 쓴다 — 어긋나면 안 됨)
         *  - is_liked: 초기 하트 상태. 없으면 새로고침마다 빈 하트로 돌아가 거짓말을 한다.
         */
        const [manualRecs] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                   p.discount_rate, p.status, ${sellableStock.sellableStockSql('p')} AS stock,
                   p.provider, p.product_badge, p.distribution_badge, p.product_type,
                   ${req.user ? '(lk.id IS NOT NULL)' : '0'} AS is_liked
            FROM product_recommendations pr
            JOIN products p ON p.id = pr.related_id
            ${req.user ? 'LEFT JOIN likes lk ON lk.product_id = p.id AND lk.user_id = ?' : ''}
            WHERE pr.product_id = ? AND p.status = 'ON' AND ${vFilterRec}
            ORDER BY pr.display_order ASC
        `, req.user ? [req.user.id, id] : [id]);

        // 수동 등록분만 노출
        const recommendedProducts = manualRecs;
        // 추천 카드도 특가가로 표시한다.
        await dealSvc.applyDeals(recommendedProducts);

        // Shopify 상품 매핑 조회 (테이블 없으면 null 처리)
        let shopifyMapping = null;
        try {
            const [shopifyRows] = await pool.query(
                'SELECT * FROM shopify_product_mappings WHERE product_id = ?', [id]
            );
            shopifyMapping = shopifyRows.length > 0 ? shopifyRows[0] : null;
        } catch (_) {}

        // ===== SEO 메타/OG/JSON-LD 구성 =====
        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';

        const domainFromSettings = (global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr';
        const domain = domainFromSettings.replace(/\/$/, '');
        const slugPath = (product.slug && product.slug.trim())
            ? `/products/${product.slug}`
            : `/products/view/${id}`;
        const productUrl = domain + slugPath;

        const seoTitle = `${product.name} | ${companyName}`;

        let seoDescription = '';
        if (product.meta_description && product.meta_description.trim()) {
            seoDescription = product.meta_description.trim();
        } else if (product.short_description && product.short_description.trim()) {
            seoDescription = product.short_description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        } else if (product.description) {
            const plain = String(product.description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            seoDescription = plain.substring(0, 150);
        }

        const imagePath = product.main_image || product.thumbnail_image || '';
        let imageUrl = '';
        if (imagePath) {
            if (/^https?:\/\//i.test(imagePath)) {
                imageUrl = imagePath;
            } else {
                const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
                imageUrl = domain + normalizedPath;
            }
        }

        let availability;
        if (product.status === 'ON' && product.stock > 0) {
            availability = 'https://schema.org/InStock';
        } else if (product.status === 'COMING_SOON') {
            availability = 'https://schema.org/PreOrder';
        } else {
            availability = 'https://schema.org/OutOfStock';
        }

        const offerPrice = product.price || 0;

        const brandName = (product.brand_name || product.provider || companyName || '').toString().trim();

        const jsonLdObject = {
            '@context': 'https://schema.org/',
            '@type': 'Product',
            name: product.name,
            description: seoDescription || undefined,
            image: imageUrl ? [imageUrl] : undefined,
            brand: {
                '@type': 'Brand',
                name: brandName
            },
            offers: {
                '@type': 'Offer',
                url: productUrl,
                priceCurrency: 'KRW',
                price: String(offerPrice),
                availability,
                seller: {
                    '@type': 'Organization',
                    name: companyName
                }
            },
            sku: String(product.id)
        };

        const seo = {
            title: seoTitle,
            description: seoDescription,
            url: productUrl,
            image: imageUrl,
            type: 'product',
            siteName: companyName,
            robots: 'index,follow',
            jsonLd: JSON.stringify(jsonLdObject, null, 2)
        };

        const kakaoJsKey = global.systemSettings && global.systemSettings.kakao_js_key;
        const kakaoChannelUrl = siteSettings.kakao_channel_enabled
            ? buildKakaoChannelUrl(siteSettings.kakao_channel_url)
            : '';

        const visitorIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket.remoteAddress || '';

        // 아울렛 상품이면 할인 사유·상태·하자를 상세에 고지해야 한다(설계서 §4-4).
        // 리퍼브·전시·포장훼손을 일반 상품처럼 보여주면 교환·반품 분쟁이 난다.
        // 아울렛이 아니면 null 이고, 뷰는 아무것도 그리지 않는다.
        const outletInfo = await outletService.getOutletInfoByProductId(req.mallId || 1, product.id);

        res.render('user/products/detail', {
            title: product.name,
            product,
            isLiked,
            reviews,
            reviewAvg,
            shippingPolicy,
            currentUser: req.user,
            visitorIp,
            seo,
            kakaoJsKey,
            kakaoChannelUrl,
            stockError: req.query.error === 'stock' ? req.query.max : null,
            // 옵션상품인데 옵션을 고르지 않고 결제로 넘어간 경우(재고 부족과 구분해 안내한다)
            optionError: req.query.error === 'option',
            recommendedProducts,
            shopifyMapping,
            outletInfo,
            productOptions,
            productSkus,
            /*
             * B2B 전용가 블록. 사업자 컨텍스트가 아니면 null 이고, 뷰는 아무것도 그리지 않는다
             * → 일반 사용자 화면은 한 픽셀도 바뀌지 않는다(설계 §6.1).
             */
            b2bInfo,
            b2bTax: b2bInfo ? b2bTaxService.split(b2bInfo.unitPrice, b2bInfo.taxType) : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 슬러그 기반 상세 보기: /products/:slug
exports.getDetailBySlug = async (req, res) => {
    const { slug } = req.params;
    try {
        const [rows] = await pool.query('SELECT id FROM products WHERE slug = ?', [slug]);
        if (rows.length === 0) {
            return res.status(404).render('user/404', {
                title: '상품을 찾을 수 없습니다',
                seo: { ...res.locals.seo, title: '상품을 찾을 수 없습니다', robots: 'noindex,follow' }
            });
        }
        req.params.id = rows[0].id;
        return exports.getDetail(req, res);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.toggleLike = async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Login required' });

    const productId = req.params.id;
    const userId = req.user.id;

    try {
        const [rows] = await pool.query('SELECT * FROM likes WHERE user_id = ? AND product_id = ?', [userId, productId]);
        if (rows.length > 0) {
            // Un-like
            await pool.query('DELETE FROM likes WHERE user_id = ? AND product_id = ?', [userId, productId]);
            res.json({ success: true, liked: false });
        } else {
            // Like
            await pool.query('INSERT INTO likes (user_id, product_id) VALUES (?, ?)', [userId, productId]);
            res.json({ success: true, liked: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

// 검색 전용 화면
exports.searchPage = async (req, res) => {
    const qRaw = req.query.q || '';
    const q = qRaw.trim();

    let products = [];
    let total = 0;

    if (q.length >= 2) {
        try {
            const like = `%${q}%`;
            const mallId = req.mallId || 1; // P5 몰 스코프 — 검색은 카테고리 필터가 없어 몰 필터가 필수
            const [rows] = await pool.query(`
                SELECT p.id, p.name, COALESCE(bc.name, p.provider) AS provider, p.price, p.original_price,
                       p.discount_rate,
                       p.main_image, p.thumbnail_image, p.slug, p.short_description, p.status,
                       ${sellableStock.sellableStockSql('p')} AS stock,
                       c.name AS category_name, c.type AS category_type,
                       (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.is_visible = 1) AS review_count
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN categories bc ON p.brand_category_id = bc.id
                WHERE p.mall_id = ?
                  AND (
                      p.name LIKE ?
                      OR p.slug LIKE ?
                      OR p.provider LIKE ?
                      OR bc.name LIKE ?
                      OR p.description LIKE ?
                      OR p.ai_recommendation_content LIKE ?
                  )
                  AND p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
                  AND (p.visibility = 'PUBLIC' ${req.user ? "OR p.visibility = 'MEMBER_ONLY'" : ''})
                ORDER BY FIELD(p.status,'ON','RESTOCK','COMING_SOON','SOLD_OUT','OFF'), p.created_at DESC
                LIMIT 50
            `, [mallId, like, like, like, like, like, like]);

            // 검색 결과 카드도 특가가로 표시한다.
            await dealSvc.applyDeals(rows);
            // 사업자면 기업 전용가를 얹는다(일반 사용자는 아무 필드도 붙지 않는다).
            await b2bPricingService.decorateProducts(req.b2b, rows);
            products = rows;
            total = rows.length;

            // 검색 로그 저장 (없는 경우 에러는 무시)
            try {
                await pool.query(
                    `INSERT INTO search_logs (user_id, keyword, result_count)
                     VALUES (?, ?, ?)` ,
                    [req.user ? req.user.id : null, q, total]
                );
            } catch (logErr) {
                console.error('Search log insert error:', logErr.message || logErr);
            }
        } catch (err) {
            console.error(err);
        }
    }

    const siteSettings = res.locals.siteSettings || {};
    const companyName = siteSettings.company_name || '와이디몰';

    const seo = {
        ...res.locals.seo,
        title: `상품 검색 | ${companyName}`,
        robots: 'noindex,follow'
    };

    res.render('user/search', {
        title: '상품 검색',
        query: qRaw,
        products,
        total,
        currentUser: req.user,
        seo
    });
};
