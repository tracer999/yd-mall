# 상품

## 1. 개요

- **컨트롤러:** `controllers/productController.js`
- **라우트:** `routes/products.js`
- **뷰:** `views/user/products/list.ejs`, `views/user/products/detail.ejs`

상품 목록(전체/카테고리별/브랜드별), 상세(ID·slug), 좋아요 토글을 제공합니다.

---

## 2. 상품 목록

### 2.1 URL

- `GET /products` — 전체 상품
- `GET /products/category/:categoryId` — 카테고리별 상품
- `GET /products/brand/:brandId` — 브랜드별 상품

기능 메뉴(`routes/feature.js` — `/best`, `/new`, `/deal/today` 등)도 같은 `getList` 를 씁니다. 이때 `req.featurePreset` 이 `sort`·`badge`·`menuKey`·`groupId`·`capLimit` 를 주입하며, **사용자 쿼리스트링보다 우선**합니다.

### 2.2 쿼리 파라미터

| name | 설명 | 기본값 |
|------|------|--------|
| sort | best, price_asc, price_desc, sales, new, review | new |
| categoryId / brandId | 경로 파라미터 대신 쿼리로도 지정 가능 | - |
| badge | BEST, NEW, RECOMMEND, DEADLINE_SALE, GREENHUB_SPECIAL | - |
| distributionBadge | ONLINE_ONLY | - |
| page | 페이지 번호 | 1 |
| perPage | 10, 20, 30, 50 중 하나 | 30 |

### 2.3 처리

- **상태:** `status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')` 인 상품만 노출(`OFF` 제외).
- **몰 스코프:** `mall_id = req.mallId`(기본 1) 필터가 항상 붙습니다.
- **노출 설정:** 비로그인은 `visibility = 'PUBLIC'`, 로그인은 `visibility IN ('PUBLIC','MEMBER_ONLY')`.
- **카테고리:**
  - `categoryId`가 있으면 categories에서 해당 카테고리 조회.
  - type이 THEME이면 `theme_category_id = ?` 또는 `product_themes` N:M 조건으로 필터. 카테고리 id 5·6 은 각각 `BEST`·`NEW` 뱃지도 자동 매칭.
  - NORMAL이면 `navigationService.getCategoryContext()` 로 서브트리(descendantIds)를 구해 `category_id IN (...)` 로 필터 — 부모 카테고리를 눌러도 자식 카테고리 상품까지 나옵니다.
  - 해당 카테고리의 CATEGORY 타입 배너 1건을 `categoryBanner`로 조회.
- **브랜드:** 같은 몰의 `categories`(type='BRAND')에서 확인 후 `brand_category_id = ?` 필터. 카테고리 배너가 없으면 `BRAND` 타입 배너를 `categoryBanner` 로 사용.
- **뱃지 필터:** `FIND_IN_SET(뱃지, product_badge)`. `DEADLINE_SALE` 은 `badge_expire_date IS NULL OR badge_expire_date >= CURDATE()` 가 함께 걸려 만료된 특가는 노출되지 않습니다.
- **상품그룹:** 프리셋의 `groupId` 가 있으면 `product_group_item` 에 수동 매핑된 상품만 노출하고, 정렬도 `product_group_item.sort_order` 를 따릅니다.
- **정렬:** 1차 키는 항상 `FIELD(status,'ON','COMING_SOON','RESTOCK','SOLD_OUT','OFF')`, 그다음 sort 별 정렬(best=view_count DESC / price_asc / price_desc / sales=판매수량 상관 서브쿼리 / review=평점·리뷰수 상관 서브쿼리 / new=created_at DESC).
- **페이지네이션:** `LIMIT perPage OFFSET (page-1)*perPage`. 프리셋 `capLimit` 가 있으면 총건수와 마지막 페이지 LIMIT 을 상한으로 조입니다.
- **메뉴 배너:** 프리셋 `menuKey` 가 있으면 `bannerService.getByGroup('menu:{key}')` 1건을 `menuBanner` 로 전달.
- **전달 변수:** title(카테고리·브랜드명 또는 '전체상품'), products, categories(NORMAL·depth 1), brands, currentCategory, currentBrand, currentSort, currentDistributionBadge, currentProductBadge, currentUser, likedProductIds, categoryBanner, menuBanner, categoryNav, sortTabs, seo, pagination(page, perPage, total, totalPages).

---

## 3. 상품 상세 (ID)

- **URL:** `GET /products/view/:id`
- **동작:** 해당 id 상품 조회. slug가 있으면 301 리다이렉트 → `/products/:slug`. 조회수 +1, 로그인 시 `recent_views` 기록, 서브 이미지·좋아요 여부·리뷰·추천상품(`product_recommendations` 수동 등록분)·Shopify 매핑 조회. SEO 메타·OG·JSON-LD 구성 후 `user/products/detail` 렌더.
- **없을 때:** `user/404` 를 **404 상태로 렌더**합니다(리다이렉트 아님).
- **노출 제어:** `visibility='HIDDEN'` → 404, `visibility='MEMBER_ONLY'` + 비로그인 → `/auth/login?redirect=...` 리다이렉트.

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

title, product(+images), isLiked, reviews, currentUser, visitorIp, seo(title, description, url, image, type, siteName, robots, jsonLd), kakaoJsKey, kakaoChannelUrl, stockError(재고 부족 시 `?error=stock&max=` 로 전달), recommendedProducts, shopifyMapping.

---

*Last Updated: 2026-07-11*
