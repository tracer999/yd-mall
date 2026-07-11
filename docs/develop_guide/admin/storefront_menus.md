# 스토어프론트 메뉴 (Storefront Menus)

## 1. 개요

고객 화면(스토어프론트)의 **GNB · 헤더 유틸 · 우측 유틸 레일** 메뉴를 관리합니다. 관리자 사이드바 메뉴(`admin_menus`)와는 완전히 별개입니다 → [관리자 메뉴 관리](./menus.md)

- **관련 테이블:** `feature_menu`(전역 카탈로그), `mall_feature_menu`(몰별 ON/OFF·순서), `custom_menu`(몰별 커스텀 메뉴), `navigation_config`(몰별 헤더 정책), `categories`(카테고리 드롭다운)
- **컨트롤러:** `controllers/admin/featureMenuController.js`, `controllers/admin/headerSettingsController.js`, `controllers/admin/menuPreviewController.js`
- **뷰:** `views/admin/feature-menus/list.ejs`, `views/admin/system-menus/list.ejs` (둘 다 `views/partials/admin/menu_editor.ejs` 공용), `views/admin/header-settings/edit.ejs`, `views/admin/menu-preview/index.ejs`
- **조립 서비스:** `services/menu/navigationService.js` → `middleware/menuData.js` 가 `res.locals` 에 주입
- **스토어프론트 표준 URL:** `routes/feature.js`
- **몰 컨텍스트:** 관리자 화면은 `req.adminMallId`(없으면 1), 스토어프론트는 `req.mallId`(없으면 1)

### 설계 원칙

- 운영자는 **메뉴의 URL 과 위치(position)를 바꿀 수 없습니다.** 표준 URL 은 코드가 고정합니다(`feature_menu.default_path` ↔ `routes/feature.js`).
- 렌더 조건은 항상 **`is_enabled AND module_ready`** 입니다. 모듈이 없는 메뉴는 관리자가 켜도 노출되지 않습니다(죽은 링크 구조적 차단).
- `is_required = 1` 인 메뉴(로그인·마이쇼핑·장바구니·검색·TOP)는 끌 수 없습니다.
- 배지는 `NEW` / `HOT` / `SALE` 화이트리스트만 허용합니다(자유 입력 금지).
- PC/모바일은 **서버에서 기기 필터를 하지 않습니다.** 같은 HTML 에 함께 렌더되고 `pc_visible` / `mobile_visible` 값을 보고 뷰가 고릅니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/feature-menus` | featureMenuController.getList | 일반 메뉴 관리 — GNB 기능 메뉴 목록/편집 |
| POST | `/admin/feature-menus` | featureMenuController.postSave | GNB 메뉴 저장 |
| GET | `/admin/system-menus` | featureMenuController.getSystemList | 시스템 메뉴 설정 — 헤더 유틸 + 우측 레일 |
| POST | `/admin/system-menus` | featureMenuController.postSystemSave | 시스템 메뉴 저장 |
| GET | `/admin/header-settings` | headerSettingsController.getEdit | Header 설정 (navigation_config) 폼 |
| POST | `/admin/header-settings` | headerSettingsController.postUpdate | Header 설정 저장 |
| GET | `/admin/menu-preview` | menuPreviewController.getPreview | 메뉴 조립 결과 미리보기 (`?device=pc\|mobile&login=0\|1`) |

모두 `routes/admin.js` 에서 `requireMenuAccess('/admin/...')` 를 거쳐 마운트됩니다.

> `custom_menu` 테이블에는 **전용 관리자 CRUD 화면이 아직 없습니다.** 조립(`navigationService`)과 참조 무결성 체크(`exhibitionController` — 기획전 삭제 시 연결된 커스텀 메뉴가 있으면 차단)만 코드에 있습니다.

---

## 3. 일반 메뉴 관리 / 시스템 메뉴 설정

두 화면은 **같은 컨트롤러·같은 편집기(`menu_editor.ejs`)** 를 쓰고, 담당 `position` 만 다릅니다.

| 화면 | position | 성격 |
|------|----------|------|
| `/admin/feature-menus` (일반 메뉴 관리) | `gnb` | 상단 GNB 기능 메뉴 |
| `/admin/system-menus` (시스템 메뉴 설정) | `header_util`, `right_rail` | 헤더 유틸 + 우측 레일 (추가·삭제 불가) |

> 화면 분리 기준은 **`position` 이지 `is_system` 이 아닙니다.** `CATEGORY`(gnb)가 `is_system = 1` 이고 `RAIL_BRAND_WISHLIST` · `RAIL_RECENT` 는 `is_system = 0` 이라, `is_system` 으로 가르면 GNB 버튼이 시스템 화면으로 끌려오고 레일 2종이 빠집니다.

### 3.1 목록 (GET)

`feature_menu` LEFT JOIN `mall_feature_menu`(mall_id = 현재 몰) 로, 담당 position 의 모든 카탈로그 항목을 가져옵니다. `mall_feature_menu` 행이 없으면 `is_enabled = 0`, `sort_order = feature_menu.default_sort_order` 로 간주합니다.

- **정렬:** `position ASC, sort_order ASC, default_sort_order ASC`
- **뷰 전달:** `screen`(담당 position·제목·설명), `groups`(position별 항목), `badgeTypes`, `config`(`max_gnb_items`, `max_custom_items`), `saved`

### 3.2 폼 필드 (`views/partials/admin/menu_editor.ejs`)

| name | 타입 | 설명 |
|------|------|------|
| `feature_code[]` | hidden | 기능 코드(행 식별자) |
| `enabled[]` | checkbox (value=feature_code) | 사용 여부. `module_ready = 0` 이면 잠금(disabled), `is_required = 1` 이면 켠 채 잠금 |
| `sort_order[]` | number | 같은 position 내 순서 |
| `display_name[]` | text | 표시명 (비우면 `feature_menu.default_name` 사용) |
| `badge_type[]` | select | NEW / HOT / SALE / 없음 |
| `pc_visible[]` | checkbox (value=feature_code) | PC 노출 |
| `mobile_visible[]` | checkbox (value=feature_code) | 모바일 노출 |
| `login_required[]` | checkbox (value=feature_code) | 로그인 사용자에게만 노출 |

체크박스는 켜진 것만 전송되므로 서버는 `Set` 으로 받아 판정합니다. `disabled` 체크박스는 전송되지 않으므로 서버가 값을 강제합니다.

### 3.3 저장 (POST)

1. 트랜잭션 시작
2. `feature_menu` 를 **서버가 다시 조회**해 `position` / `module_ready` / `is_required` 를 확인합니다. 폼이 보낸 값은 신뢰하지 않습니다.
3. 알 수 없는 `feature_code`, **그 화면이 담당하지 않는 position** 은 건너뜁니다(일반 메뉴 화면에서 시스템 메뉴를 조작하는 요청 위조 차단).
4. 강제 규칙: `is_required = 1` → `is_enabled = 1`, `module_ready = 0` → `is_enabled = 0`.
5. `INSERT ... ON DUPLICATE KEY UPDATE` 로 `mall_feature_menu` 에 upsert (`uk_mall_feature (mall_id, feature_code)`).
6. commit 후 `{화면 경로}?saved=1` 리다이렉트.

---

## 4. Header 설정 (`/admin/header-settings`)

`navigation_config`(몰당 1행)를 편집합니다. 행이 없으면 500 + "`scripts/migrate_menu_architecture.js` 를 실행하세요" 안내를 냅니다.

### 4.1 폼 필드

| name | 타입 | 허용 값 / 범위 |
|------|------|----------------|
| `header_layout_type` | select | `main_right_utility_v1` (기본형만 지원) |
| `category_display_type` | select | `dropdown` (지원) / `mega` (**렌더 미지원 — UI 잠금**) |
| `max_gnb_items` | number | 1 ~ 20 |
| `max_custom_items` | number | 0 ~ 10 (`max_gnb_items` 를 넘으면 잘라 맞춤) |
| `category_max_depth` | number | 1 ~ 3 (프론트 드롭다운이 3뎁스까지만 렌더) |
| `use_search_bar` | checkbox | 1/0 |

### 4.2 저장 검증

- 문자열은 **화이트리스트**로, 정수는 **범위 clamp** 로 서버가 재검증합니다. 화이트리스트의 `supported: false` 항목(메가 메뉴)은 선택해도 반영되지 않습니다.
- `use_mega_menu` 는 렌더 미지원이므로 **항상 0** 으로 고정 저장합니다.
- **`category_max_depth` 는 현재 카테고리 데이터의 최대 depth 미만으로 내릴 수 없습니다.** 내리면 `navigationService` 가 `depth <= maxDepth` 로 걸러 기존 하위 카테고리가 스토어프론트에서 조용히 사라지기 때문입니다. 위반 시 `?error=...` 로 리다이렉트합니다.

---

## 5. 메뉴 미리보기 (`/admin/menu-preview`)

- 스토어프론트와 **같은 함수**(`navigationService.getNavigation`)를 호출합니다. 조립 로직을 다시 짜지 않아야 미리보기와 실제가 어긋나지 않습니다.
- 쿼리: `device=pc|mobile`, `login=0|1`
- 화면의 핵심은 "무엇이 보이는가"보다 **"무엇이 왜 안 보이는가"** 입니다. `findExcluded()` 가 제외 사유를 붙여 목록으로 보여줍니다.

| 제외 사유 | 판정 |
|-----------|------|
| 모듈 미구현 (켜도 노출되지 않음) | `feature_menu.module_ready = 0` |
| 사용 안 함 (운영자가 끔) | `mall_feature_menu.is_enabled = 0` |
| 로그인 필요 | `login_required = 1` 이고 비로그인 미리보기 |
| 노출 기간 전 / 종료 | `visible_start_at` / `visible_end_at` |
| GNB 잘림 | `gnbCandidateCount - gnb.length` (= `max_gnb_items` 초과분) |

---

## 6. 조립 로직 (`services/menu/navigationService.js`)

`getNavigation(mallId, { isLoggedIn })` 반환값:

| 키 | 내용 |
|----|------|
| `config` | `navigation_config` (없으면 `DEFAULT_CONFIG` 로 폴백) |
| `categoryTree` | NORMAL · `is_active = 1` · `depth <= category_max_depth` 카테고리의 `parent_id` 재귀 트리 |
| `categoryButton` | GNB 최좌측 고정 버튼 (`feature_code = 'CATEGORY'`). 없으면 `null` → 버튼 미노출 |
| `gnb` | (기능 메뉴 + 커스텀 슬롯) 을 `max_gnb_items` 로 자른 목록 (카테고리 버튼 제외) |
| `gnbCandidateCount` | 자르기 전 후보 수 — **관리자 미리보기 전용**(스토어프론트는 읽지 않음) |
| `rightRail`, `headerUtil` | position 별 기능 메뉴 |
| `footer`, `mobileQuick` | position 별 기능 메뉴 + 커스텀 메뉴 (각각 20 / 5 슬롯) |

- 기능 메뉴 조회 조건: `mall_feature_menu.is_enabled = 1 AND feature_menu.module_ready = 1` + 노출 기간(`visible_start_at`/`visible_end_at`).
- `login_required = 1` 항목은 비로그인 사용자에게 숨깁니다(앱 레이어).
- 표시명은 `COALESCE(NULLIF(m.display_name, ''), f.default_name)`.
- 커스텀 메뉴는 `location` 별 슬롯 제한(`max_custom_items` 등)을 **서버가 강제**합니다.
- 카테고리 트리에서 **부모가 필터에 걸려 빠지면 자식도 함께 숨깁니다**(최상위로 승격시키지 않음).

### 6.1 커스텀 메뉴 링크 해석 (`LINK_RESOLVERS`)

| link_type | href |
|-----------|------|
| `INTERNAL_PAGE` | `link_url` |
| `EXTERNAL_URL` | `link_url` (**항상 새 창** — 관리자 설정과 무관하게 강제) |
| `CATEGORY` | `/products/category/{link_target}` |
| `BRAND` | `/products/brand/{link_target}` |
| `EXHIBITION` | `/exhibition/view/{link_target}` (상세 라우트가 slug 로 301) |
| `PRODUCT_GROUP` | **미등록 → 렌더 제외** (모듈 미구현) |

해석기가 없거나 대상이 비어 href 를 만들 수 없는 행은 렌더에서 제외합니다(죽은 링크 차단).

### 6.2 뷰 주입 (`middleware/menuData.js`)

`res.locals` 에 `nav`, `gnbMenus`, `categoryButton`, `rightRailMenus`, `headerUtilMenus`, `categoryTree`, `menuCategories`(THEME 카테고리 — 레거시 하위호환), `currentPath` 를 주입합니다. 조회 실패 시 예외를 삼키고 **빈 메뉴 + 카테고리 버튼 골격만** 유지해 헤더가 깨지지 않게 합니다(레거시 `storefront_menu` 폴백은 테이블 DROP 과 함께 제거됨).

---

## 7. 표준 URL (`routes/feature.js`)

`feature_menu.default_path` 와 1:1 대응합니다. 모듈이 없는 메뉴는 `'#'` 죽은 링크 대신 **준비중 랜딩**(`user/coming_soon`, `noindex,follow`)을 렌더합니다.

| feature_code | default_path | position | 상태 |
|--------------|--------------|----------|------|
| CATEGORY | (NULL) | gnb | 카테고리 드롭다운 버튼 (클라이언트 동작, 필수) |
| TODAY_DEAL | `/deal/today` | gnb | 상품그룹(manual) 기반. 0건이면 준비중 랜딩 |
| BEST | `/best` | gnb | 상품그룹(manual) 우선, 0건이면 조회수 상위 100 폴백 |
| NEW_PRODUCT | `/new` | gnb | NEW 배지 상품 (최신순) |
| EVENT | `/event` | gnb | `routes/event.js` |
| EXHIBITION | `/exhibition` | gnb | `routes/exhibition.js` |
| BRAND | `/brands` | gnb | 브랜드 |
| GROUP_BUY | `/group-buy` | gnb | `routes/group-buy.js` |
| COUPON | `/coupon` | gnb | `routes/coupon.js` (0건이면 준비중 랜딩) |
| RANKING | `/ranking` | gnb | 준비중 랜딩 |
| OUTLET | `/outlet` | gnb | 준비중 랜딩 |
| LIVE | `/live` | gnb | 준비중 랜딩 |
| MEMBERSHIP | `/membership` | gnb | 정적 제도 소개 페이지 |
| HEADER_SEARCH | `/search` | header_util | 필수 |
| HEADER_LOGIN | `/auth/login` | header_util | 필수 |
| HEADER_MYPAGE | `/mypage` | header_util | 필수 |
| HEADER_CART | `/cart` | header_util | 필수 |
| HEADER_CS | `/cs` | header_util | 시스템 |
| RAIL_CART | `/cart` | right_rail | 시스템 |
| RAIL_WISHLIST | `/mypage/likes` | right_rail | 시스템 |
| RAIL_BRAND_WISHLIST | `/mypage/brand-likes` | right_rail | |
| RAIL_RECENT | (NULL) | right_rail | 클라이언트 동작 |
| RAIL_TOP | (NULL) | right_rail | 필수 (클라이언트 동작) |

> `routes/feature.js` 는 app.js 에서 `'/'` 에 **먼저** 마운트됩니다. 여기에 `/group-buy` · `/coupon` 같은 경로를 남겨두면 뒤에 오는 전용 라우터에 요청이 영영 닿지 못합니다.

---

## 8. DB 테이블

### 8.1 feature_menu — 기능/시스템 메뉴 카탈로그 (전역, 몰 무관)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| feature_code | VARCHAR(50) UNIQUE | 기능 코드(고정 식별자) |
| default_name | VARCHAR(100) | 기본 메뉴명 |
| default_path | VARCHAR(255) NULL | 표준 URL (운영자 변경 불가). NULL = 클라이언트 동작 |
| position | VARCHAR(30) | `gnb` / `right_rail` / `header_util` / `footer` / `mobile_quick` |
| required_module | VARCHAR(50) NULL | 필요 기능 모듈 |
| module_ready | TINYINT(1) DEFAULT 0 | 1 = 모듈 구현됨(렌더 허용). 0이면 켜도 미노출 |
| is_system | TINYINT(1) DEFAULT 0 | 1 = 시스템 메뉴(삭제 불가) |
| is_required | TINYINT(1) DEFAULT 0 | 1 = 항상 노출(끌 수 없음) |
| default_sort_order | INT DEFAULT 0 | 기본 순서 |
| description | VARCHAR(255) NULL | 설명 |

### 8.2 mall_feature_menu — 몰별 ON/OFF·순서 오버라이드

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| mall_id | BIGINT DEFAULT 1 | |
| feature_code | VARCHAR(50) FK → feature_menu.feature_code | `ON DELETE CASCADE` |
| display_name | VARCHAR(100) NULL | NULL/빈 값이면 `default_name` 사용 |
| sort_order | INT DEFAULT 0 | 같은 position 내 순서 |
| is_enabled | TINYINT(1) DEFAULT 0 | 사용 여부 |
| pc_visible / mobile_visible | TINYINT(1) DEFAULT 1 | 기기별 노출 (뷰가 필터) |
| login_required | TINYINT(1) DEFAULT 0 | 로그인 사용자에게만 노출 |
| badge_type | VARCHAR(20) NULL | NEW / HOT / SALE |
| visible_start_at / visible_end_at | DATETIME NULL | 노출 기간 |
| updated_at | DATETIME | |

UNIQUE `uk_mall_feature (mall_id, feature_code)` — upsert 키.

### 8.3 custom_menu — 몰별 커스텀 메뉴 (슬롯 제한)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| mall_id | BIGINT DEFAULT 1 | |
| display_name | VARCHAR(100) | 메뉴명 |
| link_type | VARCHAR(30) DEFAULT 'INTERNAL_PAGE' | INTERNAL_PAGE / EXTERNAL_URL / CATEGORY / BRAND / EXHIBITION / PRODUCT_GROUP |
| link_target | BIGINT NULL | 내부 리소스 id (**FK 없음**) |
| link_url | VARCHAR(500) NULL | INTERNAL_PAGE / EXTERNAL_URL 일 때만 사용 |
| location | VARCHAR(30) DEFAULT 'gnb' | **커스텀 메뉴만 위치 선택 가능** |
| sort_order | INT DEFAULT 0 | |
| is_enabled | TINYINT(1) DEFAULT 1 | |
| pc_visible / mobile_visible | TINYINT(1) DEFAULT 1 | |
| login_required | TINYINT(1) DEFAULT 0 | |
| badge_type | VARCHAR(20) NULL | NEW / HOT / SALE |
| new_window | TINYINT(1) DEFAULT 0 | EXTERNAL_URL 은 서버가 1로 강제 |
| visible_start_at / visible_end_at | DATETIME NULL | 노출 기간 |
| created_at / updated_at | DATETIME | |

### 8.4 navigation_config — 몰별 내비게이션 정책 (몰당 1행)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| mall_id | BIGINT UNIQUE (`uk_navconfig_mall`) | |
| header_layout_type | VARCHAR(50) DEFAULT 'main_right_utility_v1' | |
| category_display_type | VARCHAR(50) DEFAULT 'dropdown' | dropdown / mega(미지원) |
| max_gnb_items | INT DEFAULT 8 | GNB 최대 노출 수 (카테고리 버튼 제외) |
| max_custom_items | INT DEFAULT 3 | GNB 커스텀 메뉴 슬롯 수 |
| category_max_depth | INT DEFAULT 3 | 카테고리 최대 뎁스 (앱 레이어 강제) |
| use_mega_menu | TINYINT(1) DEFAULT 0 | 렌더 미지원 — 항상 0 |
| use_search_bar | TINYINT(1) DEFAULT 1 | |
| config_json | JSON NULL | 미사용 |
| updated_at | DATETIME | |

---

## 9. 주의사항

- **`module_ready` 는 라우트를 배포한 *뒤에* 1로 올리세요.** 개발·운영이 같은 DB 를 보므로, 먼저 올리면 운영 GNB 에 404 링크가 뜹니다.
- `custom_menu.link_target` 에는 FK 가 없습니다. 연결된 리소스를 지우면 죽은 링크가 남으므로, 기획전 삭제는 `exhibitionController` 가 연결된 커스텀 메뉴 수를 세어 차단합니다. 다른 `link_type` 에는 같은 가드가 없습니다.
- `category_max_depth` 를 낮추면 기존 하위 카테고리가 스토어프론트에서 사라집니다. Header 설정이 하향을 막지만, DB 를 직접 수정하면 막히지 않습니다.
- `navigation_config` 행이 없는 몰은 Header 설정 화면이 500 입니다. 몰을 새로 만들면 `mallController` 가 `INSERT IGNORE` 로 행을 넣습니다(`scripts/migrate_menu_architecture.js` 로도 생성 가능).
- 메뉴 조회가 실패해도 헤더는 빈 메뉴로 렌더됩니다(`menuData` 가 예외를 삼킴). 메뉴가 통째로 사라졌다면 서버 로그의 `Menu Middleware Error` 를 확인하세요.
- 몰 컨텍스트가 없으면 `mall_id = 1` 로 폴백합니다.

---

*Last Updated: 2026-07-11*
