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

/*
 * 새 몰의 GNB 기본 세트.
 *
 * 여기 없는 gnb 메뉴는 applyFeatureMenus 가 is_enabled=0 으로 꺼 둔다(행은 남으므로
 * 관리자 → 메뉴 관리에서 언제든 다시 켤 수 있다. is_required=1 은 목록과 무관하게 항상 ON).
 *
 * EXHIBITION(기획전) · SPECIALTY(전문관) 은 뺐다 — 갓 만든 몰엔 기획전·전문관 콘텐츠가
 * 없어서 메뉴만 뜨고 눌러 보면 빈 화면이다. 운영자가 콘텐츠를 넣고 직접 켜는 쪽이 맞다.
 */
const FEATURE_MENUS = [
    'CATEGORY', 'SHOPPING_DEAL', 'BEST', 'NEW_PRODUCT',
    'EVENT', 'BRAND',
];

const PRESETS = {
    /*
     * ── 테마는 "배치 뼈대"만 정한다 ─────────────────────────────────
     * 히어로에 무엇이 들어가는지(상품 쇼케이스 / 이미지 배너)는 테마가 아니라
     * 배너 관리 > 메인 슬라이더에서 고른다(site_settings.hero_variant).
     * 예전엔 테마가 콘텐츠 종류까지 강제해서, 테마를 바꾸면 등록해 둔 배너·상품이
     * 통째로 안 보였다. 두 축을 분리한 뒤로는 3×2 조합이 모두 성립한다.
     */

    /* ── 테마 1: 좌 히어로 + 우 상품 카드 ─────────────────────────── */
    theme_product: {
        key: 'theme_product',
        label: '테마 1 — 좌 히어로 + 우 상품 카드',
        summary: '히어로를 두 칸으로 나눠 왼쪽에 큰 슬라이드, 오른쪽에 추천 상품 카드를 세웁니다. 슬라이드 내용(상품/이미지 배너)은 메인 슬라이더에서 고릅니다.',
        skinLabel: '2단형',
        navigation: CLASSIC_NAV,
        headerLayoutByMenuMode: CLASSIC_HEADER_BY_MENU_MODE,
        featureMenus: FEATURE_MENUS,
        theme: CLASSIC_THEME,
        homeSections: [
            { type: 'theme_hero', title: null, config: { layout: 'split_feature' } },
            ...DEFAULT_CAROUSELS,
            { type: 'recent_product', title: '최근 본 상품' },
            { type: 'kakao_cta', title: null },
        ],
    },

    /* ── 테마 2: 전체폭 히어로 ──────────────────────────────────────── */
    theme_banner: {
        key: 'theme_banner',
        label: '테마 2 — 전체폭 히어로',
        summary: '히어로를 가로 전체폭 한 칸으로 크게 씁니다. 우측 카드 없이 슬라이드에 집중하는 가장 보편적인 형태입니다. 슬라이드 내용(상품/이미지 배너)은 메인 슬라이더에서 고릅니다.',
        skinLabel: '전체폭',
        navigation: CLASSIC_NAV,
        headerLayoutByMenuMode: CLASSIC_HEADER_BY_MENU_MODE,
        featureMenus: FEATURE_MENUS,
        theme: CLASSIC_THEME,
        homeSections: [
            { type: 'theme_hero', title: null, config: { layout: 'full_width' } },
            ...DEFAULT_CAROUSELS,
            { type: 'recent_product', title: '최근 본 상품' },
            { type: 'kakao_cta', title: null },
        ],
    },

    /* ── 테마 3: 풀블리드 + 오버레이 헤더 ─────────────────────────────
     * 배치뿐 아니라 헤더·폰트까지 다른 유일한 테마다(투명 오버레이 + 디스플레이 세리프).
     */
    theme_editorial: {
        key: 'theme_editorial',
        label: '테마 3 — 풀블리드(에디토리얼)',
        summary: '투명 오버레이 헤더 위로 화면을 꽉 채우는 풀블리드 히어로를 깝니다. 디스플레이 세리프 폰트의 라이프스타일 무드. 슬라이드 내용(상품/이미지 배너)은 메인 슬라이더에서 고릅니다.',
        skinLabel: '풀블리드',
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
        /*
         * 통합형이어도 오버레이 헤더를 유지한다 — 투명 오버레이 + 풀블리드가 이 테마의 정체성이라,
         * 드로어 스킨으로 바꾸면 "테마 3을 골랐는데 테마 3이 아닌" 화면이 된다.
         *
         * 이래도 깨지지 않는 이유: 통합형에서 buildUnified 가 categoryButton 을 null 로 주고,
         * 이 스킨은 `if (_catBtn)` 일 때만 카테고리 버튼을 그린다. 즉 카테고리는 가운데 메뉴에
         * 합쳐지고 버튼은 사라진다 — 중복이 생기지 않는다.
         */
        headerLayoutByMenuMode: {
            split: 'editorial_overlay_v1',
            unified: 'editorial_overlay_v1',
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
            { type: 'theme_hero', title: null, config: { layout: 'full_bleed' } },
            ...DEFAULT_CAROUSELS,
        ],
    },
};

const DEFAULT_KEY = 'theme_banner';

/*
 * ────────────────────────────────────────────────────────────────
 * 페이지 이지모드 번들 (페이지 빌더 > 페이지 설정 > 이지모드)
 *
 * 테마(히어로·색·폰트)와 **독립된 축**이다. 테마가 최상단 히어로와 룩을 정하고,
 * 이 번들은 그 **히어로 아래 콘텐츠 캐러셀 구성**만 정한다.
 *   - 적용 시 홈의 리딩 히어로(theme_hero)는 그대로 두고, 나머지 섹션을 이 목록으로 교체·발행한다.
 *   - 그래서 두 탭(테마 설정 / 페이지 설정)이 히어로를 두고 서로 싸우지 않는다.
 *
 * 각 섹션은 preset.homeSections 와 같은 스키마: { type, title, group?, config? }.
 *   group : applyProductGroups 가 만든 조건형 상품 그룹 키('recommend'|'new')
 *   config: page_section.config_json 초기값. promotion_banner 의 groupKey 는
 *           실제 배너 존재 여부에 달렸으므로 적용 시점에 자동 배선한다(여기서 비워 둠).
 *
 * 초보자가 3종 중 하나를 골라 "바로 뜨는 메인"을 만들고, 이후 직접설정(섹션 편집)에서
 * 세부 조정한다. 요구 사양: 캐러셀 풀[베스트 카테고리·베스트 브랜드·신상품·특가·프로모션배너·퀵메뉴]
 * 을 3종으로, 각 3~4개씩 구성.
 * ──────────────────────────────────────────────────────────────── */

/* 퀵 메뉴 기본 항목 — icon 은 bootstrap-icons 이름에서 'bi-' 를 뺀 값 */
const DEFAULT_QUICK_ITEMS = [
    { icon: 'lightning-charge', label: '오늘특가', url: '/deals' },
    { icon: 'award', label: '베스트', url: '/best' },
    { icon: 'stars', label: '신상품', url: '/new' },
    { icon: 'ticket-perforated', label: '쿠폰', url: '/coupon', badge: 'N' },
];

const PAGE_BUNDLES = {
    /* 번들 1 — 상품을 앞세운 구성(4개) */
    bundle_product: {
        key: 'bundle_product',
        label: '상품 중심',
        summary: '특가 → 신상품 → 베스트 카테고리 → 베스트 브랜드 순으로 상품을 크게 앞세운 구성입니다.',
        sections: [
            { type: 'deal_carousel', title: '쇼핑특가', config: { maxCount: 12, columnsPerView: 4 } },
            { type: 'product_carousel', title: '신상품', group: 'new', config: { maxCount: 12, columnsPerView: 4 } },
            { type: 'category_showcase', title: '베스트 카테고리' },
            { type: 'brand_carousel', title: '베스트 브랜드' },
        ],
    },

    /* 번들 2 — 이벤트·혜택을 앞세운 구성(4개) */
    bundle_benefit: {
        key: 'bundle_benefit',
        label: '혜택 강조',
        summary: '퀵 메뉴 → 프로모션 배너 → 특가 → 베스트 카테고리로 이벤트·혜택을 앞세운 구성입니다.',
        sections: [
            { type: 'quick_menu', title: null, config: { items: DEFAULT_QUICK_ITEMS, columns: 4 } },
            { type: 'promotion_banner', title: '기획전', config: { maxCount: 4, layout: 'rect', columns: 2 } },
            { type: 'deal_carousel', title: '쇼핑특가', config: { maxCount: 12, columnsPerView: 4 } },
            { type: 'category_showcase', title: '베스트 카테고리' },
        ],
    },

    /* 번들 3 — 단순 구성(3개) */
    bundle_simple: {
        key: 'bundle_simple',
        label: '심플',
        summary: '베스트 카테고리 → 베스트 브랜드 → 신상품 3종만 담은 가장 단순한 구성입니다.',
        sections: [
            { type: 'category_showcase', title: '베스트 카테고리' },
            { type: 'brand_carousel', title: '베스트 브랜드' },
            { type: 'product_carousel', title: '신상품', group: 'new', config: { maxCount: 12, columnsPerView: 4 } },
        ],
    },
};

/** 유효한 페이지 번들 키인가 */
function isValidBundleKey(key) {
    return Object.prototype.hasOwnProperty.call(PAGE_BUNDLES, String(key || ''));
}

/** 번들을 돌려준다. 없는 키면 null. */
function getBundle(key) {
    return PAGE_BUNDLES[String(key || '')] || null;
}

/** 관리자 카드 목록용 */
function bundleList() {
    return Object.values(PAGE_BUNDLES);
}

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
    PAGE_BUNDLES, isValidBundleKey, getBundle, bundleList,
};
