# 시스템 개요 및 아키텍처

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **Base URL** | 루트 `/` (prefix 없음) |
| **인증 방식** | Session + Passport (req.user, 로그인 시) |
| **디자인 패턴** | MVC (Model-View-Controller) |
| **템플릿 엔진** | EJS (Server Side Rendering) |
| **레이아웃** | `views/layouts/main_layout.ejs` (헤더, 푸터, 브랜드 테마 공통) |

앱에서 사용자 라우트는 `app.js`에서 `/`, `/auth`, `/cart`, `/checkout` 등으로 마운트됩니다. `routes/index.js`가 루트 진입점이며, 그 안에서 `terms`, `products`, `notices`, `inquiries`를 `router.use()`로 추가 마운트합니다.

---

## 2. 라우트 구조 (코드 기준)

```
app.js
├── app.use('/', indexRoutes)        → routes/index.js
│   ├── GET  /                        → mainController.getHome
│   ├── GET  /search                  → productController.searchPage
│   ├── GET  /design-guide/user      → user/design_guide (인라인 렌더)
│   ├── router.use('/', terms)       → routes/terms.js
│   │   ├── GET /terms                → termsController.getTerms
│   │   ├── GET /privacy              → termsController.getPrivacy
│   │   └── GET /about                → termsController.getAbout
│   ├── router.use('/products', ...)  → routes/products.js
│   ├── router.use('/notices', ...)  → routes/notices.js
│   └── router.use('/inquiries', ...)→ routes/inquiries.js
├── app.use('/auth', authRoutes)      → routes/auth.js (로그인/회원가입/OAuth)
├── app.use('/cart', cartRoutes)     → routes/cart.js
└── app.use('/checkout', checkoutRoutes) → routes/checkout.js
```

- **인증 없이 접근 가능:** 대부분의 사용자 페이지(홈, 상품, 공지, 문의, 약관 등). 장바구니/결제는 로그인 필요 구간이 일부 있음.
- **Passport:** `req.user`는 로그인 시 설정되며, `res.locals.user`로 뷰에 전달됩니다.

---

## 3. 세션·인증

- **세션 저장소:** Redis(`REDIS_HOST` 설정 시) 또는 Node.js 메모리.
- **사용자 로그인 시:** Passport가 `req.user`에 사용자 객체 저장. `app.js`의 전역 미들웨어에서 `res.locals.user = req.user || null`로 뷰에 전달.
- **관리자 여부:** `res.locals.isAdmin = req.isAuthenticated() && req.user.role === 'super'` (헤더에 "관리자모드" 링크 노출용).

---

## 4. 미들웨어

### 4.1 전역 변수 (app.js)

- **역할:** 뷰에서 사용할 공통 변수 주입.
- **동작:** `res.locals.user`, `res.locals.path`, `res.locals.isAdmin` 설정.

### 4.2 siteSettings.js

- **역할:** 사이트 전역 설정을 뷰에 주입.
- **동작:** `site_settings` 테이블 `id = 1` 한 건 조회 후 `res.locals.siteSettings`에 저장. 로고, 회사명, 브랜드 색상, 연락처 등.
- **사용처:** main_layout 헤더/푸터, 각 페이지 타이틀/테마.

### 4.3 visitorLogger.js

- **역할:** 방문자 IP·User-Agent 기록 (방문자 집계).
- **참고:** `/admin`으로 시작하는 경로는 집계에서 제외됨.

### 4.4 menuData.js

- **역할:** 헤더 GNB용 테마 카테고리 로드.
- **동작:** `categories` 테이블에서 `type = 'THEME'`인 항목을 `display_order` 순으로 조회하여 `res.locals.menuCategories`에 저장.

### 4.5 cartData.js

- **역할:** 헤더 장바구니 개수 표시.
- **동작:** 로그인 사용자일 때 `carts` 테이블에서 해당 `user_id`의 수량 합계를 조회하여 `res.locals.cartCount`에 저장. 비로그인 시 0.

---

## 5. 컨트롤러·뷰 매핑

| 기능 | 컨트롤러 | 뷰 디렉터리 |
|------|----------|-------------|
| 홈 | `controllers/mainController.js` | `views/user/index.ejs` |
| 검색 | `controllers/productController.js` | `views/user/search.ejs` |
| 약관/정책/소개 | `controllers/termsController.js` | `views/user/terms.ejs`, `privacy.ejs`, `about.ejs` |
| 상품 | `controllers/productController.js` | `views/user/products/list.ejs`, `detail.ejs` |
| 공지 | `controllers/noticeController.js` | `views/user/notices/list.ejs`, `detail.ejs` |
| 문의 | `controllers/inquiryController.js` | `views/user/inquiries/list.ejs`, `form.ejs`, `detail.ejs` |
| 인증 | routes/auth.js (인라인) | `views/auth/login.ejs`, `signup_finish.ejs`, `signup_success.ejs`, `terms_update.ejs` |
| 장바구니 | `controllers/cartController.js` | `views/user/cart.ejs`, `cart_complete.ejs` |
| 주문/결제 | `controllers/checkoutController.js` | `views/user/checkout/choose.ejs`, `form.ejs`, `pay.ejs`, `fail.ejs`, `complete.ejs` |

---

## 6. DB 연결

- **설정:** `config/db.js`에서 MySQL connection pool 사용.
- **컨트롤러:** `const pool = require('../config/db');` 후 `pool.query()` 등 사용.

---

*Last Updated: 2026-02-08*
