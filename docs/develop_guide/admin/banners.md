# 배너 관리 (Banners)

## 1. 개요

- **Base URL:** `/admin/banners`  
- **관련 테이블:** `banners`, `hero_slide`, `categories`, `products`  
- **컨트롤러:** `controllers/admin/bannerController.js`, `controllers/admin/heroSlideController.js`  
- **라우트:** `routes/admin/banners.js` (`routes/admin.js` 에서 `requireMenuAccess('/admin/banners')` 로 마운트)  
- **뷰:** `views/admin/banners/list.ejs`, `views/admin/banners/form.ejs`, `views/admin/banners/hero-slides/list.ejs`, `views/admin/banners/hero-slides/form.ejs`  
- **이미지 업로드:** Multer 필드명 `banner_image` / `mobile_banner_image` (배너), `slide_image` (슬라이드). 저장 경로 `public/uploads/banners/`, DB 에는 `/uploads/banners/파일명`

이 화면은 **두 종류의 데이터**를 관리합니다.

1. **메인 슬라이더 (`hero_slide`)** — 홈 히어로의 상품 쇼케이스 슬라이드. `/admin/banners/hero-slides` 하위.
2. **배너 (`banners`)** — 메인(레거시)·카테고리·팝업·브랜드·메뉴별 배너. `/admin/banners` 본체.

목록 상단 탭이 `메인 슬라이더 | 메인 배너(레거시) | 카테고리 배너 | 팝업 배너 | 브랜드 배너 | 메뉴별 배너` 6개로 구성됩니다(`views/admin/banners/list.ejs`).

**메뉴별 배너 탭은 켜져 있는 GNB 메뉴를 전부 서브탭(pill)으로 펼칩니다.** 메뉴 하나를 고르면 그 메뉴의 배너만 보입니다(`?type=MENU&menu={feature_code}`). 서브탭 목록은 `feature_menu` 에서 동적으로 오므로, 메뉴를 켜고 끄면 탭도 따라 바뀝니다.

> **몰 스코프:** `hero_slide` 만 `mall_id` 컬럼을 가지며 `req.adminMallId`(`middleware/adminMallContext.js`)로 스코프됩니다. **`banners` 테이블에는 `mall_id` 가 없어 전 몰 공용**입니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/banners/hero-slides` | heroSlide.getList | 메인 슬라이더 목록 (MAIN/FEATURE 슬롯별) |
| GET | `/admin/banners/hero-slides/add` | heroSlide.getAdd | 슬라이드 등록 폼 (`?slot=MAIN\|FEATURE`) |
| POST | `/admin/banners/hero-slides/add` | heroSlide.postAdd | 슬라이드 등록 (multipart, `slide_image`) |
| GET | `/admin/banners/hero-slides/edit/:id` | heroSlide.getEdit | 슬라이드 수정 폼 |
| POST | `/admin/banners/hero-slides/edit/:id` | heroSlide.postEdit | 슬라이드 수정 (multipart) |
| POST | `/admin/banners/hero-slides/delete` | heroSlide.postDelete | 슬라이드 삭제 |
| GET | `/admin/banners` | getList | 배너 목록 (type 쿼리: MAIN/CATEGORY/POPUP/BRAND/MENU) |
| GET | `/admin/banners/add` | getAdd | 배너 등록 폼 (`?type=` 로 기본 타입 선택) |
| POST | `/admin/banners/add` | postAdd | 배너 등록 처리 (multipart, `upload.fields`) |
| GET | `/admin/banners/edit/:id` | getEdit | 배너 수정 폼 |
| POST | `/admin/banners/edit/:id` | postEdit | 배너 수정 처리 (multipart, `upload.fields`) |
| POST | `/admin/banners/delete` | postDelete | 배너 삭제 |

> `hero-slides/*` 는 `/add`·`/edit/:id` 보다 **먼저** 마운트해 경로 충돌을 피합니다(`routes/admin/banners.js`).  
> 업로드 에러는 공통 핸들러가 처리합니다. `LIMIT_FILE_SIZE` → **413** (`업로드 파일은 {MAX_UPLOAD_FILE_MB}MB 이하만 가능합니다.`), 그 외 Multer 오류 → **400**.

---

## 3. 배너 타입과 노출 위치

| 폼 타입 | 저장 형태 | 프론트 노출 위치 (소스) |
|---------|-----------|------------------------|
| MAIN (메인 배너 · **레거시**) | `banner_type='MAIN'` | 홈 히어로. `hero_variant='full_banner'` 일 때만 사용, 상위 6건 (`controllers/mainController.js:28`). `mobile_image_url` 이 있는 건만 모바일 히어로로 사용 |
| CATEGORY (카테고리 배너) | `banner_type='CATEGORY'`, `category_id` | 카테고리 목록 상단 1건 (`controllers/productController.js:125`) |
| POPUP (팝업 배너) | `banner_type='POPUP'` | 홈 팝업 레이어 1건, 게시 기간 필터 적용 (`controllers/mainController.js:55`) |
| BRAND (브랜드 배너) | `banner_type='BRAND'`, `category_id`(=브랜드 카테고리) | 브랜드 필터 목록 상단 1건, 카테고리 배너가 없을 때만 (`controllers/productController.js:153`) |
| MENU (메뉴별 배너) | `banner_type='CATEGORY'` + `category_id=NULL` + **`group_key='menu:{feature_code}'`** | 해당 GNB 메뉴 페이지 **상단** 배너 슬라이드 (`middleware/menuShowcase` → `main_layout` 이 본문 위에 렌더) |

### 3.1 메뉴별 배너 (group_key 재사용)

`banners.banner_type` enum 에는 `MENU` 값이 없습니다. 스키마 변경을 피하려고 **`group_key` 네임스페이스**로 구현되어 있습니다.

- 저장: `banner_type='CATEGORY'`, `category_id=NULL`, `group_key='menu:{feature_code}'`
- 대상 메뉴: **켜져 있는 GNB 메뉴 전부**. `menuShowcaseService.getMenuTargets()` 가 `feature_menu` × `mall_feature_menu(is_enabled=1)` 에서 동적으로 읽습니다. 하드코딩된 목록은 없습니다.
  - 제외되는 것은 노출될 페이지 자체가 없는 메뉴뿐입니다(`EXCLUDED`): `CATEGORY`(드롭다운, 자체 페이지 없음), `RANKING`(`/ranking` → `/best` 301).
- 소비: `middleware/menuShowcase` 가 요청 경로를 `feature_menu.default_path` 와 매칭 → `menuShowcaseService.getForPath()` → `main_layout` 이 `<%- body %>` **위에** 렌더. 컨트롤러는 관여하지 않으므로 **새 메뉴는 코드 변경 없이 자동으로 배너를 지원**합니다.

#### 배너와 상품 캐러셀은 공존합니다

한 메뉴에 쇼케이스가 **최대 두 개** 쌓입니다. 순서는 `getForPath()` 가 반환하는 배열 순서 그대로입니다.

1. **배너형** — `banners.group_key='menu:{feature_code}'` → **위**
2. **상품형** — `product_group.menu_code='{feature_code}'` → 배너 **아래** (쇼핑특가·베스트·신상품에 시드됨)

> 예전에는 상품형이 있으면 배너를 조회조차 하지 않아(early return), 베스트·신상품·쇼핑특가에는 배너를 걸 수 없었고 관리자 화면에서도 그 메뉴들을 숨겼습니다. 지금은 어느 메뉴에나 배너를 걸 수 있습니다. 상품 캐러셀이 함께 걸린 메뉴에서는 관리자 목록·등록 폼이 그 사실을 안내합니다.

### 3.2 group_key 보존 규칙

`banners.group_key` 는 이 화면 밖에서도 쓰입니다 — SDUI `promotion_banner` 섹션이 `group_key` 로 배너 묶음을 가져갑니다(`services/display/resolvers/promotion_banner.js`, → [페이지 빌더](./page_builder.md)).

그래서 `resolveBannerTarget()`(`bannerController.js:143`)은:

- MENU 타입 → `group_key='menu:{key}'` 로 덮어씀
- 비-MENU 타입 → 폼의 hidden `existing_group_key` 를 **그대로 보존**(예: `home_promo`). 단 `menu:` 접두어는 메뉴별 배너 전용이므로 일반 타입으로 전환 시 제거
- 목록 조회에서도 일반 타입 탭에는 `group_key LIKE 'menu:%'` 배너가 섞이지 않도록 제외

> **주의:** 게시 기간(`start_date`/`end_date`) 필터는 **팝업 배너와 `bannerService` 경유 조회(메뉴별·`promotion_banner`)에만** 적용됩니다. MAIN·CATEGORY·BRAND 직접 쿼리는 `is_active` 만 보고 기간을 무시합니다.

---

## 4. 목록 조회 (GET /admin/banners)

- **쿼리 파라미터:**
  - `type` (기본 `MAIN`) — MAIN / CATEGORY / POPUP / BRAND / MENU
  - `menu` (`type=MENU` 일 때만) — `feature_code`. 없거나 목록에 없는 값이면 **첫 메뉴**로 폴백합니다.
- **쿼리:**  
  - `type=MENU` → `WHERE b.group_key = 'menu:{menu}'` — 고른 메뉴 하나만, `ORDER BY display_order ASC, created_at DESC`  
  - 그 외 → `WHERE b.banner_type = ? AND (b.group_key IS NULL OR b.group_key NOT LIKE 'menu:%')`, `ORDER BY display_order ASC, created_at DESC`  
  - 두 경우 모두 `LEFT JOIN categories` (카테고리/브랜드명)
- **표시:** 썸네일(image_url), 제목, 타입 뱃지(메인/카테고리/브랜드/팝업/메뉴별), 대상(메뉴 라벨 · 카테고리/브랜드명 · "메인 팝업 레이어" · "전체 메인 영역 노출"), 링크 URL, 게시 기간, 사용중/중지 뱃지, 수정/삭제 버튼
- **메뉴별 탭 추가 표시:** 메뉴 서브탭(배너 건수 뱃지 포함), 상품 캐러셀이 걸린 메뉴면 공존 안내 + `상품 캐러셀 편집` 링크(`/admin/product-groups/edit/:id`)
- **뷰 전달:** `banners`, `currentType`, `currentMenuKey`, `menuTargets`, `menuBannerCounts`, `menuProductGroup`, `title: '배너 관리'`

---

## 5. 배너 등록 폼 (GET /admin/banners/add)

- **동작:** `?type=` 을 기본 선택값(`currentType`)으로 받고, 전체 카테고리(`id, name, type`) 조회 후 `banner: null` 로 폼 렌더링  
- **뷰:** `admin/banners/form.ejs`  
- **뷰 전달:** `banner`, `categories`, `currentType`, `menuTargets`, `currentMenuKey`, `maxUploadFileMb`

### 5.1 폼 필드

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| banner_type | radio | - | MAIN / CATEGORY / POPUP / BRAND / MENU, 기본은 `currentType` |
| menu_target | select | MENU일 때 | 노출 메뉴 (BEST / NEW / DEAL) — MENU 선택 시에만 노출 |
| category_id | select | CATEGORY·BRAND일 때 | 카테고리/브랜드 선택. JS 가 `data-type` 으로 옵션을 필터(BRAND 타입은 `type='BRAND'` 카테고리만) |
| title | text | - | 배너 제목 |
| banner_image | file | 신규 등록 시 O | 배너 이미지 (PC). 수정 시엔 선택 |
| mobile_banner_image | file | - | 모바일용 배너 이미지 (없으면 PC 이미지 사용). 폼 스크립트가 PC 필드 뒤에 주입 |
| existing_image / existing_mobile_image | hidden | - | 수정 시 기존 이미지 경로 유지용 |
| existing_group_key | hidden | - | 이 화면과 무관한 `group_key` 보존용 (3.2 참고) |
| link_url | text | - | 클릭 시 이동 URL (내부 경로 또는 외부 URL) |
| display_order | number | - | 노출 순서, 기본 0 |
| start_date | date | - | 게시 시작일 |
| end_date | date | - | 게시 종료일 |
| is_active | checkbox | - | 활성화 여부 (1/0), 신규는 기본 체크 |

> **권장 사이즈 & 비율 요약** (`form.ejs` 의 `updateSizeGuide()` 가 타입별로 안내)
>
> - 메인 배너: 1920×600px (3.2:1), 2배 3840×1200px
> - 카테고리 배너: 900×200px (약 4.5:1), 2배 1800×400px
> - 팝업 배너: 960×960px (1:1), 2배 1920×1920px
> - 브랜드 배너: 900×200px (약 4.5:1), 2배 1800×400px
> - 메뉴별 배너: 1200×260px (약 4.6:1), 2배 2400×520px
> - **모바일 배너:** 390×422px, 2배 780×844px
>
> 해상도는 배율(1배/2배 등)에 따라 키워도 되지만, **각 배너의 가로:세로 비율은 유지**해서 제작해 주세요.  
> 클라이언트 스크립트가 `maxUploadFileMb`(기본 20MB) 초과 파일을 업로드 전에 alert 으로 차단합니다.

---

## 6. 배너 등록 처리 (POST /admin/banners/add)

- **enctype:** `multipart/form-data`, `upload.fields([banner_image, mobile_banner_image])`  
- **로직:**  
  - `resolveBannerTarget(banner_type, category_id, menu_target, null)` 로 `storedType` / `categoryId` / `groupKey` / `redirectType` 결정  
  - `banner_type='MENU'` → `storedType='CATEGORY'`, `categoryId=null`, `groupKey='menu:{key}'`  
  - `banner_type` 이 MAIN/CATEGORY/POPUP/BRAND 이외면 MAIN 으로 강제. `category_id` 는 CATEGORY·BRAND 일 때만 저장  
  - `image_url`, `mobile_image_url` = 업로드 파일 있으면 `/uploads/banners/` + 파일명, 없으면 null  
- **INSERT 컬럼:** banner_type, category_id, **group_key**, title, image_url, (mobile_image_url), link_url, display_order, is_active(0/1), start_date, end_date  
- **하위호환:** `hasMobileImageColumn()` 이 `INFORMATION_SCHEMA` 로 `banners.mobile_image_url` 존재 여부를 1회 확인·캐시하며, 없으면 해당 컬럼을 뺀 INSERT 를 실행합니다  
- **성공 시:** `res.redirect('/admin/banners?type=' + redirectType)`

---

## 7. 배너 수정 (GET/POST /admin/banners/edit/:id)

- **GET:** 해당 id 배너 1건 조회(없으면 `/admin/banners` 리다이렉트). `group_key` 가 `menu:` 로 시작하면 폼에서 **MENU 타입**으로 다루고 `currentMenuKey` 를 채웁니다. 카테고리 목록과 함께 동일 폼 렌더링  
- **POST:** URL `id`, body 의 title·link_url·display_order·is_active·banner_type·category_id·menu_target·start_date·end_date  
  - 이미지: 새 파일 있으면 교체, 없으면 `existing_image` / `existing_mobile_image` 유지  
  - `resolveBannerTarget(..., req.body.existing_group_key)` 로 기존 `group_key` 보존  
- **성공 시:** `res.redirect('/admin/banners?type=' + redirectType)`

---

## 8. 배너 삭제 (POST /admin/banners/delete)

- **파라미터:** `id` (body)  
- **동작:** `DELETE FROM banners WHERE id = ?` 후 `/admin/banners`(type 없이) 리다이렉트  
- **뷰:** 삭제 전 `confirm('삭제하시겠습니까?')` 실행

---

## 9. 메인 슬라이더 관리 (hero_slide)

`/admin/banners/hero-slides` — 홈 히어로의 **상품 쇼케이스** 변형에 쓰이는 슬라이드입니다.

- **몰 스코프:** 모든 조회/저장/삭제가 `mall_id = req.adminMallId`(없으면 1) 조건으로 동작합니다.
- **슬롯:** `MAIN`(중앙 슬라이더) / `FEATURE`(우측 추천 카드). 목록은 `mainSlides` / `featureSlides` 로 나눠 전달.
- **상품 연결:** `product_id` 로 상품과 연결하며, `label` / `headline` / `image_url` / `link_url` 을 비우면 **상품 정보로 폴백**합니다(라벨→공급사명, 헤드라인→상품명, 이미지→대표이미지, 링크→상품 상세). 가격·할인율·재고는 항상 상품에서 가져옵니다.
- **프론트 연결:** `mainController.buildHomeContext()` 가 `hero_variant`(사이트 설정 또는 `?hero=` 쿼리)를 보고 결정합니다.
  - `full_banner` → `banners` 의 MAIN 배너 사용
  - `product_showcase` → `hero_slide` 를 `mall_id` 로 조회, `slot=MAIN` 슬라이드 + `slot=FEATURE` 첫 1건 사용

### 9.1 슬라이드 폼 필드

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| slot | radio | - | MAIN / FEATURE (기본 MAIN, 허용값 외에는 MAIN 으로 강제) |
| product_id | number | - | 연결 상품 ID (FK `products`, `ON DELETE SET NULL`) |
| label | text | - | 라벨 태그 (비우면 상품 공급사명) |
| headline | text | - | 헤드라인 (비우면 상품명) |
| slide_image | file | - | 프로모션 이미지 (비우면 상품 대표이미지). 중앙 슬라이더는 원형 노출이라 1:1 권장 |
| existing_image | hidden | - | 수정 시 기존 이미지 유지 |
| link_url | text | - | 커스텀 링크 (비우면 상품 상세) |
| sort_order | number | - | 노출 순서, 기본 0 |
| is_active | checkbox | - | 노출 활성화 (1/0), 신규는 기본 체크 |

- 모든 처리 후 `/admin/banners/hero-slides` 로 리다이렉트합니다.

---

## 10. DB 스키마

### 10.1 banners

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 배너 ID |
| banner_type | ENUM('MAIN','CATEGORY','POPUP','BRAND') DEFAULT 'MAIN' | **MENU 값은 없음** (3.1 참고) |
| group_key | VARCHAR(50) NULL | 배너 그룹 키. `menu:{key}` = 메뉴별 배너, 그 외는 SDUI `promotion_banner` 섹션 데이터소스 |
| category_id | INT FK NULL | CATEGORY/BRAND 타입일 때 대상 (`ON DELETE SET NULL`) |
| title | VARCHAR(100) NULL | 제목 |
| image_url | VARCHAR(255) NOT NULL | 이미지 경로 |
| mobile_image_url | VARCHAR(255) NULL | 모바일용 이미지 경로 |
| link_url | VARCHAR(255) NULL | 링크 URL |
| display_order | INT DEFAULT 0 | 노출 순서 |
| is_active | TINYINT(1) DEFAULT 1 | 활성화 |
| start_date, end_date | DATE NULL | 게시 기간 |
| created_at | TIMESTAMP | 생성일시 |

- 인덱스: `idx_banners_group_key (group_key, display_order)`, `fk_banners_category (category_id)`
- **`mall_id` 컬럼 없음** — 전 몰 공용

### 10.2 hero_slide

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 슬라이드 ID |
| mall_id | BIGINT DEFAULT 1 | 몰 스코프 |
| slot | ENUM('MAIN','FEATURE') DEFAULT 'MAIN' | MAIN=중앙 슬라이더, FEATURE=우측 카드 |
| product_id | INT FK NULL | 연결 상품 (`products`, ON DELETE SET NULL) |
| label | VARCHAR(50) NULL | 수동 라벨 |
| headline | VARCHAR(200) NULL | 커스텀 헤드라인 (없으면 상품명) |
| image_url | VARCHAR(255) NULL | 프로모션 이미지 (없으면 상품 대표이미지) |
| link_url | VARCHAR(500) NULL | 커스텀 링크 (없으면 상품 상세) |
| sort_order | INT DEFAULT 0 | 노출 순서 |
| is_active | TINYINT(1) DEFAULT 1 | 활성화 |
| created_at / updated_at | TIMESTAMP | 생성/수정 일시 |

- 인덱스: `idx_hero_mall_slot (mall_id, slot, sort_order)`

---

## 11. 관련 문서

- 페이지 빌더(SDUI) — `group_key` 로 배너를 소비하는 `promotion_banner` 섹션: [page_builder.md](./page_builder.md)

---

*Last Updated: 2026-07-11*
