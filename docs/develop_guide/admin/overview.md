# 시스템 개요 및 아키텍처

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **Base URL** | `/admin` |
| **인증 방식** | Session 기반 (`req.session.admin`) + 선택적 이메일 2FA |
| **디자인 패턴** | MVC (Model-View-Controller) |
| **템플릿 엔진** | EJS (Server Side Rendering) |
| **레이아웃** | `views/layouts/admin_layout.ejs` (사이드바, 헤더 공통) |
| **편집 몰 컨텍스트** | `req.adminMallId` (멀티몰) |

앱에서 admin 라우트는 `app.js`에서 `/admin` prefix로 마운트되며(`app.use('/admin', adminMenuMiddleware, adminRoutes)`), `routes/admin.js`가 진입점입니다.

**관리자 요청의 미들웨어 체인:**

```
adminMenu (app.js 마운트 시)      → DB 기반 사이드바 메뉴 트리 주입 (인증 전에도 동작)
  ↓
adminAuth (routes/admin.js)       → 세션 체크. 로그인/로그아웃 라우트 아래에 router.use()
  ↓
adminMallContext (routes/admin.js)→ 편집 대상 몰 해석 → req.adminMallId
  ↓
requireMenuAccess(path)           → 서브 라우트별 RBAC (admin_menus.visible_roles)
  ↓
서브 라우트 (routes/admin/*.js)
```

---

## 2. 라우트 구조 (코드 기준)

```
routes/admin.js
├── GET  /admin/login          → authController.getLogin     (인증 없음)
├── POST /admin/login          → authController.postLogin    (인증 없음, 2FA 2단계 겸용)
├── GET  /admin/logout         → authController.logout       (인증 없음)
├── [adminAuth 미들웨어 적용]
├── [adminMallContext 미들웨어 적용 — req.adminMallId 주입]
│
│   # 대시보드 계열 — requireMenuAccess 없이 adminAuth 만으로 접근
├── GET  /admin                     → dashboardController.getDashboard
├── GET  /admin/design-guide        → (인라인 렌더) views/admin/design_guide.ejs
├── GET  /admin/search-logs         → dashboardController.getSearchLogs
├── GET  /admin/traffic-sources     → dashboardController.getTrafficSources
├── GET  /admin/traffic-sources/drill → dashboardController.getTrafficSourceDrill
├── GET  /admin/popular-products    → dashboardController.getPopularProducts
│
│   # 이하 전부 requireMenuAccess('<경로>') 적용 후 서브 라우터 마운트
├── /admin/categories        → routes/admin/categories.js
├── /admin/feature-menus     → routes/admin/feature-menus.js      (스토어프론트 GNB 기능 메뉴 ON/OFF·순서)
├── /admin/system-menus      → routes/admin/system-menus.js       (헤더 유틸·우측 레일 등 고정 메뉴)
├── /admin/header-settings   → routes/admin/header-settings.js    (헤더 레이아웃·GNB 슬롯 정책)
├── /admin/menu-preview      → routes/admin/menu-preview.js       (메뉴 조립 결과 미리보기)
├── /admin/products          → routes/admin/products.js
├── /admin/banners           → routes/admin/banners.js
├── /admin/page-builder      → routes/admin/page-builder.js       (SDUI 페이지·섹션)
├── /admin/product-groups    → routes/admin/product-groups.js     (섹션 데이터 소스)
├── /admin/exhibitions       → routes/admin/exhibitions.js        (기획전)
├── /admin/events            → routes/admin/events.js             (이벤트&혜택)
├── /admin/group-buys        → routes/admin/group-buys.js         (공동구매)
├── /admin/users             → routes/admin/users.js
├── /admin/sales             → routes/admin/sales.js              (주문/판매 관리)
├── /admin/shipping          → routes/admin/shipping.js           (송장 관리)
├── /admin/shipping-policy   → routes/admin/shipping-policy.js    (배송비 정책 — shipping 과 별개)
├── /admin/claims            → routes/admin/claims.js             (취소·반품·환불)
├── /admin/visitors          → routes/admin/visitors.js
├── /admin/settings          → routes/admin/settings.js
├── /admin/site-settings     → routes/admin/siteSettings.js
├── /admin/theme-settings    → routes/admin/theme-settings.js     (theme.config_json 스타일 토큰)
├── /admin/faqs              → routes/admin/faqs.js               (고객센터 FAQ)
├── /admin/sys-settings      → routes/admin/sysSettings.js        (system_settings)
├── /admin/operators         → routes/admin/operators.js          (+ 라우터 내부 requireSuperAdmin)
├── /admin/malls             → routes/admin/malls.js              (몰 정의 CRUD)
├── /admin/policies          → routes/admin/policies.js
├── /admin/notices           → routes/admin/notices.js
├── /admin/inquiries         → routes/admin/inquiries.js
├── /admin/coupons           → routes/admin/coupons.js
├── /admin/points            → routes/admin/points.js
├── /admin/uploads           → routes/admin/uploads.js            (TinyMCE 업로드)
├── /admin/menus             → routes/admin/menus.js              (관리자 사이드바 메뉴 관리)
└── /admin/shopify-orders    → routes/admin/shopify-orders.js
```

- **인증 없이 접근 가능:** `GET /admin/login`, `POST /admin/login`, `GET /admin/logout`
- **그 외 모든 `/admin/*`:** `adminAuth` 통과 후 접근 가능
- **대시보드 계열:** `requireMenuAccess`가 걸려 있지 않으므로 로그인한 모든 역할이 접근 가능
- **메뉴별 권한:** 각 서브 라우트 마운트 시 `requireMenuAccess(menuPath)` 적용 — DB `admin_menus.visible_roles` 기반 접근 제어
- **운영자 메뉴:** `/admin/operators`는 `requireMenuAccess('/admin/operators')` 통과 후 라우터 내부의 `requireSuperAdmin`이 한 번 더 검사 → [운영자 관리](./operators.md) 참고

---

## 3. 세션 구조

로그인 성공 시 `req.session.admin`에 저장되는 객체:

```javascript
{
  id: number,      // admins.id
  username: string,
  role: string,    // 'super_admin' | 'admin' | 'content_admin' | 'customer_admin'
  email: string    // admins.email (2FA·접속 로그에 사용)
}
```

관리자 세션이 쓰는 그 밖의 키:

| 키 | 설정 위치 | 용도 |
|----|-----------|------|
| `req.session.pending2faAdminId` | `authController.handleCredentials` | 2FA 코드 검증 대기 중인 관리자 ID (검증 성공 시 삭제) |
| `req.session.adminMallId` | `middleware/adminMallContext.js` | 관리자가 편집 중인 몰 ID (스토어프론트 `req.mallId`와 별개) |

- **adminAuth 미들웨어:** `req.user`, `res.locals.admin`, `res.locals.user`에 동일 객체를 넣어 뷰에서 `admin`/`user`로 사용 가능
- **로그아웃:** `req.session.destroy()` 후 `/admin/login`으로 리다이렉트

---

## 4. 미들웨어

### 4.1 adminAuth.js (인증)

- **역할:** 관리자 로그인 여부 확인
- **동작:**
  - `req.session.admin`이 있으면 `req.user`, `res.locals.admin`, `res.locals.user` 설정 후 `next()`
  - 없으면 `res.redirect('/admin/login')`
- **적용 위치:** `routes/admin.js`에서 로그인/로그아웃 라우트 아래에 `router.use(adminAuth)`로 일괄 적용

### 4.2 adminMenu.js (DB 기반 메뉴 — 2뎁스 그룹 트리)

- **역할:** 관리자 사이드바 메뉴를 DB에서 로드하여 역할별로 필터링하고 **그룹 트리**로 조립
- **동작:**
  - `admin_menus` 테이블에서 `is_active = 1`인 메뉴를 `display_order ASC, id ASC` 순으로 조회
  - **그룹 행은 `path IS NULL`로 식별** (현재 7개 그룹: 쇼핑몰 설정 / 메뉴·카테고리 관리 / 페이지·전시 관리 / 상품 관리 / 프로모션 관리 / 주문·회원 관리 / 운영·시스템 관리)
  - 권한(`visible_roles`)은 **잎 메뉴에만** 적용. `super_admin`은 모든 메뉴 노출, `visible_roles`가 비어 있으면 제한 없음
  - 보이는 자식이 하나도 없는 그룹은 통째로 숨김. 최상위 잎(대시보드)은 그룹 없이 그대로 노출
  - 결과를 **`res.locals.adminMenuTree`**(사이드바 렌더용 트리)에 저장하고, 하위호환용으로 잎 메뉴 평면 목록을 `res.locals.adminMenus`에 저장
- **적용 위치:** `app.js`의 `app.use('/admin', adminMenuMiddleware, adminRoutes)` — **adminAuth보다 앞**이므로 로그인 전 요청에도 실행됨(이때 role은 null)
- **주의:** 이 미들웨어는 **노출**만 다룹니다. 실제 접근 차단은 `requireMenuAccess`가 담당합니다.

### 4.3 adminRoleGuard.js (메뉴별 접근 제어 — RBAC)

- **역할:** 특정 메뉴 경로에 대한 역할 기반 접근 제어
- **함수:** `requireMenuAccess(menuPath)` — 미들웨어 팩토리
- **동작:**
  - 세션 없으면 `/admin/login` 리다이렉트
  - `super_admin`은 항상 통과
  - 그 외: `admin_menus`에서 `path = ? AND is_active = 1`인 행의 `visible_roles`(CSV) 조회
  - `visible_roles`가 비어 있으면 모든 운영자 허용
  - 현재 역할이 CSV에 포함되면 통과, 아니면 403 `접근 권한이 없습니다.`
  - **메뉴 정의가 없으면** `admin`만 허용, `content_admin`/`customer_admin`은 403 `접근 권한이 없습니다. (메뉴 정의 없음)`
- **적용 위치:** `routes/admin.js`에서 각 서브 라우트 마운트 시 `requireMenuAccess('/admin/categories')` 등으로 적용
- **참고:** 권한 정책은 코드가 아니라 **DB(`admin_menus.visible_roles`)에 있습니다.** 역할별 접근 범위를 바꾸려면 `/admin/menus`에서 메뉴 행을 수정하세요.

### 4.4 adminMallContext.js (편집 몰 컨텍스트 — 멀티몰)

- **역할:** "관리자가 지금 **어느 몰을 편집 중인가**"를 결정
- **동작:**
  - `?adminMall=<id|code>`가 오면 해석하여 `req.session.adminMallId`에 저장 → 이후 요청에서 유지
  - 없으면 기본 몰(`mall.is_default`)
  - `req.adminMallId`, `res.locals.adminMallId`, `res.locals.adminMall`, `res.locals.adminMalls`(활성 몰 목록) 주입
  - 해석 실패 시 mall 1로 폴백
- **적용 위치:** `routes/admin.js`에서 `adminAuth` 바로 뒤 (인증된 관리자 요청에만 적용)
- **스토어프론트와의 분리:** 손님이 보는 몰(`req.mallId`, `middleware/mallContext.js`)과 **세션 키가 다릅니다**(`mallId` vs `adminMallId`). 관리자가 스토어프론트를 `?mall=2`로 미리보기해도 편집 대상 몰은 바뀌지 않습니다(그 반대도 마찬가지).
- **컨트롤러 규칙:** 관리자 컨트롤러는 하드코딩된 `MALL_ID = 1` 대신 `req.adminMallId`를 사용합니다. 단 `admin_menus`(사이드바)·`banners`·주문/회원 등 몰 무관 데이터는 스코프하지 않습니다.
- **UI:** 몰이 2개 이상일 때만 `admin_layout.ejs`에 편집 몰 셀렉터가 노출됩니다.

### 4.5 siteSettings.js (전역 설정)

- **역할:** 사이트 전역 설정을 뷰에 주입
- **동작:** `site_settings`에서 **요청 몰의 행**을 조회(`mall_id` 기준, 없으면 기본 몰 행으로 폴백)하여 `res.locals.siteSettings`에 저장. 함께 `res.locals.categories`(해당 몰 카테고리)도 주입
- **사용처:** admin 레이아웃·로그인 화면의 로고, 회사명, 파비콘 등

### 4.6 visitorLogger.js (방문자 집계)

- **역할:** 방문자 IP·User-Agent 기록
- **동작:** `visited_today` 쿠키로 동일 사용자 1일 중복 카운팅 방지
- **참고:** `/admin`으로 시작하는 경로(및 정적 리소스)는 집계에서 제외됩니다 → 관리자 접속은 방문자 수에 포함되지 않음

### 4.7 upload.js (Multer, 파일 업로드)

- **역할:** 이미지·동영상 업로드 (상품, 배너, 로고, 기획전, 공동구매, TinyMCE 등)
- **저장 경로:** `fieldname` 기준으로 분기

  | fieldname | 저장 경로 |
  |-----------|-----------|
  | (기본: `main_image`, `thumbnail_image`, `sub_images`, `file` 등) | `public/uploads/products/` |
  | `banner_image`, `mobile_banner_image` | `public/uploads/banners/` |
  | `logo` | `public/uploads/logo/` |
  | `logo_image` (브랜드) | `public/uploads/brands/` |
  | `kakao_share_image` | `public/uploads/og/` |
  | `favicon` | `public/uploads/favicon/` |
  | `list_thumbnail`, `pc_hero_image`, `mobile_hero_image`, `og_image` | `public/uploads/exhibitions/` |
  | `gb_list_thumbnail`, `gb_pc_hero_image`, `gb_mobile_hero_image` | `public/uploads/group-buys/` |

- **제한:** 파일 크기 기본 **20MB** (`MAX_UPLOAD_FILE_MB` 환경변수로 조정). 이미지 필드는 `image/*` MIME만, `video_file` 필드는 `video/*` MIME만 허용
- **파일명:** `Date.now()-난수 + 확장자`로 유일값 생성

TinyMCE 이미지 업로드는 `POST /admin/uploads/tinymce`로 처리되며, `{ location: '/uploads/...' }` 형태로 JSON 응답을 반환합니다.

---

## 5. 컨트롤러·뷰 매핑

| 기능 | 컨트롤러 | 뷰 디렉터리 |
|------|----------|-------------|
| 로그인·2FA | `controllers/admin/authController.js` | `views/admin/login.ejs` |
| 대시보드 | `controllers/admin/dashboardController.js` | `views/admin/dashboard.ejs`, `search_logs.ejs`, `traffic_sources_detail.ejs`, `popular_products_detail.ejs` |
| 카테고리 | `controllers/admin/categoryController.js` | `views/admin/categories/` |
| 기능 메뉴 | `controllers/admin/featureMenuController.js` (`getList`/`postSave`) | `views/admin/feature-menus/` |
| 시스템 메뉴 | `controllers/admin/featureMenuController.js` (`getSystemList`/`postSystemSave`) | `views/admin/system-menus/` |
| 헤더 설정 | `controllers/admin/headerSettingsController.js` | `views/admin/header-settings/` |
| 메뉴 미리보기 | `controllers/admin/menuPreviewController.js` | `views/admin/menu-preview/` |
| 상품 | `controllers/admin/productController.js` | `views/admin/products/` |
| 배너 | `controllers/admin/bannerController.js`, `heroSlideController.js` | `views/admin/banners/` |
| 페이지 빌더 | `controllers/admin/pageBuilderController.js` | `views/admin/page-builder/` |
| 상품 그룹 | `controllers/admin/productGroupController.js` | `views/admin/product-groups/` |
| 기획전 | `controllers/admin/exhibitionController.js` | `views/admin/exhibitions/` |
| 이벤트&혜택 | `controllers/admin/eventController.js` | `views/admin/events/` |
| 공동구매 | `controllers/admin/groupBuyController.js` | `views/admin/group-buys/` |
| 회원 | `controllers/admin/userController.js` | `views/admin/users/` |
| 판매(주문) | `controllers/admin/salesController.js` | `views/admin/sales/` |
| 배송(송장) | `controllers/admin/shippingController.js` | `views/admin/shipping/` |
| 배송비 정책 | `controllers/admin/shippingPolicyController.js` | `views/admin/shipping-policy/` |
| 클레임 | `controllers/admin/claimController.js` | `views/admin/claims/` |
| 쿠폰 | `controllers/admin/couponController.js` | `views/admin/coupons/` |
| 포인트 | `controllers/admin/pointController.js` | `views/admin/points/` |
| 방문자 | `controllers/admin/visitorController.js` | `views/admin/visitors/` |
| 설정(사이트·시스템) | `controllers/admin/settingsController.js` | `views/admin/settings/` |
| 테마 설정 | `controllers/admin/themeSettingsController.js` | `views/admin/theme-settings/` |
| 고객센터 FAQ | `controllers/admin/faqController.js` | `views/admin/faqs/` |
| 운영자 | `controllers/admin/operatorController.js` | `views/admin/operators/` |
| 몰 관리 | `controllers/admin/mallController.js` | `views/admin/malls/` |
| 약관/정책 | `controllers/admin/policyController.js` | `views/admin/policies/` |
| 공지사항 | `controllers/admin/noticeController.js` | `views/admin/notices/` |
| 문의 | `controllers/admin/inquiryController.js` | `views/admin/inquiries/` |
| 관리자 메뉴 | `controllers/admin/menuController.js` | `views/admin/menus/` |
| Shopify 주문 | `controllers/admin/shopifyOrderController.js` | `views/admin/shopify-orders/` |

---

## 6. DB 연결

- **설정:** `config/db.js`에서 MySQL connection pool 사용
- **컨트롤러:** `const pool = require('../../config/db');` 후 `pool.query()`, `pool.getConnection()` (트랜잭션 시) 사용
- **테이블 정의:** `tables.sql` 참고 (실제 DB와 일부 드리프트 있음 — `CLAUDE.md` 참고)

---

## 7. 설정 로딩

관리자 화면이 다루는 설정은 두 층입니다.

1. **`.env` 계열** (`config/env.js`) — 서버·DB·Redis 접속 정보. `ENC:` 접두어 값은 `ENCRYPTION_KEY`로 복호화하며, 키가 없으면 앱이 기동하지 않습니다.
2. **DB `system_settings` 테이블** (`config/systemSettings.js`) — 그 외 전부. 앱 기동 시 `loadSystemSettingsAndApplyEnv()`가 읽어 `global.systemSettings`에 담고, 매핑된 키를 **`process.env`에 덮어씁니다**(빈 값은 건너뜀). `SESSION_SECRET`, `TINYMCE_KEY`, `SHOPIFY_*`, `OPENAI_*`, `GOOGLE_*`/`KAKAO_*` OAuth, `SMTP_*`, `TOSSPAYMENTS_*`가 여기에 해당합니다.

`system_settings` 값은 `/admin/sys-settings`(및 `/admin/settings`)에서 수정합니다. 따라서 코드 안의 `process.env.X || '기본값'` 폴백은 DB에 값이 있으면 쓰이지 않습니다.

---

*Last Updated: 2026-07-11*
