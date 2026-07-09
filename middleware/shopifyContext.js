/**
 * Shopify Markets 컨텍스트 미들웨어
 * 세션에 저장된 국가/언어 설정을 res.locals.shopifyMarket 으로 주입
 * EJS 뷰에서 국가 선택기 렌더링 및 가격 표시에 사용
 */
module.exports = function shopifyContextMiddleware(req, res, next) {
    res.locals.shopifyMarket = {
        country: req.session && req.session.shopifyCountry ? req.session.shopifyCountry : null,
        language: req.session && req.session.shopifyLanguage ? req.session.shopifyLanguage : 'EN',
    };
    next();
};
