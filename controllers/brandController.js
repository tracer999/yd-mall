const brandSvc = require('../services/brand/brandService');
const benefitSvc = require('../services/brand/benefitService');
const { INITIAL_BUCKETS } = require('../shared/hangul');

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

/** 브랜드 홈 */
exports.getHome = async (req, res) => {
    try {
        const mallId = req.mallId || 1;
        const sort = ['count', 'popular', 'name', 'new'].includes(req.query.sort) ? req.query.sort : 'count';
        const initial = INITIAL_BUCKETS.includes(req.query.initial) ? req.query.initial : null;
        const page = Number(req.query.page) || 1;

        const rootCategories = await brandSvc.getRootCategories(mallId);
        const activeRoot = Number(req.query.root) || (rootCategories[0]?.id ?? null);

        const [showcase, popular, newBrands, catBrands, weeklyBenefits, listing, initialCounts, likedBrandIds] =
            await Promise.all([
                // 인기 브랜드를 '상품 캐러셀 한 줄'로 보여준다. 로고가 없는 몰2에서도 화면이 채워진다.
                brandSvc.getShowcaseBrands(mallId, { limit: 6, perBrand: 10, hasUser: !!req.user }),
                brandSvc.getPopular(mallId, 12),
                brandSvc.getNewBrands(mallId, 6),
                activeRoot ? brandSvc.getBrandsByRootCategory(mallId, activeRoot, 12) : [],
                benefitSvc.getWeeklyBenefits(mallId, 10), // 슬라이더라 6개보다 넉넉히
                brandSvc.listBrands(mallId, { initial, sort, page }),
                brandSvc.getInitialCounts(mallId),
                brandSvc.getLikedBrandIds(req.user?.id)
            ]);

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';

        res.render('user/brands/home', {
            title: '브랜드',
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

        const [benefits, bestRes, newRes, listing, categories, related, likedBrandIds] = await Promise.all([
            benefitSvc.getBrandBenefits(mallId, brandId),
            needBest ? brandSvc.getBrandBest(mallId, brandId, { hasUser, limit: tab === 'best' ? 30 : 6 })
                     : Promise.resolve({ products: [] }),
            needNew ? brandSvc.getBrandProducts(mallId, brandId, { hasUser, sort: 'new', size: tab === 'new' ? 40 : 6 })
                    : Promise.resolve({ products: [] }),
            needList ? brandSvc.getBrandProducts(mallId, brandId, { hasUser, catId: cat, sort, page })
                     : Promise.resolve({ products: [], total: 0, page: 1, pages: 1 }),
            brandSvc.getBrandCategories(mallId, brandId),
            brandSvc.getRelatedBrands(mallId, brandId, 6),
            brandSvc.getLikedBrandIds(req.user?.id)
        ]);

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';

        res.render('user/brands/detail', {
            title: brand.name,
            brand,
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
