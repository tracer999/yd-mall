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
기준일 = COALESCE(sale_start_date, DATE(created_at))          ← newProductAnchor()

신상품 =  (기준일이 오늘 이전 AND 오늘로부터 N일 이내)          ← 자동
       OR FIND_IN_SET('NEW', product_badge)                   ← 관리자 강제 노출(기간 무관)
```

| 항목 | 값 |
|---|---|
| N (상품) | `system_settings.new_product_days` — 기본 **100** |
| M (신규 입점 브랜드) | `system_settings.new_brand_days` — 기본 **180** (`categories.onboarded_at` 기준) |
| 정렬 | `NEW_PRODUCT_ORDER` = 기준일 최신순 |

- **앵커는 `sale_start_date`(판매 시작일), 없으면 `DATE(created_at)`(적재일)** 입니다.
  - 원래는 `sale_start_date` 만 봤습니다. 적재 시각으로 자르면 대량 임포트한 몰의 카탈로그 전체가 신상품이 되기 때문인데, 그 대가로 **판매 시작일을 입력하지 않은 몰은 신상품이 0건**이 됐습니다. 몰 빌더로 갓 찍어내 외부 소싱으로 상품을 막 적재한 몰이 정확히 그 경우라, 신상품 랜딩이 통째로 비었습니다(2026-07-22 개선).
  - 대량 임포트 우려는 **N일 창(기본 100일)이 그대로 막아줍니다** — 100일 지난 적재분은 빠집니다.
  - 실측(2026-07-22): `sale_start_date` 가 채워진 몰 2 는 **50건 → 50건(변동 없음)**, 전부 NULL 인 몰 28 은 **2건 → 49건**.
- ⚠️ `COALESCE(...)` 는 **인덱스를 타지 못합니다.** 소비처는 전부 카테고리·브랜드로 먼저 좁힌 뒤 이 술어를 씁니다. 전체 카탈로그를 이 조건만으로 훑는 새 소비처를 만들지 마세요.
- ⚠️ `isNewProduct(product)`(JS 판정)도 같은 폴백을 씁니다 — 카드용 쿼리에 **`created_at` 을 select 하지 않으면 NEW 뱃지가 조용히 사라집니다**(판정이 false 로 떨어짐).
- 미래 날짜(예약 발매)는 아직 판매 전이므로 **신상품에서 제외**됩니다.
- 뱃지를 DB 에 다시 써넣는(materialize) 방식이 아니라 **동적 술어**입니다. 기간이 지난 상품은 배치 없이 자동으로 빠지고, 관리자가 기간 설정을 바꾸면 즉시 반영됩니다.
- ⚠️ `newProductPredicate()` 의 `sql` 조각과 `params` 는 **반드시 같은 지점에서 함께** 삽입해야 합니다. 소비처가 문자열 이어붙이기 + `params.push()` 방식이라 순서가 어긋나면 **에러 없이 조용히 틀린 결과**가 나옵니다.
- **NEW pill 은 `views/partials/product_card.ejs` 가 단독으로 판정**합니다(`isNewProduct(product)`). 목록·상세의 `badgeMap` 중복 판정은 제거됐습니다 — 카드에 NEW 뱃지를 그리는 코드를 새로 만들지 마세요.

**술어 소비처** (모두 `newProductPredicate`/`newProductOrder`/`isNewProduct` 를 재사용):

| 소비처 | 용도 |
|--------|------|
| `controllers/productController.js` | 상품목록 `?filter=new`, 정렬 `sale_start` |
| `views/partials/product_card.ejs` | 카드 NEW pill (`isNewProduct`) |
| `services/display/productGroupService.js:67` | SDUI 상품그룹 섹션의 `isNew` 조건 |
| `routes/sitemap.js:215` | **신상품 RSS 피드** (`/rss.xml`) — 예전엔 판정과 무관하게 `created_at` 최신 50건을 뿌려 화면과 어긋났습니다 |

(브랜드용 `newBrandPredicate`/`isNewBrand` 소비처는 [brands.md](../admin/brands.md) 참고 — `new_brand_list` 리졸버 등.)

---

## 2. 상품 목록

### 2.1 URL

- `GET /products` — 전체 상품
- `GET /products/category/:categoryId` — 카테고리별 상품
- `GET /products/brand/:brandId` — 브랜드별 상품

**`/new`(신상품)는 더 이상 `getList` 를 쓰지 않습니다** (2026-07-22). 전용 컨트롤러 `controllers/newController.js` 가 두 섹션을 렌더합니다.

```
[쇼케이스]          middleware/menuShowcase 주입 → main_layout 렌더
[카테고리별 신상품] 카테고리마다 한 줄, 줄당 최대 10개(최신 등록순) → [더보기] /products/category/:id?filter=new
[브랜드별 신상품]   브랜드마다 한 줄,   줄당 최대 10개(최신 등록순) → [더보기] /products/brand/:id?filter=new
```

- 뷰: `views/user/new/index.ejs` + 공용 파티셜 `views/partials/storefront/landing_rows.ejs`(베스트와 같은 조각).
- 데이터: `services/catalog/landingSections.js` (`mode:'new'`) → [best.md](./best.md) §4.
- **좌측 facet 필터·정렬 탭은 없습니다.** 신상품은 "무엇이 새로 들어왔는지" 훑는 화면이지 조건을 좁혀 찾는 화면이 아닙니다. 필터가 필요하면 각 줄의 [더보기]가 목록 화면으로 데려갑니다.
- **빈 상태:** 신상품이 0건이면 안내 + [전체 상품 보기]. 갓 찍어낸 몰에서 빈 화면을 남기지 않습니다.

⚠️ **관리자가 페이지 빌더로 만든 SDUI 랜딩(`page.slug='new'`)이 있으면 그쪽이 이깁니다** (`routes/feature.js`). `displayService.getPageBySlug(mallId, 'new')` 로 페이지를 찾고 섹션이 1개 이상이면 `user/landing`(섹션 조립)을 렌더합니다. 운영자가 직접 구성한 화면을 코드가 덮어쓰지 않기 위해서입니다 — 표준 화면으로 되돌리려면 관리자에서 그 페이지를 내리세요. (현재 몰 2 `와이디몰 종합관` 이 이 경우입니다.)

(베스트도 `getList` 를 쓰지 않습니다 — 전용 컨트롤러입니다 → [best.md](./best.md).)

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
| **facet 키** | `price` · `brand` · `discount` · `stock` · `benefit` · 속성 facet 코드 소문자. 값은 콤마 구분(최대 30개) | - |
| **price_min / price_max** | 가격 직접 입력. JS 없이 GET 으로 넘어온다 | - |

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
  - 해당 카테고리의 CATEGORY 타입 배너를 **묶음(`categoryBanners` 배열)** 으로 조회합니다. `ORDER BY display_order ASC, id ASC`.
- **브랜드:** 같은 몰의 `categories`(type='BRAND')에서 확인 후 `brand_category_id = ?` 필터. 카테고리 배너가 하나도 없을 때만 `BRAND` 타입 배너를 같은 방식으로 조회해 `categoryBanners` 에 담습니다.
- **상단 배너 묶음 규칙:** 개별 대상 배너(`category_id` 가 찍힌 것)가 **하나라도 있으면 그것들만**, 없으면 전체 공통(`group_key='common:{TYPE}:{mallId}'`) 묶음을 씁니다(`pickBannerTier`). 두 tier 를 섞지 않아야 "이 카테고리에만 다른 배너" 라는 개별 지정이 의미를 갖습니다.
  - 뷰(`views/user/products/_category_banner.ejs`)는 **1건이면 기존과 같은 한 장**, **2건 이상이면 자동 회전 슬라이드쇼**(스크롤 스냅 트랙 + 화살표 + 도트, 5초 간격)로 그립니다. 전역 init 가드는 `window.__ydCatBannerInit` 로 `_category_best`·`menu_showcase` 와 분리돼 있습니다.
- **뱃지 필터:** `FIND_IN_SET(뱃지, product_badge)`. `DEADLINE_SALE` 은 `badge_expire_date IS NULL OR badge_expire_date >= CURDATE()` 가 함께 걸려 만료된 특가는 노출되지 않습니다.
- **상품그룹:** 프리셋의 `groupId` 가 있으면 `product_group_item` 에 수동 매핑된 상품만 노출하고, 정렬도 `product_group_item.sort_order` 를 따릅니다.
- **정렬:** 1차 키는 항상 `FIELD(status,'ON','COMING_SOON','RESTOCK','SOLD_OUT','OFF')`, 그다음 sort 별 정렬(best=view_count DESC / price_asc / price_desc / sales=판매수량 상관 서브쿼리 / review=평점·리뷰수 상관 서브쿼리 / new=created_at DESC / sale_start=판매시작일 최신순).
  - ⚠️ 판매량·상품평은 **ORDER BY 안의 상관 서브쿼리**입니다. FROM 에 JOIN 하면 `getList` 의 `query.replace('SELECT *','SELECT COUNT(*)')` 카운트가 조인만큼 뻥튀기됩니다.
- **가격:** 조회 직후 `dealSvc.applyDeals(products)` 로 활성 특가를 반영합니다.
- **페이지네이션:** `LIMIT perPage OFFSET (page-1)*perPage`. 프리셋 `capLimit` 가 있으면 총건수와 마지막 페이지 LIMIT 을 상한으로 조입니다.
- **메뉴 배너:** 프리셋 `menuKey` 가 있으면 `bannerService.getByGroup('menu:{key}')` 1건을 `menuBanner` 로 전달.
- **전달 변수:** title(카테고리·브랜드명 또는 '전체상품'), products, categories(NORMAL·depth 1), brands, currentCategory, currentBrand, currentSort, currentDistributionBadge, currentProductBadge, currentUser, likedProductIds, categoryBanner, menuBanner, categoryNav, sortTabs, seo, pagination(page, perPage, total, totalPages), **facets · selectedFacets · brandFacetOptions**.

### 2.4 필터(facet)

설계: `docs/사이트개선/카테고리_브랜드_상품필터_설계.md`. 구현은 `services/catalog/facetService.js` + 뷰 `views/user/products/_facet_filters.ejs`.

**정의는 DB 카탈로그다.** `facet_definition`(필터 정의) · `facet_value_definition`(값) · `category_facet`(카테고리별 부여)의 3테이블이며, 마이그레이션 SQL(`scripts/migrations/20260722_facet_phase*.sql`)로 배포에 싣는다(제품의 일부). 값(`product_attribute`)은 운영 데이터라 스크립트로 넣지 않는다.

| 단계 | 함수 | 하는 일 |
|---|---|---|
| ① 노출 결정 | `getFacetsForCategory(categoryId)` | 조상 체인(최대 3뎁스)을 타고 `category_facet` 을 머지. **가까운 조상이 이기고**, 조상 행은 `inherit_to_children=1` 일 때만 내려온다. 매핑이 없으면 **Tier 0 만** 자동 노출 |
| ② 값 정리 | `getAttributeAvailability(mallId)` → `pruneUnavailable()` | 몰에 실제 값이 있는 속성만 남긴다. `product_attribute` 가 비면 속성 필터가 통째로 숨는다 |
| ③ 술어 조립 | `buildPredicates(facets, q, {exclude})` | 쿼리스트링 → WHERE 조각. facet 간 AND, facet 내 값 OR |

**Tier 0(항상 붙는 공통 필터)** — `CATEGORY`(칩) · `PRICE`(구간) · `BRAND`(파생) · `DISCOUNT` · `BADGE` · `STOCK`(토글) · `BENEFIT` · `DELIVERY` · `CHANNEL`.
이 중 `CATEGORY`·`BADGE`·`CHANNEL`·`RATING` 은 기존 컨트롤러가 이미 처리하므로 `HANDLED_ELSEWHERE` 로 술어를 만들지 않는다(이중 적용 방지). `DELIVERY` 는 상품 단위 데이터가 없어 술어가 `null` 이다.

값 해석 규칙:

- **PRICE** — `price=P1,P3`(프리셋) · `price=30000-50000`(직접 구간, 열린 구간 가능) · `price_min`/`price_max`(폼). **폼 입력이 프리셋보다 우선**하고, 여러 구간은 OR. 구간은 `min <= price < max`.
- **DISCOUNT** — 다중 선택 시 **가장 낮은 하한**만 쓴다(`D10`+`D30` → `discount_rate >= 10`).
- **BENEFIT** — `DEAL`(활성 `deal_item` EXISTS) · `OUTLET`(`outlet_product.is_visible=1` EXISTS). 쿠폰은 상품 단위 매핑 테이블이 없어 보류.
- **BRAND** — `brand_category_id IN (...)`.
- **ATTRIBUTE 계열** — `product_attribute` 에 `attr_name = source_key` 이고 `is_searchable=1` 인 행 EXISTS.

> ⚠️ **술어는 EXISTS/IN 서브쿼리만 쓴다. FROM 에 JOIN 을 추가하면 안 된다.** `getList` 가 카운트 쿼리를 `query.replace('SELECT *','SELECT COUNT(*) as total')` 문자열 치환으로 만들기 때문에, JOIN 을 붙이면 카운트가 조용히 틀어진다.

**브랜드 파셋 카운트** — 브랜드 후보는 고정 목록이 아니라 "지금 조건에서 상품이 있는 브랜드 상위 30개 + 건수"다. 몰 전체 브랜드(1,300여 개)를 뿌리면 대부분 0건이고 DOM 만 커진다. 집계 쿼리는 **`exclude: ['BRAND']` 로 자기 자신을 뺀 술어**로 만든다 — 빼지 않으면 브랜드 하나를 고르는 순간 나머지가 전부 0으로 접힌다.

**뷰** — `_facet_filters.ejs` 가 `ui_type` 에 따라 위젯 4종(알약·사이즈 격자·색상 스와치·토글)을 그린다. 선택 조건은 상단에 해제 가능한 칩으로, 값이 많은 필터는 `+N개` 로 접는다. URL 조립은 `list.ejs` 의 `_url(overrides)`(URLSearchParams) 하나로 통일돼 있다.

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

### 5.1 브랜드 찜 토글

- **URL:** `POST /likes/brand/toggle` (`routes/likes.js:16` → `likeController.toggleBrandLike`)
- **인증:** 로그인 필수(`ensureAuthenticated`). body: `brandId`.
- **동작:** `categories`(`type='BRAND'`) 존재 확인 후 `brand_likes(user_id, category_id)` 를 토글. JSON `{ success, liked }`. 찜 목록은 `/mypage/brand-likes`.
- ⚠️ **몰 검증이 없습니다.** `toggleBrandLike`(`likeController.js:52-55`)는 `id`·`type='BRAND'` 만 확인하고 `mall_id` 를 보지 않아 다른 몰의 브랜드도 찜됩니다 → [brands.md](../admin/brands.md) §7.

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
