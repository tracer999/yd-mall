# 몰 빌더 설계서 — 몰 생성 · 구성 · 디자인 관리

> 작성일 2026-07-14. 대상: `mall` 단위로 **GNB 구조·메뉴 구성·디자인·메인 화면**을 통째로 다르게 가져가는 기능.
> 전제: 이 저장소는 전 과정이 개발 단계다. 상용 배포 상황은 없다.

---

## 0. 정정 (2026-07-14 구현 중 확정) — 이 문서보다 이 절이 우선한다

설계 당시의 "대형몰 / 소형몰" 축은 **폐기했다.** 확정된 모델은 다음과 같다.

1. **몰의 규모 분류는 없다.** `mall.mall_type` 컬럼은 삭제했다. 상품이 1만 개인 몰이 드로어형을 쓸 수도 있다.
2. **몰마다 헤더·GNB 스킨을 2종 중 고른다.** 소스 오브 트루스는 `navigation_config` 다.

   | 스킨 | `header_layout_type` | `nav_mode` | 형태 |
   |---|---|---|---|
   | 기본형 | `main_right_utility_v1` | `split` | 유틸바 + 로고/검색 + GNB 3단. 카테고리는 [☰ 카테고리] 버튼의 캐스케이드 패널 (현행) |
   | 드로어형 | `compact_drawer_v1` | `unified` | [☰]·로고·장바구니만 두고 **메뉴 전체를 좌측 슬라이드 드로어**에. 하위 뎁스는 [+] 아코디언 |

   두 값은 항상 짝으로 저장된다(`headerSettingsController.navModeOf`) — 운영자가 깨진 조합을 만들 수 없다.
   설계서 §3.3 의 인라인 스킨(`compact_inline_v1`)은 만들었다가 **폐기**했다(스킨은 2종으로 고정).

3. **커스텀·기능 메뉴는 평면 그대로다.** 계층을 갖는 것은 카테고리뿐이다. 드로어형에서 카테고리가
   메뉴 목록에 들어오는 경로는 두 가지이고 함께 쓸 수 있다:
   - `mall_feature_menu.CATEGORY` 를 켜면 → 카테고리 1뎁스 **전체**가 메뉴 목록에 들어온다(위치는 그 행의 `sort_order`).
   - 커스텀 메뉴 `link_type='CATEGORY'` 로 원하는 카테고리만 꽂으면 → **하위 카테고리가 자동으로 하위 메뉴로 붙는다**(뎁스 상속).

   즉 "일반 메뉴와 카테고리가 한 목록에 섞이고 각 항목이 자기 뎁스를 갖는" 구조가 나온다.
   `custom_menu` 에 부모/뎁스 컬럼을 추가할 필요는 없었다(한 번 넣었다가 되돌림).

---

## 1. 현황 (as-is) — 멀티몰 기반은 이미 깔려 있다

새로 만들 것으로 오해하기 쉬우나, **몰 스코프 자체는 이미 광범위하게 구현돼 있다.**

### 1.1 몰 해석 경로

**몰 컨텍스트는 두 벌이다** — 스토어프론트용과 관리자 편집용이 세션 키까지 분리돼 있다. 관리자가 `?mall=2` 로 스토어프론트를 미리보기해도 편집 대상 몰은 안 바뀐다.

| | 스토어프론트 | 관리자 |
|---|---|---|
| 미들웨어 | `middleware/mallContext.js` | `middleware/adminMallContext.js` |
| 전환 쿼리 | `?mall=<id\|code>` | `?adminMall=<id\|code>` |
| 세션 키 | `req.session.mallId` | `req.session.adminMallId` |
| req / locals | `req.mallId`, `res.locals.mallId / mall / malls` | `req.adminMallId`, `res.locals.adminMallId / adminMall / adminMalls` |
| 폴백 | `mall.is_default=1` → 없으면 하드코딩 `1` | 동일 |
| 셀렉트 박스 | `views/partials/storefront/header.ejs:35-51` (value=**code**, `action="/"` 로 홈 이동) | `views/layouts/admin_layout.ejs:269-280` (value=**id**, 현재 경로에 `?adminMall=` 부착) |

쿼리스트링은 **전환 트리거**일 뿐이고, 한 번 오면 세션에 박아 이후 요청은 세션으로 해석한다. 몰 목록은 60초 TTL 메모리 캐시이고 두 미들웨어가 공유한다(`mallContext.getMalls`).

`mall` 테이블: `id, code, name, domain, is_active, is_default`. 현재 2행.

| id | code | name | is_default | 상품 | 카테고리 |
|---|---|---|---|---|---|
| 1 | `health` | 와이디몰 건강식품관 | ✅ | 324 | 42 |
| 2 | `general` | 와이디몰 종합관 | | **9,677** | **1,723** |

> ⚠️ **몰 2는 이미 크다.** 프리셋 `overwrite` 를 몰 1·2 에 돌리면 안 된다(§4 함정 참고).

`domain` 컬럼은 도메인 기반 라우팅용으로 **미리 만들어져 있으나 아직 안 쓴다.**

### 1.2 몰 스코프 테이블 (31개)

`mall_id` 컬럼 보유:

```
categories  products  page  theme  navigation_config  site_settings
custom_menu  mall_feature_menu  coupons  shipping_policy
best_group  best_pin  best_ranking  best_ranking_run  best_score_config
brand_profile  brand_stat  brand_category_stat
deal  deal_category  event  exhibition  faq  faq_category
group_buy  hero_slide  live_show  outlet_product  outlet_setting
product_group  recommend_group
```

즉 **상품·카테고리·프로모션·메뉴·테마·홈 화면이 전부 몰별로 분리돼 있다.** 몰 2도 이미 자체 홈(`page` id=4, 섹션 10개)과 테마를 갖고 있다.

### 1.3 이미 있는 관리자 화면

| 경로 | 컨트롤러 | 역할 |
|---|---|---|
| `/admin/malls` | `mallController.js` | 몰 CRUD. 기본몰 유일성·삭제 가드(데이터 있으면 차단) 구현됨 |
| `/admin/header-settings` | `headerSettingsController.js` | `navigation_config` 편집 (GNB 슬롯 수, 카테고리 최대 뎁스 등) |
| `/admin/theme-settings` | `themeSettingsController.js` | `theme.config_json` 토큰 편집 |
| `/admin/menus`, `/admin/custom-menus`, `/admin/feature-menus` | 각 컨트롤러 | 메뉴 ON/OFF·순서·커스텀 메뉴 |
| `/admin/page-builder` | `pageBuilderController.js` | SDUI 메인 화면 섹션 조립 |
| `/admin/menu-preview` | `menuPreviewController.js` | GNB 조립 결과 미리보기 |

### 1.4 GNB 조립 (핵심 — 여기가 제약이다)

`services/menu/navigationService.js:383` `getNavigation(mallId)` 반환:

```js
{
  config,           // navigation_config 행
  categoryTree,     // NORMAL 카테고리 트리 (depth <= category_max_depth)
  categoryButton,   // GNB 최좌측 고정 '카테고리' 버튼 (feature_menu.CATEGORY)
  gnb,              // [기능메뉴 ∪ 커스텀메뉴] 를 sortOrder 로 병합 → max_gnb_items 로 절단
  rightRail, headerUtil, footer, mobileQuick
}
```

렌더(`header.ejs:186-228`, Row2):

```
[ ☰ 카테고리 ▾ ]  │  베스트  신상품  특가  기획전  브랜드  …
      └─ 클릭 시 전체 카테고리 패널 (category_panel.ejs, 2뎁스 hover 서브패널)
```

**이것이 "대형몰 방식"이다 — 카테고리 축과 일반 메뉴 축이 물리적으로 분리돼 있다.**

---

## 2. 빈 곳 (gap) — 4가지

### G1. 몰 "유형" 개념이 없다
`navigation_config.header_layout_type` 의 화이트리스트(`headerSettingsController.js:23-25`)에 값이 **단 하나** 뿐이다.

```js
const HEADER_LAYOUT_TYPES = [
    { value: 'main_right_utility_v1', label: '기본형 (로고 좌측 · 유틸 우측)', supported: true },
];
```

뷰도 `header.ejs` 하나로 하드코딩. **레이아웃을 고를 수단 자체가 없다.**

또한 `navigation_config` 의 **절반이 죽은 컬럼**이다 — 저장은 되는데 렌더가 안 읽는다.

| 컬럼 | 상태 |
|---|---|
| `category_display_type` | **미소비** (dropdown/mega 구분 없음) |
| `use_mega_menu` | **미소비**. 컨트롤러가 항상 0 강제 |
| `use_search_bar` | **미소비**. `header.ejs:106` 이 이 값을 안 보고 검색창을 **무조건** 렌더 |
| `config_json` | 미사용 (NULL) |

→ 소형몰 헤더에서 "검색 아이콘 토글"을 쓰려면 `use_search_bar` 를 **실제로 배선해야 한다.** 지금은 켜든 끄든 아무 일도 안 일어난다.

### G2. GNB 자료구조가 평면이다 (가장 큰 제약)
- `getNavigation().gnb` 의 각 항목에 **`children` 이 없다.**
- `middleware/menuData.js:24` `toViewItem()` 이 `{name, href, featureCode, badgeType, …}` 만 뽑고 나머지를 **버린다.**
- 카테고리 트리는 `categoryButton` **하나에만** 매달린 별도 패널이다.

→ 사용자가 원하는 소형몰 구조("카테고리 1뎁스가 GNB 최상위 항목으로 올라가고, 롤오버하면 2·3뎁스가 펼쳐지고, 일반 메뉴도 같은 줄에 섞임")를 **표현할 자료구조가 아예 없다.**

### G3. 몰 생성이 빈 껍데기를 만든다
`mallController.postAdd` 는 `navigation_config` 1행만 만든다(`mallController.js:101-103`). 그래서 새 몰은:

| 대상 | 상태 | 결과 |
|---|---|---|
| `mall_feature_menu` | 없음 | **GNB 가 통째로 빈다** ⚠️ |
| `page(home)` + `page_section` | 없음 | **메인 화면이 빈다** ⚠️ |
| `theme` | 없음 | 기본 토큰으로 폴백 (동작은 함) |
| `site_settings` | 없음 | `middleware/siteSettings.js:25-39` 가 **기본몰 설정으로 폴백** → 로고·상호가 기본몰 것으로 나온다 |

몰 2는 `scripts/seed_mall2_general.js` 로 **수동 시딩**했다. 관리자가 몰을 만들면 쓸 수 없는 몰이 나온다.

> **단, `mall_feature_menu` 는 이미 자동 백필 장치가 있다.** `services/menu/featureMenuSync.js` 의 `ensureAllMalls()` 가 앱 기동 시(`app.js:113`) 돌고, `ensureMallFeatureMenus(mallId)` 가 관리자 메뉴 화면 진입 시에도 돈다. **프로비저너는 이걸 재사용해야 한다** — 시딩 로직을 새로 짜면 두 벌이 어긋난다.

### G4. 몰 하나를 구성하려면 6개 화면을 떠돈다
`malls` → `header-settings` → `menus` → `custom-menus` → `theme-settings` → `page-builder`. 각 화면은 상단 몰 셀렉트에 의존하므로 **"어느 몰을 편집 중인지" 가 화면마다 흩어진다.**

---

## 3. 설계 (to-be)

### 3.0 설계 원칙

1. **기존 동작은 한 줄도 바뀌지 않는다.** 신규 축은 전부 기본값이 현행과 동일(`nav_mode='split'`).
2. **몰 셀렉트 박스는 유지한다** (사용자 요구).
3. **조합 폭발을 막는다.** `nav_mode` × `header_layout_type` × 테마 × 홈 섹션을 각각 고르게 두면 운영자가 깨진 조합을 만든다. → **몰 유형 프리셋**이 이 값들을 한 번에 세팅하고, 세부 조정은 그 다음에 허용한다.
4. **죽은 스위치를 안 만든다.** 이 저장소의 기존 원칙(`feature_menu.module_ready`, `HEADER_LAYOUT_TYPES.supported`)을 그대로 따른다 — 렌더가 지원하지 않는 값은 UI 에서 잠근다.

---

### 3.1 [P1] 스키마 — 축 2개 추가

```sql
-- 몰 유형(표시·프리셋 기억용)
ALTER TABLE mall
  ADD COLUMN mall_type  VARCHAR(20) NOT NULL DEFAULT 'large' AFTER name,   -- 'large' | 'small'
  ADD COLUMN preset_key VARCHAR(50) NULL AFTER mall_type;                  -- 마지막 적용 프리셋

-- GNB 조립 알고리즘 선택 (이게 핵심)
ALTER TABLE navigation_config
  ADD COLUMN nav_mode VARCHAR(20) NOT NULL DEFAULT 'split' AFTER header_layout_type;
```

`nav_mode` 기본값이 `'split'` 이므로 **기존 몰 2개는 아무것도 안 바뀐다.**

`navigation_config.config_json` 은 이미 있고 NULL 이다 — 레이아웃별 세부 옵션(드롭다운 트리거 hover/click, 메가메뉴 열 수 등)을 여기 담는다. 새 컬럼을 계속 늘리지 않는다.

| nav_mode | 대상 | GNB 구성 |
|---|---|---|
| `split` (기본 = 현행) | 대형몰 | `[☰ 카테고리 ▾]` │ 기능/커스텀 메뉴 (평면) |
| `unified` (신규) | 소형몰 | 카테고리 1뎁스 + 기능/커스텀 메뉴가 **하나의 GNB 축**에 병합. 각 항목이 `children`(2~3뎁스)을 가짐 → 롤오버/클릭 드롭다운 |

---

### 3.2 [P2] navigationService — 공통 노드 shape + unified 빌더

**모든 GNB 항목을 하나의 노드 타입으로 통일한다.**

```js
// GNB 노드 (split·unified 공통)
{
  key,            // 'feature:BEST' | 'custom:12' | 'category:34'
  kind,           // 'feature' | 'custom' | 'category'
  name, href,
  badgeType, newWindow, loginRequired,
  pcVisible, mobileVisible, sortOrder,
  children: []    // split 에선 항상 [], unified 에선 카테고리 하위 트리
}
```

`getNavigation()` 을 `nav_mode` 로 분기:

```js
async function getNavigation(mallId = 1, opts = {}) {
    const config = await getConfig(mallId);
    const [features, customs, categoryTree] = await Promise.all([...]); // 현행 그대로

    return config.nav_mode === 'unified'
        ? buildUnified(config, features, customs, categoryTree, isLoggedIn)
        : buildSplit(config, features, customs, categoryTree, isLoggedIn);  // ← 현행 로직 그대로 이동
}
```

**`buildSplit`** = 현재 `getNavigation` 본문을 그대로 옮긴 것. 반환 shape 동일 (`categoryButton` 있음, `gnb[].children = []`). **회귀 0.**

**`buildUnified`** 신규:

1. `categoryTree`(이미 `depth <= category_max_depth` 로 필터됨)의 **루트 노드들**을 GNB 노드로 변환. `children` 은 하위 트리를 재귀 매핑(`href = /products/category/{id}`).
2. 기능 메뉴·커스텀 메뉴를 `children: []` 노드로 변환 (split 과 동일).
3. **하나의 `sortOrder` 축으로 병합 정렬.** 카테고리 블록의 삽입 위치는 `mall_feature_menu` 의 `CATEGORY` 행 `sort_order` 로 정한다 — 즉 기존 "카테고리 버튼"의 순서 값을 **카테고리 블록의 위치**로 재해석한다.
   - `CATEGORY` 가 `is_enabled=0` 이면 → 카테고리가 GNB 에서 빠진다 (일반 메뉴만 있는 몰).
4. `categoryButton = null` 을 반환한다 (unified 에선 별도 카테고리 버튼이 없다).
5. **절단 규칙이 다르다.** `max_gnb_items` 로 자를 때 카테고리가 잘려나가면 스토어가 반토막 난다.
   → **카테고리 노드는 절단 대상에서 제외**하고, 기능/커스텀 메뉴만 `max_gnb_items - 카테고리수` 만큼 남긴다. 남는 슬롯이 0 이하면 기능 메뉴가 0개가 되는 것이 아니라, **관리자 미리보기에 경고**를 띄운다(`gnbCandidateCount` 와 같은 방식).

**`middleware/menuData.js` 수정** — `toViewItem()` 이 `children` 을 **재귀 매핑**하도록. 현재는 버린다.

```js
function toViewItem(item) {
    return {
        ...기존 필드,
        kind: item.kind || 'feature',
        children: (item.children || []).map(toViewItem),   // ← 추가
    };
}
```

---

### 3.3 [P3] 헤더 뷰 분해 — 디스패처 + 스킨 2종

현재 `header.ejs`(236줄)는 단일 하드코딩이다. 이를 **얇은 디스패처**로 바꾼다.

```
views/partials/storefront/
  header.ejs                 ← 디스패처 (10줄). nav.config.header_layout_type 으로 분기
  header/
    _main_right_utility.ejs  ← 현행 236줄을 그대로 이관 (대형몰). 회귀 0
    _compact_inline.ejs      ← 신규 (소형몰)
    _gnb_node.ejs            ← 재귀 파셜: GNB 노드 1개 + children 드롭다운 (2·3뎁스)
  category_panel.ejs         ← split 전용 (그대로)
```

`headerSettingsController.HEADER_LAYOUT_TYPES` 화이트리스트 확장:

```js
const HEADER_LAYOUT_TYPES = [
    { value: 'main_right_utility_v1', label: '대형몰형 (유틸바 + 로고/검색 + GNB 3단)', supported: true, navModes: ['split'] },
    { value: 'compact_inline_v1',     label: '소형몰형 (로고 + GNB 인라인 1단)',        supported: true, navModes: ['unified'] },
];
```

`navModes` 로 **레이아웃과 nav_mode 의 유효 조합을 서버가 강제**한다. 운영자가 깨진 조합을 저장할 수 없다.

#### `_compact_inline.ejs` 구조 (소형몰)

```
┌──────────────────────────────────────────────────────────┐
│ [로고]   회사소개  제품  ▾  브랜드스토리  공지사항   🔍 👤 🛒 │  ← 1단 인라인 GNB
└──────────────────────────────────────────────────────────┘
                     └─ hover/click 드롭다운
                        ├ 건강기능식품 ▸ ─┬ 유산균
                        │                 └ 오메가3
                        └ 식품            (3뎁스는 우측 flyout)
```

- 검색은 아이콘 토글(공간 절약). `use_search_bar=0` 이면 숨김.
- 드롭다운 트리거는 `config_json.dropdown_trigger` = `'hover'`(기본) | `'click'`.
- 접근성: `aria-expanded`, `aria-haspopup`, Esc 닫기, 키보드 화살표 이동. 터치 기기는 첫 탭 = 열기(hover 안 먹음).
- 모바일: unified 도 모바일에선 GNB 가로 슬라이더 + 카테고리 전체 레이어(`mobile_bottom_nav.ejs`)를 **그대로 재사용**한다. 3뎁스 hover 는 모바일에 의미가 없다.

#### `_gnb_node.ejs` (재귀)

```ejs
<%# GNB 노드 1개. children 있으면 드롭다운. depth 로 flyout 방향 결정 %>
<li class="yd-gnb__item" data-depth="<%= depth %>">
  <a href="<%= node.href %>" ...><%= node.name %><% if (node.children.length) { %><i class="bi bi-chevron-down"></i><% } %></a>
  <% if (node.children.length) { %>
    <ul class="yd-gnb__sub yd-gnb__sub--d<%= depth + 1 %>">
      <% node.children.forEach(c => { %>
        <%- include('./_gnb_node', { node: c, depth: depth + 1 }) %>
      <% }) %>
    </ul>
  <% } %>
</li>
```

> **재귀 파셜은 이미 선례가 있다.** `views/partials/storefront/category_node.ejs` 가 전체 뎁스 재귀 렌더러인데, `category_panel.ejs` / `mobile_bottom_nav.ejs` 가 3뎁스를 하드코딩 전개하는 바람에 **아무도 안 쓰는 고아 파셜**이 됐다. `_gnb_node.ejs` 는 이 파일을 되살리거나 같은 패턴을 따른다.

> **주의 1 — 뎁스 상한.** `category_max_depth` 상한이 3인 이유가 "프론트가 3뎁스까지만 렌더"였다(`headerSettingsController.js:31`). 재귀 파셜을 쓰면 이 제약이 사라지지만 **상한은 3으로 유지한다** — 4뎁스 이상은 GNB UX 가 무너진다.

> **주의 2 — CSS hover 캐스케이드의 DOM 제약.** `category_panel.ejs` 가 순수 CSS hover 로 3단 캐스케이드를 만드는데, **3뎁스 컬럼이 2뎁스 `<li>` 의 자손이어야 한다**(형제로 빼면 마우스 이동 중 hover 가 끊긴다). `_gnb_node.ejs` 의 재귀 구조는 이 제약을 자연히 만족한다(자식 `<ul>` 이 부모 `<li>` 안에 들어가므로).

> **주의 3 — 링크 경로 불일치.** PC 패널은 `/products/category/:id`, 모바일 하단바는 `/products?categoryId=:id` 로 **같은 카테고리를 다른 URL 로** 보낸다. unified GNB 를 새로 만들면서 경로를 하나로 통일한다(`/products/category/:id`).

> **주의 4 — `use_search_bar` 배선.** 소형몰 헤더의 검색 아이콘 토글은 이 컬럼을 읽어야 하는데 **지금 아무도 안 읽는다**(G1 참고). `_compact_inline.ejs` 에서 처음으로 실제 소비한다. 기존 `_main_right_utility.ejs` 는 현행 동작 보존을 위해 **계속 무시**한다(검색창 항상 노출).

---

### 3.4 [P4] 몰 프리셋 & 프로비저닝 — "만들면 바로 쓸 수 있는 몰"

#### `services/mall/presets.js` (신규)

```js
module.exports = {
  large_mall: {
    label: '대형몰 (카테고리 분리형)',
    description: '카테고리 버튼과 일반 메뉴가 분리된 종합몰 구조. 상품 수가 많고 프로모션 축이 많은 몰.',
    mallType: 'large',
    navigation: {
      nav_mode: 'split',
      header_layout_type: 'main_right_utility_v1',
      category_display_type: 'dropdown',
      max_gnb_items: 12, max_custom_items: 3, category_max_depth: 3,
      use_mega_menu: 0, use_search_bar: 1,
    },
    featureMenus: ['CATEGORY','BEST','NEW','DEAL','EXHIBITION','BRAND','OUTLET','EVENT','LIVE','GROUP_BUY'],
    theme: { fontFamily: "'Pretendard', …", cardRadius: '0.5rem', productCardStyle: 'shadow', containerWidth: '72rem' },
    homeSections: ['hero','value_proposition','best_ranking','product_carousel','product_grid',
                   'deal_carousel','quick_menu','benefit_bento','promotion_banner','ranking_tabs',
                   'brand_carousel','category_showcase','recent_product','kakao_cta'],
  },

  small_mall: {
    label: '소형몰 (통합 GNB · 홈페이지형)',
    description: '카테고리와 일반 메뉴가 한 줄 GNB 에 섞이고 롤오버로 하위 뎁스가 펼쳐지는 구조. 일반 기업 홈페이지에 가까운 몰.',
    mallType: 'small',
    navigation: {
      nav_mode: 'unified',
      header_layout_type: 'compact_inline_v1',
      category_display_type: 'dropdown',
      max_gnb_items: 8, max_custom_items: 5, category_max_depth: 3,
      use_mega_menu: 0, use_search_bar: 1,
    },
    featureMenus: ['CATEGORY','NEW','NOTICE'],   // 최소 구성
    theme: { fontFamily: "'Pretendard', …", cardRadius: '0.75rem', productCardStyle: 'border', containerWidth: '64rem' },
    homeSections: ['hero','value_proposition','product_grid','custom_html','kakao_cta'],
  },
};
```

> `is_required = 1` 인 feature_menu(로그인·장바구니·검색 등)는 프리셋 목록과 무관하게 **항상 활성**으로 시딩한다 — 현행 불변식.

#### `services/mall/mallProvisioner.js` (신규)

```js
/**
 * 몰에 프리셋을 적용해 "바로 뜨는 몰"을 만든다.
 * @param {'fill'|'overwrite'} mode
 *   fill      — 없는 것만 채운다 (기본, 비파괴). 몰 생성 시 사용.
 *   overwrite — 프리셋 값으로 덮어쓴다. 기존 page_section·테마가 날아간다. 명시적 확인 필요.
 */
async function provisionMall(mallId, presetKey, { mode = 'fill' } = {}) { … }
```

트랜잭션 안에서:

| 순서 | 대상 | fill 동작 | overwrite 동작 |
|---|---|---|---|
| 1 | `navigation_config` | 행 없으면 INSERT | 프리셋 값으로 UPDATE |
| 2 | `mall_feature_menu` | **`featureMenuSync.ensureMallFeatureMenus(mallId)` 호출**(기존 장치 재사용) → 프리셋 목록 + `is_required` 만 `is_enabled=1` 로 UPDATE | 전건 재시딩 |
| 3 | `theme` | 행 없으면 INSERT | `config_json` UPDATE |
| 4 | `site_settings` | 행 없으면 INSERT (몰명 기본값) | 건드리지 않음 (로고·상호는 운영자 자산) |
| 5 | `page(page_type='home')` + `page_section` | 없으면 생성 | **섹션 전량 교체** (⚠️ 파괴적) |
| 6 | `page_revision` | — | **반드시 새 리비전 발행** (아래 참고) |

> 🔴 **`page_revision` 함정 — 이걸 놓치면 "저장했는데 화면이 안 바뀐다".**
> `displayService.getPageSections()` 는 **발행 스냅샷(`page_revision.snapshot_json`)이 있으면 그것을 렌더하고, 없을 때만 라이브 `page_section` 으로 폴백**한다.
> 따라서 프로비저너가 `page_section` 만 갈아끼우면, **이미 발행 이력이 있는 페이지는 옛 스냅샷이 계속 나간다.**
> → `overwrite` 는 섹션 교체 후 **반드시 새 리비전을 발행**해야 한다. `fill` 로 새로 만든 페이지는 리비전이 없으므로 라이브 폴백으로 정상 렌더된다.

완료 후 `mall.mall_type`, `mall.preset_key` 갱신 + `mallContext.invalidate()` + `themeData.invalidate(mallId)` + `navigationService.invalidateContentGate(mallId)`.

#### `mallController` 변경

- `postAdd`: 폼에 **몰 유형 라디오(대형/소형)** 추가 → 생성 직후 `provisionMall(id, presetKey, { mode:'fill' })`. 현재의 `navigation_config` INSERT 는 프로비저너가 흡수한다.
- `postDelete`: 정리 대상에 `site_settings`, `page`, `page_section` 추가 (현재 누락 → 몰 삭제 시 고아 데이터).
- 신규 `postApplyPreset`: 기존 몰에 프리셋 재적용. `overwrite` 는 **어떤 데이터가 날아가는지 개수를 세어 확인 화면에 보여준 뒤에만** 실행.

---

### 3.5 [P5] 몰 구성 허브 — 관리자 UX

`/admin/malls/:id` 를 단순 폼에서 **탭 허브**로 바꾼다. **기존 6개 화면은 그대로 둔다** — 허브는 "그 몰로 스코프가 고정된 진입점"일 뿐이다.

```
┌ 와이디몰 종합관 (general)  [기본몰 아님] [활성]  ─────────────────┐
│ [기본정보] [몰 유형·프리셋] [헤더/GNB] [메뉴] [디자인] [메인화면] │
├──────────────────────────────────────────────────────────────┤
│  ● 몰 유형                                                     │
│    ○ 대형몰 — 카테고리 버튼 + 일반 메뉴 분리                     │
│    ● 소형몰 — 통합 GNB, 롤오버 2·3뎁스                          │
│                                                                │
│  [프리셋 다시 적용]  ⚠ 메인화면 섹션 10개가 교체됩니다           │
└──────────────────────────────────────────────────────────────┘
```

| 탭 | 재사용 대상 |
|---|---|
| 기본정보 | 현행 `malls/form.ejs` |
| 몰 유형·프리셋 | **신규** |
| 헤더/GNB | `header-settings` (임베드 or 링크, `?mall=:id` 고정) + `nav_mode` 라디오 |
| 메뉴 | `menus` / `custom-menus` / `feature-menus` 링크 + `menu-preview` |
| 디자인 | `theme-settings` |
| 메인화면 | `page-builder` |

허브에서 진입할 땐 `adminMallContext` 를 URL 의 `:id` 로 강제한다 — 상단 셀렉트와 편집 대상이 어긋나는 사고를 막는다.

---

### 3.6 [P6] 미리보기 확장 — 대부분 공짜다

`menu-preview` 는 **이미 잘 만들어져 있다.** 조립 로직을 재구현하지 않고 스토어프론트와 **같은 `navigationService.getNavigation()`** 을 호출하며(`menuPreviewController.js:70`), `findExcluded()` 가 "무엇이 왜 안 보이는가"를 판정한다(모듈 미구현 → 사용 안 함 → 로그인 필요 → 노출 기간). `gnbTruncated` 경고 배너도 있다.

→ `getNavigation()` 이 `nav_mode` 를 알아서 분기하므로 **미리보기는 자동으로 따라온다.** 추가할 것만:
- 헤더 모형을 `nav_mode` 에 따라 split/unified 두 모양으로 렌더.
- unified 에서 `카테고리 노드 수 + 기능/커스텀 메뉴 수 > max_gnb_items` 면 경고(절단 규칙이 split 과 다르므로).

---

## 4. 구현 순서 & 회귀 위험

| # | 단계 | 파일 | 회귀 위험 |
|---|---|---|---|
| P1 | 스키마 2컬럼 | `ALTER` + `tables.sql` | **없음** (기본값 = 현행) |
| P2 | navigationService 분기 + menuData children | `services/menu/navigationService.js`, `middleware/menuData.js` | **낮음** — `buildSplit` 은 현행 로직 이관, unified 는 새 경로 |
| P3 | 헤더 뷰 분해 + 소형몰 스킨 | `views/partials/storefront/header*` | **중간** — 현행 마크업을 `_main_right_utility.ejs` 로 **무수정 이관**해야 함 |
| P4 | 프리셋 + 프로비저너 | `services/mall/*`, `mallController.js` | **낮음** (신규 경로) |
| P5 | 몰 구성 허브 | `views/admin/malls/*`, `routes/admin/malls.js` | **낮음** |
| P6 | 미리보기 | `menuPreviewController.js` | 없음 |

### 알려진 함정 (이 저장소 특유)

- **`page_revision` 스냅샷 우선** — §3.4 의 🔴 항목. 이 설계에서 가장 놓치기 쉬운 지점이다.
- **EJS 캐시**: `.ejs` 수정 후 서버 재시작 필수. 안 하면 "수정이 안 먹는다"고 헛짚는다.
- **`category_max_depth` 하향 가드**: 이미 있는 가드(`headerSettingsController.js:99-103`)를 unified 에서도 유지해야 한다. unified 에선 카테고리가 GNB **본체**라 뎁스를 낮추면 메뉴가 통째로 사라진다.
- **`featureMenuSync` 재사용**: `mall_feature_menu` 시딩 로직을 새로 짜지 말 것. 스토어프론트는 `INNER JOIN`, 관리자는 `LEFT JOIN` 으로 읽어서 행이 없으면 "관리자엔 보이는데 몰엔 안 뜨는" 버그가 이미 한 번 났다.
- **fail-open 가드**: 프로비저닝을 CLI 스크립트로 돌린다면 `scripts/_bootstrap.js` 를 먼저 호출할 것. 안 하면 Shopify 동기화가 fail-open 으로 실제 API 를 친다.
- **DB 공용 + 몰 2는 크다**: 로컬·서버가 같은 DB(`yd_mall`)를 본다. 몰 2에는 상품 9,677개·카테고리 1,723개가 있다. 프로비저닝 테스트는 **버릴 수 있는 테스트 몰**(예: `test_small`)을 새로 만들어서 하고, **몰 1·2 에 `overwrite` 를 절대 돌리지 않는다.**
- **관리자 미리보기 몰 정합성**: 페이지빌더 미리보기는 `req.mallId` 를 `adminMallId` 로 덮고 `menuData.applyNavigation()` 을 **재호출**해야 섹션과 헤더가 같은 몰이 된다(`mainController.js:137-143`). unified 헤더를 붙일 때 이 경로가 깨지지 않는지 확인할 것.

---

## 4.1 이번 스코프 밖이지만 발견한 결함 (별도 처리 필요)

설계 조사 중 드러난 것들. **이번 작업에서 고치지 않지만 기록해 둔다.**

| # | 결함 | 영향 |
|---|---|---|
| 1 | **몰 삭제 가드에 구멍** — `mallController.postDelete` 가 `categories`/`products` 만 검사한다. `mall_id` 를 가진 31개 테이블에 **FK 가 하나도 없어서**, 쿠폰·기획전·이벤트·페이지만 있는 몰은 가드를 통과해 삭제되고 **고아 데이터가 남는다.** → P4 에서 정리 대상에 `site_settings`/`page`/`page_section` 을 추가하면서, 검사 대상도 넓히는 게 좋다. |
| 2 | **대시보드·매출이 몰 스코프가 아니다** — `dashboardController`, `salesController` 가 `adminMallId` 를 안 쓴다. 편집 몰을 바꿔도 숫자가 **전 몰 합산**으로 안 바뀐다. |
| 3 | **`orders`/`carts` 에 `mall_id` 가 없다** — 몰 간 상품이 한 장바구니·한 주문에 섞일 수 있고, 주문 통계를 몰별로 나눌 수 없다. |
| 4 | **sitemap 이 기본몰만 포함** — `routes/sitemap.js` 가 `is_default=1` 몰만 본다. 몰 2의 9,677개 상품이 SEO 에서 통째로 빠진다. |
| 5 | **`deal.mall_id`/`deal_category.mall_id` 만 `int`** — 나머지 29개는 `bigint`, `mall.id` 도 `bigint`. |
| 6 | **모바일 하단바 하드코딩** — `feature_menu(position='mobile_quick')` 스키마와 `nav.mobileQuick` 출력이 있는데 `mobile_bottom_nav.ejs` 가 안 읽고 홈/카테고리/장바구니/마이를 하드코딩한다(해당 행 0건이라 의도적). |

---

## 5. 열린 결정 (사용자 확인 필요)

1. **소형몰 헤더에 검색바를 상시 노출할지, 아이콘 토글로 할지** — 설계서는 토글을 가정.
2. **unified 에서 카테고리를 GNB 어디에 넣을지** — 설계서는 `mall_feature_menu.CATEGORY.sort_order` 로 위치를 정하는 안. (예: sort_order=0 이면 맨 앞, 50 이면 일반 메뉴 뒤)
3. **프리셋을 2종(대형/소형)으로 시작할지, 더 늘릴지** — 3종 이상(예: 브랜드몰, 단일상품몰)은 P4 이후 데이터만 추가하면 된다.
4. **도메인 기반 몰 라우팅**(`mall.domain`)을 이번에 켤지 — 설계서는 스코프 밖으로 둠(셀렉트 유지 요구에 따라).
