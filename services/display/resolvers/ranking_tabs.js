const bestRankingService = require('../../best/bestRankingService');

/*
 * ranking_tabs — 랭킹 탭 (홈)
 *
 * 예전에는 `products.view_count` 를 직접 정렬했다. 그래서 같은 홈 화면에서
 * 위쪽 베스트(랭킹 엔진)와 아래쪽 랭킹 탭(조회수)이 **서로 다른 순위**를 보여줬다.
 * 지금은 둘 다 같은 스냅샷(best_ranking)을 읽는다 — 랭킹은 한 곳에서만 정의된다.
 *
 * 옛 `sort` 옵션(views/sales/newest/discount)은 폐기했다. `sales` 가 조회수와 **같은 SQL** 로
 * 매핑돼 있어 "판매순"을 골라도 조회수가 나오는 죽은 옵션이었다. 순위 기준은 이제
 * best_score_config(판매 5 · 좋아요 3 · 조회 0)에 단일 정의돼 있고, 여기서 고르는 건 기간뿐이다.
 *
 * 탭도 카테고리가 아니라 **랭킹 그룹**(전체·카테고리·브랜드)이다. 관리자가
 * /admin/best-groups 에서 정한 탭과 순서를 그대로 쓴다 — GNB /best 와 같은 탭이 나온다.
 *
 * config:
 *   maxTabs   탭 개수 (기본 6). 그룹 순서대로 앞에서부터
 *   rankLimit 탭당 노출 수 (기본 8)
 *   period    REALTIME | DAILY | WEEKLY | MONTHLY (기본 DAILY)
 *
 * 첫 탭만 SSR 하고 나머지는 GET /sections/ranking 으로 가져온다.
 * 특가가는 getRanking() 이 applyDeals 로 이미 입혀 준다.
 */
async function resolve({ shared, config, locals }) {
    const mallId = shared.mallId || 1;
    const maxTabs = Math.min(Number(config.maxTabs) || 6, 12);
    const rankLimit = Math.min(Number(config.rankLimit) || 8, 20);
    const period = bestRankingService.normalizePeriod(config.period);

    const groups = await bestRankingService.getGroups(mallId);
    if (!groups.length) return null;

    const tabs = groups.slice(0, maxTabs).map(g => ({ id: g.id, name: g.name }));

    const { products } = await bestRankingService.getRanking({
        mallId,
        groupId: tabs[0].id,
        period,
        hasUser: shared.hasUser,
        limit: rankLimit,
    });

    // 배치가 한 번도 안 돌았으면 첫 탭이 비어 있다. 빈 그리드를 띄우지 않는다.
    if (!products.length) return null;

    locals.tabs = tabs;
    locals.products = products;
    locals.rankLimit = rankLimit;
    locals.period = period;
    return locals;
}

module.exports = { resolve };
