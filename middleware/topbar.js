const { getTopbar } = require('../services/display/topbarService');

/*
 * 헤더 톱바 주입 — res.locals.topbar = { notice, banners[], version } | null
 *
 * 스토어프론트 헤더 파셜이 소비한다. 콘텐츠가 하나도 없으면 null 이고, 그때 바는 렌더되지 않는다.
 * 관리자 화면은 이 헤더를 쓰지 않으므로 쿼리 자체를 건너뛴다.
 *
 * mallContext 뒤에 마운트한다 — req.mallId 를 신뢰한다.
 */
module.exports = async (req, res, next) => {
    if (req.path.startsWith('/admin')) {
        res.locals.topbar = null;
        return next();
    }
    try {
        res.locals.topbar = await getTopbar(req.mallId || 1);
    } catch (err) {
        // 톱바는 부가 요소다. 조회가 실패해도(예: 마이그레이션 전) 페이지는 떠야 한다.
        console.error('[topbar] 조회 실패:', err.message);
        res.locals.topbar = null;
    }
    next();
};
