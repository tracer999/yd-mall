const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const productController = require('../controllers/productController');

/*
 * 기능 메뉴 표준 URL (M3)
 *
 * feature_menu.default_path 와 1:1 대응한다. 운영자는 이 URL 을 바꿀 수 없고,
 * 관리자에서는 사용 여부(is_enabled)·표시명·순서만 관리한다.
 * (docs/사이트개선/frontend_dev_plan.md §5)
 *
 * 기존 상품목록 컨트롤러(productController.getList)를 얇게 재사용한다.
 * Express 5의 req.query 는 getter 이므로 변형하지 않고 req.featurePreset 으로 주입한다.
 */

/** 상품목록 컨트롤러에 넘길 프리셋을 심는 미들웨어 */
function preset(featurePreset) {
    return (req, res, next) => {
        req.featurePreset = featurePreset;
        next();
    };
}

// 베스트 — 조회수 기준 인기 상품
// menuKey: 메뉴별 배너(group_key='menu:{key}') 매칭용. 관리자 bannerController.MENU_BANNER_TARGETS 와 1:1.
// 상위 100 으로 캡한다(capLimit). 순위 번호는 붙이지 않는다(그건 랭킹의 몫).
router.get('/best', preset({ sort: 'best', capLimit: 100, menuKey: 'BEST' }), productController.getList);

// 신상품 — NEW 뱃지 상품만(최신순). 전체 카탈로그를 최신순 정렬하면 "신상품 = 전체"가 되므로
// 뱃지로 자른다. productController 에 badge==='NEW' 분기(FIND_IN_SET)가 이미 있다.
router.get('/new', preset({ badge: 'NEW', sort: 'new', menuKey: 'NEW' }), productController.getList);

/*
 * 오늘특가 — 관리자가 상품그룹(manual)에서 직접 고른 상품을 보여준다.
 *   - 소스 그룹: mall 별 오늘특가 그룹(seed_key='ct_deal' 또는 이름에 '오늘특가').
 *     홈의 '오늘의 특가' 캐러셀과 같은 그룹을 공유한다 → 관리자가 한 곳만 관리.
 *   - 그룹이 없거나 담긴 상품이 0건이면 준비중 랜딩으로 폴백(빈 목록 방지, dev=prod).
 *   - 뱃지(DEADLINE_SALE) 자동 노출 방식은 폐기했다(관리자 수동 큐레이션으로 전환).
 */
router.get('/deal/today', async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const [[grp]] = await pool.query(
            `SELECT id FROM product_group
              WHERE mall_id = ? AND is_active = 1
                AND (JSON_UNQUOTE(JSON_EXTRACT(filter_condition_json,'$.seed_key')) = 'ct_deal'
                     OR name LIKE '%오늘특가%')
              ORDER BY id LIMIT 1`,
            [mallId]
        );
        if (!grp) return comingSoon('deal-today')(req, res);
        const [[{ c }]] = await pool.query(
            'SELECT COUNT(*) c FROM product_group_item WHERE product_group_id = ?', [grp.id]
        );
        if (!c) return comingSoon('deal-today')(req, res);
        req.featurePreset = { groupId: grp.id, menuKey: 'DEAL' };
        return productController.getList(req, res);
    } catch (e) {
        return next(e);
    }
});

// '/event' 는 routes/event.js 가 실제 목록을 렌더한다.
// 예전에는 '/boards/notice'(공지사항) 로 302 했으나, 공지사항은 고객센터(/cs)의 하위 항목이지
// 이벤트가 아니다. 발행된 이벤트가 0건이면 eventController 가 COMING_SOON.event 랜딩으로 되돌린다.

/*
 * 준비 중 메뉴 (쇼핑라이브 / 랭킹 / 아울렛 / 쿠폰 / 멤버십)
 *
 * GNB 에 노출하되 모듈이 아직 없다. '#' 죽은 링크 대신 실제 랜딩 페이지를 둔다.
 * 검색엔진에는 색인시키지 않는다(noindex).
 *
 * 모듈이 구현되면 이 핸들러를 실제 목록 렌더로 교체하면 되고,
 * 표준 URL 과 feature_menu 설정은 그대로 유지된다.
 *
 * ⚠️ 라우트를 배포한 **뒤에** `feature_menu.module_ready` 를 1 로 올린다.
 *    (dev·prod 가 같은 DB 라, 먼저 올리면 운영 GNB 에 404 링크가 뜬다)
 *
 * 왜 RANKING·OUTLET·COUPON·MEMBERSHIP 도 실기능이 아니라 랜딩인가:
 *   - OUTLET     : `discount_rate > 0` 인 상품이 **0개**다. 목록을 만들어도 항상 빈다.
 *   - MEMBERSHIP : `users` 에 등급 컬럼이 없다(`points_balance` 뿐).
 *   - COUPON     : `coupons` 는 있으나 고객이 받아가는 '다운로드 쿠폰' 개념·화면이 없다.
 *   - RANKING    : `getList` 의 `sort=best`(조회수) 로 만들 수는 있다. 다만 카테고리별 순위·기간별
 *                  집계가 빠진 반쪽이라, 지금은 랜딩으로 두고 모듈로 제대로 만든다.
 */
const COMING_SOON = {
    exhibition: {
        name: '기획전',
        icon: 'bi-stars',
        description: '시즌·브랜드·테마별 기획전을 준비하고 있습니다.<br>곧 특별한 구성으로 찾아뵙겠습니다.',
        bullets: ['시즌 기획전 (설·추석·여름 클리어런스)', '브랜드 위크', '테마별 큐레이션'],
        primary: { label: '오늘특가 보러가기', href: '/deal/today' },
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
    ranking: {
        name: '랭킹',
        icon: 'bi-trophy',
        description: '카테고리별·기간별 인기 상품 순위를 준비하고 있습니다.<br>지금은 조회수 기준 베스트 상품을 먼저 만나보세요.',
        bullets: ['카테고리별 실시간 순위', '주간·월간 랭킹', '급상승 상품'],
        primary: { label: '베스트 상품 보기', href: '/best' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    outlet: {
        name: '아울렛',
        icon: 'bi-tags',
        description: '재고 소진 특가와 시즌오프 상품을 모은 아울렛을 준비하고 있습니다.',
        bullets: ['재고 소진 특가', '시즌오프 할인', '한정 수량 판매'],
        primary: { label: '오늘특가 보러가기', href: '/deal/today' },
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
    // 오늘특가 상품그룹(manual)에 관리자가 상품을 1건도 담지 않았을 때만 쓰이는 폴백 랜딩이다.
    'deal-today': {
        name: '오늘특가',
        icon: 'bi-alarm',
        description: '오늘의 특가 상품을 준비하고 있습니다.<br>곧 엄선한 구성으로 찾아뵙겠습니다.',
        bullets: ['MD 엄선 특가 구성', '기간 한정 판매', '매일 새로운 구성'],
        primary: { label: '베스트 상품 보기', href: '/best' },
        secondary: { label: '전체 상품', href: '/products' },
    },
    // 이벤트는 모듈이 있다. 이 항목은 **발행된 이벤트가 0건일 때만** 쓰이는 폴백 랜딩이다.
    event: {
        name: '이벤트 & 혜택',
        icon: 'bi-gift',
        description: '진행 중인 이벤트가 없습니다.<br>새로운 이벤트를 준비하고 있습니다.',
        bullets: ['응모·경품 이벤트', '쿠폰팩 지급', '출석체크 혜택'],
        primary: { label: '오늘특가 보러가기', href: '/deal/today' },
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
router.get('/live', comingSoon('live'));
router.get('/ranking', comingSoon('ranking'));

/*
 * 아울렛 — 할인 상품(discount_rate>0)을 할인율순으로. 몰에 할인 상품이 0건이면
 * 빈 그리드 대신 준비중 랜딩으로 폴백한다(mall=1 은 항상 0건 — gnb §2-2).
 * 목록/필터는 productController.getList 를 재사용하고, isOutlet 프리셋으로 전용 슬롯만 켠다.
 */
router.get('/outlet', async (req, res, next) => {
    try {
        const mallId = req.mallId || 1;
        const visFilter = req.user ? "visibility IN ('PUBLIC','MEMBER_ONLY')" : "visibility = 'PUBLIC'";
        const [[{ c }]] = await pool.query(
            `SELECT COUNT(*) c FROM products
              WHERE mall_id = ? AND status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND ${visFilter}
                AND discount_rate > 0`,
            [mallId]
        );
        if (!c) return comingSoon('outlet')(req, res);
        req.featurePreset = { isOutlet: true, sort: 'discount' };
        return productController.getList(req, res);
    } catch (e) {
        return next(e);
    }
});

/*
 * 멤버십 — 정적 제도 소개(안 A). 등급 산정을 하지 않는다(데이터 부족, gnb §2-9).
 * 등급 정의는 테이블 없이 상수로 둔다. 실제 등급 시스템(user_grade + 배치)은 2차.
 */
const MEMBERSHIP_TIERS = [
    { code: 'WELCOME', name: '웰컴',   threshold: '가입 시',          rate: '1%', perks: ['기본 적립'] },
    { code: 'SILVER',  name: '실버',   threshold: '누적 10만원 이상',  rate: '2%', perks: ['기본 적립 상향'] },
    { code: 'GOLD',    name: '골드',   threshold: '누적 50만원 이상',  rate: '3%', perks: ['적립 상향', '무료배송'], accent: true },
    { code: 'VIP',     name: 'VIP',    threshold: '누적 200만원 이상', rate: '5%', perks: ['최고 적립', '무료배송', '전용 쿠폰'] },
];
const MEMBERSHIP_BENEFITS = [
    { icon: 'bi-coin',            title: '구매 적립', desc: '등급별 적립률로 구매 금액을 적립금으로 돌려드립니다.' },
    { icon: 'bi-truck',          title: '배송 혜택', desc: '골드 등급부터 무료배송 혜택이 적용됩니다.' },
    { icon: 'bi-gift',           title: '생일 쿠폰', desc: '생일·기념일에 전용 쿠폰을 드립니다.' },
];
router.get('/membership', (req, res) => {
    res.render('user/membership/index', {
        title: '멤버십',
        tiers: MEMBERSHIP_TIERS,
        benefits: MEMBERSHIP_BENEFITS,
        seo: Object.assign({}, res.locals.seo, {
            title: '멤버십 안내',
            description: '구매 실적에 따른 등급별 적립·배송·전용 혜택을 안내합니다.',
            robots: 'index,follow',
        }),
    });
});

module.exports = router;
// 기획전·이벤트·공동구매 컨트롤러가 '발행 0건' 폴백에서 같은 랜딩을 렌더한다.
module.exports.COMING_SOON = COMING_SOON;
