# 기획전 관리 (Exhibitions)

## 1. 개요

기획전은 **시즌·브랜드·테마별로 상품을 전시하는 랜딩**입니다. 판매 조건을 바꾸지 않고(가격·수량 제한이 없다) 이미 등록된 상품을 큐레이션해 보여주는 것이 전부입니다. 같은 "캠페인" 계열의 다른 두 모듈과는 스키마부터 갈립니다.

| | 기획전 (`exhibition`) | 이벤트&혜택 (`event`) | 공동구매 (`group_buy`) |
|---|---|---|---|
| 목적 | 상품 전시 랜딩 | 응모 등 참여·혜택 | 조건부 판매 캠페인 |
| 가격 컬럼 | 없음 (상품가 그대로) | 없음 | `group_buy_product.group_buy_price` (결제가 재계산) |
| 참여/주문 기록 | 없음 | `event_participant` | `group_buy_participation` |
| 기간 | `end_at` NULL 허용(무기한) | `end_at` NULL 허용(상시) | `end_at` **NOT NULL** (기간이 본질) |
| 하위 구조 | `exhibition_section`(내부 탭) + `exhibition_product` | `event_coupon`(미연동) | `group_buy_product` |

- 코드 근거: `controllers/admin/exhibitionController.js:120` (subtitle "시즌·브랜드·테마별 상품 전시 랜딩을 만들고 관리합니다."), `services/exhibition/exhibitionService.js:3-23`
- **Base URL:** `/admin/exhibitions` (`routes/admin.js:46`, `requireMenuAccess('/admin/exhibitions')`)
- **관련 테이블:** `exhibition`, `exhibition_section`, `exhibition_product`, (참조) `products`, `custom_menu`
- **컨트롤러:** `controllers/admin/exhibitionController.js`
- **서비스:** `services/exhibition/exhibitionService.js` (관리자·고객 공용 읽기 경로 + enum 정의)
- **뷰:** `views/admin/exhibitions/list.ejs`, `views/admin/exhibitions/edit.ejs` (등록·수정 공용)
- **이미지 업로드:** `middleware/upload.js` (Multer), 필드 4종 `list_thumbnail` / `pc_hero_image` / `mobile_hero_image` / `og_image` (`routes/admin/exhibitions.js:22-27`). 저장 경로 `public/uploads/exhibitions/` (`middleware/upload.js:17-22`, `47-48`), 이미지 MIME 만 허용, 상한 `MAX_UPLOAD_FILE_MB`(기본 20MB)
- **권한:** `admin_menus.visible_roles = super_admin,admin,content_admin` (DB, id=44)

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/exhibitions` | getList | 목록 (검색 `q`, 상태 필터 `status`) |
| GET | `/admin/exhibitions/add` | getAdd | 등록 폼 |
| POST | `/admin/exhibitions/add` | postAdd | 등록 처리 (multipart) |
| GET | `/admin/exhibitions/product-search` | getProductSearch | 상품 검색 모달용 AJAX (JSON) |
| GET | `/admin/exhibitions/:id/edit` | getEdit | 수정 폼 (기본정보 + 섹션 + 상품) |
| POST | `/admin/exhibitions/:id/edit` | postEdit | 기본정보 수정 (multipart) |
| POST | `/admin/exhibitions/:id/delete` | postDelete | 삭제 |
| POST | `/admin/exhibitions/:id/sections` | postSaveSections | 섹션(내부 탭) 일괄 저장 |
| POST | `/admin/exhibitions/:id/products` | postSaveProducts | 상품 매핑 일괄 저장 |
| POST | `/admin/exhibitions/:id/products/add` | postAddProduct | 상품 담기 |
| POST | `/admin/exhibitions/:id/products/:mappingId/delete` | postRemoveProduct | 상품 빼기 |

**라우팅 주의** (`routes/admin/exhibitions.js:10-19`): Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않습니다. 정적 세그먼트(`/add`, `/product-search`)를 `/:id` 보다 **먼저** 선언하고, 숫자 검증은 `requireNumericId` 미들웨어가 담당합니다(비숫자면 404).

응답 방식은 저장소 관리자 표준(폼 POST → `res.redirect`)입니다. JSON 을 돌려주는 것은 상품 검색 하나뿐입니다(`controllers/admin/exhibitionController.js:10-11`). 결과 메시지는 쿼리스트링(`?saved=1`, `?error=...`)으로 전달합니다(`redirectWith`, 32-33행).

---

## 3. 목록 (GET /admin/exhibitions)

- 쿼리: `exhibition` + 서브셀렉트 2개 — 담긴 상품 수(`exhibition_product` COUNT), 이 기획전을 연결한 커스텀 메뉴 수(`custom_menu.link_type='EXHIBITION' AND link_target = e.id`). `ORDER BY e.id DESC` (`exhibitionController.js:106-114`)
- 필터: `q`(title·slug LIKE), `status`(STATUSES 화이트리스트) — 99-105행
- 몰 스코프: `e.mall_id = req.adminMallId`(없으면 1)
- 각 행은 `svc.decorate()` 로 파생 필드(`phase`, `phaseLabel`, `detailPath`, `purchaseBlocked`)를 붙여 렌더 (`exhibitionService.js:86-96`)

---

## 4. 등록·수정 폼 (GET /admin/exhibitions/add, /:id/edit)

등록·수정 모두 `views/admin/exhibitions/edit.ejs` 하나를 씁니다(`renderForm`, `exhibitionController.js:137-177`). 등록 화면에서는 섹션·상품 탭이 비어 있고, 저장 후 `/:id/edit?saved=1` 로 이동한 뒤에야 섹션·상품을 편집할 수 있습니다(`postAdd`, 222행).

### 4.1 기본정보 필드 (`buildBasicFields`, 68-90행 / `views/admin/exhibitions/edit.ejs`)

| name | 저장 컬럼 | 비고 |
|------|-----------|------|
| title | `title` | 필수, 200자 절단 |
| slug | `slug` | 비우면 title 에서 생성. `svc.ensureUniqueSlug` 가 `(mall_id, slug)` 유니크 보장 |
| summary | `summary` | 500자 절단 |
| description | `description` | HTML. 저장 시 `sanitize()` |
| exhibition_type | `exhibition_type` | THEME/BRAND/SEASON/CATEGORY/COLLAB/BROADCAST |
| status | `status` | DRAFT/PUBLISHED/HIDDEN |
| start_at | `start_at` | 필수 (`datetime-local` → MySQL datetime) |
| end_at | `end_at` | 비우면 무기한. start_at 보다 빠르면 거부 |
| list_visible / search_visible / share_enabled | 동명 컬럼 | 체크박스 → 0/1 |
| detail_template_type | `detail_template_type` | TAB_SHOP/STORY/CATEGORY_SHOP/BRAND_SHOP |
| ended_access_policy | `ended_access_policy` | ALLOW/NOTICE/BLOCK |
| ended_purchase_policy | `ended_purchase_policy` | ALLOW/BLOCK |
| hide_sold_out | `display_config_json.hide_sold_out` | JSON 안에 저장 |
| notice | `display_config_json.notice` | JSON 안에 저장, `sanitize()` |
| `{field}` / `{field}_clear` | `*_url` 4종 | 파일 업로드 / 삭제 체크 (`resolveImage`, 54-59행) |

- 이미지 경로는 `file.path` 에서 `public` 접두어를 제거해 `/uploads/...` 로 저장 (56행)
- `*_clear` 체크 시 NULL, 새 파일 없으면 기존 값 유지

### 4.2 섹션(내부 탭) — POST /:id/sections

- 폼 배열 `sections[i][id|section_name|section_code|section_type|is_tab|is_active|html|_delete]`
- 트랜잭션으로 일괄 처리 (`postSaveSections`, 315-380행). `id` 없으면 INSERT, `_delete` 켜지면 DELETE, 빈 `section_name` 행은 무시
- `section_code` 는 `normalizeSlug` 로 정규화. 빈 값이면 `section-{i+1}`, `all` 이면 `all-section` 으로 바꿈(전체 탭 예약어 충돌 방지, 347행). 같은 요청 안의 중복 코드도 접미사로 회피(349행)
- `sort_order` 는 폼 순서(i+1)로 재부여
- `section_type='HTML'` 이면 `display_config_json.html` 에 sanitize 한 HTML 저장(353행)

### 4.3 상품 매핑

- **담기(POST /:id/products/add):** `product_id` + `section_id`(빈 값 = 전체 탭). 다른 몰 상품은 거부(412-413행). `sort_order` 는 기존 MAX+1
- **일괄 저장(POST /:id/products):** `products[i][mapping_id|section_id|sort_order|is_fixed|display_badge|display_comment|visible|purchase_enabled]` 를 트랜잭션으로 UPDATE (442-497행)
- **빼기(POST /:id/products/:mappingId/delete):** `exhibition_product` 행 삭제
- **상품 검색(GET /product-search?q=):** `products` LIKE 검색 20건, `{ products: [...] }` JSON (519-538행)

---

## 5. DB 테이블

### 5.1 `exhibition` (기획전)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint PK | |
| mall_id | bigint | 몰 ID (기본 1) |
| title / slug / summary / description | varchar/text | `uk_exhibition_mall_slug (mall_id, slug)` 유니크 |
| exhibition_type | varchar(50) | BRAND/SEASON/CATEGORY/COLLAB/BROADCAST/**THEME**(기본) |
| list_thumbnail_url / pc_hero_image_url / mobile_hero_image_url / og_image_url | varchar(500) | 이미지 4종 |
| status | varchar(30) | **DRAFT** / PUBLISHED / HIDDEN |
| start_at | datetime NOT NULL | 노출 시작 |
| end_at | datetime NULL | NULL = 무기한 |
| list_visible / search_visible / share_enabled | tinyint(1) | 기본 1 |
| detail_template_type | varchar(50) | **TAB_SHOP**(기본) / STORY / CATEGORY_SHOP / BRAND_SHOP |
| display_config_json | json | `hide_sold_out`, `notice` |
| ended_access_policy | varchar(30) | **ALLOW** / BLOCK / NOTICE |
| ended_purchase_policy | varchar(30) | **ALLOW** / BLOCK |
| view_count | int | 상세 조회수 |

### 5.2 `exhibition_section` (내부 탭)

`id`, `exhibition_id`(FK CASCADE), `section_name`, `section_code`, `section_type`(PRODUCT_GRID/PRODUCT_CAROUSEL/HTML), `sort_order`, `is_tab`, `is_active`, `display_config_json`
유니크: `uk_exh_section_code (exhibition_id, section_code)`

### 5.3 `exhibition_product` (상품 전시 매핑)

`id`, `exhibition_id`(FK CASCADE), `section_id`(FK CASCADE, NULL=섹션 미배정=전체 탭에만 노출), `product_id`(FK CASCADE, **int** — products.id 가 int), `sort_order`, `is_fixed`, `display_badge`(50), `display_comment`(200), `visible`, `purchase_enabled`
유니크: `uk_exh_product (exhibition_id, section_id, product_id)`

### 5.4 상태 모델

`status` 는 "발행했는가"만 담고, **예정/진행중/종료(phase)는 컬럼이 아니라 `start_at`·`end_at` 에서 파생**합니다(`exhibitionService.js:77-83`). 기간과 상태를 둘 다 저장하면 반드시 어긋납니다.

| phase | 조건 | 라벨 |
|-------|------|------|
| UPCOMING | now < start_at | 예정 |
| ONGOING | 그 외 | 진행중 |
| ENDED | end_at 존재 && now > end_at | 종료 |

---

## 6. 고객 화면 연계

- 라우트: [`routes/exhibition.js`](../../../routes/exhibition.js) — `GET /exhibition`(목록), `GET /exhibition/view/:id`(→ slug 301), `GET /exhibition/:slug`(상세)
- 컨트롤러: [`controllers/exhibitionController.js`](../../../controllers/exhibitionController.js)
- URL 은 **단수 `/exhibition`** 고정입니다. `feature_menu.EXHIBITION.default_path` 가 `/exhibition` 이고 운영자가 바꿀 수 없어서, 복수형으로 만들면 GNB 메뉴가 404 됩니다(`routes/exhibition.js:6-13`).
- 고객 노출 조건 (`exhibitionService.js:153-177`)
  - 목록: `status='PUBLISHED' AND list_visible=1`, 그리고 "종료 + `ended_access_policy='BLOCK'`" 은 목록에서도 제외
  - 상세: `status='PUBLISHED'`. 종료 + `ended_access_policy='BLOCK'` 이면 404 (`exhibitionController.js:109`)
  - 상품: `ep.visible=1 AND p.visibility='PUBLIC' AND p.status <> 'OFF'`, `hide_sold_out` 이면 SOLD_OUT·재고 0 제외 (224-238행)
- **0건 폴백:** 발행된 기획전이 0건이면 빈 목록 대신 `user/coming_soon` (준비중 랜딩)을 렌더합니다(`controllers/exhibitionController.js:60`). `feature_menu.EXHIBITION.module_ready=1` 이라 GNB 에 메뉴가 이미 떠 있고 개발·운영 DB 가 같기 때문입니다.
- 탭은 `?tab={section_code}` 로 서버에서 고릅니다(JS 없이 동작). `all` 은 예약어(전체).
- `search_visible=0` 이면 상세 SEO 가 `noindex,nofollow` (`exhibitionController.js:175`)

---

## 7. 주의사항

- **몰 스코프.** `exhibition_section` / `exhibition_product` 에는 `mall_id` 컬럼이 없습니다. 하위 테이블을 건드리기 전에 반드시 `findOwned(mallId, id)` 로 부모를 확인해야 합니다. 안 그러면 id 만 갈아끼운 요청으로 다른 몰의 기획전을 편집할 수 있습니다(`exhibitionController.js:13-16`).
- **섹션 삭제 = 상품 매핑 삭제.** `exhibition_product.section_id` 가 `ON DELETE CASCADE` 라, 섹션을 지우면 그 섹션에 배정된 상품 매핑도 함께 사라집니다(`exhibitionController.js:310-313`).
- **NULL 섹션 중복은 DB 가 못 막는다.** `uk_exh_product (exhibition_id, section_id, product_id)` 는 `section_id` 가 NULL 이면 걸리지 않습니다(NULL ≠ NULL). 섹션 미배정 중복은 애플리케이션이 SELECT 로 막습니다(`postAddProduct`, 417-422행).
- **커스텀 메뉴가 걸린 기획전은 삭제 불가.** `custom_menu.link_target` 에는 FK 가 없어서, 지우면 메뉴가 죽은 링크를 든 채 남습니다. `postDelete` 가 연결 개수를 세어 차단합니다(286-293행).
- **HTML 이중 새니타이즈.** `description`·`notice`·섹션 HTML 은 저장 시(`buildBasicFields`, `postSaveSections`)와 렌더 시(`exhibitionController.js:161-162, 140`) 양쪽에서 `services/display/htmlSanitizer` 를 통과합니다.
- `detail_template_type` 은 1차에서 **TAB_SHOP 만 전용 렌더**를 갖습니다. 나머지 3종은 라벨에 "(2차)" 가 붙어 있고 TAB_SHOP 으로 폴백합니다(`exhibitionService.js:40-46`).

---

*Last Updated: 2026-07-11*
