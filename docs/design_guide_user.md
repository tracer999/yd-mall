# 사용자 화면 디자인 가이드 (User UI Design Guide)

고객이 보는 스토어프론트 페이지를 작업할 때 참고하는 **공통 레이아웃, 컬러/테마 시스템, 컴포넌트 구조, 페이지 패턴** 가이드입니다.

## 1. 기술 스택 및 전반 구조

- **템플릿 엔진**: EJS + `express-ejs-layouts`. 기본 레이아웃은 `views/layouts/main_layout.ejs`
- **스타일링**: Tailwind CSS 4.x 빌드 결과(`public/css/style.css`) + `main_layout.ejs` 의 `<style>` 블록에 정의된 CSS 변수/유틸리티 클래스
- **폰트**: **Pretendard** (`--yd-font-family` 로 주입, 테마에서 교체 가능)
- **아이콘**: Bootstrap Icons (`bi bi-*`)
- **슬라이더**: Swiper 11 (CDN)
- **뷰 위치**: `views/user/**`, 공통 조각은 `views/partials/**`

### 1.1 주요 라우트

| 경로 | 뷰 |
|------|-----|
| `/` | `views/user/index.ejs` — **SDUI 섹션 조립 렌더** |
| `/products`, `/products/category/:id` | `views/user/products/list.ejs` |
| `/products/:slug` (SEO), `/products/view/:id` | `views/user/products/detail.ejs` |
| `/search` | `views/user/search.ejs` |
| `/cart`, `/checkout` | `views/user/cart.ejs`, `views/user/checkout/` |
| `/notices`, `/inquiries`, `/brands`, `/cs` | 각 디렉터리 |
| `/exhibition`, `/event`, `/group-buy`, `/coupon` | 기획전·이벤트·공동구매·쿠폰 |
| `/mypage`, `/likes` | 마이페이지, 찜 |
| `/terms`, `/privacy` | 정책/약관 |
| **`/design-guide/user`** | `views/user/design_guide.ejs` — 디자인 프리뷰 페이지 |

## 2. 레이아웃 및 공통 요소

### 2.1 메인 레이아웃 (`views/layouts/main_layout.ejs`)

```
<header>   상단 고정 헤더
<main class="flex-grow brand-page-surface">   페이지 본문
<footer>   회사 정보 / SNS
+ 카카오 플로팅 버튼 (.kakao-floating-btn — hover 시 라벨이 펼쳐지는 pill)
```

**헤더는 DB 기반 내비게이션(`services/menu/navigationService.js`)으로 조립됩니다.** `middleware/menuData.js` 가 다음 `res.locals` 를 주입합니다.

| 변수 | 내용 |
|------|------|
| `gnbMenus` | 메인 GNB 메뉴 (기본 최대 8개) |
| `categoryButton` | 좌측 "카테고리" 버튼 |
| `categoryTree` | 카테고리 드롭다운 트리 (`navigation_config.category_max_depth` 로 깊이 제한) |
| `rightRailMenus` | 우측 레일 메뉴 |
| `headerUtilMenus` | 헤더 유틸(검색/장바구니/마이페이지 등) |
| `menuCategories` | THEME 타입 카테고리 |

메뉴 구성은 관리자 `/admin/header-settings`, `/admin/feature-menus`, `/admin/system-menus` 에서 바꿉니다. **뷰에 메뉴를 하드코딩하지 마세요.**

### 2.2 Footer

`/admin/site-settings` 에서 입력한 회사 정보(회사명, 주소, 대표자, 사업자등록번호, 통신판매업 신고번호, 고객센터)와 SNS 링크(인스타그램/페이스북/유튜브)가 `siteSettings` 를 통해 노출됩니다.

### 2.3 테마 토큰 (`--yd-*`)

`middleware/themeData.js` 가 활성 테마를 읽어 `:root` 에 주입합니다. 값은 `themeService` 가 화이트리스트 + 정규식으로 검증한 것만 통과합니다(CSS 인젝션 차단). 테마가 없으면 아래 기본값이 쓰입니다.

```css
--yd-font-family:     'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
--yd-radius-button:   0.5rem;
--yd-radius-card:     0.5rem;
--yd-radius-pill:     9999px;
--yd-radius-input:    0.375rem;
--yd-section-spacing: 3rem;
--yd-container-width: 72rem;
```

상품 카드 스타일은 `<body>` 클래스로 전환됩니다 — `body.yd-card-shadow` / `.yd-card-border` / `.yd-card-flat` 가 `.product-card-surface` 의 그림자·보더를 결정합니다. **상품 카드를 새로 만들면 `.product-card-surface` 클래스를 붙여야 테마가 적용됩니다.**

관리자 `/admin/theme-settings` 에서 편집합니다.

### 2.4 브랜드 컬러 변수 (`--gh-*`)

`siteSettings.brand_main_color` / `brand_dark_color` / `brand_light_color` 에서 파생됩니다.

```css
--gh-primary:             /* 키컬러 */
--gh-primary-dark:        /* 진한색 */
--gh-secondary:           /* 연한색 */
--gh-primary-contrast:    /* 버튼/배지 텍스트 대비색 */
--gh-accent:              color-mix(in srgb, var(--gh-primary) 60%, var(--gh-primary-dark));
--gh-text: #2C3E50;  --gh-muted: #7F8C8D;  --gh-border: #E2E8F0;
--gh-primary-soft:        color-mix(in srgb, var(--gh-primary) 15%, white);
--gh-primary-soft-strong: color-mix(in srgb, var(--gh-primary) 28%, white);
--gh-primary-ring:        color-mix(in srgb, var(--gh-primary) 40%, transparent);
--gh-primary-shadow:      color-mix(in srgb, var(--gh-primary) 22%, transparent);
```

### 2.5 유틸리티 클래스

| 클래스 | 설명 |
|--------|------|
| `.brand-text` / `.brand-text-strong` | 키컬러 / 진한 컬러 텍스트 |
| `.brand-chip` | 연한 배경 + 진한 텍스트의 pill/태그 |
| `.brand-border` | 브랜드 톤 보더 |
| `.brand-badge` | 키컬러 배경 + 대비 텍스트 뱃지 |
| `.brand-cta` | 그라데이션 CTA 버튼 (hover 시 살짝 떠오름, radius = `--yd-radius-pill`) |
| `.brand-pill--ghost` | 테두리형 pill 버튼 |
| `.brand-focus` | 포커스 시 브랜드 컬러 링 (인풋/셀렉트, radius = `--yd-radius-input`) |
| `.brand-tab` / `.brand-tab.is-active` | 탭 UI |
| `.brand-page-surface` | 페이지 기본 배경 (**고정 중립색 `#F7F8FB`** — 브랜드 연한색과 분리) |
| `.gh-btn-primary` | 단색 키컬러 버튼 |
| `.gh-link` | 본문 링크 (hover 시 키컬러) |
| `.gh-serif` | 강조 타이틀용 — 현재는 본문과 같은 폰트의 **bold**(별도 serif 폰트 아님) |
| `.product-card-surface` | 상품 카드 겉면 (테마 카드 스타일 적용 대상) |

```html
<button class="px-4 py-2 rounded-lg text-sm font-semibold brand-cta">지금 구매하기</button>
<div class="inline-flex items-center px-3 py-1 rounded-full text-xs brand-chip">#유기농</div>
```

## 3. 홈은 SDUI 로 조립됩니다 (중요)

홈(`/`)은 **하드코딩된 섹션이 아니라 DB 정의(`page` / `page_section`)를 읽어 조립**합니다.

```
controllers/mainController.getHome
  → displayService.getHomeSections()            services/display/
      → resolvers/*.js 가 섹션별 데이터를 채움
  → views/user/index.ejs 가 sort_order 순으로 렌더
      → 각 section = { type, view: 'partials/sections/*', locals }
```

- **섹션 리졸버**: `services/display/resolvers/` — `hero`, `product_grid`, `product_carousel`, `ranking_tabs`, `category_showcase`, `brand_carousel`, `benefit_bento`, `value_proposition`, `promotion_banner`, `recent_product`, `kakao_cta`, `custom_html`
- **섹션 뷰**: `views/partials/sections/*.ejs`
- **타입 ↔ 뷰 ↔ 관리자 설정폼 스키마** 매핑은 `services/display/sectionRegistry.js` 가 관장
- 편집 UI 는 관리자 `/admin/page-builder`

> **홈 화면에 새 블록을 넣고 싶다면 `index.ejs` 를 고치는 게 아니라 섹션 타입을 추가하거나 페이지 빌더에서 섹션을 배치합니다.** 새 섹션 타입 추가 = 리졸버 + 뷰 + `sectionRegistry` 등록 3종 세트.
> `custom_html` 섹션은 `services/display` 의 HTML 새니타이즈를 거칩니다.

## 4. 페이지 구조 패턴

### 4.1 기본 배경 / 래퍼

`<main>` 이 이미 `brand-page-surface` 이므로, 개별 페이지는 폭 컨테이너만 잡으면 됩니다.

```html
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- 섹션 / 그리드 / 카드 -->
</div>
```

### 4.2 상품 카드는 공통 파샬로

`views/partials/product_card.ejs` 를 사용합니다. 이미지, 공급사, 상품명, 가격·할인 라벨, 상태(`SOLD_OUT` / `COMING_SOON`) 오버레이가 들어 있습니다. **상품 카드 마크업을 페이지마다 새로 짜지 마세요.**

### 4.3 상품 목록 (`/products`, `/products/category/:id`)

- 상단 브레드크럼 → 모바일은 `select` 카테고리 선택
- 데스크톱 좌측 사이드바: 카테고리 리스트 카드(선택 항목은 `brand-chip` + `font-semibold`)
- 우측 메인: CATEGORY 배너(있을 때) → 정렬 드롭다운(신상품/인기/가격) → 상품 그리드

### 4.4 공지사항 (`/notices`)

- 리스트/상세 모두 `py-12 brand-page-surface min-h-screen` 으로 시작하고, 내부는 흰 카드 + 그림자
- 리스트는 데스크톱 테이블 / 모바일 카드. 강조 공지는 붉은 톤 배지
- 상세는 `max-w-4xl` 카드

## 5. 타이포그래피 & 레이아웃 규칙

- 기본 폰트: **Pretendard** (`var(--yd-font-family)`)
- 강조 타이틀: `.gh-serif` (bold)
- 헤더 메뉴 `text-base font-medium text-gray-700` / 카드 타이틀 `text-lg font-bold text-gray-900` / 서브 텍스트 `text-sm text-gray-500`
- 컨텐츠 폭: `max-w-7xl mx-auto` (테마의 `--yd-container-width` 는 기본 72rem = `max-w-6xl` 상당이므로, 섹션 파샬은 테마 변수를 우선 사용)
- 좌우 패딩: `px-4 sm:px-6 lg:px-8` / 세로 여백: `py-8`, 섹션 간 `--yd-section-spacing`
- 카드: `bg-white rounded-lg shadow-sm border border-gray-200`
- 강조 카드: `bg-[var(--gh-secondary)]` + `brand-border`
- 버튼: CTA 는 `.brand-cta px-5 py-3 rounded-lg text-sm font-semibold`, 서브는 `border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`

## 6. 새 사용자 페이지를 만들 때

1. **레이아웃**: 기본 `main_layout.ejs`. 파일은 `views/user/...` 아래
2. **래퍼**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8`
3. **색상**: Tailwind 임의 색 대신 `.brand-*` 클래스와 `--gh-*` / `--yd-*` 변수를 우선 사용. 배경 전체를 키컬러로 채우기보다 카드/뱃지/버튼 포인트에 사용
4. **재사용**: 상품 카드는 `partials/product_card.ejs`, 반복되는 블록은 `partials/sections/` 의 기존 섹션을 참고
5. **사이트 설정 연계**: `res.locals.siteSettings` 로 회사명/슬로건/색상 접근. SEO 는 `seo` 객체를 `res.render` 에 넘김 (기본값은 `middleware/seoDefaults.js`)
6. **접근성/반응형**: `hover:` 뿐 아니라 `focus:`(`brand-focus`)도 고려. `sm / md / lg` 브레이크포인트 사용

> ⚠️ 현재 테스트 서버는 `seoDefaults` 가 **전역 `noindex,nofollow`** 를 강제합니다. SEO 메타를 확인할 때 이 점을 감안하세요. (→ [`ssl_setup.md`](./ssl_setup.md) 크롤링 차단)

### 6.1 AI 도구 프롬프트 팁

- "Tailwind + `main_layout.ejs` 레이아웃, 폰트는 Pretendard"
- "브랜드 컬러는 `--gh-primary` 등 CSS 변수로, 테마 토큰은 `--yd-*` 로 이미 정의돼 있음"
- "상품 카드는 `views/partials/product_card.ejs` 를 include 할 것"
- "홈에 넣을 블록이면 `views/partials/sections/` 형식(섹션 파샬 + 리졸버)에 맞출 것"

## 7. 디자인 프리뷰 페이지

- URL: **`/design-guide/user`** (`routes/index.js`)
- 템플릿: `views/user/design_guide.ejs`

헤더/푸터/기본 배경과 어울리는 표준 섹션 레이아웃 샘플, 브랜드 컬러와 공통 컴포넌트(버튼·카드·배지) 조합 예시를 제공합니다.
