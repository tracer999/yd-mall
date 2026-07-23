# 브랜드 관리 (Brands)

## 1. 개요

브랜드는 **독립 테이블이 아닙니다.** 마스터는 `categories` 의 `type='BRAND'` 행이고, 브랜드 전용 속성은 `brand_profile` 이 1:1 로 확장합니다. 상품 수·인기 점수·혜택 수 같은 파생값은 **집계 캐시 `brand_stat` / `brand_category_stat`** 에서 읽습니다 — **화면이 직접 집계하지 않습니다.**

| 테이블 | 역할 | 건수(2026-07) |
|--------|------|--------------|
| `categories` (type='BRAND') | 브랜드 마스터 — 이름·로고·활성·입점일 | 1,390 |
| `brand_profile` | 확장 속성 — 영문명·별칭·초성·스토리·공식여부·SEO | 1,390 |
| `brand_stat` | 집계 캐시 — 상품수·인기점수·혜택수·대표상품 | 1,377 |
| `brand_category_stat` | 브랜드 × 상품카테고리 교차 집계 | 2,585 |

> **왜 집계 캐시인가:** 브랜드 홈의 6개 섹션이 매 요청마다 상품 9,677건에 조인하면 화면이 죽습니다. 실제로 `/admin/categories` 가 브랜드 1,354개에서 터진 전례가 있습니다(`brandStatService.js:3-9`).

- **Base URL:** `/admin/brands` (`routes/admin.js:33`, `requireMenuAccess('/admin/brands')`)
- **컨트롤러:** `controllers/admin/brandController.js`
- **서비스:** `services/brand/brandStatService.js`(집계), `services/brand/brandService.js`(고객 읽기), `services/brand/benefitService.js`(혜택), `services/brand/brandProfile.js`
- **뷰:** `views/admin/brands/list.ejs`, `views/admin/brands/form.ejs`
- **고객 화면:** `/brands`(허브), `/brands/:brandId`(상세관) — `routes/brands.js`, `controllers/brandController.js`
- **권한:** `admin_menus` id=57, parent_id=30(메뉴/카테고리 관리), `visible_roles = super_admin,admin,content_admin`

> **`/admin/categories` 와의 분업 (2026-07-23 이관):** 카테고리 관리에 있던 **[브랜드 카테고리] 탭을 이 화면으로 흡수**했습니다. 브랜드 생성·삭제·순서·로고·입점일·사용여부·몰별 표시가 전부 여기로 왔고, `/admin/categories` 는 `type='NORMAL'` 전용이 됐습니다.
>
> 이관 이유: 브랜드 1,401건이 카테고리 트리 화면에 얹히면 부모 후보 JSON·DOM 이 함께 터졌고(18MB/70초 전례), 브랜드는 전부 1뎁스라 트리 편집 UI 가 애초에 불필요했습니다.
>
> 단 **`delete` · `visibility` · `mall-visibility` 엔드포인트는 `/admin/categories` 것을 그대로 재사용**합니다(좁은 컬럼만 만지거나 별도 테이블이라 브랜드에도 안전). 폼이 `return_url` 을 실어 보내 이 화면으로 복귀합니다.

---

## 2. 라우트 (`routes/admin/brands.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/brands` | getList | 목록 (범위 `scope=used\|all`, 검색 `q`, 공식여부 `official`, 정렬 `sort`, 페이지 30건) |
| GET | `/admin/brands/search.json` | searchJson | 브랜드 자동완성 (JSON, 최대 15건) |
| POST | `/admin/brands/recalc` | postRecalc | **집계 재계산** (이 몰 전건) |
| POST | `/admin/brands/add` | postAdd | **브랜드 등록** (multipart, `upload.single('logo_image')`) |
| GET | `/admin/brands/:id` | getEdit | 브랜드 편집 폼 |
| POST | `/admin/brands/:id` | postUpdate | 상세 저장 (`categories` + `brand_profile` 트랜잭션) |
| POST | `/admin/brands/:id/inline` | postInlineEdit | **목록 행 저장** (multipart — 이름·순서·입점일·사용여부·로고) |

목록 화면이 함께 쓰는 카테고리 엔드포인트 (모두 `return_url=/admin/brands…` 를 실어 보냄):

| 메서드 | URL | 용도 |
|--------|-----|------|
| POST | `/admin/categories/delete` | 브랜드 삭제 (`brand_profile` 은 FK CASCADE 로 함께 삭제) |
| POST | `/admin/categories/visibility` | `is_active` 일괄 저장 |
| POST | `/admin/categories/mall-visibility` | 몰별 표시 override 토글 |

고정 경로(`/search.json`, `/recalc`, `/add`)를 `/:id` 보다 먼저 선언하고 숫자 검증은 `requireNumericId` 가 합니다(Express 5 는 `:id(\d+)` 미지원).

> **`search.json` 이 필요한 이유:** 브랜드가 1,390개라 `<select>` 드롭다운으로 못 씁니다. 기획전의 '브랜드 귀속' 선택 등 다른 관리자 화면이 이 API 를 호출합니다.

---

## 3. 관리자 화면

### 3.1 목록 (`GET /admin/brands`)

- **쿼리:** `categories c LEFT JOIN brand_profile bp LEFT JOIN (products 집계) pc LEFT JOIN brand_stat s LEFT JOIN categories tc`(대표 카테고리명)
- **범위 `scope`:** `used`(기본) = `EXISTS (SELECT 1 FROM products p WHERE p.brand_category_id = c.id AND p.mall_id = ?)`, `all` = 전체. 탭 배지용 건수는 `SUM(EXISTS …)` 로 한 쿼리에서 함께 셉니다.

> ⚠️ **`used` 필터와 화면의 [상품] 칸은 반드시 같은 소스여야 합니다.** 상품 수를 `brand_stat.product_count`(캐시)로 두고 필터만 라이브로 걸면, 재계산 전에는 "used 탭에 떴는데 상품수 0" 인 모순이 납니다. 그래서 목록의 상품 수는 `brand_stat` 이 아니라 **`products` 라이브 집계(`pc.n`)** 입니다. 인기 점수·혜택 수는 여전히 `brand_stat` 캐시입니다.

- **검색 `q`:** `c.name` / `bp.name_en` / `bp.alias` / `bp.initial_chosung` LIKE. 검색어는 `toChosung(q)` 로도 변환해 **초성 검색**이 됩니다(`나이키` ↔ `ㄴㅇㅋ`).
- **필터 `official`:** `COALESCE(bp.official_yn, 0)` 기준 0/1
- **정렬 `sort`:** `count`(기본, 상품많은순 — `pc.n` 기준) / `name` / `popular`(popularity_score) / `new`(onboarded_at DESC) / `order`(display_order ASC)

### 3.1.1 목록 인라인 편집 (`POST /admin/brands/:id/inline`)

카테고리 관리 브랜드 탭에서 이관한 편집 UI 입니다. 행마다 `form="brand-form-<id>"` 로 셀 전반의 input 을 묶습니다.

| 컬럼 | 갱신 방식 |
|------|-----------|
| `name` | 그대로. 변경 시 `brand_profile.initial` / `initial_chosung` 도 재파생(검색 인덱스) |
| `display_order` | `COALESCE(?, display_order)` — **`scope=all` 탭에서는 input 을 렌더하지 않으므로** 값이 안 오고 기존 순서가 유지됨 |
| `onboarded_at` | 그대로 |
| `is_active` | `toBool()` (hidden 0 + checkbox 1 쌍) |
| `logo_image_path` | `COALESCE(?, logo_image_path)` — 새 파일이 없으면 **기존 로고 유지** |

> **`categoryController.postEdit` 을 재사용하지 않는 이유:** 그쪽 UPDATE 는 전(全)컬럼 계약이라 폼이 `existing_logo`·`description`·`pc_visible`·`mobile_visible` 을 빠뜨리면 조용히 비워집니다. 브랜드는 전부 1뎁스라 그 핸들러의 뎁스·순환·서브트리 재계산도 전혀 쓰지 않습니다. → 좁은 전용 핸들러가 안전합니다.

> **순서 편집은 `used` 탭 한정입니다**(사용자 요구). 다만 **`categories.display_order` 는 브랜드 허브 정렬에 거의 쓰이지 않습니다** — `services/brand/brandService.js` 의 `SORTS` 는 `product_count` / `popularity_score` / `name` / `onboarded_at` 기준이고, `display_order` 는 `services/display/resolvers/new_by_brand.js` 의 2차 tie-break 로만 소비됩니다.

### 3.1.2 브랜드 등록 (`POST /admin/brands/add`)

- `categories` 에 `type='BRAND'`, `mall_id=GLOBAL_CATEGORY_MALL_ID(0)`, `parent_id=NULL`, `depth=1` 로 INSERT (브랜드는 계층을 쓰지 않습니다 — 전 1,401건이 depth 1).
- 이어서 `brand_profile` 에 `initial` / `initial_chosung` 을 심습니다. 이게 없으면 **등록 직후 초성 검색에 걸리지 않습니다.**
- `display_order` 를 비우면 `MAX(display_order) + 1`.
- **집계 시각 표시:** `MAX(brand_stat.calculated_at)` 을 함께 내려줍니다. 상품 수가 실제와 어긋나 보일 때 운영자가 "언제 집계했는지"를 확인할 근거입니다.

### 3.2 편집 (`GET/POST /admin/brands/:id`)

저장은 **트랜잭션 하나**에서 두 테이블을 씁니다(`postUpdate`).

| 대상 | 컬럼 | 비고 |
|------|------|------|
| `categories` | `name`, `onboarded_at`, `is_active` | **마스터에 남긴다** — 다른 화면이 이 컬럼을 본다 |
| `brand_profile` | `name_en`, `alias`, `initial`, `initial_chosung`, `tagline`, `story`, `country`, `official_yn`, `shop_enabled`, `hero_image_url`, `seo_title`, `seo_description`, `seller_name`, `is_seller` | `INSERT … ON DUPLICATE KEY UPDATE` (프로필 행이 없으면 생성) |

- **초성은 이름에서 파생합니다.** `initial` 은 관리자가 고른 값이 있으면 그것을, 없으면 `toInitial(name)` 을 씁니다. `initial_chosung` 은 **항상** `toChosung(name)` 으로 재계산합니다(`shared/hangul.js`).
- **최초 백필:** 기존 브랜드의 `brand_profile` 행·`initial_chosung`·`name_en`(+ 셀러명, `onboarded_at` 추정)은 `scripts/backfill_brand_profile.js` 가 일회성으로 채웠습니다(멱등 — 이미 채워진 값은 건드리지 않음). `onboarded_at` 은 전 몰 0건이라 **"브랜드 최초 상품의 `created_at`"** 으로 추정한 값이므로 관리자가 덮어쓸 수 있습니다.
- **`INITIAL_BUCKETS`**: ㄱ~ㅎ / A~Z / # (`shared/hangul.js`)
- 화면 하단에 `brand_category_stat` 기준 "이 브랜드가 취급하는 카테고리" 상위 20건을 **읽기 전용**으로 보여줍니다.
- **입점일 `categories.onboarded_at`** 은 여기와 **목록 행**에서 입력합니다. 신규 브랜드 판정의 유일한 앵커입니다.

### 3.3 집계 재계산 (`POST /admin/brands/recalc`)

`brandStatService.recalcMall(mallId)` 를 동기 호출합니다. **전건 재계산(멱등)** — `brand_stat` / `brand_category_stat` 을 몰 단위로 `DELETE` 후 500건씩 벌크 INSERT 합니다.

- **CLI 배치:** `scripts/recalc_brand_stat.js` (활성 몰 전체 순회)
  ```bash
  set -a; . /etc/environment; set +a; node scripts/recalc_brand_stat.js
  ```
- **⚠️ cron 등록이 없습니다.** 상품·주문·찜·혜택이 바뀌어도 자동으로 갱신되지 않습니다. 관리자 버튼 또는 위 스크립트를 **수동 실행**해야 합니다.

---

## 4. 집계 로직 (`brandStatService.recalcMall`)

### 4.1 인기 점수 (`popularity_score`)

가중치는 `best_score_config`(몰별)에서 읽습니다 — **베스트/랭킹과 같은 설정을 공유**합니다.

```
score = wSales × sales_count
      + wLike  × (like_count + brand_like_count × 2)
      + wView  × view_score
      + cart_count
```

- 브랜드 찜(`brand_likes`)은 상품 찜보다 강한 신호라 **가중치 2배**, 장바구니는 1점 고정.
- **`weight_view` 가 0 이면 1 로 승격합니다**(`brandStatService.js:108-110`). 상품 랭킹은 조회수 노이즈를 빼려고 0 을 쓰지만, 브랜드에서는 조회수가 사실상 유일하게 살아있는 신호이기 때문입니다(주문 22건·찜 11건 수준).

### 4.2 집계 대상 필터

| 상수 | 정의 |
|------|------|
| `P_LIVE` | `p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND p.visibility <> 'HIDDEN'` |
| `O_PAID` | `o.status IN ('PAID','PREPARING','SHIPPED','DELIVERED')` (bestRankingService 와 동일) |
| `NEW_DAYS` | 30 (`new_count` 산출용 — **`system_settings.new_brand_days` 와 무관**) |

**상품이 0건인 브랜드는 `brand_stat` 에 아예 남지 않습니다**(탐색 대상이 아니므로). 그래서 `categories(BRAND)` 1,390 vs `brand_stat` 1,377 의 차이가 납니다.

### 4.3 혜택 수 (`benefit_count`, `loadBenefitCounts`)

4개 소스에서 브랜드를 역추적해 셉니다.

| 소스 | 귀속 방법 |
|------|-----------|
| 쿠폰 | `coupons.scope_json` → `{"include":{"brandIds":[…]}}` (진행 중 + ACTIVE) |
| 기획전 | `exhibition.brand_category_id` **또는** 편성 상품의 `products.brand_category_id` 로 역추적. **`exhibition_type='SPECIALTY'`(전문관)는 제외** — 전문관은 브랜드 행사가 아니라 카테고리 축이라, 넣으면 '뷰티관' 하나가 브랜드 9개의 혜택으로 잡힙니다 |
| 쇼핑특가 | `deal_item` → `products.brand_category_id` (진행 중) |
| 공동구매 | `group_buy_product` → `products.brand_category_id` (PUBLISHED + 기간 내) |

### 4.4 `brand_category_stat`

브랜드 × 상품카테고리는 **매핑 테이블 없이 `products` 조인으로 도출**됩니다. 각 행에 `root_cat_id`(루트 카테고리)를 함께 적재해 고객 화면의 "루트 카테고리 탭"이 조인 없이 읽습니다. 최빈 카테고리는 `brand_stat.top_category_id` 로 승격됩니다.

---

## 5. 고객 화면

### 5.1 브랜드 홈 `/brands` (`brandController.getHome`)

| 블록 | 서비스 함수 |
|------|-------------|
| 인기 브랜드 쇼케이스(상품 캐러셀) | `getShowcaseBrands` — 인기 후보 중 상품 4개 이상인 브랜드만 |
| 인기 브랜드 | `getPopular` |
| 신규 입점 브랜드 | `getNewBrands` |
| 루트 카테고리별 브랜드 | `getBrandsByRootCategory` (`?root=` 탭) |
| 이번 주 혜택 슬라이더 | `benefitService.getWeeklyBenefits` |
| 전체 목록 | `listBrands` (`?initial=` 초성 · `?sort=` · `?page=`) |

- **정렬 `sort`:** `count`(기본, 상품많은순) / `popular` / `name` / `new`
- **필터 `initial`:** 초성/알파벳/`#` 버킷 (`INITIAL_BUCKETS`)
- **인기 브랜드 폴백 사다리** (`getPopular`, `brandService.js:130-183`) — 몰2는 전 브랜드가 0점이라 그대로 쓰면 섹션이 빈 화면이 됩니다.
  1. `popularity_score > 0` 인 브랜드
  2. 모자라면 `product_count DESC`
  3. 그래도 모자라면 `last_product_at DESC`
  데이터가 쌓이면 자연스럽게 1단계가 지배합니다.
- **신규 입점 폴백:** `onboarded_at >= CURDATE() - 180일` 이 0건이면 **최신 입점 순으로라도** 채웁니다.

### 5.2 브랜드 검색 `/brands/search.json?q=`

`brandService.searchBrands` — 이름·영문명·별칭·**초성**(`initial_chosung`) LIKE.

### 5.3 브랜드 상세관 `/brands/:brandId` (`?tab=`)

| 탭 | 내용 |
|----|------|
| `home` (기본) | 요약 — 베스트 6 + 신상품 6 + 혜택. 상품이 3개 이하면 전체 목록도 함께 |
| `best` | 브랜드 베스트 30 |
| `new` | 신상품 40 |
| `all` | 전체 목록 (`?cat=` 카테고리, `?sort=` new/popular/low/high, 페이징) |
| `benefit` | 쿠폰·기획전·특가·공동구매 |

- **베스트 탭(`getBrandBest`)의 2단 구조:** `best_group(group_type='BRAND', ref_id=brandId, is_active=1)` 이 있으면 **랭킹 엔진 스냅샷을 그대로** 씁니다(MD 픽 병합 포함). 없거나 비었으면 **조회수 순 폴백**입니다. 브랜드가 1,390개라 전건에 그룹을 만들 수는 없습니다.
- 관련 브랜드: `brand_stat.top_category_id` 가 같고 가격대(`max_price`)가 비슷한 브랜드.

### 5.4 이번 주 혜택 (`benefitService.getWeeklyBenefits`)

`brand_stat.benefit_count > 0` 인 브랜드를 뽑아 **쿠폰·기획전·특가·공동구매를 통합**해 슬라이더로 보여줍니다. **브랜드당 1건**만 노출합니다(같은 브랜드가 슬라이더를 도배하지 않게).

**기획전 브랜드 귀속:** `exhibition.brand_category_id`(선택 컬럼)를 지정하면 그 기획전이 브랜드 허브·상세관 혜택에 노출됩니다.

### 5.5 SDUI 리졸버 `new_brand_list` (`services/display/resolvers/new_brand_list.js`)

홈 등 SDUI 페이지에 꽂는 **신규 입점 브랜드** 섹션 리졸버입니다. 판정은 `newArrival.newBrandPredicate('c')`(= `categories.onboarded_at` 기준, 기본 180일)를 씁니다 — 브랜드 허브의 `getNewBrands`(180일 하드코딩)와 달리 **`system_settings.new_brand_days` 를 실제로 읽습니다**(§7 참고).

- `config.maxCount`(기본 8, 최대 24) 브랜드를 `onboarded_at DESC` 로, 각 브랜드의 대표 상품 `config.productCount`(기본 3, 최대 6, 0이면 미노출)를 `newArrival.newProductOrder('p')` 순으로 함께 싣습니다.
- 대표 상품은 신상품일 필요가 없습니다(갓 입점한 브랜드의 얼굴이면 됨). `type='BRAND' AND is_active=1 AND mall_id=?` 로 스코프.
- **신규 입점 브랜드가 0곳이면 `null` 을 반환**해 섹션 렌더를 통째로 건너뜁니다. 기존 브랜드 대부분이 `onboarded_at` NULL 이라, 관리자가 입점일을 넣기 전까지 이 섹션은 비어 있습니다.

### 5.6 사이트맵의 브랜드 (`routes/sitemap.js`)

`/sitemap.xml` 은 **기본몰(`mall.is_default=1`)의 브랜드만** 싣습니다(`sitemap.js:33-62`). 크롤러는 세션이 없어 기본몰로 보므로, 다른 몰의 `/brands/:id` 를 실으면 기본몰에서 열리지 않는 URL 을 색인시키기 때문입니다. 기본몰의 `type='BRAND'` 전 브랜드가 `/brands/{id}`(priority 0.7)로 들어갑니다.

---

## 6. DB

### 6.1 `categories` (type='BRAND') — 코드가 참조하는 컬럼

`id`, `mall_id`, `name`, `type='BRAND'`, `logo_image_path`, `description`, `is_active`, `display_order`, **`onboarded_at`**(입점일 — 신규 브랜드 판정의 유일한 앵커)

### 6.2 `brand_profile` (PK = `category_id`, FK CASCADE)

| 컬럼 | 설명 |
|------|------|
| category_id | PK. `categories.id` |
| mall_id | |
| name_en / alias | 영문명 / 콤마 구분 별칭 (검색 대상) |
| initial | 초성 인덱스 버킷 (ㄱ~ㅎ / A~Z / #) |
| initial_chosung | **초성 검색용** (나이키 → ㄴㅇㅋ). 저장 시 이름에서 항상 재계산 |
| tagline / story / country | |
| official_yn | 공식 브랜드 여부 |
| shop_enabled | 공식 브랜드관 확장 활성 |
| hero_image_url | |
| seo_title / seo_description | 상세관 SEO (비면 자동 생성) |
| seller_name / is_seller | `products.provider` 유래. 브랜드가 아닌 입점 셀러 표시 |
| approved_at | (관리자 폼에서 쓰지 않음) |

### 6.3 `brand_stat` (PK = `category_id`) — 집계 캐시

`product_count`, `new_count`(최근 30일 신상품), `top_category_id`, `min_price`, `max_price`, `view_score`, `sales_count`, `like_count`, `brand_like_count`, `cart_count`, **`popularity_score`**(decimal), `benefit_count`, `rep_product_ids`(JSON — 타일 썸네일용 대표 상품 4개), `last_product_at`, `calculated_at`

### 6.4 `brand_category_stat` (PK = `mall_id, category_id, cat_id`)

`category_id`(브랜드), `cat_id`(상품 카테고리), `root_cat_id`(루트), `product_count`

### 6.5 `brand_likes`

`user_id`, `category_id` — 브랜드 찜 (`controllers/likeController.js`)

---

## 7. 주의사항

- **집계는 자동으로 갱신되지 않습니다.** cron 이 없습니다. 상품을 대량 등록·삭제했으면 `/admin/brands` 의 재계산 버튼을 누르거나 `scripts/recalc_brand_stat.js` 를 돌려야 합니다. 그때까지 브랜드 허브의 상품 수·인기 순위는 옛날 값입니다. 목록 상단의 `calculated_at` 이 그 근거입니다.
- **상품 0건 브랜드는 `brand_stat` 에서 사라집니다.** `getPopular` 등 브랜드 허브의 모든 쿼리가 `brand_stat` 을 `FROM` 으로 잡으므로, 상품이 없는 브랜드는 고객 화면에 **아예 나오지 않습니다**(관리자 목록에는 LEFT JOIN 이라 남습니다).
- **`services/display/resolvers/brand_carousel.js` 는 아직 `brand_stat` 으로 전환되지 않았습니다.** 여전히 `categories LEFT JOIN products … GROUP BY` 로 매 요청 집계합니다. 홈에 이 섹션을 쓰면 브랜드 캐러셀 하나 때문에 상품 전건 조인이 돕니다.
- **브랜드 찜에 몰 검증이 없습니다.** `controllers/likeController.js:52-55` 의 `toggleBrandLike` 는 `SELECT id FROM categories WHERE id = ? AND type = 'BRAND'` 만 확인하고 **`mall_id` 를 보지 않습니다.** 다른 몰의 브랜드도 찜할 수 있습니다.
- **브랜드 베스트는 수동 시드에 의존합니다.** `best_group(group_type='BRAND')` 자동 생성 배치가 없습니다(`scripts/seed_best_brand_groups.sql` 로 10건만 시드). 그룹이 없는 브랜드는 **조회수 순 폴백**이라 "베스트"라기엔 약합니다.
- **`brand_stat.new_count` 의 30일은 `system_settings.new_brand_days`(기본 180)와 무관합니다.** 전자는 `brandStatService.NEW_DAYS` 상수(브랜드의 최근 신상품 수), 후자는 `services/catalog/newArrival.js` 가 읽는 **신규 입점 브랜드** 판정 기간입니다. 또한 브랜드 홈의 `getNewBrands(mallId, 6)` 은 서비스 기본값 **180일 하드코딩**을 쓰고 `new_brand_days` 를 읽지 않습니다 — 설정을 바꿔도 `/brands` 홈의 신규 입점 섹션은 반응하지 않습니다(SDUI `new_brand_list` 섹션만 반응).
- **미구현:** `/admin/brands/merge`(중복 브랜드 병합, 2차), 브랜드 엑셀 일괄 등록.

---

*Last Updated: 2026-07-23*
