const bestRankingService = require('../services/best/bestRankingService');

/*
 * 섹션 AJAX 부분 렌더 컨트롤러 (CT-3)
 *
 * 스토어프론트 섹션이 무새로고침으로 데이터만 갱신할 때 쓰는 JSON 엔드포인트.
 */

const MAX_LIMIT = 20;

/**
 * GET /sections/ranking?groupId=&period=&limit=
 * 랭킹 탭 전환용 (ranking_tabs 섹션)
 *
 * 순위를 여기서 계산하지 않는다. 배치가 만든 스냅샷(best_ranking)을 읽고 핀을 얹을 뿐이다.
 * SSR 첫 탭(resolvers/ranking_tabs)과 **같은 함수**를 부르므로 둘이 어긋날 수 없다.
 *
 * 예전에는 여기서 view_count 를 직접 정렬했고, sort=sales 는 조회수와 같은 SQL 로 매핑된
 * 죽은 옵션이었다. 순위 기준은 이제 best_score_config 에 단일 정의된다.
 *
 * groupId 는 요청에서 받지만 **몰 스코프로 검증**한다 — 남의 몰 랭킹 탭을 조회할 수 없다.
 */
exports.getRanking = async (req, res) => {
    try {
        const mallId = req.mallId || 1;
        const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), MAX_LIMIT);
        const period = bestRankingService.normalizePeriod(req.query.period);

        const groups = await bestRankingService.getGroups(mallId);
        const requested = Number(req.query.groupId) || 0;
        const group = groups.find(g => g.id === requested);
        if (!group) {
            return res.status(404).json({ success: false, message: '랭킹 탭을 찾을 수 없습니다.', products: [] });
        }

        const { products } = await bestRankingService.getRanking({
            mallId,
            groupId: group.id,
            period,
            hasUser: !!req.user,
            limit,
        });

        res.json({ success: true, products });
    } catch (err) {
        console.error('[sections] getRanking 오류:', err.message);
        res.status(500).json({ success: false, message: '상품을 불러오지 못했습니다.', products: [] });
    }
};
