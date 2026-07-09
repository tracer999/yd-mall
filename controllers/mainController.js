const pool = require('../config/db');
const displayService = require('../services/display/displayService');

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
    let lnbCategories = [];
    if (heroVariant === 'product_showcase') {
        const [slides] = await pool.query(`
            SELECT hs.id, hs.slot, hs.label, hs.headline, hs.image_url, hs.link_url, hs.sort_order,
                   p.id AS product_id, p.name AS product_name, p.slug, p.main_image,
                   p.price, p.original_price, p.discount_rate, p.status, p.stock, p.provider
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.is_active = 1 AND hs.mall_id = 1
            ORDER BY hs.slot ASC, hs.sort_order ASC, hs.id ASC
        `);
        heroMainSlides = slides.filter(s => s.slot === 'MAIN');
        heroFeature = slides.find(s => s.slot === 'FEATURE') || null;
        [lnbCategories] = await pool.query(
            "SELECT id, name FROM categories WHERE type = 'NORMAL' AND parent_id IS NULL ORDER BY display_order ASC, id ASC"
        );
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
        kakaoUrl: computeKakaoUrl(siteSettings),
        heroData: {
            variant: heroVariant,
            heroMainSlides,
            heroFeature,
            lnbCategories,
            heroBanners,
            mobileHeroBanners
        }
    };

    return { shared, renderData: { title: '홈', popupBanner, seo } };
}

exports.getHome = async (req, res) => {
    try {
        const { shared, renderData } = await buildHomeContext(req, res);
        const page = await displayService.getHomePage();
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
        const displayService = require('../services/display/displayService');
        const page = await displayService.getHomePage();
        const { shared, renderData } = await buildHomeContext(req, res);
        const sections = page ? await displayService.getDraftSections(page.id, shared) : [];
        res.render('user/index', Object.assign({
            sections: sections || [],
            isPreview: true,
            layoutType: (page && page.layout_type) || 'main_basic'
        }, renderData));
    } catch (err) {
        console.error(err);
        res.status(500).send('미리보기 렌더 오류');
    }
};

// AJAX: 카테고리별 상품 목록 (탭 전환용)
exports.getCategoryProducts = async (req, res) => {
    try {
        const categoryId = parseInt(req.query.category_id, 10);
        if (!categoryId) return res.json({ products: [] });

        const vFilter = req.user
            ? "p.visibility IN ('PUBLIC','MEMBER_ONLY')"
            : "p.visibility = 'PUBLIC'";

        const [[catCfg]] = await pool.query(
            "SELECT max_count FROM main_display_sections WHERE section_key = 'category'"
        );
        const limit = (catCfg && catCfg.max_count) || 8;

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                   p.discount_rate,
                   p.status, p.stock, p.provider,
                   p.product_badge, p.distribution_badge
            FROM products p
            WHERE p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND ${vFilter} AND p.category_id = ?
            ORDER BY FIELD(p.status,'ON','COMING_SOON','RESTOCK','SOLD_OUT','OFF'), p.created_at DESC LIMIT ?
        `, [categoryId, limit]);

        res.json({ products });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
};
