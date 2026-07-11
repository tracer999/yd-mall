# 상품 관리 (Products)

## 1. 개요

- **Base URL:** `/admin/products`  
- **관련 테이블:** `products` (메인), `categories` (조인/선택 — `category_id`=NORMAL, `brand_category_id`=BRAND, 테마=THEME), `product_themes` (테마 다대다), `product_images` (서브 이미지), `product_recommendations` (추천 상품)  
- **컨트롤러:** `controllers/admin/productController.js`  
- **뷰:** `views/admin/products/list.ejs`, `form.ejs`, `detail.ejs`, `seo_preview.ejs`  
- **이미지 업로드:** `middleware/upload.js` (Multer), 필드: main_image, thumbnail_image, sub_images(최대 10), video_file, 저장 경로 `public/uploads/products/`  
- **몰 스코프:** `/admin` 마운트 시 `middleware/adminMallContext.js` 가 `req.adminMallId`(관리자가 편집 중인 몰)를 실어준다. 목록·카테고리/브랜드 선택지·신규 상품의 `mall_id` 가 모두 이 값으로 스코프된다.

> **참고:** `productController.js` 에는 `exports.getList` 가 두 번 정의되어 있고(:332, :745), 나중 정의(:745)가 실제로 쓰인다. 이 문서는 :745 기준이다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/products` | getList | 상품 목록 (검색·필터·페이지네이션) |
| GET | `/admin/products/add` | getAdd | 상품 등록 폼 |
| POST | `/admin/products/add` | postAdd | 상품 등록 처리 (multipart) |
| GET | `/admin/products/detail/:id` | getDetail | 상품 상세 조회 |
| GET | `/admin/products/edit/:id` | getEdit | 상품 수정 폼 |
| POST | `/admin/products/edit` | postEdit | 상품 수정 처리 (multipart) |
| POST | `/admin/products/delete` | postDelete | 상품 삭제 |
| POST | `/admin/products/product-image-upload` | postUploadImage | 이미지 업로드 (TinyMCE/드래그용, JSON 응답) |
| POST | `/admin/products/generate-ai-recommendation` | generateAIRecommendation | AI 추천 문구 생성 (OpenAI, JSON 응답) |
| POST | `/admin/products/status/update` | postUpdateStatus | 판매 상태 일괄 변경 |
| POST | `/admin/products/visibility` | postVisibility | 노출 여부 변경 (JSON) |
| POST | `/admin/products/shopify-sync` | postShopifySync | Shopify 일괄 동기화 (JSON, 현재 비활성) |
| GET | `/admin/products/recommendations/search` | getRecommendationSearch | 추천 상품 검색 (JSON) |
| GET | `/admin/products/recommendations/:productId` | getRecommendations | 추천 상품 목록 (JSON) |
| POST | `/admin/products/recommendations/add` | postAddRecommendation | 추천 상품 추가 (JSON) |
| POST | `/admin/products/recommendations/remove` | postRemoveRecommendation | 추천 상품 제거 (JSON) |
| POST | `/admin/products/recommendations/reorder` | postReorderRecommendations | 추천 상품 순서 변경 (JSON) |
| GET | `/admin/products/seo/view/:id` | getProductSEOView | 상품 SEO 미리보기 (팝업) |
| POST | `/admin/products/seo/generate-meta` | generateMetaDescription | AI 메타 디스크립션 생성 (JSON) |
| POST | `/admin/products/seo/save-meta` | saveMetaDescription | 메타 디스크립션 저장 (JSON) |

---

## 3. 목록 조회 (GET /admin/products)

- **쿼리:** `products` LEFT JOIN `categories`(category_id) + LEFT JOIN `product_themes` → `categories`(테마명 GROUP_CONCAT), `WHERE p.mall_id = ?` (편집 중인 몰), `GROUP BY p.id`, `ORDER BY p.created_at DESC`, `LIMIT ? OFFSET ?`
- **표시:** 썸네일(main_image), 상품명/공급사/카테고리·테마·뱃지, 재고(stock), 정가(original_price), 판매가(price + 할인율), 판매 상태(status), 노출관리(visibility 셀렉트), 관리(수정/삭제)
- **뷰 전달:** `products`, `keyword`, `filters`, `filterCategories`, `filterBrands`, `selectedCategory`, `selectedBrand`, `pagination`, `title: '상품 관리'`

### 3.1 검색·필터 (쿼리스트링)

| 파라미터 | 허용값 | 동작 |
|----------|--------|------|
| `keyword` | 문자열 | `p.name` / `p.provider` / `c.name` LIKE 검색 |
| `stock` | `in` / `out` | `in` → `p.stock > 0`, `out` → `p.stock IS NULL OR p.stock = 0` |
| `status` | `ON` `OFF` `SOLD_OUT` `COMING_SOON` `RESTOCK` | `p.status = ?` |
| `visibility` | `PUBLIC` `HIDDEN` `MEMBER_ONLY` | `p.visibility = ?` |
| `categoryId` | 숫자 | 해당 카테고리 **서브트리 전체**(재귀 CTE)의 `category_id IN (...)`. 다른 몰 카테고리를 넘기면 서브트리가 비어 결과 0건(크로스몰 차단) |
| `brandId` | 숫자 | `p.brand_category_id = ?` |

- 허용값 화이트리스트를 통과한 값만 파라미터 바인딩으로 넘긴다.
- 카테고리·브랜드는 셀렉트가 아니라 모달 피커(hidden input `categoryId`/`brandId`)로 고른다.

### 3.2 페이지네이션 / N개씩 보기

- `perPage`: `10 | 20 | 30 | 50` 중 하나(기본 20). 그 외 값은 20으로 폴백  
- `page`: 1 이상(기본 1), `offset = (page - 1) * perPage`  
- `pagination = { page, perPage, total, totalPages }` 를 뷰가 받아 하단 페이지 네비를 그린다

### 3.3 일괄 작업

- 체크박스 `product_ids[]` 선택 후 상단 버튼으로 판매중/품절/판매중지 일괄 처리 (§10)
- Shopify 동기화 버튼은 `shopifyEnabled` 일 때만 노출 (§14)

---

## 4. 상품 등록/수정 폼 (GET /admin/products/add, GET /admin/products/edit/:id)

- **등록:** 편집 중인 몰의 카테고리(NORMAL)·테마(THEME)·브랜드(BRAND) 목록을 조회하고 `product: null` 로 폼 렌더링  
- **수정:** `products`에서 id 조회, 없으면 `/admin/products`로 리다이렉트. 카테고리/테마/브랜드 + `product_images`(서브 이미지) + `product_themes`(선택된 테마 id) 를 붙여 폼 렌더링  
- **뷰 전달:** `productCategories`, `themeCategories`, `brands`, `product`, `productUrlBase`(도메인 + `/products/`)

### 4.1 폼 필드 (form.ejs 기준)

| name | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | hidden | 수정 시 | 상품 ID |
| old_image | hidden | 수정 시 | 기존 main_image 경로 (이미지 변경 안 할 때 유지) |
| old_thumbnail | hidden | 수정 시 | 기존 thumbnail_image 경로 |
| old_video | hidden | 수정 시 | 기존 video_url |
| name | text | O | 상품명 |
| product_code | text | - | 상품코드 (관리자 입력) |
| slug | text | - | SEO URL 슬러그 (비우면 상품명으로 자동 생성, 중복 시 `-1`, `-2` … 부여) |
| category_id | select | - | 상품 카테고리 (`categories.type = 'NORMAL'`) |
| theme_categories | checkbox (다중) | - | 테마 카테고리 (`type = 'THEME'`) → `product_themes` 다대다 |
| brand_category_id | select | - | 브랜드 (`type = 'BRAND'`) |
| provider | text | - | 공급사. **`brand_category_id` 가 있으면 그 브랜드명이 우선 저장된다** |
| status | select | - | ON(판매중) / OFF(판매중지) / SOLD_OUT(품절) / COMING_SOON(출시예정) / RESTOCK(재입고예정) |
| visibility | select | - | PUBLIC(전체공개) / HIDDEN(숨김) / MEMBER_ONLY(회원전용) |
| stock | number | - | 재고 수량 |
| distribution_badge | select | - | ONLINE_ONLY / OFFLINE_ONLY (그 외 값은 null) |
| product_badge | checkbox (다중) | - | BEST / NEW / RECOMMEND / DEADLINE_SALE / GREENHUB_SPECIAL (SET, CSV 로 저장) |
| badge_expire_date | date | - | 뱃지 만료일 |
| recommendation_ids | hidden (다중) | - | 등록 시 함께 연결할 추천 상품 (최대 8) |
| price | text | O | 판매가 |
| original_price | text | - | 정가 (소비자가) |
| discount_rate | number | - | 할인율 (%) |
| purchase_price | text | - | 매입가 (원가) |
| main_image | file | - | 대표 이미지 |
| thumbnail_image | file | - | 썸네일 이미지 |
| sub_images | file (multiple) | - | 서브 이미지 (최대 10장) → `product_images` |
| existing_image_ids[] / delete_image_ids | hidden/checkbox | - | 기존 서브 이미지 유지/삭제 지정 |
| video_type | select | - | FILE / YOUTUBE |
| video_file | file | - | 동영상 파일 (video_type = FILE) |
| video_url | text | - | 유튜브 URL (video_type = YOUTUBE) |
| short_description | textarea (TinyMCE) | - | 상품 기본 설명 (3~4줄 요약) |
| description | textarea (TinyMCE) | - | 상품 상세 설명 (HTML) |
| is_ai_recommendation | checkbox | - | AI 추천 사용 여부 |
| ai_recommendation_content | textarea | - | AI 추천 문구 |

- **필수:** HTML `required` 가 걸린 필드는 `name`, `price` 두 개뿐이다. 서버측 추가 검증은 없다(`main_image` 도 null 허용).
- **가격:** 뷰에서 정가·할인율 입력 시 판매가 자동 계산, 천단위 콤마 포맷팅  
- **상세 설명:** TinyMCE (CDN, `process.env.TINYMCE_KEY`) 사용, `textarea#short_description` 과 `textarea#description` 두 곳에 초기화  
- **TinyMCE 이미지 업로드:** `images_upload_handler` 가 `POST /admin/products/product-image-upload` 로 보내고 JSON `{ location: '/uploads/products/...' }` 를 받는다  
- **업로드 용량 제한:** `MAX_UPLOAD_FILE_MB` (미설정 시 기본 **20MB**) — `middleware/upload.js`

---

## 5. 상품 등록 처리 (POST /admin/products/add)

- **enctype:** `multipart/form-data`, Multer `upload.fields([main_image, thumbnail_image, sub_images(10), video_file])`  
- **저장 경로:** 이미지 있으면 `/uploads/products/` + 파일명, 없으면 null  
- **slug:** `generateUniqueSlugFromName()` 로 유니크 slug 생성 (`products.slug` 는 UNIQUE)  
- **provider:** `brand_category_id` 로 `categories`(type=BRAND) 이름을 조회해 우선 사용, 없으면 입력한 provider  
- **INSERT 컬럼:** `mall_id`(= `req.adminMallId`), category_id, brand_category_id, name, product_code, provider, description, short_description, main_image, thumbnail_image, video_type, video_url, purchase_price, original_price, price, discount_rate, stock, status, is_ai_recommendation, ai_recommendation_content, slug, distribution_badge, product_badge, badge_expire_date, visibility  
- **부수 INSERT:**
  - `theme_categories` → `product_themes (product_id, category_id)`
  - `sub_images` → `product_images (product_id, image_url, display_order)`
  - `recommendation_ids` → `product_recommendations` (양방향, 각 상품당 최대 8)
- **Shopify:** `syncProductById(productId)` 백그라운드 호출 (비활성 시 가드가 스킵)  
- **성공 시:** `res.redirect('/admin/products')`
- **예외:** 500 응답

---

## 6. 상품 수정 처리 (POST /admin/products/edit)

- **파라미터:** id, old_image, old_thumbnail, old_video, 그 외 폼 필드 동일  
- **이미지:** 새 파일 있으면 `/uploads/products/` + 새 파일명으로 교체, 없으면 `old_*` 값 유지  
- **UPDATE:** 등록과 동일 컬럼(단 `mall_id` 는 갱신하지 않음) + WHERE id  
- **테마:** `product_themes` 를 전부 DELETE 후 재INSERT  
- **서브 이미지:** 새 파일은 기존 개수 뒤로 append, `delete_image_ids` 는 `product_images` 에서 DELETE  
- **Shopify:** `syncProductById(id)` 백그라운드 호출  
- **성공 시:** `/admin/products`로 리다이렉트  

**참고:** 기존 이미지 파일 삭제 로직은 없음 (디스크 정리는 별도 정책 필요).

---

## 7. 상품 상세 조회 (GET /admin/products/detail/:id)

- **동작:** products JOIN categories로 상품 1건 조회, 없으면 `/admin/products` 리다이렉트  
- **추가 조회:** `product_images`(서브 이미지), `product_themes`(테마명), 해당 상품의 판매이력(`order_items` JOIN `orders`, 상태 PAID/PREPARING/SHIPPED/DELIVERED)  
- **뷰 전달:** `product`(images·themes 포함), `productUrl`, `salesHistory`, `title: '상품 상세 정보'`

---

## 8. 이미지 업로드 API (POST /admin/products/product-image-upload)

- **용도:** TinyMCE 또는 드래그 업로드 시 상품 이미지 업로드  
- **enctype:** multipart, 필드 `file`  
- **응답:** `{ location: '/uploads/products/파일명' }` (성공), 400 (실패)

---

## 9. AI 추천 문구 생성 (POST /admin/products/generate-ai-recommendation)

- **파라미터:** name, category_name, provider (body)  
- **동작:** OpenAI API(`OPENAI_MODEL`, 기본 `gpt-5.2`)로 상품 추천 문구 생성  
- **응답:** `{ content: string }` (성공), `OPENAI_API_KEY` 미설정 시 503, 그 외 500

---

## 10. 판매 상태 일괄 변경 (POST /admin/products/status/update)

- **파라미터:** product_ids (배열 또는 단일), status (ON/OFF/SOLD_OUT/COMING_SOON/RESTOCK)  
- **동작:** `UPDATE products SET status = ? WHERE id IN (?)`  
- **성공 시:** `/admin/products` 리다이렉트

---

## 11. 노출 여부 변경 (POST /admin/products/visibility)

- **요청:** JSON `{ productId, visibility }`  
- **동작:** `visibility` 를 PUBLIC/HIDDEN/MEMBER_ONLY 로 정규화(그 외는 PUBLIC) 후 `UPDATE products SET visibility = ?`  
- **응답:** `{ success: true, visibility }` — 목록의 노출관리 셀렉트가 change 시 호출한다

---

## 12. 추천 상품 관리 API

| 메서드 | URL | 요청 | 동작 |
|--------|-----|------|------|
| GET | `/admin/products/recommendations/search` | `?q=`, `?excludeId=` | 상품명·상품코드 LIKE 검색, 최대 10건 |
| GET | `/admin/products/recommendations/:productId` | - | `product_recommendations` JOIN products, display_order 순 |
| POST | `/admin/products/recommendations/add` | JSON `{ productId, relatedId }` | **양방향** 등록. 각 방향 최대 8개 |
| POST | `/admin/products/recommendations/remove` | JSON `{ productId, relatedId }` | 양방향 삭제 |
| POST | `/admin/products/recommendations/reorder` | JSON `{ productId, order: [relatedId…] }` | display_order 재부여 |

---

## 13. 상품 SEO (미리보기 / 메타 디스크립션)

- **GET `/admin/products/seo/view/:id`** — 상품 상세 페이지와 동일한 SEO 메타/OG/JSON-LD 를 구성해 렌더. 뷰: `admin/products/seo_preview.ejs` (layout: false). 상세 화면에서 팝업으로 연다.
  - 메타 디스크립션 우선순위: `products.meta_description` > `short_description` > 자동 생성(공급사·상품명·카테고리·가격·설명 조합, 160자 컷). `seoDescriptionSource` 로 어느 소스인지 표시한다.
  - `availability`: status=ON & stock>0 → InStock, status=COMING_SOON → PreOrder, 그 외 OutOfStock
- **POST `/admin/products/seo/generate-meta`** — body `{ product_id }`. OpenAI 로 150자 이내 메타 디스크립션 생성 → `{ content }`. 키 미설정 시 503.
- **POST `/admin/products/seo/save-meta`** — body `{ product_id, meta_description }` → `UPDATE products SET meta_description = ?`

---

## 14. Shopify 일괄 동기화 (POST /admin/products/shopify-sync)

- **요청:** JSON `{ productIds: [1, 2, 3] }`  
- **가드:** `isShopifySyncEnabled()` 가 false 면 **409** `{ success: false, disabled: true }`. 현재 `system_settings.shopify_sync_enabled = 0` 이라 UI 버튼도 숨겨진다.  
- **응답:** `{ success, message, created, updated, failed }`

---

## 15. 상품 삭제 (POST /admin/products/delete)

- **파라미터:** `id` (body)  
- **동작:** `deleteProductById(id)` 로 Shopify 매핑 삭제 시도(DB 삭제 **전**) → `DELETE FROM products WHERE id = ?` → `/admin/products`로 리다이렉트  
- **참고:** 연관된 order_items 등은 FK 정책에 따름 (product_id SET NULL 등)

---

## 16. 상품 그룹 (연계)

페이지 빌더 섹션의 데이터 소스가 되는 **상품 그룹**은 별도 화면(`/admin/product-groups`)에서 관리합니다. 상세는 [page_builder.md](./page_builder.md) 참고.

---

*Last Updated: 2026-07-11*
