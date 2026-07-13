const pool = require('../config/db');
const bestRankingService = require('../services/best/bestRankingService');
const bannerService = require('../services/display/bannerService');

/*
 * 베스트/랭킹 (고객)
 *
 * productController.getList 를 재사용하지 않는다. 목록형 화면과 계약이 다르다:
 *   - 순위 번호(1..N)와 "N시 기준" 산출 시각이 화면의 본질이다
 *   - 그룹 탭 × 기간 탭 × 세그먼트 필터가 상태를 이룬다
 *   - 페이지네이션이 없다(rank_limit 까지 한 화면)
 * getList 에 이걸 다 밀어넣으면 두 화면이 서로를 망가뜨린다.
 *
 * 데이터는 배치가 만든 스냅샷(best_ranking)에서 읽는다. 여기서 점수를 계산하지 않는다.
 */

const SEGMENT_AGE_BANDS = ['10', '20', '30', '40', '50', '60'];

/**
 * 세그먼트(성별·나이대) 필터를 쓸 수 있는가?
 *
 * users 에 성별이 없어서 현재 배치는 ('ALL','ALL') 만 채운다. 그래서 필터를 켜면
 * 무조건 빈 랭킹이 나온다 — UI 는 만들되 **비활성**으로 렌더하고, 배치가 세그먼트
 * 행을 채우기 시작하면 저절로 켜진다. 플래그를 코드에 박지 않는 이유다.
 */
async function segmentsAvailable(mallId) {
    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS c FROM best_ranking
          WHERE mall_id = ? AND (gender <> 'ALL' OR age_band <> 'ALL') LIMIT 1`,
        [mallId]
    );
    return Number(row.c) > 0;
}

/** GET /best — 베스트/랭킹 */
async function getIndex(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const hasUser = !!req.user;

        const groups = await bestRankingService.getGroups(mallId);
        if (!groups.length) {
            // 그룹이 하나도 없으면 보여줄 탭이 없다. 준비중 랜딩으로 되돌린다.
            return res.redirect('/products?sort=best');
        }

        const period = bestRankingService.normalizePeriod(req.query.period);
        const requested = Number(req.query.group) || 0;
        const group = groups.find(g => g.id === requested) || groups[0];

        const segOk = await segmentsAvailable(mallId);
        const gender = segOk && ['M', 'F'].includes(req.query.gender) ? req.query.gender : 'ALL';
        const ageBand = segOk && SEGMENT_AGE_BANDS.includes(req.query.age) ? req.query.age : 'ALL';

        const { products, calculatedAt, isEmpty } = await bestRankingService.getRanking({
            mallId, groupId: group.id, period, hasUser, gender, ageBand, limit: 100,
        });

        const banners = await bannerService.getByGroup('menu:BEST', { limit: 5 });

        res.render('user/best/index', {
            title: '베스트/랭킹',
            groups,
            group,
            period,
            periods: bestRankingService.PERIODS,
            products,
            calculatedAt,
            isEmpty,
            banners,
            segmentsEnabled: segOk,
            gender,
            ageBand,
            ageBands: SEGMENT_AGE_BANDS,
            seo: Object.assign({}, res.locals.seo, {
                title: '베스트/랭킹',
                description: '판매·좋아요를 합산한 인기 상품 순위입니다.',
            }),
        });
    } catch (e) {
        next(e);
    }
}

/**
 * GET /best/tab — 탭 전환용 부분 렌더(AJAX)
 * 그룹·기간을 바꿀 때 전체 페이지를 다시 그리지 않는다.
 */
async function getTab(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const hasUser = !!req.user;

        const groups = await bestRankingService.getGroups(mallId);
        const requested = Number(req.query.group) || 0;
        const group = groups.find(g => g.id === requested) || groups[0];
        if (!group) return res.status(404).json({ error: 'no group' });

        const period = bestRankingService.normalizePeriod(req.query.period);
        const segOk = await segmentsAvailable(mallId);
        const gender = segOk && ['M', 'F'].includes(req.query.gender) ? req.query.gender : 'ALL';
        const ageBand = segOk && SEGMENT_AGE_BANDS.includes(req.query.age) ? req.query.age : 'ALL';

        const { products, calculatedAt, isEmpty } = await bestRankingService.getRanking({
            mallId, groupId: group.id, period, hasUser, gender, ageBand, limit: 100,
        });

        res.render('user/best/_ranking_list', {
            layout: false,
            products,
            calculatedAt,
            isEmpty,
        });
    } catch (e) {
        next(e);
    }
}

module.exports = { getIndex, getTab };
