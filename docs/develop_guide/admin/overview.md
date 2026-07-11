# 시스템 개요 및 아키텍처

## 1. 기본 정보

| 항목 | 내용 |
|------|------|
| **Base URL** | `/admin` |
| **인증 방식** | Session 기반 (`req.session.admin`) |
| **디자인 패턴** | MVC (Model-View-Controller) |
| **템플릿 엔진** | EJS (Server Side Rendering) |
| **레이아웃** | `views/layouts/admin_layout.ejs` (사이드바, 헤더 공통) |

앱에서 admin 라우트는 `app.js`에서 `/admin` prefix로 마운트되며, `routes/admin.js`가 진입점입니다. `/admin` 요청 시 `adminMenuMiddleware`가 먼저 적용되어 DB 기반 관리자 메뉴를 로드합니다.

---

## 2. 라우트 구조 (코드 기준)

```
routes/admin.js
├── GET  /admin/login          → authController.getLogin     (인증 없음)
├── POST /admin/login          → authController.postLogin   (인증 없음)
├── GET  /admin/logout         → authController.logout      (인증 없음)
├── [adminAuth 미들웨어 적용]
├── GET  /admin                → dashboardController.getDashboard
├── GET  /admin/search-logs    → dashboardController.getSearchLogs
├── /admin/categories          → routes/admin/categories.js (requireMenuAccess)
├── /admin/products            → routes/admin/products.js   (requireMenuAccess)
├── /admin/banners             → routes/admin/banners.js    (requireMenuAccess)
├── /admin/users               → routes/admin/users.js      (requireMenuAccess)
├── /admin/sales               → routes/admin/sales.js      (requireMenuAccess)
├── /admin/shipping            → routes/admin/shipping.js   (requireMenuAccess)
├── /admin/visitors            → routes/admin/visitors.js   (requireMenuAccess)
├── /admin/settings            → routes/admin/settings.js   (requireMenuAccess)
├── /admin/operators           → routes/admin/operators.js  (requireMenuAccess + requireSuperAdmin)
├── /admin/policies            → routes/admin/policies.js   (requireMenuAccess)
├── /admin/inquiries           → routes/admin/inquiries.js  (requireMenuAccess)
├── /admin/uploads             → routes/admin/uploads.js    (requireMenuAccess, TinyMCE 업로드)
└── /admin/menus               → routes/admin/menus.js      (requireMenuAccess)
```

- **인증 없이 접근 가능:** `/admin/login`, `POST /admin/login`, `/admin/logout`  
- **그 외 모든 `/admin/*`:** `adminAuth` 통과 후 접근 가능  
- **메뉴별 권한:** 각 서브 라우트에 `requireMenuAccess(menuPath)` 적용 — DB `admin_menus.visible_roles` 기반 접근 제어  
- **운영자 메뉴:** `/admin/operators`는 추가로 `requireSuperAdmin` 적용 — `super_admin` 또는 `admin` 역할만 접근 가능

---

## 3. 세션 구조

로그인 성공 시 `req.session.admin`에 저장되는 객체:

```javascript
{
  id: number,      // admins.id
  username: string,
  role: string     // 예: 'super_admin', 'admin', 'content_admin', 'customer_admin'
}
```

- **adminAuth 미들웨어:** `res.locals.admin`, `res.locals.user`에 동일 객체를 넣어 뷰에서 `admin`/`user`로 사용 가능  
- **로그아웃:** `req.session.destroy()` 후 `/admin/login`으로 리다이렉트

---

## 4. 미들웨어

### 4.1 adminAuth.js (인증)

- **역할:** 관리자 로그인 여부 확인  
- **동작:**  
  - `req.session.admin`이 있으면 `req.user`, `res.locals.admin`, `res.locals.user` 설정 후 `next()`  
  - 없으면 `res.redirect('/admin/login')`  
- **적용 위치:** `routes/admin.js`에서 로그인/로그아웃 라우트 아래에 `router.use(adminAuth)`로 일괄 적용

### 4.2 adminMenu.js (DB 기반 메뉴)

- **역할:** 관리자 사이드바 메뉴를 DB에서 로드하여 역할별로 필터링  
- **동작:**  
  - `admin_menus` 테이블에서 `is_active = 1`인 메뉴를 `display_order` 순으로 조회  
  - 현재 관리자 역할(`req.session.admin.role`)에 따라 `visible_roles` 기반 필터링  
  - `super_admin`은 모든 메뉴 노출, 그 외는 `visible_roles`에 포함된 역할만 노출  
  - 결과를 `res.locals.adminMenus`에 저장  
- **적용 위치:** `app.js`에서 `/admin` 라우트 마운트 전에 `app.use('/admin', adminMenuMiddleware, adminRoutes)` 로 적용

### 4.3 adminRoleGuard.js (메뉴별 접근 제어)

- **역할:** 특정 메뉴 경로에 대한 역할 기반 접근 제어  
- **함수:** `requireMenuAccess(menuPath)` — 미들웨어 팩토리  
- **동작:**  
  - `super_admin`은 항상 통과  
  - 그 외: `admin_menus`에서 해당 `path`의 `visible_roles` 조회  
  - `visible_roles`가 비어 있으면 모든 운영자 허용  
  - 현재 역할이 `visible_roles`에 포함되면 통과, 아니면 403  
  - 메뉴 정의가 없으면 `admin`만 허용, `content_admin`/`customer_admin`은 차단  
- **적용 위치:** `routes/admin.js`에서 각 서브 라우트 마운트 시 `requireMenuAccess('/admin/categories')` 등으로 적용

### 4.4 siteSettings.js (전역 설정)

- **역할:** 사이트 전역 설정을 뷰에 주입  
- **동작:** `site_settings` 테이블 `id = 1` 한 건 조회 후 `res.locals.siteSettings`에 저장  
- **사용처:** admin 레이아웃의 로고, 회사명 등  
- **참고:** `visitorLogger`는 `/admin` 경로를 제외하고 집계하므로 관리자 접속은 방문자 수에 포함되지 않음

### 4.5 visitorLogger.js (방문자 집계)

- **역할:** 방문자 IP·User-Agent 기록  
- **동작:** `visited_today` 쿠키로 동일 사용자 1일 중복 카운팅 방지  
- **참고:** `/admin`으로 시작하는 경로는 집계에서 제외됨

### 4.6 upload.js (Multer, 파일 업로드)

- **역할:** 이미지 업로드 (상품, 배너, 로고, TinyMCE)  
- **저장 경로:**  
  - `fieldname === 'main_image'` 등 (기본) → `public/uploads/products/`  
  - `fieldname === 'banner_image'` → `public/uploads/banners/`  
  - `fieldname === 'logo'` → `public/uploads/logo/`  
- **제한:** 이미지 MIME만 허용, 파일 크기 5MB  
- **파일명:** `Date.now()-난수 + 확장자` 로 유일값 생성  

TinyMCE 이미지 업로드는 `POST /admin/uploads/tinymce`로 처리되며, `{ location: '/uploads/...' }` 형태로 JSON 응답을 반환합니다.

---

## 5. 컨트롤러·뷰 매핑

| 기능 | 컨트롤러 | 뷰 디렉터리 |
|------|----------|-------------|
| 로그인 | `controllers/admin/authController.js` | `views/admin/login.ejs` |
| 대시보드 | `controllers/admin/dashboardController.js` | `views/admin/dashboard.ejs` |
| 검색 로그 | `controllers/admin/dashboardController.js` | `views/admin/search_logs.ejs` |
| 카테고리 | `controllers/admin/categoryController.js` | `views/admin/categories/list.ejs` |
| 상품 | `controllers/admin/productController.js` | `views/admin/products/list.ejs`, `form.ejs`, `detail.ejs`, `seo_preview.ejs` |
| 배너 | `controllers/admin/bannerController.js` | `views/admin/banners/list.ejs`, `form.ejs` |
| 회원 | `controllers/admin/userController.js` | `views/admin/users/list.ejs`, `detail.ejs` |
| 판매 | `controllers/admin/salesController.js` | `views/admin/sales/list.ejs`, `detail.ejs` |
| 배송 | `controllers/admin/shippingController.js` | `views/admin/shipping/list.ejs` |
| 방문자 | `controllers/admin/visitorController.js` | `views/admin/visitors/stats.ejs` |
| 설정 | `controllers/admin/settingsController.js` | `views/admin/settings/form.ejs` |
| 운영자 | `controllers/admin/operatorController.js` | `views/admin/operators/list.ejs`, `form.ejs` |
| 약관 | `controllers/admin/policyController.js` | `views/admin/policies/list.ejs`, `create.ejs`, `detail.ejs`, `edit.ejs`, `form.ejs` |
| 문의 | `controllers/admin/inquiryController.js` | `views/admin/inquiries/list.ejs`, `detail.ejs` |
| 메뉴 | `controllers/admin/menuController.js` | `views/admin/menus/list.ejs` |

---

## 6. DB 연결

- **설정:** `config/db.js`에서 MySQL connection pool 사용  
- **컨트롤러:** `const pool = require('../../config/db');` 후 `pool.query()`, `pool.getConnection()` (트랜잭션 시) 사용  
- **테이블 정의:** `tables.sql` 참고

---

*Last Updated: 2026-02-07*
