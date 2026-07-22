const bestRankingService = require('../services/best/bestRankingService');
const landingSections = require('../services/catalog/landingSections');

/*
 * 베스트/랭킹 (고객)
 *
 * 화면 구조 (2026-07-22 개편)
 *   [쇼케이스]        상단 배너·상품 캐러셀 — 이 컨트롤러가 아니라 middleware/menuShowcase 가 주입한다
 *   [BEST 10]         전체 랭킹 상위 10 + 순위 번호. 기간 탭(실시간·일간·주간·월간)만 붙는다
 *   [카테고리별 BEST] 카테고리마다 한 줄, 줄당 최대 10개
 *   [브랜드별 BEST]   브랜드마다 한 줄, 줄당 최대 10개
 *
 * 예전에는 그룹 탭(전체·카테고리·브랜드)으로 한 화면에서 갈아끼웠다. 탭을 눌러야만 다른
 * 카테고리가 보이니 스크롤만으로는 아무것도 알 수 없었고, 탭 목록이 곧 `best_group` 이라
 * **운영자가 그룹을 만들어 두지 않은 몰(= 갓 찍어낸 몰)에는 '전체' 하나뿐**이었다.
 * 지금은 카테고리·브랜드를 조회 시점에 파생하므로 설정 없이도 화면이 채워진다.
 *
 * 성별·나이 세그먼트 셀렉트도 걷어냈다. 배치가 ('ALL','ALL') 조합만 채워서 늘 비활성이었다.
 * 스키마(best_ranking.gender·age_band)와 배치는 그대로 살아 있으니, 세그먼트를 켤 때
 * 다시 붙이면 된다.
 *
 * BEST 10 데이터는 배치가 만든 스냅샷(best_ranking)에서 읽는다. 여기서 점수를 계산하지 않는다.
 * 반면 카테고리별·브랜드별은 스냅샷에 없으므로 조회 시점에 계산한다(landingSections 주석 참고).
 */

/** BEST 10 — 이름 그대로 10개. 더 있으면 전체 랭킹(/best/all)으로 넘긴다 */
const TOP_LIMIT = 10;

/** 전체 랭킹 화면에서 한 번에 보여줄 최대 순위 */
const ALL_LIMIT = 100;

/** 랭킹 그룹 중 '전체'. 없으면 첫 그룹으로 폴백한다(그룹이 0개면 null) */
function pickAllGroup(groups) {
    return groups.find(g => g.group_type === 'ALL') || groups[0] || null;
}

/** BEST 10 슬롯을 채운다. 그룹이 하나도 없으면 빈 결과(화면은 카테고리·브랜드 줄만 렌더) */
async function loadTop({ mallId, hasUser, period, limit }) {
    const groups = await bestRankingService.getGroups(mallId);
    const group = pickAllGroup(groups);
    if (!group) return { products: [], calculatedAt: null, isEmpty: true, hasMore: false };

    // limit + 1 건을 읽어 "더 있는지"를 판정한다 (COUNT 쿼리를 따로 쏘지 않는다)
    const { products, calculatedAt } = await bestRankingService.getRanking({
        mallId, groupId: group.id, period, hasUser, limit: limit + 1,
    });
    const hasMore = products.length > limit;
    const sliced = hasMore ? products.slice(0, limit) : products;
    return { products: sliced, calculatedAt, isEmpty: sliced.length === 0, hasMore };
}

/** GET /best — 베스트/랭킹 */
async function getIndex(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const hasUser = !!req.user;
        const period = bestRankingService.normalizePeriod(req.query.period);

        const [top, categoryRows, brandRows] = await Promise.all([
            loadTop({ mallId, hasUser, period, limit: TOP_LIMIT }),
            landingSections.getCategoryRows(mallId, { hasUser, mode: 'best' }),
            landingSections.getBrandRows(mallId, { hasUser, mode: 'best' }),
        ]);

        res.render('user/best/index', {
            title: '베스트/랭킹',
            period,
            periods: bestRankingService.PERIODS,
            top,
            topLimit: TOP_LIMIT,
            categoryRows,
            brandRows,
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
 * GET /best/tab — BEST 10 부분 렌더(AJAX)
 * 기간 탭을 바꿀 때 아래 카테고리·브랜드 줄까지 다시 그리지 않는다(그 줄들은 기간과 무관하다).
 */
async function getTab(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const period = bestRankingService.normalizePeriod(req.query.period);
        const limit = String(req.query.scope) === 'all' ? ALL_LIMIT : TOP_LIMIT;

        const top = await loadTop({ mallId, hasUser: !!req.user, period, limit });

        res.render('user/best/_ranking_list', {
            layout: false,
            products: top.products,
            calculatedAt: top.calculatedAt,
            isEmpty: top.isEmpty,
        });
    } catch (e) {
        next(e);
    }
}

/**
 * GET /best/all — 전체 랭킹 (BEST 10 의 [더보기])
 * 같은 스냅샷을 100위까지 펼쳐 보여준다. 기간 탭은 같고, 카테고리·브랜드 줄은 없다.
 */
async function getAll(req, res, next) {
    try {
        const mallId = req.mallId || 1;
        const period = bestRankingService.normalizePeriod(req.query.period);
        const top = await loadTop({ mallId, hasUser: !!req.user, period, limit: ALL_LIMIT });

        res.render('user/best/all', {
            title: '전체 랭킹',
            period,
            periods: bestRankingService.PERIODS,
            top,
            seo: Object.assign({}, res.locals.seo, {
                title: '전체 랭킹',
                description: '판매·좋아요를 합산한 인기 상품 전체 순위입니다.',
            }),
        });
    } catch (e) {
        next(e);
    }
}

module.exports = { getIndex, getTab, getAll };
