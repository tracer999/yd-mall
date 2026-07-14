/*
 * 몰 프리셋 (몰 빌더 P4)
 *
 * 몰 하나를 "바로 쓸 수 있는 상태"로 만드는 데 필요한 설정 묶음이다.
 * 헤더·GNB 스킨 · 내비 정책 · GNB 메뉴 세트 · 테마 토큰 · 홈 섹션 구성을 **한 번에** 정한다.
 *
 * ⚠️ 이건 "대형몰 / 소형몰" 같은 몰의 규모 분류가 아니다.
 *    **몰마다 고르는 헤더·GNB 스킨**이다. 상품이 1만 개인 몰이 드로어형을 쓸 수도 있고,
 *    상품이 10개인 몰이 기본형을 쓸 수도 있다. 규모와 스킨은 아무 상관이 없다.
 *
 * 왜 묶는가: nav_mode / header_layout_type / 테마 / 홈 섹션을 각각 고르게 두면
 * 운영자가 깨진 조합(예: 통합 GNB 인데 카테고리 메뉴가 꺼져 있음)을 만들 수 있다.
 * 프리셋이 정합성 있는 조합을 보장하고, 세부 조정은 그 다음에 각 화면에서 한다.
 * 스킨만 바꾸고 싶으면 몰을 다시 만들 필요 없이 /admin/header-settings 에서 바꾼다.
 *
 * 설계: docs/사이트개선/mall_builder_plan.md §3.4
 */

/*
 * featureMenus — GNB(position='gnb') 에서 켤 메뉴 코드.
 *
 * 여기 없는 gnb 메뉴는 꺼진다. header_util / right_rail 은 프리셋이 건드리지 않는다
 * (검색·로그인·장바구니 등은 스킨과 무관하며 is_required 라 어차피 못 끈다).
 * is_required = 1 인 메뉴는 목록에 없어도 항상 켜진다 — 프로비저너가 강제한다.
 */

/*
 * homeSections — page_section 시딩 목록.
 *
 * ⚠️ 상품그룹·베스트그룹을 요구하는 섹션(product_grid, best_ranking 등)은 새 몰에
 * 해당 데이터가 없으면 리졸버가 null 을 돌려 **조용히 스킵**된다(displayService 가 격리).
 * 화면이 깨지지는 않지만 섹션이 안 보인다. 운영자가 상품그룹을 만들고 페이지 빌더에서
 * 연결하면 그때 나타난다. 그래서 데이터 없이도 뜨는 섹션(hero, value_proposition,
 * category_showcase, custom_html, kakao_cta)을 골격으로 깔아 둔다.
 */

const PRESETS = {
    /* ── 스킨 1: 기본형 ───────────────────────────────────────────────
     * 유틸바 + 로고/검색 + GNB 3단. 카테고리는 GNB 최좌측 [☰ 카테고리] 버튼에 매달린
     * 별도 패널(3단 캐스케이드)이고, 일반 메뉴는 그 옆에 평면으로 늘어선다.
     * 현행 몰(건강식품관·종합관)이 쓰는 구조 — 프로모션 축이 여럿일 때 자리가 넉넉하다.
     */
    split_gnb: {
        key: 'split_gnb',
        label: '기본형 — 카테고리 버튼 + 평면 GNB (3단 헤더)',
        summary: '카테고리는 [☰ 카테고리] 버튼의 드롭다운 패널로 열리고, 일반 메뉴는 그 옆에 한 줄로 놓입니다. 상단 유틸바와 큰 검색창이 함께 나옵니다.',
        skinLabel: '기본형',

        navigation: {
            nav_mode: 'split',
            header_layout_type: 'main_right_utility_v1',
            category_display_type: 'dropdown',
            max_gnb_items: 12,
            max_custom_items: 3,
            category_max_depth: 3,
            use_mega_menu: 0,
            use_search_bar: 1,
        },

        featureMenus: [
            'CATEGORY', 'SHOPPING_DEAL', 'BEST', 'NEW_PRODUCT',
            'EVENT', 'EXHIBITION', 'BRAND', 'SPECIALTY',
        ],

        theme: {
            fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
            buttonRadius: '0.5rem',
            cardRadius: '0.5rem',
            pillRadius: '9999px',
            inputRadius: '0.375rem',
            productCardStyle: 'shadow',
            sectionSpacing: '3rem',
            containerWidth: '72rem',
        },

        homeSections: [
            { type: 'hero', title: null },
            { type: 'value_proposition', title: null },
            { type: 'best_ranking', title: '베스트 상품' },
            { type: 'product_grid', title: 'MD 추천' },
            { type: 'category_showcase', title: '카테고리' },
            { type: 'recent_product', title: '최근 본 상품' },
            { type: 'kakao_cta', title: null },
        ],
    },

    /* ── 스킨 2: 드로어형 ─────────────────────────────────────────────
     * 헤더에는 [☰] · 로고 · 장바구니만 두고, 메뉴 전체를 좌측 슬라이드 드로어에 담는다.
     * 카테고리 1뎁스가 일반 메뉴와 **같은 축**에 놓이고(nav_mode='unified'),
     * 하위 뎁스는 [+] 아코디언으로 펼친다. 검색창도 드로어 안에 있다.
     */
    drawer_gnb: {
        key: 'drawer_gnb',
        label: '드로어형 — 햄버거 전체메뉴 + 아코디언 카테고리',
        summary: '헤더는 [☰]·로고·장바구니만 남기고 메뉴 전체를 좌측 슬라이드 드로어에 담습니다. 카테고리와 일반 메뉴가 한 목록에 섞이고 하위 뎁스는 [+] 로 펼칩니다.',
        skinLabel: '드로어형',

        navigation: {
            nav_mode: 'unified',
            header_layout_type: 'compact_drawer_v1',
            category_display_type: 'dropdown',
            max_gnb_items: 20,   // 드로어는 세로 목록이라 자리 제약이 거의 없다
            max_custom_items: 5,
            category_max_depth: 3,
            use_mega_menu: 0,
            use_search_bar: 1,
        },

        // 카테고리가 메뉴 목록의 본체이므로 기능 메뉴는 몇 개만 둔다.
        featureMenus: ['CATEGORY', 'BEST', 'NEW_PRODUCT'],

        theme: {
            fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
            buttonRadius: '0.75rem',
            cardRadius: '0.75rem',
            pillRadius: '9999px',
            inputRadius: '0.5rem',
            productCardStyle: 'border',
            sectionSpacing: '4rem',
            containerWidth: '64rem',
        },

        homeSections: [
            { type: 'hero', title: null },
            { type: 'value_proposition', title: null },
            { type: 'product_grid', title: '상품' },
            { type: 'category_showcase', title: '카테고리' },
            { type: 'kakao_cta', title: null },
        ],
    },
};

const DEFAULT_KEY = 'split_gnb';

/** 유효한 프리셋 키인가 */
function isValidKey(key) {
    return Object.prototype.hasOwnProperty.call(PRESETS, String(key || ''));
}

/** 프리셋을 돌려준다. 없는 키면 기본 프리셋. */
function get(key) {
    return PRESETS[String(key || '')] || PRESETS[DEFAULT_KEY];
}

/** 관리자 폼의 라디오 목록용 */
function list() {
    return Object.values(PRESETS);
}

module.exports = { PRESETS, DEFAULT_KEY, get, list, isValidKey };
