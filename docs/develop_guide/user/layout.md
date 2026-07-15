# 사용자 레이아웃 (main_layout)

## 1. 개요

- **파일:** `views/layouts/main_layout.ejs`
- **구성 partial:**
  - `views/partials/storefront/header.ejs` — **헤더 스킨 디스패처**(아래 §4 참고). 실제 마크업은 `header/` 하위 스킨 파일에 있습니다.
  - `views/partials/storefront/header/_main_right_utility.ejs` — 기본형 스킨(`main_right_utility_v1`)
  - `views/partials/storefront/header/_compact_drawer.ejs` — 드로어형 스킨(`compact_drawer_v1`)
  - `views/partials/storefront/header/_pc_top.ejs`, `_topbar.ejs` — 두 스킨이 공유하는 공통부
  - `views/partials/storefront/header/_drawer_node.ejs` — 드로어 메뉴 노드(**자기 자신을 include 하는 재귀 파셜**)
  - `views/partials/storefront/category_panel.ejs` — PC GNB 카테고리 드롭다운(3단 캐스케이드)
  - `views/partials/storefront/mobile_bottom_nav.ejs` — 모바일 하단 시스템 바 + 카테고리 전체 레이어
  - `views/partials/storefront/right_utility.ejs` — 우측 유틸 레일
  - `views/partials/storefront/menu_showcase.ejs` — GNB 메뉴별 쇼케이스(`middleware/menuShowcase` 주입, `<%- body %>` 위에 렌더)
  - 푸터·카카오 플로팅 버튼·TOP 버튼·트래킹 스크립트는 레이아웃 파일에 인라인
- **적용 범위:** 사용자 영역 전체. `app.js`에서 `app.set('layout', 'layouts/main_layout')`로 기본 레이아웃으로 지정되어 있으며, 인증 페이지(`views/auth/*`)도 동일 레이아웃을 명시적으로 사용합니다.
- **역할:** 헤더·본문 영역·모바일 하단바·푸터를 공통으로 감싸고, 브랜드 색상·테마 토큰·SEO 메타를 동적으로 적용합니다.

---

## 2. 공통 변수 (레이아웃·뷰에서 사용)

| 변수 | 출처 | 설명 |
|------|------|------|
| `siteSettings` | middleware/siteSettings | 몰별 사이트 설정 1건 (로고, 회사명, 브랜드 색상, 연락처, SNS, `hero_variant`, GA4 등) |
| `user` | app.js 전역 (res.locals.user) | 로그인 시 Passport 사용자 객체, 비로그인 시 null |
| `isAdmin` | app.js 전역 | `req.user.role === 'super'` 일 때 true (관리자모드 링크 노출) |
| `mallId` · `mall` · `malls` | middleware/mallContext | 현재 몰 id·행·활성 몰 목록. **Top Bar 몰 선택 셀렉트**가 `malls` 를 씁니다 |
| `theme` | middleware/themeData | `{ name, tokens, cardStyle, cssVars }` — `<head>` 가 `:root` 에 인라인 주입 |
| `nav` | middleware/menuData | navigationService 위치별 조립 결과 전체 |
| `gnbMenus` | middleware/menuData | GNB 기능 메뉴 + 커스텀 슬롯. 항목마다 `href`, `name`, `badgeType`, `pcVisible`, `mobileVisible`, `newWindow` |
| `categoryButton` | middleware/menuData | GNB 최좌측 고정 카테고리 버튼(`{ name }`). null 이면 버튼 미노출 |
| `categoryTree` | middleware/menuData | NORMAL 카테고리 트리 (`navigation_config.category_max_depth` 이내, 기본 3뎁스) |
| `headerUtilMenus` | middleware/menuData | 헤더 우측 유틸 항목(`feature_menu.position='header_util'`) |
| `rightRailMenus` | middleware/menuData | 우측 유틸 레일 항목(`position='right_rail'`) |
| `menuCategories` | middleware/menuData | THEME 카테고리 — **레거시 하위호환**. 현재 헤더는 사용하지 않습니다 |
| `currentPath` | middleware/menuData | 활성 메뉴 밑줄 표시용 (`req.path`) |
| `cartCount` | middleware/cartData | 헤더·하단바·레일에 표시할 장바구니 수량 합계 (비로그인 시 0) |
| `seo` | middleware/seoDefaults (+ 컨트롤러 오버라이드) | title, description, url, image, type, siteName, robots, jsonLd |
| `shopifyEnabled` | middleware/shopifyFlag | Shopify UI(마켓 선택기) 노출 여부. 현재 false |
| `layoutType` | 컨트롤러(홈) | `page.layout_type` (`main_basic` \| `main_right_utility_v1`) |

브랜드 색상은 레이아웃 상단에서 `siteSettings.brand_main_color`, `brand_dark_color`, `brand_light_color`를 읽어 hex 보정·대비색 계산 후 CSS 변수로 사용합니다.

---

## 3. head

- **charset / viewport:** UTF-8, width=device-width, initial-scale=1.0
- **theme-color:** `siteSettings.brand_main_color` (기본 #76A764)
- **favicon:** `siteSettings.favicon_url || logo_url`
- **title:** `seo.title`이 있으면 사용, 없으면 `siteSettings.header_slogan` → `{company_name} | 건강식품 전문 쇼핑몰`
- **GA4:** `siteSettings.ga4_measurement_id` 가 있을 때만 gtag 스크립트 삽입
- **SEO:** robots, description, canonical, Open Graph(og:type, title, description, image 1200×630, url, site_name), 선택 시 jsonLd 스크립트
- **스타일:** `/css/style.css`(Tailwind 빌드), Bootstrap Icons. 폰트는 **Pretendard**(`--yd-font-family`, CSS `@import` 경유)
- **인라인 스타일:**
  - `:root` 에 테마 토큰(`--yd-font-family`, `--yd-radius-*`, `--yd-section-spacing`, `--yd-container-width`) → 그 뒤에 `theme.cssVars` 를 덮어씀
  - 브랜드 변수(`--gh-primary`, `--gh-primary-dark`, `--gh-secondary`, `--gh-primary-contrast`, `--gh-accent`, `--gh-text` 등)
  - 공통 클래스(`.gh-btn-primary`, `.brand-text`, `.brand-cta`, `.brand-tab`, `.brand-page-surface` …), 카카오 플로팅 버튼 스타일
  - `--yd-mbnav-h` — 모바일 하단 시스템 바 높이(4rem + 1px + safe-area). 767.98px 이하에서 `body { padding-bottom }` 으로 적용
- **body 클래스:** `yd-card-<theme.cardStyle>` (`shadow` \| `border` \| `flat`) → 상품 카드 스타일 결정

---

## 4. 헤더 (partials/storefront/header.ejs)

### 4.0 헤더 스킨 디스패처 ⚠️ 먼저 읽으세요

`header.ejs` 에는 **마크업이 없습니다.** 몰마다 헤더 스킨을 고르는 **디스패처**입니다.

```
navigation_config.header_layout_type   →   include 할 스킨 파일
  main_right_utility_v1  (기본형)      →   ./header/_main_right_utility.ejs
  compact_drawer_v1      (드로어형)    →   ./header/_compact_drawer.ejs
  그 외 / 행 없음                      →   기본형으로 폴백
```

- **화이트리스트로만 분기합니다.** DB 값을 그대로 include 경로에 넣으면 임의 파일이 렌더됩니다. 스킨을 추가하려면 `header.ejs` 의 `HEADER_SKINS` 맵에 등록하세요.
- `navigation_config` 행이 없는 몰도 기본형으로 렌더됩니다.
- 스킨 파일은 상위 locals(`siteSettings`/`user`/`gnbMenus`/`categoryTree`/…)를 그대로 상속합니다.
- 규모(대형몰/소형몰)와 무관합니다 — 어떤 몰이든 두 스킨 중 하나를 씁니다.

### 4.0.1 GNB 조립 방식 (`navigation_config.nav_mode`) — 2종

`header_layout_type` 과 **항상 짝으로 저장**됩니다. 스킨이 요구하는 GNB 조립 알고리즘을 정합니다(`services/menu/navigationService.js`).

| nav_mode | 짝이 되는 스킨 | 카테고리 처리 | `categoryButton` |
|---|---|---|---|
| `split` (기본) | `main_right_utility_v1` | GNB 최좌측 **고정 버튼 + 별도 패널**(`category_panel.ejs`). 메뉴와 분리 | `{ name }` |
| `unified` | `compact_drawer_v1` | 카테고리 **1뎁스가 GNB 항목으로 승격**되어 일반 메뉴와 하나의 순서 축에 섞임 | **`null`** (별도 버튼 없음) |

- `unified` 에서 카테고리 묶음이 **끼어드는 위치**는 `mall_feature_menu` 의 `CATEGORY` 행 `sort_order` 입니다.
- **절단 규칙이 다릅니다.** `split` 은 `max_gnb_items`(기본 8)로 전체를 자르지만, `unified` 는 **일반 메뉴에만** 상한을 적용합니다. 통째로 자르면 카테고리(= unified 에선 메뉴의 본체)가 잘려 나가 스토어가 반토막 납니다.
- 두 방식 모두 `gnb[]` 항목이 같은 노드 형태(`kind`·`children` 포함)라 뷰가 한 코드로 그립니다.
- PC 인라인 GNB 의 3뎁스 전개는 `_compact_drawer.ejs` 안에서 하고, 드로어 트리는 재귀 파셜 `_drawer_node.ejs` 가 그립니다.

> 아래 §4.1~§4.5 는 **기본형 스킨(`main_right_utility_v1`)** 기준 설명입니다.

### 4.1 탑바 (Top Bar) — `hidden md:flex`

**모바일에서는 숨깁니다.** 모바일은 로고줄 + GNB 슬라이더 + 하단 시스템 바 구조입니다.

- 배경: `--gh-secondary` (연한 브랜드색)
- 좌측: `siteSettings.header_slogan` (없으면 기본 문구)
- 우측(순서대로):
  1. **몰 선택 셀렉트** — `malls.length > 1` 일 때만. `<form method="get" action="/">` + `onchange` 자동 제출 → `?mall=<code>` → `mallContext` 가 세션에 고정. 현재 경로가 아니라 **홈(`/`)으로 보냅니다**(다른 몰에 없는 상품/카테고리로 남으면 404 가 되므로). JS 미사용 환경을 위해 `<noscript>` 제출 버튼을 둡니다.
  2. Shopify 마켓(국가) 선택기 — `shopifyEnabled` 일 때만 (현재 비노출)
  3. 로그인 시: 프로필 이미지 + "환영합니다, {user.name}님"
  4. `isAdmin` 이면 "관리자모드" 링크(`/admin`)
- **로그인·회원가입 링크는 이 줄에서 제거**됐습니다. 같은 동작은 아래 로고 줄의 유틸 아이콘이 담당합니다.

### 4.2 Header Row 1 — 로고 · 검색바 · 유저 액션

- **로고:** `/` 링크. `siteSettings.logo_url`이 있으면 이미지, 없으면 원형 "G" + `siteSettings.company_name`
- **검색바(중앙):** `GET /search` 폼. 라운드 입력창 + 돋보기 버튼. **모바일에서도 노출**합니다.
- **유저 액션(우측):** 아이콘 + 라벨 세로 스택
  - 로그인 상태면 로그아웃(`/auth/logout`), 아니면 로그인(`/auth/login`) — `hidden sm:flex`
  - 마이쇼핑(`/mypage`) — `hidden sm:flex`
  - 장바구니(`/cart`) + `cartCount` 배지 — 모바일에도 노출
  - 고객센터 — `headerUtilMenus` 에서 `featureCode === 'HEADER_CS'` 를 찾아 렌더. URL·표시명은 데이터에서 옵니다(하드코딩 금지). 관리자가 끄면 사라집니다.
- **모바일 햄버거 버튼은 제거**됐습니다(두 벌의 모바일 메뉴를 두지 않음).

### 4.3 모바일 GNB 슬라이더 — `md:hidden`

- `gnbMenus` 중 `mobileVisible !== 0` 항목만 가로 스크롤(`.yd-mgnb`, 스크롤바 숨김)로 나열.
- 현재 경로와 일치하면 굵게 + 하단 밑줄, `badgeType` 이 있으면 점 배지.
- **카테고리는 여기 없습니다** — 하단 시스템 바가 담당합니다.

### 4.4 Header Row 2 — PC GNB (`hidden md:block`)

- **카테고리 고정 버튼:** `categoryButton` 이 있을 때만(= `feature_menu.CATEGORY` ON). 클릭 토글로 `#gnb-cat-panel` 을 열고, `#gnb-cat-backdrop`(반투명 검정)을 함께 띄웁니다. 바깥 클릭·ESC 로 닫힘. 백드롭은 **`<header>` 바깥**에 둡니다(헤더가 `z-50` stacking context 를 만들기 때문).
- **몰별 가변 메뉴:** `gnbMenus` 중 `pcVisible !== 0` 항목. 활성 경로는 하단 보더 강조. `badgeType`(NEW/HOT/SALE)은 화이트리스트 정규화된 값만 배지로 렌더. `newWindow` 인 경우 `target="_blank" rel="noopener noreferrer"`.

### 4.5 카테고리 드롭다운 패널 (category_panel.ejs) — 3단 캐스케이드

```
[1뎁스 288px] │ [2뎁스 240px] │ [3뎁스 240px] │ [프로모션 288px]   = 1056px
```

- 1뎁스 롤오버 → 2뎁스 컬럼, 2뎁스 롤오버 → 3뎁스 컬럼이 옆 칸에 열립니다. **CSS hover 만으로 동작**(JS 없음)하므로 하위 컬럼은 반드시 상위 `<li>` 의 자손이어야 합니다.
- **프로모션 칸**: 현재 롤오버 중인 **1뎁스**의 `logo_image_path`(4:5 이미지) + `description`. 항목 아이콘이 아니라 이 칸 전용입니다.
- 자식이 없으면 해당 컬럼을 만들지 않고, 트리 전체에 자식이 없으면 좁은 단일 리스트로 렌더(프로모션 칸 생략).
- 링크는 `/products/category/{id}`.
- 트리가 비면 "등록된 카테고리가 없습니다."

---

## 5. 본문

- `<main class="flex-grow brand-page-surface">` 안에 `express-ejs-layouts`가 주입하는 `<%- body %>`가 들어갑니다.

---

## 6. 우측 유틸 레일 (right_utility.ejs)

- `rightRailMenus` 가 1건 이상일 때 **스토어프론트 전 페이지**에 include 됩니다(`position: fixed` 라 본문 레이아웃에 영향 없음). `layoutType` 과 무관합니다.
- **`@media (min-width: 1600px)` 에서만 노출**되며, 이때 레거시 플로팅 TOP 버튼(`#scrollTopBtn`)은 숨겨집니다(중복 방지).
- 항목: 로그인/마이쇼핑(시스템 고정) + `feature_menu(position='right_rail')` 항목(`RAIL_CART`, `RAIL_WISHLIST`, `RAIL_BRAND_WISHLIST`, `RAIL_RECENT`, `RAIL_TOP`) + 멤버십/앱 QR(설정 시) + TOP(최하단 고정).
- **뱃지는 `RAIL_CART` 에만 붙습니다**(`cartCount > 0` 일 때). 찜(`RAIL_WISHLIST`)·브랜드찜에는 **개수 뱃지가 없습니다** — 미들웨어가 찜 개수를 세지 않습니다.
- "바로접속" 헤더 버튼으로 레일 본문을 접을 수 있고, 상태는 `localStorage['yd_rail_collapsed']` 에 남습니다.
- 최근 본 상품은 `localStorage.yd_recent_products` 기반 — 2×2 썸네일 + 클릭 시 전체 목록 패널.

---

## 7. 모바일 하단 시스템 바 + 카테고리 레이어 (mobile_bottom_nav.ejs)

`md:hidden`. 구조(CJ온스타일형):

```
[헤더]  로고 + 검색 + 장바구니      ← header.ejs
[GNB]   일반 메뉴 가로 슬라이딩      ← header.ejs (.yd-mgnb)
[본문]
[하단바] 홈 · 카테고리 · 장바구니 · 마이(로그인)   ← 이 파일 (fixed, z-50)
```

- 하단 바는 4칸 그리드(h-16 + safe-area). 항목은 **하드코딩**입니다(`feature_menu.mobile_quick` 행이 0건). 관리자에서 바꿀 수 없습니다.
- 비로그인이면 4번째 칸이 "로그인"(`/auth/login`), 로그인이면 "마이"(`/mypage`, 프로필 이미지 표시).
- **카테고리 전체 레이어**(`#yd-cat-layer`, z-60): 화면 전체를 덮는 **단계별 드릴다운**.
  - 1뎁스 탭 → 2뎁스 패널, 2뎁스 탭 → 3뎁스 패널. 자식이 없으면 바로 상품목록으로 이동.
  - ⚠️ **여기서 만드는 카테고리 링크는 `/products?categoryId={id}` 형식**입니다. PC GNB 패널(`category_panel.ejs`)이 쓰는 `/products/category/{id}` 와 **다릅니다**. 두 형태 모두 `productController.getList` 가 처리해 동작은 같지만, 카테고리 URL 규칙을 바꾼다면 **두 곳을 함께** 고쳐야 합니다.
  - 각 하위 패널 최상단에 "{이름} 전체보기" 링크.
  - 헤더의 ← 버튼이 뒤로가기(패널 스택), X·딤·ESC 로 닫힘.
  - 하단에 현재 1뎁스의 이미지 + 설명(PC 패널 프로모션 칸과 같은 역할). 이미지·설명이 모두 없으면 영역 자체를 숨깁니다.
  - **몰 선택 셀렉트**가 레이어 상단에 있습니다(Top Bar 가 모바일에서 숨겨지므로 여기로 이동). 1뎁스 화면에서만 노출.
  - PC 의 `category_panel.ejs` 를 재사용하지 않는 이유: 그쪽은 CSS hover 캐스케이드라 터치 기기에서 열리지 않습니다.
- 세 뎁스를 모두 서버에서 렌더하고 JS 는 보이기만 전환합니다.

---

## 8. 푸터

- **상단 링크바:** 이용약관(`/terms`), 개인정보처리방침(`/privacy`)
- **좌측:** 로고(또는 회사명), `siteSettings.slogan`, SNS 링크(instagram/facebook/youtube — 각 `*_enabled` + `*_url` 이 모두 있을 때)
- **우측 "회사 정보":** 상호명, 대표전화, 이메일, 주소 (`company_name`, `contact_phone`, `contact_email`, `address`)
- **하단:** 저작권 문구 (연도 + company_name)

---

## 9. 스크립트

- **PC 카테고리 드롭다운 토글:** `#gnb-cat-btn` 클릭 → `#gnb-cat-panel` + `#gnb-cat-backdrop` 토글. 바깥 클릭·ESC 로 닫힘. (모바일 햄버거 드롭다운 스크립트는 제거됨)
- **TOP 버튼:** `#scrollTopBtn` — 스크롤 300px 초과 시 노출, `z-index: 45`(모바일 카테고리 레이어 z-60 아래에 있어야 함).
- **카카오 플로팅 버튼:** `siteSettings.kakao_channel_enabled` + `kakao_channel_url` 일 때만. hover 시 라벨 확장.
- **체류시간 비콘:** `_pvId` 가 있으면 `visibilitychange`/`pagehide` 에 `POST /api/pv-duration`.
- **카카오 문의 클릭 추적:** `[data-kakao-source]` 요소 클릭을 위임 캡처해 `POST /api/kakao-inquiry` 로 비콘 전송.

---

## 10. 메뉴가 GNB 에 뜨는 조건 (콘텐츠 게이트)

`services/menu/navigationService.js:152-243`.

메뉴는 세 관문을 **모두** 통과해야 노출됩니다.

```
mall_feature_menu.is_enabled = 1   (운영자가 켰는가)
  AND feature_menu.module_ready = 1  (모듈이 개발됐는가 — 현재 25행 전부 1)
  AND 콘텐츠 게이트 통과              (채울 콘텐츠가 있는가)
```

| feature_code | 게이트 조건 |
|---|---|
| `OUTLET` | 판매중 아울렛 상품 수 ≥ `outlet_setting.min_product_count`(기본 30) |
| `GROUP_BUY` | 공개 공동구매 **1건 이상**(`groupBuyService.hasAnyPublic`) |
| `LIVE` | 공개 라이브 **1건 이상**(`liveService.hasAnyPublic`) |

- 아울렛만 임계치인 이유: 상시 채널이라 몇 개는 있어야 "매장" 꼴이 납니다. 공동구매·라이브는 한 건만 열려도 그 자체가 콘텐츠입니다.
- **캐시:** 판정은 `${mallId}:${featureCode}` 키로 **30초 TTL** 프로세스 캐시(`menuData` 는 모든 페이지에서 도는데, 캐시가 없으면 사이트 전체에 COUNT 쿼리가 상시로 붙습니다). 관리자 변경 시 `invalidateContentGate()` 로 즉시 비웁니다.
- **게이트 조회가 실패하면 메뉴를 숨깁니다**(fail-closed). 빈 메뉴를 보여주느니 메뉴가 없는 편이 낫다는 판단이며, 실패는 캐시하지 않습니다.
- 게이트는 **조용히 숨깁니다.** "켰는데 왜 GNB 에 없나" 를 설명하려면 `checkContentGate(mallId, featureCode)` 판정을 보세요(관리자 메뉴 미리보기가 이걸 씁니다).
- 게이트와 컨트롤러의 0건 폴백은 **판정 기준이 같아야 합니다.** 어긋나면 "GNB 에는 있는데 눌러보면 준비중" 이 다시 생깁니다.

### 10.1 준비중 랜딩 (COMING_SOON) — 10종

정의: `routes/feature.js` 의 `COMING_SOON` 상수 (`module.exports.COMING_SOON` 으로 각 컨트롤러가 가져다 씁니다) · 뷰: `views/user/coming_soon.ejs` · `robots: 'noindex,follow'`.

| 용도 | 키 |
|---|---|
| **모듈이 아예 없는 메뉴** | `membership` (`users` 에 등급 컬럼이 없음 — `points_balance` 뿐) |
| **모듈은 있는데 콘텐츠 0건** | `exhibition`, `specialty`, `event`, `group-buy`, `live`, `deals`, `outlet`, `recommend`, `coupon` |

- ⚠️ **`feature_menu` 25행은 전부 `module_ready = 1` 입니다.** "준비중 랜딩 = 미구현" 이 아닙니다. 두 번째 부류는 각 컨트롤러가 **결과 0건일 때만** 폴백으로 렌더합니다.
- 개발 DB = 운영 DB 라서 생긴 배포 안전장치입니다. **지우지 마세요** — 발행 0건 상태에서 빈 목록이 그대로 노출됩니다.
- 라우트를 배포한 **뒤에** `feature_menu.module_ready` 를 1 로 올리세요. 먼저 올리면 GNB 에 404 링크가 뜹니다(로컬·서버가 같은 DB).
- `ranking` 항목은 삭제됐습니다 — 베스트가 랭킹 엔진을 흡수해 `/ranking` 은 `/best` 로 **301** 합니다.

### 10.2 `middleware/menuData.js` 가 싣는 locals

`nav`, `categoryButton`, `gnbMenus`, `rightRailMenus`, `headerUtilMenus`, `categoryTree`, `menuCategories`(THEME — 레거시), `currentPath`.

- 조립 실패 시 골격만 유지한 채 빈 메뉴로 렌더합니다(화면이 깨지지 않도록).
- `applyNavigation(req, res, mallId)` 로 **다시 조립**할 수 있습니다. 관리자 미리보기가 편집 중인 몰로 스코프를 바꿀 때 씁니다 — 이미 실려 있는 `res.locals` 는 기본 몰 기준이라 그대로 두면 종합관을 편집해도 건강식품관 메뉴가 보입니다.

---

*Last Updated: 2026-07-15*
