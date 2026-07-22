const express = require('express');
const router = express.Router();
const bestController = require('../controllers/bestController');
const newController = require('../controllers/newController');
const dealController = require('../controllers/dealController');
const displayService = require('../services/display/displayService');
const evaluationService = require('../services/membership/evaluationService');

/*
 * 기능 메뉴 표준 URL (M3)
 *
 * feature_menu.default_path 와 1:1 대응한다. 운영자는 이 URL 을 바꿀 수 없고,
 * 관리자에서는 사용 여부(is_enabled)·표시명·순서만 관리한다.
 * (docs/사이트개선/frontend_dev_plan.md §5)
 *
 * 각 메뉴는 전용 컨트롤러가 렌더한다. 예전에는 상품목록(productController.getList)에
 * req.featurePreset 을 심어 재사용했는데, 목록형 화면의 계약(정렬 탭·facet 필터·페이지네이션)이
 * 랜딩형 화면과 맞지 않아 떼어냈다.
 */

/*
 * 베스트/랭킹 — 판매·좋아요를 합산한 자동 순위 + 관리자 수동 고정(MD 픽).
 *
 * 예전에는 '베스트'가 상품그룹(manual) 큐레이션이었다. 지금은 **랭킹 엔진**이다.
 *   - 점수: 판매 × 5 + 좋아요 × 3 + 조회 × 0 (가중치는 best_score_config 에서 조정)
 *   - 배치(scripts/calc_best_ranking.js)가 best_ranking 스냅샷에 산출해 둔다.
 *   - MD 가 미는 상품은 best_pin 으로 얹는다(조회 시점 병합 — 즉시 반영).
 *
 * 목록형 화면(productController.getList)이 아니라 전용 컨트롤러를 쓴다.
 * 순위 번호·기준 시각·그룹×기간 탭은 getList 의 계약에 없다.
 */
router.get('/best', bestController.getIndex);
router.get('/best/all', bestController.getAll);
router.get('/best/tab', bestController.getTab);

/*
 * 신상품 — 기준일(판매 시작일, 없으면 적재일) 100일 이내 + NEW 뱃지 강제 노출.
 *   판정은 services/catalog/newArrival 한 곳에서만 한다.
 *
 * 화면은 [카테고리별 신상품] + [브랜드별 신상품] 두 섹션이다(newController).
 * 예전에는 상품목록(productController.getList)을 재사용해 좌측 facet 필터가 딸려 왔다.
 *
 * ⚠️ 관리자가 페이지 빌더로 만든 SDUI 랜딩(page slug='new')이 있으면 **그쪽이 이긴다**.
 *    운영자가 직접 구성한 화면을 코드가 덮어쓰면 안 된다. 표준 화면으로 되돌리려면
 *    관리자에서 그 페이지를 내리면 된다.
 */
router.get('/new', async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const page = await displayService.getPageBySlug(mallId, 'new');
        if (page) {
            const sections = await displayService.getPageSections(page, {
                mallId,
                hasUser: !!req.user,
            });
            if (sections && sections.length) {
                return res.render('user/landing', {
                    page,
                    sections,
                    pageTitle: page.title || '신상품',
                });
            }
        }
    } catch (e) {
        return next(e);
    }

    // 랜딩 미시드(또는 섹션 0건) → 표준 신상품 화면
    return newController.getIndex(req, res, next);
});

/*
 * 쇼핑특가 (docs/사이트개선/shopping_deal_design.md)
 *
 * 예전 '오늘특가'(/deal/today)는 상품그룹(manual) 하나를 상품목록으로 재사용했다.
 * 쇼핑특가는 그것을 대체한다 — 관리자가 만든 **특가 카테고리**(오늘의특가·타임특가·시즌특가…)
 * 별로 섹션이 나뉘고, 특가는 기간·시간창·요일·선착순 수량 조건이 맞을 때만 특가가로 열린다.
 * 특가가는 노출뿐 아니라 **실제 결제 금액**에 반영된다(dealService).
 *
 * 진행 중인 특가도 오늘 열릴 타임특가도 없으면 준비중 랜딩으로 폴백한다(빈 화면 방지, dev=prod).
 */
async function renderDeals(req, res, next) {
    try {
        const rendered = await dealController.getIndex(req, res);
        if (!rendered) return comingSoon('deals')(req, res);
    } catch (e) {
        return next(e);
    }
}

router.get('/deals', renderDeals);
router.get('/deals/:code', renderDeals);

// 구 URL 보존 — 북마크·외부 링크가 죽지 않게 영구 이전으로 넘긴다.
router.get('/deal/today', (req, res) => res.redirect(301, '/deals'));

// '/event' 는 routes/event.js 가 실제 목록을 렌더한다.
// 예전에는 '/boards/notice'(공지사항) 로 302 했으나, 공지사항은 고객센터(/cs)의 하위 항목이지
// 이벤트가 아니다. 발행된 이벤트가 0건이면 eventController 가 COMING_SOON.event 랜딩으로 되돌린다.

/*
 * 준비중 랜딩 (COMING_SOON)
 *
 * 두 가지 용도가 섞여 있다. 구분해서 읽어야 한다.
 *
 *   1) **모듈이 아예 없는 메뉴** — 멤버십.
 *      GNB 에 노출하되 '#' 죽은 링크 대신 실제 랜딩을 둔다. 검색엔진에는 색인 안 한다(noindex).
 *      - MEMBERSHIP : `users` 에 등급 컬럼이 없다(`points_balance` 뿐).
 *      ⚠️ 라우트를 배포한 **뒤에** `feature_menu.module_ready` 를 1 로 올린다.
 *         (로컬·서버가 같은 DB 라, 먼저 올리면 GNB 에 404 링크가 뜬다)
 *
 *   2) **모듈은 있는데 콘텐츠가 0건인 메뉴** — 기획전 / 공동구매 / 전문관 / 추천 / 쇼핑특가 / 아울렛 /
 *      쿠폰 / **쇼핑라이브**. 각 컨트롤러가 0건일 때 이 랜딩으로 폴백한다.
 *      빈 목록을 보여주지 않기 위한 안전망이다.
 *      - COUPON : 쿠폰존(routes/coupon.js). 다운로드 쿠폰이 0건이면 폴백.
 *      - LIVE   : 쇼핑라이브(routes/live.js, 2026-07-13). 발행된 방송이 0건이면 폴백.
 *                 스트리밍은 우리가 하지 않는다 — YouTube/Vimeo 임베드다.
 *
 * 아울렛은 2번이다. 모듈이 있고(services/outlet, /admin/outlet), 상품이 0건이면 폴백한다.
 * 게다가 navigationService 의 콘텐츠 게이트가 GNB 에서 아예 빼주므로 이 랜딩까지 오는 경로는
 * 직접 URL 접근뿐이다. (설계: docs/사이트개선/outlet_design_and_development.md §4-5)
 *
 * 랭킹은 목록에서 빠졌다 — 베스트가 랭킹 엔진을 흡수해 /ranking 은 /best 로 301 한다.
 */
const COMING_SOON = {
    exhibition: {
        name: '기획전',
        icon: 'bi-stars',
        description: '시즌·브랜드·테마별 기획전을 준비하고 있습니다.<br>곧 특별한 구성으로 찾아뵙겠습니다.',
        bullets: ['시즌 기획전 (설·추석·여름 클리어런스)', '브랜드 위크', '테마별 큐레이션'],
        primary: { label: '쇼핑특가 보러가기', href: '/deals' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    // 공동구매는 모듈이 있다. 이 항목은 **발행된 공동구매가 0건일 때만** 쓰이는 폴백 랜딩이다.
    'group-buy': {
        name: '공동구매',
        icon: 'bi-people-fill',
        description: '진행 중인 공동구매가 없습니다.<br>기간 한정 특가 공동구매를 준비하고 있습니다.',
        bullets: ['기간 한정 공동구매가', '목표 수량 달성률 공개', '참여 수량 실시간 표시'],
        primary: { label: '베스트 상품 보기', href: '/best' },
        secondary: { label: '1:1 문의', href: '/inquiries' },
    },
    live: {
        name: '쇼핑라이브',
        icon: 'bi-broadcast',
        description: '라이브 방송으로 상품을 직접 보고 구매하는 쇼핑라이브를 준비하고 있습니다.',
        bullets: ['실시간 방송 중 특가', '방송 다시보기', '라이브 전용 혜택'],
        primary: { label: '신상품 보기', href: '/new' },
        secondary: { label: '고객센터', href: '/cs' },
    },
    // 랭킹 항목은 삭제했다 — 베스트가 랭킹 엔진을 흡수해 /ranking 은 /best 로 301 한다.
    outlet: {
        name: '아울렛',
        icon: 'bi-tags',
        description: '재고 소진 특가와 시즌오프 상품을 모은 아울렛을 준비하고 있습니다.',
        bullets: ['재고 소진 특가', '시즌오프 할인', '한정 수량 판매'],
        primary: { label: '쇼핑특가 보러가기', href: '/deals' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    coupon: {
        name: '쿠폰',
        icon: 'bi-ticket-perforated',
        description: '받아서 바로 쓰는 다운로드 쿠폰을 준비하고 있습니다.<br>지금은 주문서에서 쿠폰 코드를 입력해 사용할 수 있습니다.',
        bullets: ['다운로드 즉시 적용', 'brand·카테고리 전용 쿠폰', '신규 가입·재구매 혜택'],
        primary: { label: '내 쿠폰함', href: '/mypage/coupons' },
        secondary: { label: '고객센터', href: '/cs' },
    },
    membership: {
        name: '멤버십',
        icon: 'bi-award',
        description: '구매 실적에 따른 등급과 전용 혜택을 준비하고 있습니다.<br>지금은 적립금을 모아 사용할 수 있습니다.',
        bullets: ['등급별 적립률·할인', '생일·기념일 쿠폰', '무료배송 혜택'],
        primary: { label: '내 적립금', href: '/mypage/points' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    // 진행 중인 특가도, 오늘 열릴 타임특가도 없을 때만 쓰이는 폴백 랜딩이다.
    deals: {
        name: '쇼핑특가',
        icon: 'bi-alarm',
        description: '지금 진행 중인 특가가 없습니다.<br>곧 엄선한 구성으로 찾아뵙겠습니다.',
        bullets: ['오늘의 특가 · 타임특가 · 시즌특가', '기간·시간 한정 판매', '선착순 수량 한정'],
        primary: { label: '베스트 상품 보기', href: '/best' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    /*
     * 추천 — 모듈이 있다(routes/recommend.js). 이 항목은 **세 섹션이 전부 빌 때만** 쓰이는 폴백이다.
     * 섹션이 다 비는 경우: RECOMMEND 뱃지 상품 0건 + 조회수 있는 상품 0건 + (비로그인).
     */
    recommend: {
        name: '추천',
        icon: 'bi-magic',
        description: '고객님께 맞는 상품을 골라드리는 추천을 준비하고 있습니다.',
        bullets: ['최근 본 상품 기반 추천', 'MD가 직접 고른 상품', '지금 많이 보는 상품'],
        primary: { label: '베스트 상품 보기', href: '/best' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    /*
     * 전문관 — 모듈이 있다(routes/specialty.js). 이 항목은 **발행된 전문관이 0건일 때만** 쓰이는 폴백이다.
     * 전문관은 exhibition_type='SPECIALTY' 인 기획전이므로, 관리자에서 만들면 바로 채워진다.
     */
    specialty: {
        name: '전문관',
        icon: 'bi-shop',
        description: '테마별로 상시 운영되는 전문 매장을 준비하고 있습니다.',
        bullets: ['선물관 · 프리미엄관 · 이너뷰티관', '상시 운영(기간 제한 없음)', '전문관별 큐레이션 구성'],
        primary: { label: '기획전 보러가기', href: '/exhibition' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    // 이벤트는 모듈이 있다. 이 항목은 **발행된 이벤트가 0건일 때만** 쓰이는 폴백 랜딩이다.
    event: {
        name: '이벤트 & 혜택',
        icon: 'bi-gift',
        description: '진행 중인 이벤트가 없습니다.<br>새로운 이벤트를 준비하고 있습니다.',
        bullets: ['응모·경품 이벤트', '쿠폰팩 지급', '출석체크 혜택'],
        primary: { label: '쇼핑특가 보러가기', href: '/deals' },
        secondary: { label: '내 쿠폰함', href: '/mypage/coupons' },
    },
};

function comingSoon(key) {
    return (req, res) => {
        const feature = COMING_SOON[key];
        res.render('user/coming_soon', {
            title: feature.name,
            feature,
            seo: Object.assign({}, res.locals.seo, {
                title: `${feature.name} (준비 중)`,
                description: String(feature.description).replace(/<[^>]*>/g, ' '),
                robots: 'noindex,follow',
            }),
        });
    };
}

// '/exhibition' 은 routes/exhibition.js 가 실제 목록을 렌더한다.
// 다만 발행된 기획전이 0건이면 exhibitionController 가 COMING_SOON.exhibition 랜딩으로 되돌린다.
//
// '/group-buy' 도 마찬가지로 routes/group-buy.js 가 렌더한다.
// ⚠️ 여기에 `router.get('/group-buy', ...)` 를 남겨두면 안 된다 — featureRoutes 가 app.js 에서
//    '/' 에 **먼저** 마운트되므로, 뒤에 오는 app.use('/group-buy', ...) 가 영영 닿지 못한다.
//
// '/coupon' 도 routes/coupon.js 가 렌더한다. 다운로드 쿠폰이 0건이면 couponController 가
// COMING_SOON.coupon 랜딩으로 되돌린다. 여기에 `router.get('/coupon', ...)` 를 남겨두면
// featureRoutes 가 '/' 에 먼저 마운트되므로 뒤의 app.use('/coupon', ...) 가 영영 닿지 못한다.
//
// '/live' 도 이제 routes/live.js 가 렌더한다(2026-07-13). 같은 이유로 여기에 핸들러를 두지 않는다.
// 발행된 라이브가 0건이면 liveController 가 COMING_SOON.live 랜딩으로 되돌린다 —
// 그래서 아래 COMING_SOON 의 `live` **정의는 남겨둔다**(폴백에서 재사용).

/*
 * 랭킹 — 베스트에 흡수됐다(2026-07 사용자 결정). GNB 메뉴도 내렸다.
 *
 * 베스트가 랭킹 엔진(best_ranking 스냅샷 + 그룹×기간 탭)으로 재설계되면서 '랭킹'이 따로
 * 존재할 이유가 없어졌다 — 메뉴 이름도 이미 '베스트/랭킹'이다. 준비중 랜딩으로 남겨두면
 * 같은 기능을 두 곳에서 설명하게 되므로 **영구 이전(301)** 으로 넘긴다.
 * 라우트를 지우면 북마크·외부 링크가 404 가 된다.
 */
router.get('/ranking', (req, res) => res.redirect(301, '/best'));

/*
 * 아울렛 — 모듈로 구현됐다. routes/outlet.js 가 '/outlet' 에 마운트된다(app.js).
 * 여기에 라우트를 두면 featureRoutes 가 '/' 에 먼저 마운트되므로 그쪽이 영영 안 잡힌다.
 *
 * COMING_SOON.outlet 은 지우지 않는다 — outletController 가 '아울렛 상품 0건' 폴백으로 재사용한다.
 * → 설계: docs/사이트개선/outlet_design_and_development.md
 */

/*
 * 멤버십 — 정적 제도 소개(안 A). 등급 산정을 하지 않는다(데이터 부족, gnb §2-9).
 *
 * GNB 메뉴에서는 내려왔다(2026-07 사용자 결정) — 이제 **이벤트&혜택(/event)의 하위 섹션**으로
 * 노출한다. 다만 이 라우트는 유지한다: 섹션의 '자세히 보기'가 여기로 오고, 라우트를 지우면
 * 기존 링크·북마크가 죽는다.
 *
 * 등급·혜택 정의는 services/membership/membershipInfo.js 한 곳에 둔다
 * (이 페이지와 이벤트 페이지가 함께 쓴다 — 두 벌로 갈라지면 반드시 어긋난다).
 */
router.get('/membership', async (req, res, next) => {
    try {
        // DB 등급이 있으면 그것을, 없으면 정적 상수(membershipInfo)로 폴백한다.
        const { tiers, benefits } = await evaluationService.getPublicTiers(req.mallId || 1);
        res.render('user/membership/index', {
            title: '멤버십',
            tiers, benefits,
            seo: Object.assign({}, res.locals.seo, {
                title: '멤버십 안내',
                description: '구매 실적에 따른 등급별 적립·배송·전용 혜택을 안내합니다.',
                robots: 'index,follow',
            }),
        });
    } catch (e) { next(e); }
});

module.exports = router;
// 기획전·이벤트·공동구매 컨트롤러가 '발행 0건' 폴백에서 같은 랜딩을 렌더한다.
module.exports.COMING_SOON = COMING_SOON;
