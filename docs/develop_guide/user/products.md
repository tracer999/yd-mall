# 상품

## 1. 개요

- **컨트롤러:** `controllers/productController.js`
- **라우트:** `routes/products.js`
- **뷰:** `views/user/products/list.ejs`, `views/user/products/detail.ejs`

상품 목록(전체/카테고리별/브랜드별), 상세(ID·slug), 좋아요 토글을 제공합니다.

> **가격은 어디서 오는가.** 상품 가격은 목록·상세·추천·검색 등 **표시 경로 전반에서 `services/deal/dealService.applyDeals()` 를 거칩니다**. 즉 화면에 보이는 가격은 `products.price` 가 아니라 **활성 쇼핑특가가 반영된 가격**일 수 있습니다. 특가는 표시뿐 아니라 **실제 결제 금액**에도 반영됩니다 → [promotions.md](./promotions.md) §쇼핑특가.

---

## 1.1 신상품 판정 — 단일 진실 공급원

`services/catalog/newArrival.js` **한 곳**에만 정의됩니다. 판정 규칙을 바꾸려면 이 파일만 고치고, 소비처는 여기서 만든 술어를 재사용하세요.

```
신상품 =  (sale_start_date 가 오늘 이전 AND 오늘로부터 N일 이내)   ← 자동
       OR FIND_IN_SET('NEW', product_badge)                      ← 관리자 강제 노출(기간 무관)
```

| 항목 | 값 |
|---|---|
| N (상품) | `system_settings.new_product_days` — 기본 **100** |
| M (신규 입점 브랜드) | `system_settings.new_brand_days` — 기본 **180** (`categories.onboarded_at` 기준) |
| 정렬 | `NEW_PRODUCT_ORDER` = 판매시작일 최신순, **NULL 은 뒤로** |

- **앵커는 `created_at` 이 아니라 `sale_start_date`(판매 시작일)** 입니다. 적재 시각으로 자르면 대량 임포트한 몰의 카탈로그 전체가 신상품이 됩니다.
- 미래 날짜(예약 발매)는 아직 판매 전이므로 **신상품에서 제외**됩니다.
- 뱃지를 DB 에 다시 써넣는(materialize) 방식이 아니라 **동적 술어**입니다. 기간이 지난 상품은 배치 없이 자동으로 빠지고, 관리자가 기간 설정을 바꾸면 즉시 반영됩니다.
- ⚠️ `newProductPredicate()` 의 `sql` 조각과 `params` 는 **반드시 같은 지점에서 함께** 삽입해야 합니다. 소비처가 문자열 이어붙이기 + `params.push()` 방식이라 순서가 어긋나면 **에러 없이 조용히 틀린 결과**가 나옵니다.
- **NEW pill 은 `views/partials/product_card.ejs` 가 단독으로 판정**합니다(`isNewProduct(product)`). 목록·상세의 `badgeMap` 중복 판정은 제거됐습니다 — 카드에 NEW 뱃지를 그리는 코드를 새로 만들지 마세요.

---

## 2. 상품 목록

### 2.1 URL

- `GET /products` — 전체 상품
- `GET /products/category/:categoryId` — 카테고리별 상품
- `GET /products/brand/:brandId` — 브랜드별 상품

기능 메뉴(`routes/feature.js`)의 신상품 폴백 화면도 같은 `getList` 를 씁니다. 이때 `req.featurePreset` 이 `filter`·`sort`·`badge`·`menuKey`·`groupId`·`capLimit` 를 주입하며, **사용자 쿼리스트링보다 우선**합니다.
(베스트는 더 이상 `getList` 를 쓰지 않습니다 — 전용 컨트롤러입니다 → [best.md](./best.md).)

### 2.2 쿼리 파라미터

| name | 설명 | 기본값 |
|------|------|--------|
| sort | best, price_asc, price_desc, sales, new, review, **sale_start** | new (신상품 필터일 땐 **sale_start**) |
| **filter** | `new` — 신상품 필터(`newArrival` 술어 적용) | - |
| categoryId / brandId | 경로 파라미터 대신 쿼리로도 지정 가능 | - |
| badge | BEST, NEW, RECOMMEND, DEADLINE_SALE, GREENHUB_SPECIAL | - |
| distributionBadge | ONLINE_ONLY | - |
| page | 페이지 번호 | 1 |
| perPage | 10, 20, 30, 50 중 하나 | 30 |

- `sale_start` 는 `new` 와 **다릅니다.** `new` = `created_at DESC`(적재 순), `sale_start` = 판매 시작일 최신순(NULL 후순위).
- `sort` 탭(`SORT_TABS`)에 노출되는 건 6종(인기상품·낮은가격·높은가격·판매량·최근등록·상품평)이고, `sale_start` 는 신상품 필터의 **기본 정렬**로만 쓰입니다.
- `?badge=NEW` 는 **하위호환**으로 남아 있습니다. 신상품 화면은 `?filter=new` 를 쓰세요.

### 2.3 처리

- **상태:** `status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')` 인 상품만 노출(`OFF` 제외).
- **몰 스코프:** `mall_id = req.mallId`(기본 1) 필터가 항상 붙습니다.
- **노출 설정:** 비로그인은 `visibility = 'PUBLIC'`, 로그인은 `visibility IN ('PUBLIC','MEMBER_ONLY')`.
- **아울렛 상품 제외:** `outlet_setting.show_in_normal_list = 0` 이면 일반 목록에서 아울렛 상품을 뺍니다 (`AND id NOT IN (SELECT product_id FROM outlet_product WHERE mall_id = ?)`). 아울렛 전용관은 `/outlet` → [promotions.md](./promotions.md).
- **카테고리:**
  - `categoryId`가 있으면 categories에서 해당 카테고리 조회.
  - ⚠️ **`categoryId` 5·6 은 폐기된 THEME 축**입니다. `RETIRED_THEME_REDIRECTS = { 5: '/best', 6: '/new' }` 로 **리다이렉트**됩니다(더 이상 뱃지 매칭을 하지 않음). 베스트·신상품은 이제 전용 화면입니다.
  - type이 THEME이면 `theme_category_id = ?` 또는 `product_themes` N:M 조건으로 필터.
  - NORMAL이면 `navigationService.getCategoryContext()` 로 서브트리(descendantIds)를 구해 `category_id IN (...)` 로 필터 — 부모 카테고리를 눌러도 자식 카테고리 상품까지 나옵니다.
  - 해당 카테고리의 CATEGORY 타입 배너 1건을 `categoryBanner`로 조회.
- **브랜드:** 같은 몰의 `categories`(type='BRAND')에서 확인 후 `brand_category_id = ?` 필터. 카테고리 배너가 없으면 `BRAND` 타입 배너를 `categoryBanner` 로 사용.
- **뱃지 필터:** `FIND_IN_SET(뱃지, product_badge)`. `DEADLINE_SALE` 은 `badge_expire_date IS NULL OR badge_expire_date >= CURDATE()` 가 함께 걸려 만료된 특가는 노출되지 않습니다.
- **상품그룹:** 프리셋의 `groupId` 가 있으면 `product_group_item` 에 수동 매핑된 상품만 노출하고, 정렬도 `product_group_item.sort_order` 를 따릅니다.
- **정렬:** 1차 키는 항상 `FIELD(status,'ON','COMING_SOON','RESTOCK','SOLD_OUT','OFF')`, 그다음 sort 별 정렬(best=view_count DESC / price_asc / price_desc / sales=판매수량 상관 서브쿼리 / review=평점·리뷰수 상관 서브쿼리 / new=created_at DESC / sale_start=판매시작일 최신순).
  - ⚠️ 판매량·상품평은 **ORDER BY 안의 상관 서브쿼리**입니다. FROM 에 JOIN 하면 `getList` 의 `query.replace('SELECT *','SELECT COUNT(*)')` 카운트가 조인만큼 뻥튀기됩니다.
- **가격:** 조회 직후 `dealSvc.applyDeals(products)` 로 활성 특가를 반영합니다.
- **페이지네이션:** `LIMIT perPage OFFSET (page-1)*perPage`. 프리셋 `capLimit` 가 있으면 총건수와 마지막 페이지 LIMIT 을 상한으로 조입니다.
- **메뉴 배너:** 프리셋 `menuKey` 가 있으면 `bannerService.getByGroup('menu:{key}')` 1건을 `menuBanner` 로 전달.
- **전달 변수:** title(카테고리·브랜드명 또는 '전체상품'), products, categories(NORMAL·depth 1), brands, currentCategory, currentBrand, currentSort, currentDistributionBadge, currentProductBadge, currentUser, likedProductIds, categoryBanner, menuBanner, categoryNav, sortTabs, seo, pagination(page, perPage, total, totalPages).

---

## 3. 상품 상세 (ID)

- **URL:** `GET /products/view/:id`
- **동작:** 해당 id 상품 조회. slug가 있으면 301 리다이렉트 → `/products/:slug`. 조회수 +1, 로그인 시 `recent_views` 기록, 서브 이미지·좋아요 여부·리뷰·추천상품(`product_recommendations` 수동 등록분)·Shopify 매핑 조회. SEO 메타·OG·JSON-LD 구성 후 `user/products/detail` 렌더.
- **가격:** 본 상품과 추천 상품 모두 `dealSvc.applyDeals()` 를 거칩니다.
- **없을 때:** `user/404` 를 **404 상태로 렌더**합니다(리다이렉트 아님).
- **노출 제어:** `visibility='HIDDEN'` → 404, `visibility='MEMBER_ONLY'` + 비로그인 → `/auth/login?redirect=...` 리다이렉트.

### 3.1 아울렛 고지 블록 (`outletInfo`)

`outletService.getOutletInfoByProductId(mallId, productId)` — 아울렛 상품이 아니면 `null` 이고 뷰는 아무것도 그리지 않습니다.

| 필드 | 내용 |
|---|---|
| `outlet_type` · `outlet_reason` | 사유 배지(리퍼브·전시·포장훼손 등) |
| `condition_grade` | 상품 등급 |
| `defect_description` | 하자 고지 |
| `expiry_at` | 유통기한 |
| `outlet_category_id` · `category_name` | 아울렛 카테고리 |

⚠️ **아울렛 전용 상세 페이지를 만들지 마세요.** 같은 상품·같은 가격이고, 아울렛 정보만 상세에 얹힙니다. 리퍼브·전시·포장훼손을 일반 상품처럼 보여주면 교환·반품 분쟁이 납니다.

### 3.2 🔴 알려진 결함 — 상세에 국내 구매 진입점이 없다

`views/user/products/detail.ejs` 의 Action Buttons 영역(377~401줄)에는 **Shopify `해외 구매하기` 버튼만** 있습니다. 장바구니 담기·바로구매 버튼이 없고, 수량 선택기(343줄)에는 `hidden` 클래스가 걸려 있습니다.

- Shopify 는 현재 비활성(`shopify_sync_enabled=0`)이므로 그 블록은 **아무것도 렌더하지 않습니다** → 상세에서 구매로 넘어갈 수단이 없습니다.
- JS 는 `add-to-cart-form` 을 참조하지만(790줄) 그 폼이 마크업에 없어 `if (addToCartForm)` 방어로 조용히 통과합니다.
- **저장소의 어떤 뷰도 `/cart/add` 로 POST 하지 않습니다.** `routes/cart.js` · `controllers/cartController.js` · `/checkout` 은 정상 동작하지만 PDP 에서 도달할 수 없습니다.
- `git log -S "장바구니 담기" -- views/user/products/detail.ejs` 가 빈 결과라, 이 파일에 해당 버튼이 있었던 적이 없습니다(Shopify 소싱몰 시절의 구조가 남은 것으로 보입니다).

국내 구매 흐름을 살리려면 상세에 구매 폼(`POST /cart/add` + `goToCheckout()`)을 추가하고 수량 선택기의 `hidden` 을 걷어내야 합니다.

---

## 4. 상품 상세 (slug)

- **URL:** `GET /products/:slug`
- **동작:** slug로 products에서 id 조회 후 `getDetail`에 id를 넘겨 동일 로직 실행. slug가 없으면 `user/404` 를 404 로 렌더.

---

## 5. 좋아요 토글

- **URL:** `POST /products/like/:id`
- **인증:** 로그인 필수. 비로그인 시 401 JSON.
- **동작:** likes 테이블에 이미 있으면 DELETE(liked: false), 없으면 INSERT(liked: true). JSON 응답 `{ success, liked }`.

---

## 6. 상세 페이지 전달 변수

title, product(+images), isLiked, reviews, currentUser, visitorIp, seo(title, description, url, image, type, siteName, robots, jsonLd), kakaoJsKey, kakaoChannelUrl, stockError(재고 부족 시 `?error=stock&max=` 로 전달), recommendedProducts, shopifyMapping, **outletInfo**.

---

## 7. 브랜드 (`/brands`)

- **라우트:** `routes/brands.js` (`routes/index.js` 안에서 `/brands` 로 마운트)
- **컨트롤러:** `controllers/brandController.js` · **뷰:** `views/user/brands/`

| URL | 액션 | 설명 |
|-----|------|------|
| `GET /brands` | `getHome` | 브랜드 허브(색인·검색) |
| `GET /brands/search.json` | `searchJson` | 브랜드 검색 AJAX. **`/:brandId` 보다 먼저 선언**해야 합니다(숫자가 아니어도 `:brandId` 가 먹습니다) |
| `GET /brands/:id` | `getDetail` | **브랜드 상세관** |

- ⚠️ **`/brands/:id` 는 더 이상 `/products/brand/:id` 로 리다이렉트하지 않습니다.** 자체 상세관을 렌더합니다.
- **탭:** `?tab=home | best | new | all | benefit` (기본 `home`). 화이트리스트 밖의 값은 `home` 으로 정규화.
  - `home` — 베스트 6 + 신상품 6 (상품이 3개 이하면 전체 목록도 함께)
  - `best` — 30건, `new` — 40건, `all` — 전체 목록, `benefit` — 브랜드 혜택
- 브랜드는 `categories`(`type='BRAND'`) 입니다. 상품은 `products.brand_category_id` 로 묶입니다.
- 신규 입점 라벨은 `newArrival.isNewBrand(brand)`(`categories.onboarded_at`, 기본 180일) → §1.1.

---

## 8. 최근 본 상품

| 상태 | 저장소 | 렌더 |
|---|---|---|
| 로그인 | `recent_views` 테이블 (상세 진입 시 기록) | **SSR** |
| 비로그인 | `localStorage` | 클라이언트 전용(`clientOnly`) |

홈 섹션 `recent_product` 와 우측 유틸 레일이 같은 규칙을 씁니다.

---

*Last Updated: 2026-07-15*
