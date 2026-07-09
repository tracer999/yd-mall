const pool = require('../config/db');

function buildSeo(res, pageTitle, pagePath, description) {
    const siteSettings = res.locals.siteSettings || {};
    const companyName = siteSettings.company_name || '와이디몰';
    const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');
    return {
        title: `${pageTitle} | ${companyName}`,
        description: description,
        url: `${domain}${pagePath}`,
        image: '',
        type: 'website',
        siteName: companyName,
        robots: 'index,follow',
        jsonLd: null
    };
}

exports.getTerms = async (req, res) => {
    res.render('user/terms', {
        title: '이용약관',
        seo: buildSeo(res, '이용약관', '/terms', '와이디몰 이용약관 안내 페이지입니다.')
    });
};

exports.getPrivacy = async (req, res) => {
    res.render('user/privacy', {
        title: '개인정보 처리방침',
        seo: buildSeo(res, '개인정보 처리방침', '/privacy', '와이디몰 개인정보 처리방침 안내 페이지입니다.')
    });
};

exports.getAbout = async (req, res) => {
    res.render('user/about', {
        title: '회사 소개',
        seo: buildSeo(res, '회사 소개', '/about', '와이디몰 회사 소개 - 검증된 품질의 건강식품 전문 쇼핑몰입니다.')
    });
};

exports.getGuide = async (req, res) => {
    res.render('user/guide', {
        title: '이용안내',
        seo: buildSeo(res, '이용안내', '/guide', '와이디몰 이용안내 - 주문, 배송, 결제, 반품 안내를 확인하세요.')
    });
};
