/*
 * 헤더 스킨 카탈로그 — navigation_config.header_layout_type 의 화이트리스트.
 *
 * 한 벌만 둔다. 예전에는 이 목록이 headerSettingsController 안에만 있어서, 다른 화면
 * (배너 관리 > 톱바)이 "이 스킨이 톱바를 그리는가" 를 알 방법이 없었다.
 * 스킨을 소비하는 화면이 늘어날수록 목록이 복사되고, 복사본은 반드시 어긋난다.
 *
 * `supported: false` 는 컬럼은 있으나 렌더가 아직 소비하지 않는 값이다.
 * feature_menu.module_ready 와 같은 원칙으로 UI 에서 잠근다 — 켜도 안 바뀌는 스위치를
 * 운영자에게 내주면 설정과 화면이 어긋난다.
 *
 * `rendersTopbar` 는 그 스킨의 템플릿이 partials/storefront/header/_topbar.ejs 를
 * 실제로 include 하는가다. 관리자 '톱바 배너·알림' 화면이 이 값으로 노출 여부를 안내한다.
 * ⚠️ 스킨 템플릿에서 톱바 include 를 넣고 빼면 **여기 값도 함께** 고칠 것.
 */
const HEADER_SKINS = Object.freeze([
    {
        value: 'main_right_utility_v1', supported: true,
        label: '기본형 — 카테고리 버튼 + 평면 GNB (3단 헤더)',
        hint: '상단 유틸바 + 로고/검색 + GNB 3단. 카테고리는 [☰ 카테고리] 버튼의 드롭다운 패널(3단 캐스케이드)로 열리고, 일반 메뉴는 그 옆에 한 줄로 놓입니다.',
        navMode: 'split',
        rendersTopbar: true,    // _pc_top.ejs 경유
    },
    {
        value: 'compact_drawer_v1', supported: true,
        label: '드로어형 — 햄버거 전체메뉴 + 아코디언 카테고리',
        hint: '헤더에는 [☰]·로고·장바구니만 두고 메뉴 전체를 좌측 슬라이드 드로어에 담습니다. 카테고리 1뎁스가 일반 메뉴와 같은 목록에 놓이고, 하위 뎁스는 [+] 로 펼칩니다. 검색창도 드로어 안에 있습니다.',
        navMode: 'unified',
        rendersTopbar: true,    // _pc_top.ejs 경유
    },
    {
        value: 'editorial_overlay_v1', supported: true,
        label: '에디토리얼형 — 투명 오버레이 헤더 (풀블리드 히어로용)',
        hint: '투명 헤더가 풀블리드 히어로 위에 겹치고, 스크롤이 히어로를 지나면 흰 배경으로 굳습니다. 로고·중앙 메뉴·우측 아이콘의 라이프스타일 무드. 테마 3(에디토리얼)과 짝을 이룹니다.',
        navMode: 'split',
        rendersTopbar: true,    // 톱바를 직접 include (헤더는 톱바 아래부터 겹친다)
    },
]);

/** 기본 스킨 — navigation_config 행이 없는 몰, 모르는 값의 폴백. views/partials/storefront/header.ejs 와 같아야 한다. */
const DEFAULT_SKIN = 'main_right_utility_v1';

function find(value) {
    return HEADER_SKINS.find(s => s.value === value) || null;
}

/** 스킨 라벨. 모르는 값이면 값 자체를 돌려준다(빈 칸보다 낫다 — 무엇이 들어 있는지는 보여야 한다). */
function labelOf(value) {
    const hit = find(value);
    return hit ? hit.label : String(value || DEFAULT_SKIN);
}

/*
 * 레이아웃 ↔ nav_mode 는 짝이다. 레이아웃만 바꾸고 nav_mode 를 그대로 두면
 * "드로어 헤더인데 카테고리가 메뉴 목록에 없는" 깨진 조합이 나온다(반대도 마찬가지).
 */
function navModeOf(value) {
    const hit = find(value);
    return (hit && hit.navMode) || 'split';
}

/** 이 스킨이 톱바(배너·알림)를 그리는가. 모르는 값은 기본 스킨으로 폴백한다. */
function rendersTopbar(value) {
    const hit = find(value) || find(DEFAULT_SKIN);
    return !!(hit && hit.rendersTopbar);
}

module.exports = { HEADER_SKINS, DEFAULT_SKIN, find, labelOf, navModeOf, rendersTopbar };
