# 멀티몰 (Malls)

## 1. 개요

- **Base URL:** `/admin/malls`
- **관련 테이블:** `mall` (정의), `navigation_config` · `mall_feature_menu` · `theme` (몰 소유 설정), 그 밖에 `mall_id` 를 가진 데이터 테이블 17종(§5)
- **컨트롤러:** `controllers/admin/mallController.js`
- **라우트:** `routes/admin/malls.js` (마운트: `routes/admin.js:68`)
- **미들웨어:** `middleware/mallContext.js`(스토어프론트), `middleware/adminMallContext.js`(관리자)
- **뷰:** `views/admin/malls/list.ejs`, `form.ejs`, 편집 몰 선택기 `views/layouts/admin_layout.ejs:269-280`, 스토어프론트 몰 선택기 `views/partials/storefront/header.ejs:38` · `views/partials/storefront/mobile_bottom_nav.ejs:58`

하나의 앱 인스턴스가 여러 몰을 서비스한다. 현재 데이터: `mall` 2행 — `health`(와이디몰 건강식품관, 기본몰) / `general`(와이디몰 종합관).

**몰 컨텍스트는 두 개다. 서로 독립이다.**

| | 스토어프론트 | 관리자 |
|---|---|---|
| 미들웨어 | `middleware/mallContext.js` | `middleware/adminMallContext.js` |
| 세션 키 | `req.session.mallId` | `req.session.adminMallId` |
| 쿼리 파라미터 | `?mall=<id\|code>` | `?adminMall=<id\|code>` |
| 노출 값 | `req.mallId`, `res.locals.mallId` / `mall` / `malls` | `req.adminMallId`, `res.locals.adminMallId` / `adminMall` / `adminMalls` |
| 의미 | 손님이 **보는** 몰 | 관리자가 **편집 중인** 몰 |

→ 관리자가 스토어프론트를 `?mall=2` 로 미리보기해도 편집 대상 몰은 바뀌지 않는다(그 반대도). `middleware/adminMallContext.js` 상단 주석.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/malls` | `getList` | 몰 목록 + 몰별 카테고리·상품 건수 |
| GET | `/admin/malls/new` | `getNew` | 몰 등록 폼 |
| POST | `/admin/malls` | `postAdd` | 몰 생성 |
| GET | `/admin/malls/:id` | `getEdit` | 몰 수정 폼 |
| POST | `/admin/malls/:id` | `postEdit` | 몰 수정 |
| POST | `/admin/malls/:id/delete` | `postDelete` | 몰 삭제 |

- **권한 2중**: `routes/admin.js:68` 의 `requireMenuAccess('/admin/malls')`(`admin_menus.visible_roles` = `super_admin,admin`) + 라우터 자체의 `requireSuperAdmin`(세션 role 이 `super_admin` 또는 `admin` 이 아니면 403).
- Express 5 라 `/new` 를 `/:id` 보다 먼저 선언하고, 숫자 검증은 `requireNumericId` 가 한다.

### 2.1 폼 필드 (`views/admin/malls/form.ejs`)

| name | 타입 | 검증 |
|------|------|------|
| code | text | `/^[a-z0-9_-]{2,50}$/` (소문자화 후 검사), 전역 유니크 |
| name | text | 필수, 100자 절단 |
| domain | text | 선택. **향후 도메인 기반 라우팅용 — 현재 코드는 읽지 않는다** |
| is_active | checkbox | |
| is_default | checkbox | 지정 시 `is_active` 강제 1 |

---

## 3. 불변식 (mallController.js)

| 규칙 | 이유 | 구현 |
|---|---|---|
| **기본몰(`is_default=1`)은 정확히 하나** | 해석기 폴백 대상 | `setDefault(conn, id)` — 트랜잭션으로 나머지 `is_default=0` 후 대상만 1(+`is_active=1`) |
| **기본몰은 비활성화 불가** | `mallContext.loadMalls()` 가 `is_active=1` 만 캐시 → 기본몰이 빠지면 폴백이 깨진다 | `postEdit` 에서 차단(다른 몰을 먼저 기본몰로 지정하라는 에러) |
| **기본몰은 삭제 불가** | 위와 동일 | `postDelete` 에서 차단 |
| **데이터(카테고리·상품)가 있는 몰은 삭제 불가** | `mall_id` 참조에 **FK 가 없다** → 몰 행만 지우면 고아 데이터가 남는다 | `mallDataCounts(id)` 로 `categories`·`products` 건수 확인 후 차단 |
| **변경 후 캐시 무효화** | 몰 목록은 프로세스 메모리에 60초 TTL 캐시 | 생성·수정·삭제 뒤 `mallContext.invalidate()` |

- **몰 생성 시 `navigation_config` 자동 생성** (`INSERT IGNORE`): `header_layout_type='main_right_utility_v1'`, `category_display_type='dropdown'`, `max_gnb_items=8`, `max_custom_items=3`, `category_max_depth=3`, `use_mega_menu=0`, `use_search_bar=1`. 새 몰이 빈 스토어가 되는 것을 막는다.
- **몰 삭제 시** `navigation_config` / `mall_feature_menu` / `theme` 의 해당 `mall_id` 행을 함께 지운다(FK 가 없으므로 코드가 정리). 데이터 테이블은 위 가드로 이미 0건임이 보장된다.

---

## 4. 몰 컨텍스트 해석

### 4.1 스토어프론트 (`middleware/mallContext.js`)

`app.js:202` — 전역 변수 미들웨어 다음, `siteSettings`·`themeData`·`menuData` 등 **모든 스토어프론트 미들웨어보다 먼저** 마운트된다.

해석 순서:
1. `?mall=<id|code>` 가 오면 유효성 검사 후 **세션에 고정**(`req.session.mallId`)
2. 세션 값
3. 기본 몰(`mall.is_default=1`)

- 비활성/삭제된 몰이 세션에 남아 있으면 기본 몰로 되돌린다.
- 해석 실패(DB 오류 등)해도 화면은 떠야 하므로 **mall 1 폴백** + 경고 로그.
- 캐시: `loadMalls()` 가 `SELECT id, code, name, is_active, is_default FROM mall WHERE is_active = 1` 을 60초 TTL 로 프로세스 메모리에 담는다. `mall` 테이블이 비어 있으면 `{id:1, code:'default'}` 폴백.
- `res.locals.malls` — 헤더 Top Bar 몰 선택 셀렉트용(활성 몰만, 기본몰 먼저). 스토어프론트 선택기는 `views/partials/storefront/header.ejs`(PC)와 `mobile_bottom_nav.ejs`(모바일)에 `<select name="mall">` 로 있다.
- **export 부가**: `mallContext.invalidate()`(캐시 비우기), `mallContext.getMalls()`(관리자 해석기가 같은 캐시를 재사용).

### 4.2 관리자 (`middleware/adminMallContext.js`)

`routes/admin.js:16` — `adminAuth` **뒤**에 마운트(인증된 관리자 요청에만 적용). 즉 `/admin/login` 은 영향받지 않는다.

- 해석: `?adminMall=<id|code>` → 세션(`req.session.adminMallId`) 저장 → 이후 유지. 없으면 기본 몰.
- 실패 시 mall 1 폴백.
- `res.locals.adminMalls` — 레이아웃 상단 편집 몰 선택기(`admin_layout.ejs`). **몰이 2개 이상일 때만 노출**되며, `GET` 폼이 현재 URL 에 `?adminMall=<id>` 를 붙여 재요청한다.

### 4.3 관리자 컨트롤러의 사용 규약

몰 스코프가 필요한 컨트롤러는 하드코딩 `MALL_ID = 1` 대신 **`req.adminMallId || 1`** 을 쓴다. 현재 사용 중인 컨트롤러:

`categoryController`, `claimController`, `eventController`, `exhibitionController`, `faqController`, `featureMenuController`, `groupBuyController`, `headerSettingsController`, `heroSlideController`, `menuPreviewController`, `pageBuilderController`, `productController`, `productGroupController`, `settingsController`, `shippingPolicyController`, `themeSettingsController` (+ 스토어프론트 `mainController` 의 미리보기)

**스코프하지 않는 것**: `admin_menus`(사이드바), `banners`, `orders`, `users` 등 몰 무관 데이터(`middleware/adminMallContext.js` 상단 주석).

### 4.4 페이지 빌더 미리보기와의 관계

`controllers/mainController.js:131` `getHomePreview` 는 `req.mallId = req.adminMallId || req.mallId || 1` 로 스토어프론트 몰을 **편집 몰로 덮어쓴 뒤** 홈 컨텍스트를 만든다. 히어로·상품 리졸버가 편집 대상과 다른 몰로 스코프되던 문제(커밋 `60aa7b6`)를 이렇게 막는다. → [`page_builder.md`](./page_builder.md)

---

## 5. DB 테이블

### `mall` — 몰 정의

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| code | varchar(50) NOT NULL | **UNIQUE** (`uk_mall_code`). 고정 식별자 (`health` / `general`). `?mall=코드` 로 쓰인다 |
| name | varchar(100) NOT NULL | |
| domain | varchar(255) | 향후 도메인 기반 라우팅용. **현재 미사용** |
| is_active | tinyint(1) NOT NULL DEFAULT 1 | 0 이면 해석기 캐시에서 빠진다 |
| is_default | tinyint(1) NOT NULL DEFAULT 0 | 해석기 폴백 대상 — **1개만 1** |
| created_at / updated_at | datetime | |

현재 행: `1 / health / 와이디몰 건강식품관 / is_default=1`, `2 / general / 와이디몰 종합관`.

### `mall_id` 를 가진 테이블 (17)

`categories`, `coupons`, `custom_menu`, `event`, `exhibition`, `faq`, `faq_category`, `group_buy`, `hero_slide`, `mall_feature_menu`, `navigation_config`, `page`, `product_group`, `products`, `shipping_policy`, `site_settings`, `theme`

> **어느 테이블에도 `mall_id` FK 가 없다.** 참조 무결성은 애플리케이션(컨트롤러 가드)이 지킨다.

**`mall_id` 가 없는 주요 테이블**: `banners`, `page_section`(→ `page` 를 통해 간접 스코프), `product_group_item`(→ `product_group` 을 통해), `orders`, `users`, `admin_menus`, `admins`.

---

## 6. 주의사항

- **`banners` 는 몰 스코프가 아니다.** 배너는 모든 몰이 공유한다(`mainController.buildHomeContext` 의 MAIN/POPUP 배너 조회에 `mall_id` 조건이 없다). `promotion_banner` 섹션도 `group_key` 로만 조회한다.
- **몰 캐시는 60초 TTL 이고 프로세스 메모리에 있다.** 관리자 화면 밖(스크립트·DB 직접 수정)에서 `mall` 을 바꾸면 최대 60초 지연이 생기고, PM2 를 여러 프로세스로 늘리면 프로세스마다 캐시가 따로 논다(현재 PM2 는 fork·`instances: 1`).
- **`mall.code` 를 바꾸면 기존 `?mall=<code>` 링크가 깨진다.** id 는 계속 유효하다.
- **몰 삭제 가드는 `categories`·`products` 만 센다.** 그 몰의 `page`/`product_group`/`coupons`/`exhibition` 등이 남아 있어도 삭제된다(고아 행이 된다). 삭제 전 데이터 정리는 운영자 책임이다.
- **몰 전환은 세션에 고정된다.** 한 번 `?mall=general` 로 들어오면 이후 요청은 계속 종합관을 본다. 되돌리려면 `?mall=health`(또는 기본몰 코드).
- **`domain` 컬럼은 아직 아무 코드도 읽지 않는다.** 도메인 기반 라우팅은 미구현이다.
- `ranking_tabs` 섹션 리졸버는 몰 스코프 없이 카테고리를 뽑는다(mall 1 고정). → [`page_builder.md`](./page_builder.md) §8
- 관련 문서: [`page_builder.md`](./page_builder.md), [`menus.md`](./menus.md), [`settings.md`](./settings.md), [`categories.md`](./categories.md)

---

*Last Updated: 2026-07-11*
