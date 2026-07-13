const pool = require('../config/db');
const displayService = require('../services/display/displayService');
const dealSvc = require('../services/deal/dealService');

// 카카오채널 URL 정규화 (siteSettings 기반)
function computeKakaoUrl(siteSettings) {
    let kakaoUrl = '#';
    if (siteSettings && siteSettings.kakao_channel_enabled && siteSettings.kakao_channel_url) {
        const raw = String(siteSettings.kakao_channel_url).trim();
        if (/^https?:\/\//i.test(raw)) kakaoUrl = raw;
        else if (raw.startsWith('/')) kakaoUrl = `https://pf.kakao.com${raw}`;
        else if (raw.startsWith('@')) kakaoUrl = `https://pf.kakao.com/${raw}`;
        else if (raw.startsWith('_')) kakaoUrl = `https://pf.kakao.com/${raw}`;
        else kakaoUrl = `https://pf.kakao.com/_${raw}`;
    }
    return kakaoUrl;
}

/*
 * 홈 렌더 컨텍스트(배너·히어로·SEO·팝업·shared)를 구성한다.
 * 스토어프론트(getHome)와 관리자 미리보기(getHomePreview)가 공유한다.
 * @returns { renderData, shared }  — sections는 호출측에서 주입
 */
async function buildHomeContext(req, res) {
    const hasUser = !!req.user;
    const mallId = req.mallId || 1; // P5 몰 스코프

    // 1. 메인 상단 배너 (MAIN 타입만)
    const [banners] = await pool.query(
        "SELECT * FROM banners WHERE is_active = 1 AND banner_type = 'MAIN' ORDER BY display_order ASC, id ASC"
    );
    const heroBanners = (banners || []).slice(0, 6);
    const mobileHeroBanners = heroBanners.filter(b => !!b.mobile_image_url);

    // 1-b. 히어로 변형 결정 (full_banner | product_showcase)
    const _settings = res.locals.siteSettings || {};
    const heroVariant = (req.query.hero || _settings.hero_variant || 'full_banner');
    let heroMainSlides = [];
    let heroFeature = null;
    if (heroVariant === 'product_showcase') {
        const [slides] = await pool.query(`
            SELECT hs.id, hs.slot, hs.label, hs.headline, hs.image_url, hs.link_url, hs.sort_order,
                   p.id AS product_id, p.name AS product_name, p.slug, p.main_image,
                   p.price, p.original_price, p.discount_rate, p.status, p.stock, p.provider
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.is_active = 1 AND hs.mall_id = ?
            ORDER BY hs.slot ASC, hs.sort_order ASC, hs.id ASC
        `, [mallId]);
        // 히어로에 물린 상품도 특가가로 노출한다 (상품 미연결 슬라이드는 applyDeals 가 건너뛴다).
        await dealSvc.applyDeals(slides, { idKey: 'product_id' });
        heroMainSlides = slides.filter(s => s.slot === 'MAIN');
        heroFeature = slides.find(s => s.slot === 'FEATURE') || null;
    }

    // 5. 팝업 배너
    const [popupBannerRows] = await pool.query(`
        SELECT * FROM banners
        WHERE is_active = 1
          AND banner_type = 'POPUP'
          AND (start_date IS NULL OR start_date <= CURDATE())
          AND (end_date IS NULL OR end_date >= CURDATE())
        ORDER BY display_order ASC, id ASC
        LIMIT 1
    `);
    const popupBanner = popupBannerRows && popupBannerRows.length > 0 ? popupBannerRows[0] : null;

    const siteSettings = res.locals.siteSettings || {};
    const companyName = siteSettings.company_name || '와이디몰';
    const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

    const _ogImgRaw = siteSettings.kakao_share_image_url || siteSettings.logo_url || '';
    const _ogImg = _ogImgRaw ? (_ogImgRaw.startsWith('http') ? _ogImgRaw : domain + _ogImgRaw) : '';
    const seo = {
        title: siteSettings.header_slogan || `${companyName} | 건강식품 전문 쇼핑몰`,
        description: siteSettings.header_slogan || `${companyName} - 검증된 품질의 건강식품을 합리적인 가격으로 만나보세요.`,
        url: domain + '/',
        image: _ogImg,
        type: 'website',
        siteName: companyName,
        robots: 'index,follow',
        jsonLd: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: companyName,
            url: domain + '/',
            potentialAction: {
                '@type': 'SearchAction',
                target: { '@type': 'EntryPoint', urlTemplate: domain + '/search?q={search_term_string}' },
                'query-input': 'required name=search_term_string'
            }
        }, null, 2)
    };

    const shared = {
        hasUser,
        mallId, // P5 — 리졸버·홈 섹션이 몰 스코프로 조회하도록
        // 리졸버가 사용자별 데이터(최근 본 상품 등)를 조회할 때 필요 (CT-8)
        userId: (req.user && req.user.id) || null,
        kakaoUrl: computeKakaoUrl(siteSettings),
        heroData: {
            variant: heroVariant,
            heroMainSlides,
            heroFeature,
            heroBanners,
            mobileHeroBanners
        }
    };

    return { shared, renderData: { title: '홈', popupBanner, seo } };
}

// 페이지 빌더의 섹션 단건 미리보기가 같은 shared 로 리졸버를 돌리기 위해 공개한다.
// (미리보기가 홈과 다른 shared 를 쓰면 "실제로 어떻게 보이는지"를 못 답한다)
exports.buildHomeContext = buildHomeContext;

exports.getHome = async (req, res) => {
    try {
        const { shared, renderData } = await buildHomeContext(req, res);
        const page = await displayService.getHomePage(req.mallId || 1);
        const sections = await displayService.getHomeSections(shared);
        res.render('user/index', Object.assign({
            sections: sections || [],
            layoutType: (page && page.layout_type) || 'main_basic'
        }, renderData));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 관리자 미리보기: 라이브 page_section(작업본) 기준 draft 렌더 (발행 전 확인용)
exports.getHomePreview = async (req, res) => {
    try {
        const builder = require('../services/display/pageBuilderService');
        // 미리보기는 "편집 중인 몰"(adminMallId)의 작업본을 렌더해야 한다.
        // req.mallId 를 편집 몰로 맞춰야 히어로·상품 리졸버가 같은 몰로 스코프된다.
        req.mallId = req.adminMallId || req.mallId || 1;

        // 헤더 GNB 는 menuData 미들웨어가 **이 시점보다 먼저** 기본 몰 기준으로 실어 놨다.
        // 편집 몰로 다시 조립하지 않으면 섹션은 종합관, 헤더는 건강식품관이 되는 어긋남이 난다.
        await require('../middleware/menuData').applyNavigation(req, res, req.mallId);

        // 빌더가 홈 외 페이지(랜딩)도 편집하므로 ?page= 를 받는다.
        // 몰 스코프 검증(getPage)은 필수 — 안 하면 남의 몰 페이지를 미리 볼 수 있다.
        const requested = Number(req.query.page) || 0;
        const page = requested
            ? await builder.getPage(requested, req.mallId)
            : await builder.getHomePage(req.mallId); // status 무필터 → 미발행 draft 도 잡는다

        if (!page) return res.status(404).send('페이지를 찾을 수 없습니다.');

        // 미리보기는 **항상 라이브 page_section(작업본)** 을 본다. 발행 스냅샷이 아니다.
        // 그게 "발행 전에 확인한다"의 의미다.
        const { shared, renderData } = await buildHomeContext(req, res);
        const sections = await displayService.getDraftSections(page.id, shared);

        // 홈과 랜딩은 템플릿이 다르다. 스토어프론트가 쓰는 것과 같은 템플릿으로 그려야
        // 미리보기가 실제와 어긋나지 않는다(routes/feature.js 의 /new 와 같은 계약).
        if (page.page_type !== 'home') {
            return res.render('user/landing', {
                page,
                sections: sections || [],
                pageTitle: page.title || '랜딩',
                isPreview: true,
            });
        }

        res.render('user/index', Object.assign({
            sections: sections || [],
            isPreview: true,
            layoutType: page.layout_type || 'main_basic'
        }, renderData));
    } catch (err) {
        console.error(err);
        res.status(500).send('미리보기 렌더 오류');
    }
};
