const { isIndexingAllowed, BLOCK_DIRECTIVE } = require('../config/indexingPolicy');

module.exports = (req, res, next) => {
    const siteSettings = res.locals.siteSettings || {};
    const companyName = siteSettings.company_name || '와이디몰';
    const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

    // canonical URL (쿼리 파라미터 제외)
    const canonicalUrl = domain + req.path;

    // 색인 차단 중에는 컨트롤러가 seo.robots 를 index,follow 로 덮어써도
    // 레이아웃이 이 플래그를 보고 무시한다(뷰에서 최종 강제).
    const blockIndexing = !isIndexingAllowed();
    res.locals.blockIndexing = blockIndexing;

    const robots = blockIndexing ? BLOCK_DIRECTIVE : 'index,follow';

    // 기본 OG 이미지
    const ogImageSource = siteSettings.kakao_share_image_url || siteSettings.logo_url;
    const defaultImage = ogImageSource
        ? (ogImageSource.startsWith('http') ? ogImageSource : domain + ogImageSource)
        : '';

    res.locals.seo = {
        title: `${companyName} | 건강식품 전문 쇼핑몰`,
        description: `${companyName} - 검증된 품질의 건강식품을 합리적인 가격으로 만나보세요.`,
        url: canonicalUrl,
        image: defaultImage,
        type: 'website',
        siteName: companyName,
        robots: robots,
        jsonLd: null
    };

    next();
};
