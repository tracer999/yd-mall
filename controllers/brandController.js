const pool = require('../config/db');
const brandSvc = require('../services/brand/brandService');
const benefitSvc = require('../services/brand/benefitService');
const { INITIAL_BUCKETS } = require('../shared/hangul');
const facetService = require('../services/catalog/facetService');

/**
 * 브랜드 허브.
 *
 * 예전 이 컨트롤러는 브랜드를 통째로 SELECT 해서 로고 그리드 하나를 뿌리고,
 * /brands/:id 는 /products/brand/:id 로 리다이렉트만 했다. 몰2는 브랜드 1,354개에
 * 로고가 0개라 그 화면은 성립하지 않는다.
 *
 * 이제 브랜드 홈(검색·인기·신규·카테고리별·혜택·전체)과 브랜드 상세관(탭)을 제공한다.
 * 화면은 brand_stat(집계 캐시)만 읽는다.
 */

const domainOf = () =>
    ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

/*
 * 브랜드 상단 배너 묶음 (관리자: 배너 관리 > 브랜드 배너).
 *
 * 개별 브랜드 배너(category_id=브랜드id)가 하나라도 있으면 그 묶음만, 없으면 전체 공통 묶음
 * (group_key='common:BRAND:{mallId}')으로 폴백한다 — 상품 목록의 pickBannerTier 와 같은 규칙이다.
 * 두 tier 를 섞으면 "이 브랜드에만 다른 배너" 라는 개별 지정이 의미를 잃는다.
 *
 * brandId 를 주지 않으면(브랜드 목록 화면) 공통 묶음만 본다 — 걸 대상 브랜드가 정해지지 않았다.
 * 카테고리가 글로벌해진 뒤로 category_id 만으로는 몰이 갈리지 않으므로 mall_id 로 직접 스코프한다.
 *
 * 2건 이상이면 뷰가 슬라이드쇼로 그린다(_category_banner.ejs). 순서는 관리자가 정한 display_order.
 */
async function loadBrandBanners(mallId, brandId = null) {
    const commonKey = `common:BRAND:${mallId}`;
    const [rows] = await pool.query(
        `SELECT * FROM banners
         WHERE is_active = 1 AND banner_type = 'BRAND' AND mall_id = ?
           AND (${brandId ? 'category_id = ? OR ' : ''}group_key = ?)
         ORDER BY display_order ASC, id ASC`,
        brandId ? [mallId, brandId, commonKey] : [mallId, commonKey]
    );
    const individual = rows.filter(r => r.category_id != null);
    return individual.length ? individual : rows;
}

/** 브랜드 홈 */
exports.getHome = async (req, res) => {
    try {
        const mallId = req.mallId || 1;
        const sort = ['count', 'popular', 'name', 'new'].includes(req.query.sort) ? req.query.sort : 'count';
        const initial = INITIAL_BUCKETS.includes(req.query.initial) ? req.query.initial : null;
        const page = Number(req.query.page) || 1;

        const rootCategories = await brandSvc.getRootCategories(mallId);
        const activeRoot = Number(req.query.root) || (rootCategories[0]?.id ?? null);

        const [showcase, popular, newBrands, catBrands, weeklyBenefits, listing, initialCounts, likedBrandIds, brandBanners] =
            await Promise.all([
                // 인기 브랜드를 '상품 캐러셀 한 줄'로 보여준다. 로고가 없는 몰2에서도 화면이 채워진다.
                brandSvc.getShowcaseBrands(mallId, { limit: 6, perBrand: 10, hasUser: !!req.user }),
                brandSvc.getPopular(mallId, 12),
                brandSvc.getNewBrands(mallId, 6),
                activeRoot ? brandSvc.getBrandsByRootCategory(mallId, activeRoot, 12) : [],
                benefitSvc.getWeeklyBenefits(mallId, 10), // 슬라이더라 6개보다 넉넉히
                brandSvc.listBrands(mallId, { initial, sort, page }),
                brandSvc.getInitialCounts(mallId),
                brandSvc.getLikedBrandIds(req.user?.id),
                // 전체 공통 브랜드 배너 — 브랜드 목록 상단에도 노출한다(대상 브랜드가 없으니 공통만).
                loadBrandBanners(mallId)
            ]);

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';

        res.render('user/brands/home', {
            title: '브랜드',
            brandBanners,
            showcase,
            popular, newBrands, rootCategories, activeRoot, catBrands, weeklyBenefits,
            listing,
            initialBuckets: INITIAL_BUCKETS,
            initialCounts: Object.fromEntries(initialCounts),
            filters: { initial, sort },
            likedBrandIds,
            currentUser: req.user || null,
            seo: {
                ...res.locals.seo,
                title: `브랜드 | ${companyName}`,
                description: `${companyName} 입점 브랜드를 검색하고 브랜드별 상품·신상품·베스트·혜택을 확인하세요.`,
                url: `${domainOf()}/brands`,
                robots: 'index,follow'
            }
        });
    } catch (err) {
        console.error('[brands] 홈 렌더 실패', err);
        res.status(500).send('Server Error');
    }
};

/** 브랜드 검색 자동완성 (JSON) */
exports.searchJson = async (req, res) => {
    try {
        const mallId = req.mallId || 1;
        const brands = await brandSvc.searchBrands(mallId, req.query.q, 10);
        res.json({ brands });
    } catch (err) {
        console.error('[brands] 검색 실패', err);
        res.status(500).json({ brands: [] });
    }
};

/** 브랜드 상세관 */
exports.getDetail = async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const brandId = Number(req.params.brandId);
        if (!brandId) return next();

        const brand = await brandSvc.getBrand(mallId, brandId);
        if (!brand) return next(); // 404 핸들러로

        const hasUser = !!req.user;
        const tab = ['home', 'best', 'new', 'all', 'benefit'].includes(req.query.tab) ? req.query.tab : 'home';
        const cat = Number(req.query.cat) || null;
        const sort = ['new', 'popular', 'low', 'high'].includes(req.query.sort) ? req.query.sort : 'new';
        const page = Number(req.query.page) || 1;

        // 홈 탭은 요약이라 모든 블록이 필요하다. 개별 탭은 자기 데이터만 있으면 된다.
        const needBest = tab === 'home' || tab === 'best';
        const needNew = tab === 'home' || tab === 'new';
        const needList = tab === 'all' || (tab === 'home' && brand.product_count <= 3);

        /*
         * 필터(facet). 브랜드관에서는 **카테고리가 1급 필터**다 — 브랜드 하나가 최대 11개
         * 1뎁스에 걸쳐 있어(오너클랜), 카테고리를 좁히기 전에는 속성 필터를 부여할 수 없다.
         * 그래서 cat 이 선택됐을 때만 그 카테고리의 필터를 해석한다.
         * 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §5.1
         *
         * ⚠ 브랜드 목록 쿼리는 products 를 `p` 로 별칭하므로 alias 를 넘겨야 한다.
         */
        let facetDefs = [];
        let facetPredicate = null;
        try {
            const all = await facetService.getFacetsForCategory(cat);
            const fp = facetService.buildPredicates(all, req.query, { alias: 'p' });
            if (fp.sql) facetPredicate = fp;
            const availability = await facetService.getAttributeAvailability(mallId);
            facetDefs = facetService.pruneUnavailable(all, availability);
        } catch (e) {
            console.error('[brand] 필터 해석 실패 — 필터 없이 진행합니다.', e);
        }

        const [benefits, bestRes, newRes, listing, categories, related, likedBrandIds] = await Promise.all([
            benefitSvc.getBrandBenefits(mallId, brandId),
            needBest ? brandSvc.getBrandBest(mallId, brandId, { hasUser, limit: tab === 'best' ? 30 : 6 })
                     : Promise.resolve({ products: [] }),
            needNew ? brandSvc.getBrandProducts(mallId, brandId, { hasUser, sort: 'new', size: tab === 'new' ? 40 : 6 })
                    : Promise.resolve({ products: [] }),
            needList ? brandSvc.getBrandProducts(mallId, brandId, { hasUser, catId: cat, sort, page, facet: facetPredicate })
                     : Promise.resolve({ products: [], total: 0, page: 1, pages: 1 }),
            brandSvc.getBrandCategories(mallId, brandId),
            brandSvc.getRelatedBrands(mallId, brandId, 6),
            brandSvc.getLikedBrandIds(req.user?.id)
        ]);

        // 관리자 '브랜드 배너' — 상세관 최상단. 개별 배너 우선, 없으면 전체 공통(loadBrandBanners).
        // 예전엔 LIMIT 1 이라 여러 건을 등록해도 한 장만 나왔다 — 카테고리 배너와 달리 슬라이드쇼가 안 됐다.
        const brandBanners = await loadBrandBanners(mallId, brandId);

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';

        res.render('user/brands/detail', {
            title: brand.name,
            brand,
            brandBanners,
            tab,
            benefits,
            best: bestRes.products,
            newProducts: newRes.products,
            listing,
            categories,
            related,
            likedBrandIds,
            isLiked: likedBrandIds.map(Number).includes(brandId),
            filters: { cat, sort },
            facets: facetDefs,
            currentQuery: Object.assign({}, req.query),
            currentUser: req.user || null,
            seo: {
                ...res.locals.seo,
                title: brand.seo_title || `${brand.name} | ${companyName}`,
                description: brand.seo_description || brand.tagline ||
                    `${brand.name} 브랜드의 상품 ${Number(brand.product_count || 0).toLocaleString()}개를 확인하세요.`,
                url: `${domainOf()}/brands/${brand.id}`,
                image: brand.logo_image_path || brand.hero_image_url || res.locals.seo?.image,
                robots: 'index,follow'
            }
        });
    } catch (err) {
        console.error('[brands] 상세 렌더 실패', err);
        res.status(500).send('Server Error');
    }
};
