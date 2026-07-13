const menuShowcaseService = require('../services/menu/menuShowcaseService');

/*
 * 메뉴 쇼케이스 주입 미들웨어.
 *
 * 요청 경로가 GNB 메뉴(feature_menu.default_path)에 해당하면 그 메뉴의 쇼케이스
 * (상품 캐러셀 또는 배너 슬라이드)를 res.locals.menuShowcase 에 실어준다.
 * 실제 렌더는 main_layout 이 <%- body %> 위에서 한다 — 컨트롤러는 건드리지 않는다.
 *
 * 매칭되지 않는 경로(홈·상세·마이페이지 등)에서는 DB 를 치지 않는다(경로 맵은 프로세스 캐시).
 */
module.exports = async function menuShowcase(req, res, next) {
    // 조회 요청의 전체 페이지 렌더에만 붙인다. 부분 렌더(/best/tab 등)는 레이아웃을 타지 않아
    // res.locals 를 실어도 무해하지만, 불필요한 쿼리를 아끼려고 여기서 걸러낸다.
    if (req.method !== 'GET' || req.xhr) return next();

    try {
        res.locals.menuShowcase = await menuShowcaseService.getForPath(req.path, {
            mallId: req.mallId || 1,
            hasUser: !!req.user,
        });
    } catch (err) {
        // 쇼케이스는 부가 요소다 — 실패해도 페이지 자체는 떠야 한다.
        console.error('[menuShowcase]', err.message);
        res.locals.menuShowcase = null;
    }
    next();
};
