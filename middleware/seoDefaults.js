module.exports = (req, res, next) => {
    const siteSettings = res.locals.siteSettings || {};
    const companyName = siteSettings.company_name || '와이디몰';
    const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

    // canonical URL (쿼리 파라미터 제외)
    const canonicalUrl = domain + req.path;

    // 테스트 서버 — 전체 페이지 크롤링 차단
    const robots = 'noindex,nofollow';

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
