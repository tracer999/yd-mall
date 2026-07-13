const dealSvc = require('../services/deal/dealService');

/*
 * 쇼핑특가 (docs/사이트개선/shopping_deal_design.md §6.2)
 *
 * 예전 '오늘특가'(/deal/today)는 상품그룹(manual) 하나를 상품목록 컨트롤러로 재사용한
 * 큐레이션 화면이었다. 쇼핑특가는 그것을 대체한다 — **특가 카테고리별 섹션**으로 나뉘고,
 * 각 상품은 기간·시간창·요일·선착순 수량 조건이 모두 맞을 때만 특가가로 노출된다.
 *
 * 활성 판정은 dealService 가 읽는 시점에 한다. 여기서는 조립만 한다.
 */

/**
 * GET /deals            — 전체 (카테고리별 섹션)
 * GET /deals/:code      — 특정 특가 카테고리만
 *
 * 활성 특가가 하나도 없으면 res.locals 에 표시할 게 없으므로 false 를 리턴한다.
 * 라우트가 그때 comingSoon 랜딩으로 폴백한다(빈 화면 방지, dev=prod).
 */
exports.getIndex = async (req, res) => {
    const mallId = req.mallId || 1;
    const code = req.params.code ? String(req.params.code).toUpperCase() : null;

    const categories = await dealSvc.getActiveDealsByCategory(mallId, code);
    const upcoming = await dealSvc.getUpcomingTimeDeals(mallId);

    // 진행 중인 특가도, 오늘 열릴 예정인 타임특가도 없으면 보여줄 게 없다.
    if (categories.length === 0 && upcoming.length === 0) return false;

    // 탭은 코드 지정과 무관하게 항상 전체를 보여준다(다른 카테고리로 이동할 수 있어야 한다).
    const allCategories = code
        ? await dealSvc.getActiveDealsByCategory(mallId)
        : categories;

    res.render('user/deals/index', {
        title: '쇼핑특가',
        pageTitle: '쇼핑특가',
        categories,
        upcoming,
        tabs: allCategories.map((c) => ({
            code: c.code, name: c.name, count: c.products.length,
        })),
        activeCode: code,
        menuKey: 'DEAL',
    });
    return true;
};
