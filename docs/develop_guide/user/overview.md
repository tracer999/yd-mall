# 시스템 개요 및 아키텍처

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **Base URL** | 루트 `/` (prefix 없음) |
| **인증 방식** | Session + Passport **OAuth 전용**(Google, Kakao). 비밀번호 로그인 없음 (→ [auth.md](./auth.md)) |
| **디자인 패턴** | MVC (Model-View-Controller) |
| **템플릿 엔진** | EJS (Server Side Rendering) + express-ejs-layouts |
| **레이아웃** | `views/layouts/main_layout.ejs` (헤더 partial·푸터·모바일 하단바·브랜드/테마 공통) |
| **몰 스코프** | 모든 스토어프론트 요청은 `req.mallId`(멀티몰 P5)로 스코프됩니다 (`middleware/mallContext.js`) |

앱에서 사용자 라우트는 `app.js`에서 `/`, `/auth`, `/cart`, `/checkout` 등으로 마운트됩니다. `routes/index.js`가 루트 진입점이며, 그 안에서 `terms`, `products`, `brands`, `notices`, `inquiries`를 `router.use()`로 추가 마운트합니다.

---

## 2. 라우트 구조 (코드 기준)

`app.js:255-280` 의 마운트 순서 그대로입니다. **기능 메뉴 라우트(`featureRoutes`)가 `indexRoutes` 보다 먼저** 마운트됩니다(`/best`, `/new`, `/deal/today` 가 `/` 핸들러에 잡히지 않도록).

```
app.js
├── app.use('/shopify', shopifyRoutes)        → routes/shopify.js (웹훅·마켓, 현재 비활성)
├── app.use('/', sitemapRoutes)               → routes/sitemap.js
├── app.use('/', featureRoutes)               → routes/feature.js  (/best, /new, /deal/today, /ranking, /outlet …)
├── app.use('/exhibition', exhibitionRoutes)  → 기획전
├── app.use('/event', eventRoutes)            → 이벤트&혜택
├── app.use('/group-buy', groupBuyRoutes)     → 공동구매
├── app.use('/coupon', couponRoutes)          → 쿠폰존(받는 곳)
├── app.use('/sections', sectionRoutes)       → 스토어프론트 섹션 AJAX (ranking_tabs 등)
├── app.use('/cs', csRoutes)                  → 고객센터
├── app.use('/', indexRoutes)                 → routes/index.js
│   ├── GET  /                                 → mainController.getHome
│   ├── GET  /search                           → productController.searchPage
│   ├── GET  /design-guide/user                → user/design_guide (인라인 렌더)
│   ├── POST /api/kakao-click                  → 카카오 문의 클릭 로그
│   ├── POST /api/kakao-inquiry                → 카카오 문의 경로별 클릭 로그
│   ├── POST /api/pv-duration                  → 체류시간 비콘 (page_views.duration)
│   ├── router.use('/', terms)                → /terms, /privacy, /about
│   ├── router.use('/products', ...)          → routes/products.js
│   ├── router.use('/brands', ...)            → routes/brands.js
│   ├── router.use('/notices', ...)           → routes/notices.js
│   └── router.use('/inquiries', ...)         → routes/inquiries.js
├── app.use('/auth', authRoutes)              → routes/auth.js (OAuth 로그인/가입 마무리/약관 재동의)
├── app.use('/likes', likesRoutes)
├── app.use('/boards', boardRoutes)
├── app.use('/mypage', mypageRoutes)
├── app.use('/admin', adminMenuMiddleware, adminRoutes)
├── app.use('/cart', cartRoutes)
├── app.use('/checkout', checkoutRoutes)
└── app.use('/manual', manualRoutes)
404 → res.status(404).render('user/404')  (app.js:283)
```

- **인증 없이 접근 가능:** 대부분의 사용자 페이지(홈, 상품, 공지, 문의, 약관 등). 장바구니/결제/마이페이지는 로그인 필요 구간이 있음.
- **Passport:** `req.user`는 로그인 시 설정되며, `res.locals.user`로 뷰에 전달됩니다.

---

## 3. 세션·인증

- **세션 저장소:** Redis(`REDIS_HOST` 설정 시) 또는 Node.js 메모리(MemoryStore 폴백).
- **사용자 로그인 시:** Passport가 `req.user`에 사용자 객체 저장. `app.js:193` 의 전역 미들웨어에서 `res.locals.user = req.user || null`로 뷰에 전달.
- **관리자 여부:** `res.locals.isAdmin = req.isAuthenticated() && req.user.role === 'super'` (`app.js:197`, 헤더 Top Bar 의 "관리자모드" 링크 노출용). 관리자 백오피스 로그인은 이와 별개인 자체 세션(`req.session.admin`)입니다.
- **고객 로그인은 OAuth 전용:** 자체 비밀번호 로그인 라우트가 없습니다. 상세는 [auth.md](./auth.md).

---

## 4. 미들웨어

`app.js:193-229` 의 실행 순서입니다. 스토어프론트 미들웨어는 모두 `req.mallId` 를 신뢰하므로 **`mallContext` 가 가장 먼저** 옵니다.

```
액세스 로그(logs/access.log) → 전역 변수 → mallContext → siteSettings → themeData
→ shopifyFlag → visitorLogger → pageViewLogger → menuData → cartData → seoDefaults → shopifyContext
```

### 4.1 전역 변수 (app.js)

- **역할:** 뷰에서 사용할 공통 변수 주입.
- **동작:** `res.locals.user`, `res.locals.path`, `res.locals.isAdmin` 설정.

### 4.2 mallContext.js

- **역할:** 요청이 어느 몰을 보는지 해석 → `req.mallId` / `res.locals.mallId` / `res.locals.mall` / `res.locals.malls`.
- **동작:** `?mall=<id|code>` → 세션 고정 → 없으면 기본 몰(`mall.is_default = 1`). 몰 목록은 60초 프로세스 캐시.
- **사용처:** 헤더 Top Bar·모바일 카테고리 레이어의 **몰 선택 셀렉트**(`res.locals.malls`).

### 4.3 siteSettings.js

- **역할:** 사이트 전역 설정 + 카테고리를 뷰에 주입.
- **동작:** `site_settings` 를 **몰별 1행**으로 조회(요청 몰 행이 없으면 기본몰 행으로 폴백, 둘 다 없으면 하드코딩 기본값) 후 `res.locals.siteSettings`. 같은 몰의 카테고리를 `res.locals.categories` 에 담습니다.
- **사용처:** main_layout 헤더/푸터, 각 페이지 타이틀/브랜드 색상.

### 4.4 themeData.js

- **역할:** 활성 테마 토큰 주입 → `res.locals.theme = { name, tokens, cardStyle, cssVars }`.
- **동작:** `themeService.getActiveTheme(mallId)`. 몰 id 를 키로 60초 캐시. 레이아웃 `<head>` 가 `cssVars` 를 `:root` 에 인라인 주입하고, `<body>` 에 `yd-card-{cardStyle}` 클래스를 붙입니다.

### 4.5 shopifyFlag.js

- **역할:** `res.locals.shopifyEnabled` 주입 → 헤더의 마켓(국가) 선택기 등 Shopify UI 노출 제어. **현재 비활성**.

### 4.6 visitorLogger.js

- **역할:** 방문자 IP·User-Agent 기록 (일 1회, `visited_today` 쿠키로 중복 방지).
- **참고:** `/admin`·정적 경로는 집계에서 제외됨.

### 4.7 pageViewLogger.js

- **역할:** 사용자 GET 요청을 `page_views` 에 기록(세션ID·IP·URL·Referer·디바이스). `res.locals._pvId` 를 심어 두면 레이아웃의 비콘 스크립트가 `POST /api/pv-duration` 으로 체류시간을 채웁니다.
- **제외:** `/admin`, `/css`, `/js`, `/images`, `/auth`, `/api`, `/favicon`, `/uploads`, `/sitemap`.

### 4.8 menuData.js

- **역할:** 헤더 내비게이션 전체 주입. `services/menu/navigationService.js` 가 조립합니다.
- **주입 값:** `nav`(위치별 조립 결과), `gnbMenus`, `categoryButton`, `rightRailMenus`, `headerUtilMenus`, `categoryTree`(NORMAL 카테고리 트리, 최대 뎁스 이내), `menuCategories`(THEME 카테고리 — 레거시 하위호환), `currentPath`.
- **데이터 소스:** `feature_menu`(전역 카탈로그) × `mall_feature_menu`(몰별 on/off·순서) + `custom_menu`(자유 메뉴) + `navigation_config`(레이아웃·`category_max_depth`).
- **렌더 조건:** 항상 `is_enabled AND module_ready` — 모듈 미구현 메뉴는 관리자가 켜도 노출되지 않습니다(죽은 링크 차단).
- **실패 시:** 골격만 유지한 채 빈 메뉴로 렌더(화면이 깨지지 않도록).

### 4.9 cartData.js

- **역할:** 헤더 장바구니 개수 표시.
- **동작:** 로그인 사용자일 때 `carts` 테이블에서 해당 `user_id`의 수량 합계를 조회하여 `res.locals.cartCount`에 저장. 비로그인 시 0.

### 4.10 seoDefaults.js

- **역할:** `res.locals.seo` 기본값(title, description, canonical, OG image, siteName) 주입. 컨트롤러가 `seo` 를 따로 넘기면 그 값이 우선합니다.
- **주의:** 테스트 서버라 **`robots: 'noindex,nofollow'` 를 전역 강제**합니다(`app.js` 도 `X-Robots-Tag` 헤더를 붙임).

### 4.11 shopifyContext.js

- **역할:** 세션 국가/언어 → `res.locals.shopifyMarket`. Shopify 비활성 시 UI 에 쓰이지 않습니다.

---

## 5. 컨트롤러·뷰 매핑

| 기능 | 컨트롤러 | 뷰 디렉터리 |
|------|----------|-------------|
| 홈 | `controllers/mainController.js` + `services/display/` (SDUI) | `views/user/index.ejs` + `views/partials/sections/*` |
| 검색 | `controllers/productController.js` | `views/user/search.ejs` |
| 약관/정책/소개 | `controllers/termsController.js` | `views/user/terms.ejs`, `privacy.ejs`, `about.ejs` |
| 상품 | `controllers/productController.js` | `views/user/products/list.ejs`, `detail.ejs` |
| 브랜드 | `controllers/brandController.js` | `views/user/brands/` |
| 기능 메뉴(베스트/신상품/특가 등) | `routes/feature.js` | `views/user/products/list.ejs` 등 재사용 |
| 기획전 / 이벤트 / 공동구매 / 쿠폰존 | `routes/exhibition.js`, `event.js`, `group-buy.js`, `coupon.js` | `views/user/exhibition/`, `event/`, `group-buy/`, `coupon/` |
| 고객센터 | `controllers/csController.js` | `views/user/cs/` |
| 공지 | `controllers/noticeController.js` | `views/user/notices/list.ejs`, `detail.ejs` |
| 문의 | `controllers/inquiryController.js` | `views/user/inquiries/list.ejs`, `form.ejs`, `detail.ejs` |
| 인증 | `routes/auth.js` (인라인) | `views/auth/login.ejs`, `signup_finish.ejs`, `signup_success.ejs`, `terms_update.ejs` |
| 마이페이지 | `controllers/mypageController.js` | `views/user/mypage/` |
| 장바구니 | `controllers/cartController.js` | `views/user/cart.ejs`, `cart_complete.ejs` |
| 주문/결제 | `controllers/checkoutController.js` | `views/user/checkout/choose.ejs`, `form.ejs`, `pay.ejs`, `fail.ejs`, `complete.ejs` |

---

## 6. SDUI (홈 전시 엔진)

홈은 컨트롤러가 화면을 고정하지 않고 **DB 에 정의된 섹션을 조립**해 렌더합니다.

- **정의:** `page`(페이지) → `page_section`(섹션 행, `section_type` + `config_json` + `sort_order`) → `page_revision`(발행 스냅샷).
- **조립:** `services/display/displayService.js` 가 스냅샷(없으면 라이브 `page_section`)을 읽어 `sectionRegistry.js` 로 뷰를 찾고, `resolvers/` 12종이 데이터를 채웁니다.
- **렌더:** `views/user/index.ejs` 가 `sections` 배열을 순서대로 `include` 합니다.
- 상세는 [home.md](./home.md).

---

## 7. DB 연결

- **설정:** `config/db.js`에서 MySQL connection pool 사용.
- **컨트롤러:** `const pool = require('../config/db');` 후 `pool.query()` 등 사용.

---

*Last Updated: 2026-07-11*
