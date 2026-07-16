/*
 * 몰 프리셋 = "테마" (몰 빌더 P4 → P6 테마 재편)
 *
 * 몰 하나를 "바로 쓸 수 있는 상태"로 만드는 데 필요한 설정 묶음이다.
 * 헤더·GNB 스킨 · 내비 정책 · GNB 메뉴 세트 · 테마 토큰 · 홈 섹션 구성을 **한 번에** 정한다.
 *
 * 초보 사용자를 위해 이 묶음을 **테마**로 노출한다(몰 생성 시 3종 중 택1). 테마를 고르면
 * 아래 homeSections 대로 기본 캐러셀(베스트 · 쇼핑특가 · 베스트 카테고리 · 베스트 브랜드)이
 * 자동 배치되고, 사용자는 이후 페이지 빌더(설정 모드)에서 원하는 대로 더한다.
 *
 * 3종 테마
 *   theme_product   현재 디자인 + 상품 배너 슬라이드쇼(hero_slide 상품 쇼케이스)  — 스킨 classic
 *   theme_banner    현재 디자인 + 일반 이미지 배너 슬라이드쇼                     — 스킨 classic
 *   theme_editorial 풀블리드 대형 히어로 + 오버레이 헤더 + 디스플레이 폰트         — 스킨 editorial
 *
 * ⚠️ 규모(대형몰/소형몰)와 무관하다. 어떤 몰이든 세 테마 중 하나를 쓴다.
 *
 * 왜 묶는가: nav_mode / header_layout_type / 테마 / 홈 섹션을 각각 고르게 두면
 * 운영자가 깨진 조합을 만들 수 있다. 테마가 정합성 있는 조합을 보장하고,
 * 세부 조정은 그 다음에 각 화면(Header 설정 · 페이지 빌더 · 테마 설정)에서 한다.
 *
 * 설계: docs/사이트개선/mall_builder_plan.md §3.4
 */

/*
 * homeSections — page_section 시딩 목록.
 *
 * ⚠️ 상품/베스트/특가 데이터가 없으면 리졸버가 null 을 돌려 섹션이 **조용히 스킵**된다
 * (displayService 격리). 그래서 몰 생성 시 "샘플 데이터 포함"을 켜면 sampleSeeder 가
 * 카테고리·브랜드·상품·특가·hero_slide 를 몰 스코프로 심어 첫 화면이 바로 뜬다.
 *
 * 각 섹션 정의:
 *   type    : sectionRegistry 키
 *   title   : page_section.title (null 이면 뷰 기본 제목)
 *   group   : 'recommend' | 'new'  →  applyProductGroups 가 만든 product_group 을 data_source_id 로 물림
 *   config  : page_section.config_json 초기값(테마 히어로 layout 등)
 */

/* 세 테마가 공유하는 기본 캐러셀 4종 — 사용자 요구 사양(베스트/쇼핑특가/베스트카테고리/베스트브랜드) */
const DEFAULT_CAROUSELS = [
    { type: 'best_ranking', title: '베스트' },
    { type: 'deal_carousel', title: '쇼핑특가', config: { maxCount: 12, columnsPerView: 4 } },
    { type: 'category_showcase', title: '베스트 카테고리' },
    { type: 'brand_carousel', title: '베스트 브랜드' },
];

/* classic(현재 디자인) 테마가 공유하는 스타일 토큰 */
const CLASSIC_THEME = {
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
    buttonRadius: '0.5rem',
    cardRadius: '0.5rem',
    pillRadius: '9999px',
    inputRadius: '0.375rem',
    productCardStyle: 'shadow',
    sectionSpacing: '3rem',
    containerWidth: '72rem',
    skin: 'classic',
};

/* classic 두 테마가 공유하는 내비(기본형 헤더) */
const CLASSIC_NAV = {
    nav_mode: 'split',
    header_layout_type: 'main_right_utility_v1',
    category_display_type: 'dropdown',
    max_gnb_items: 12,
    max_custom_items: 3,
    category_max_depth: 3,
    use_mega_menu: 0,
    use_search_bar: 1,
};

/*
 * 메뉴 구성 방식 — 테마와 **독립된 축**이다.
 *
 * 테마는 룩(색·폰트·홈 섹션)을 정하고, 이 축은 GNB 를 어떻게 조립할지를 정한다.
 * 예전에는 테마가 헤더 스킨까지 고정해 통합형(드로어)을 고를 방법이 아예 없었다.
 *
 * header_layout_type 과 nav_mode 는 **반드시 짝**이어야 한다(짝이 어긋나면 "드로어 헤더인데
 * 카테고리가 메뉴 목록에 없는" 조합이 나온다). 그래서 여기서 함께 정한다 —
 * 같은 규칙을 Header 설정(controllers/admin/headerSettingsController.js)도 쓴다.
 */
const MENU_MODES = [
    {
        key: 'split',
        label: '카테고리 분리형',
        summary: '상단에 [☰ 카테고리] 버튼을 두고 그 옆에 일반 메뉴를 한 줄로 놓습니다. 카테고리는 버튼을 누르면 3단 드롭다운 패널로 열립니다.',
    },
    {
        key: 'unified',
        label: '통합형 (드로어)',
        summary: '헤더에는 [☰]·로고·장바구니만 두고 메뉴 전체를 좌측 슬라이드 드로어에 담습니다. 카테고리 1뎁스가 일반 메뉴와 같은 목록에 놓이고 하위는 [+] 로 펼칩니다.',
    },
];

const DEFAULT_MENU_MODE = 'split';

/* 통합형은 어느 테마에서든 드로어 헤더를 쓴다 — 드로어 스킨이 하나뿐이라 그렇다. */
const CLASSIC_HEADER_BY_MENU_MODE = {
    split: 'main_right_utility_v1',
    unified: 'compact_drawer_v1',
};

const FEATURE_MENUS = [
    'CATEGORY', 'SHOPPING_DEAL', 'BEST', 'NEW_PRODUCT',
    'EVENT', 'EXHIBITION', 'BRAND', 'SPECIALTY',
];

const PRESETS = {
    /* ── 테마 1: 상품 배너 슬라이드쇼 ─────────────────────────────────
     * 현재 디자인 그대로. 최상단 히어로가 상품 쇼케이스(hero_slide 상품 슬라이드)다.
     * 신상품·특가를 이미지가 아니라 "상품"으로 크게 돌리고 싶은 몰에 맞는다.
     */
    theme_product: {
        key: 'theme_product',
        label: '테마 1 — 상품 배너 슬라이드쇼',
        summary: '현재 기본 디자인. 최상단에 상품을 크게 돌리는 상품 쇼케이스 히어로가 놓이고, 그 아래 베스트·쇼핑특가·베스트 카테고리·베스트 브랜드 캐러셀이 자동 배치됩니다.',
        skinLabel: '상품형',
        navigation: CLASSIC_NAV,
        headerLayoutByMenuMode: CLASSIC_HEADER_BY_MENU_MODE,
        featureMenus: FEATURE_MENUS,
        theme: CLASSIC_THEME,
        homeSections: [
            { type: 'theme_hero', title: null, config: { layout: 'showcase' } },
            ...DEFAULT_CAROUSELS,
            { type: 'recent_product', title: '최근 본 상품' },
            { type: 'kakao_cta', title: null },
        ],
    },

    /* ── 테마 2: 일반 배너 슬라이드쇼 ─────────────────────────────────
     * 현재 디자인 그대로. 최상단 히어로가 전체폭 이미지 배너 슬라이드다.
     * 프로모션 이미지를 큼직하게 거는 가장 보편적인 형태.
     */
    theme_banner: {
        key: 'theme_banner',
        label: '테마 2 — 일반 배너 슬라이드쇼',
        summary: '현재 기본 디자인. 최상단에 전체폭 이미지 배너 슬라이드가 놓이고, 그 아래 베스트·쇼핑특가·베스트 카테고리·베스트 브랜드 캐러셀이 자동 배치됩니다.',
        skinLabel: '배너형',
        navigation: CLASSIC_NAV,
        headerLayoutByMenuMode: CLASSIC_HEADER_BY_MENU_MODE,
        featureMenus: FEATURE_MENUS,
        theme: CLASSIC_THEME,
        homeSections: [
            { type: 'theme_hero', title: null, config: { layout: 'banner' } },
            ...DEFAULT_CAROUSELS,
            { type: 'recent_product', title: '최근 본 상품' },
            { type: 'kakao_cta', title: null },
        ],
    },

    /* ── 테마 3: 에디토리얼 ───────────────────────────────────────────
     * 완전히 다른 룩. 투명 오버레이 헤더 + 풀블리드(뷰포트 높이) 히어로 + 디스플레이 폰트.
     * 라이프스타일/럭셔리 브랜드 무드. 캐러셀은 동일 4종을 쓰되 스킨 CSS 로 외형이 달라진다.
     */
    theme_editorial: {
        key: 'theme_editorial',
        label: '테마 3 — 에디토리얼(풀블리드)',
        summary: '투명 오버레이 헤더 + 화면을 꽉 채우는 풀블리드 히어로 + 디스플레이 세리프 폰트의 라이프스타일 무드. 그 아래 베스트·쇼핑특가·베스트 카테고리·베스트 브랜드 캐러셀이 자동 배치됩니다.',
        skinLabel: '에디토리얼',
        navigation: {
            nav_mode: 'split',
            header_layout_type: 'editorial_overlay_v1',
            category_display_type: 'dropdown',
            max_gnb_items: 8,
            max_custom_items: 3,
            category_max_depth: 3,
            use_mega_menu: 0,
            use_search_bar: 1,
        },
        /* 분리형일 때만 오버레이 헤더를 쓴다. 통합형을 고르면 드로어 헤더가 되어 투명 오버레이는 포기한다. */
        headerLayoutByMenuMode: {
            split: 'editorial_overlay_v1',
            unified: 'compact_drawer_v1',
        },
        featureMenus: FEATURE_MENUS,
        theme: {
            fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
            fontDisplay: "'Nanum Myeongjo', 'Playfair Display', serif",
            buttonRadius: '0',
            cardRadius: '0',
            pillRadius: '9999px',
            inputRadius: '0',
            productCardStyle: 'flat',
            sectionSpacing: '4.5rem',
            containerWidth: '80rem',
            skin: 'editorial',
        },
        homeSections: [
            { type: 'theme_hero', title: null, config: { layout: 'editorial' } },
            ...DEFAULT_CAROUSELS,
        ],
    },
};

const DEFAULT_KEY = 'theme_banner';

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

/** 유효한 메뉴 구성 방식인가 */
function isValidMenuMode(mode) {
    return MENU_MODES.some((m) => m.key === String(mode || ''));
}

/** 관리자 폼의 메뉴 구성 방식 라디오 목록용 */
function menuModeList() {
    return MENU_MODES;
}

/**
 * 프리셋 + 메뉴 구성 방식 → navigation_config 에 넣을 값.
 * header_layout_type 과 nav_mode 를 항상 짝으로 맞춘다.
 */
function resolveNavigation(preset, menuMode) {
    const mode = isValidMenuMode(menuMode) ? String(menuMode) : DEFAULT_MENU_MODE;
    const layout = (preset.headerLayoutByMenuMode || CLASSIC_HEADER_BY_MENU_MODE)[mode];
    return { ...preset.navigation, nav_mode: mode, header_layout_type: layout };
}

module.exports = {
    PRESETS, DEFAULT_KEY, get, list, isValidKey,
    MENU_MODES, DEFAULT_MENU_MODE, menuModeList, isValidMenuMode, resolveNavigation,
};
