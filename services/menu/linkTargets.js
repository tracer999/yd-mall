/*
 * 링크 대상 카탈로그 — "이 몰에서 실제로 열리는 페이지" 목록.
 *
 * 퀵메뉴 같은 바로가기 UI 는 운영자가 URL 을 손으로 적게 하면 안 된다. 오타 하나로 죽은
 * 링크가 나가고, 아이콘 이름은 더더욱 외울 수 없다. 그래서 목록에서 고르게 하고
 * URL·아이콘은 여기서 자동으로 채운다(이름만 운영자가 고친다).
 *
 * 출처는 GNB 와 같다(navigationService):
 *   - feature_menu × mall_feature_menu : 몰에서 켜져 있고 모듈이 준비됐고 콘텐츠 게이트를 통과한 것만
 *   - custom_menu                      : 운영자가 만든 자유 메뉴(대상이 유효한 것만)
 * 즉 **GNB 에 나올 수 있는 페이지만** 후보가 된다 — 퀵메뉴만 죽은 링크를 갖는 일이 없다.
 */
const nav = require('./navigationService');

/*
 * feature_code → Bootstrap Icons 이름('bi-' 제외).
 * feature_menu 테이블에는 아이콘 컬럼이 없다. 아이콘은 운영 데이터가 아니라 디자인 결정이라
 * 코드에 둔다 — 새 기능 메뉴를 추가하면 여기에 한 줄 넣는다(없으면 DEFAULT_ICON).
 */
const FEATURE_ICONS = {
    SHOPPING_DEAL: 'lightning-charge',
    BEST: 'award',
    NEW_PRODUCT: 'stars',
    EVENT: 'gift',
    EXHIBITION: 'collection',
    BRAND: 'bookmark-star',
    RANKING: 'bar-chart',
    OUTLET: 'tags',
    COUPON: 'ticket-perforated',
    MEMBERSHIP: 'person-badge',
    GROUP_BUY: 'people',
    LIVE: 'broadcast',
    RECOMMEND: 'hand-thumbs-up',
    SPECIALTY: 'shop',
    RAIL_CART: 'cart',
    HEADER_CART: 'cart',
    RAIL_WISHLIST: 'heart',
    RAIL_ORDERS: 'receipt',
    HEADER_SEARCH: 'search',
    HEADER_LOGIN: 'box-arrow-in-right',
    HEADER_MYPAGE: 'person',
    HEADER_CS: 'headset',
};
const DEFAULT_ICON = 'link-45deg';

/** 메뉴 테이블에 없지만 항상 존재하는 페이지. */
const STATIC_TARGETS = [
    { label: '홈', url: '/', icon: 'house', group: '기본' },
];

/**
 * 몰에서 고를 수 있는 링크 대상 목록.
 * @returns {Promise<Array<{label:string,url:string,icon:string,group:string}>>} url 기준 중복 제거됨
 */
async function getLinkTargets(mallId = 1) {
    const [features, customs] = await Promise.all([
        nav.getFeatureMenus(mallId),
        nav.getCustomMenus(mallId),
    ]);

    const fromFeatures = features
        .filter(m => m.path)   // CATEGORY·최근본상품·TOP 처럼 경로가 없는 항목은 바로가기 대상이 아니다
        .map(m => ({
            label: m.name,
            url: m.path,
            icon: FEATURE_ICONS[m.featureCode] || DEFAULT_ICON,
            group: '기능 메뉴',
        }));

    const fromCustoms = customs.map(m => ({
        label: m.name,
        url: m.path,
        icon: DEFAULT_ICON,
        group: '커스텀 메뉴',
    }));

    // 같은 URL 이 여러 위치에 있다(예: 장바구니 = 헤더 유틸 + 우측 레일). 먼저 나온 것만 남긴다.
    const seen = new Set();
    return [...STATIC_TARGETS, ...fromFeatures, ...fromCustoms].filter((t) => {
        if (!t.url || seen.has(t.url)) return false;
        seen.add(t.url);
        return true;
    });
}

module.exports = { getLinkTargets, FEATURE_ICONS, DEFAULT_ICON };
