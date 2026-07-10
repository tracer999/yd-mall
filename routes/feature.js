const express = require('express');
const router = express.Router();
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
router.get('/best', preset({ sort: 'best' }), productController.getList);

// 신상품 — 최근 등록 순
router.get('/new', preset({ sort: 'new' }), productController.getList);

// 오늘특가 — 마감 임박 세일 뱃지 상품
router.get('/deal/today', preset({ badge: 'DEADLINE_SALE' }), productController.getList);

// 이벤트&혜택 — 전용 모듈 구현 전까지 공지 게시판으로 연결(표준 URL 은 선점).
// TODO: 이벤트 모듈 구현 시 이 별칭을 실제 이벤트 목록 렌더로 교체한다.
router.get('/event', (req, res) => res.redirect(302, '/boards/notice'));

/*
 * 준비 중 메뉴 (기획전 / 공동구매 / 쇼핑라이브 / 랭킹 / 아울렛 / 쿠폰 / 멤버십)
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
    'group-buy': {
        name: '공동구매',
        icon: 'bi-people-fill',
        description: '목표 수량을 함께 채워 더 저렴하게 구매하는 공동구매를 준비하고 있습니다.',
        bullets: ['목표 수량 달성 시 할인 적용', '기간 한정 진행', '알림 신청으로 오픈 소식 받기'],
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

router.get('/exhibition', comingSoon('exhibition'));
router.get('/group-buy', comingSoon('group-buy'));
router.get('/live', comingSoon('live'));
router.get('/ranking', comingSoon('ranking'));
router.get('/outlet', comingSoon('outlet'));
router.get('/coupon', comingSoon('coupon'));
router.get('/membership', comingSoon('membership'));

module.exports = router;
