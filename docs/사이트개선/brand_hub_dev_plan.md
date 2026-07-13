# 브랜드 허브 재설계 계획서

> 작성 2026-07-13 · 대상 `/brands` 및 브랜드 상세관
> 상태: 설계 확정 → 1차 개발 착수

---

## 0. 왜 다시 만드는가

현재 `/brands` 는 **로고 카드 그리드 하나**다. `controllers/brandController.js` 가 `categories WHERE type='BRAND' AND mall_id=?` 를 통째로 SELECT 해서 `views/user/brands/list.ejs` 에 뿌리고, `/brands/:id` 는 페이지가 아니라 `/products/brand/:id` 로 302 리다이렉트한다. 즉 **브랜드 상세관이라는 것이 존재하지 않고**, 브랜드 메뉴는 상품 목록의 필터 링크 모음에 지나지 않는다.

데이터를 보면 이 화면이 성립할 수 없다는 게 분명하다.

| 사실 | 수치 | 의미 |
|---|---|---|
| 몰1(건강식품관) 브랜드 | 25개, **로고 25/25** | 로고 그리드가 성립하는 유일한 몰 |
| 몰2(종합관) 브랜드 | 1,354개, **로고 0/1354** | 로고 그리드가 **원리적으로 불가능**. 지금은 빈 카드 1,354개를 한 페이지에 렌더 |
| 몰2 브랜드 중 상품 1개짜리 | 599개 (44%) | 목록의 절반이 탐색 가치가 없는 잡음 |
| 브랜드/셀러 혼재 | 나이키·LG전자(브랜드) vs 오너클랜·에이치플러스몰·셀렙샵에디션(입점 셀러) | `products.provider` 를 그대로 브랜드로 밀어넣은 결과 |
| `onboarded_at` | 전 몰 **0건** | "신규 입점 브랜드" 섹션이 렌더할 데이터가 없음 |
| 브랜드 찜(`brand_likes`) | **0건** | 기능은 있으나 죽어 있음 |
| 주문(`orders`) | **22건** | 판매 기반 인기 점수가 사실상 0 신호 |

**결론: 로고 의존을 버리고, 브랜드를 "탐색 가능한 주체"로 재구성한다.**

---

## 1. 브랜드 메뉴의 정의

> **입점 브랜드를 검색하고, 브랜드별 상품·신상품·베스트·쿠폰·기획전을 통합 탐색하는 브랜드 전용 허브.**

브랜드 메뉴는 상품 카테고리의 복사본이 아니다. 담당하는 고객은 다음과 같다.

1. 특정 브랜드 제품을 먼저 찾는 고객
2. 신뢰하는 브랜드만 비교하려는 고객
3. 브랜드의 신상품·베스트를 한 번에 보려는 고객
4. 공식 입점 여부를 확인하려는 고객
5. 브랜드별 쿠폰·기획전을 찾는 고객

### 1-1. 브랜드 ≠ 전문관(몰)

| 구분 | 브랜드 | 전문관(`mall`) |
|---|---|---|
| 분류 기준 | 파는 주체(브랜드·제조사·입점 셀러) | 카테고리·고객 목적 |
| 예시 | 나이키관, LG전자관, 백세식품관 | 건강식품관, 종합관 |
| 상품 범위 | 해당 브랜드 상품 | 여러 브랜드 상품 |
| 데이터 | `categories.type='BRAND'` | `mall` 테이블 (2행) |

**전문관은 브랜드의 상위 스코프다.** 브랜드 허브의 모든 쿼리는 현재 `mall_id` 로 스코프된다. 두 메뉴를 통합하지 않는다.

---

## 2. 정보 구조

```
브랜드 홈 /brands
├─ ① 브랜드 검색          (한글명·영문명·별칭·초성)
├─ ② 인기 브랜드          (전체 / 카테고리별 / 급상승)
├─ ③ 신규·주목 브랜드      (입점일 기준)
├─ ④ 카테고리별 브랜드     (패션·뷰티·리빙…)
├─ ⑤ 진행 중 브랜드 혜택   (쿠폰·기획전·특가·공동구매)
└─ ⑥ 전체 브랜드          (초성 인덱스 + 정렬 + 페이지네이션)

브랜드 상세관 /brands/:id
├─ 헤더 (로고·브랜드명·한줄소개·공식 배지·관심 브랜드·사용 가능 쿠폰)
├─ 탭: 홈 | 베스트 | 신상품 | 전체 상품 | 혜택
└─ 하단: 관련 브랜드
```

---

## 3. 브랜드 타일 — 이 설계의 핵심 컴포넌트

로고가 없는 몰2를 살리는 유일한 방법은 **상품 이미지로 브랜드를 시각화**하는 것이다.

```
로고 있음 (몰1)              로고 없음 (몰2)
┌──────────────┐            ┌──────────────┐
│              │            │  ▣▣  │  ▣▣  │   ← 대표 상품 썸네일 4장
│   [ 로고 ]   │            │──────┼──────│      (판매순/신상품순 상위)
│              │            │  ▣▣  │  ▣▣  │
├──────────────┤            ├──────────────┤
│ 백세식품   ♡ │            │ 나이키     ♡ │
│ 상품 171개   │            │ 상품 87개    │
│ 공식 ✔ 혜택2 │            │ 스포츠·잡화  │
└──────────────┘            └──────────────┘
```

**단일 컴포넌트 `partials/brand/tile.ejs` 가 로고 유무에 따라 우아하게 degrade 한다.** 몰1은 로고관, 몰2는 썸네일 디렉터리가 되지만 코드는 하나다. `products.main_image` / `thumbnail_image` 는 전 상품에 존재한다.

타일이 노출하는 정보:
- 로고 또는 썸네일 모자이크
- 브랜드명
- 상품 수
- 대표 카테고리 (몰2, 로고 없을 때 정체성 보조)
- 공식 배지 (`official_yn`)
- 진행 중 혜택 수
- 관심 브랜드(♡) 토글

---

## 4. DB 설계

### 4-1. 브랜드 마스터 — `categories(type='BRAND')` 유지 + `brand_profile` 1:1 확장

별도 `brand` 테이블로 갈아엎지 **않는다.** 아래가 전부 `categories.id` 를 참조하고 있어 전면 마이그레이션이 되기 때문이다.

- `products.brand_category_id`
- `coupons.scope_json` → `{"include":{"brandIds":[11]}}`
- `best_group.ref_id` (`group_type='BRAND'`)
- `brand_likes.category_id`
- `custom_menu.link_target` (`link_type='BRAND'`)

대신 브랜드 전용 속성만 담는 확장 테이블을 신설한다. **기존 코드는 한 줄도 깨지지 않는다.**

```sql
CREATE TABLE brand_profile (
  category_id      INT          NOT NULL PRIMARY KEY,   -- categories.id (type='BRAND')
  mall_id          BIGINT       NOT NULL DEFAULT 1,
  name_en          VARCHAR(100) NULL,                   -- NIKE
  alias            VARCHAR(255) NULL,                   -- 나이키코리아,나이키 공식 (콤마 구분)
  initial          VARCHAR(8)   NULL,                   -- ㄴ / N / #  (초성 인덱스)
  initial_chosung  VARCHAR(32)  NULL,                   -- ㄴㅇㅋ (초성 검색용)
  tagline          VARCHAR(200) NULL,                   -- 한 줄 소개
  story            TEXT         NULL,                   -- 브랜드 스토리 (공식관)
  country          VARCHAR(50)  NULL,
  official_yn      TINYINT(1)   NOT NULL DEFAULT 0,     -- 공식 브랜드관 여부
  shop_enabled     TINYINT(1)   NOT NULL DEFAULT 0,     -- 공식관 확장 페이지 활성
  hero_image_url   VARCHAR(500) NULL,
  seo_title        VARCHAR(200) NULL,
  seo_description  VARCHAR(300) NULL,
  seller_name      VARCHAR(100) NULL,                   -- 입점 셀러(=provider)
  is_seller        TINYINT(1)   NOT NULL DEFAULT 0,     -- 브랜드가 아니라 입점 셀러인가
  approved_at      DATETIME     NULL,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mall_initial (mall_id, initial),
  KEY idx_official (mall_id, official_yn),
  CONSTRAINT fk_brand_profile_cat FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE CASCADE
);
```

- **입점일은 `categories.onboarded_at`(기존 컬럼)을 계속 쓴다.** 관리자 브랜드 탭이 이미 저장 로직을 갖고 있다(`controllers/admin/categoryController.js:188,242`). 중복 신설하지 않는다.
- `is_seller` 로 브랜드(나이키)와 입점 셀러(오너클랜)를 구분한다. **1차에서는 화면을 분리하지 않고 통합 디렉터리로 진열**하되, 배지로만 구분한다. 데이터가 쌓이면 2차에서 탭 분리를 검토한다.
- `initial` 은 앱에서 브랜드명으로 자동 산출해 백필한다(초성 추출 유틸).

### 4-2. `brand_stat` — 집계 캐시 (성능의 근간)

브랜드 홈 6개 섹션이 매 요청마다 9,677개 상품에 조인하면 화면이 죽는다. (실제로 `/admin/categories` 가 브랜드 1,354개에서 이미 터진 전례가 있다 — `docs/develop_guide/admin/categories.md:47`)

```sql
CREATE TABLE brand_stat (
  category_id       INT      NOT NULL PRIMARY KEY,
  mall_id           BIGINT   NOT NULL,
  product_count     INT      NOT NULL DEFAULT 0,   -- 판매중 상품 수
  new_count         INT      NOT NULL DEFAULT 0,   -- 최근 N일 신상품 수
  top_category_id   INT      NULL,                 -- 대표 카테고리 (최빈)
  min_price         INT      NULL,
  max_price         INT      NULL,
  view_score        INT      NOT NULL DEFAULT 0,   -- Σ products.view_count
  sales_count       INT      NOT NULL DEFAULT 0,   -- Σ order_items
  like_count        INT      NOT NULL DEFAULT 0,   -- Σ likes(상품찜)
  brand_like_count  INT      NOT NULL DEFAULT 0,   -- brand_likes
  cart_count        INT      NOT NULL DEFAULT 0,   -- Σ carts
  popularity_score  DECIMAL(12,2) NOT NULL DEFAULT 0,
  benefit_count     INT      NOT NULL DEFAULT 0,   -- 진행 중 혜택 수
  rep_product_ids   JSON     NULL,                 -- 타일 썸네일용 대표 상품 4개
  last_product_at   DATETIME NULL,
  calculated_at     DATETIME NOT NULL,
  KEY idx_mall_pop (mall_id, popularity_score DESC),
  KEY idx_mall_count (mall_id, product_count DESC),
  KEY idx_mall_topcat (mall_id, top_category_id)
);
```

`brand_category` 다대다 매핑 테이블은 **만들지 않는다.** `products` 가 `brand_category_id` 와 `category_id` 를 둘 다 갖고 있고 `category_id` 결측이 0건이라, 다대다 관계는 조인으로 완전히 도출된다. 배치가 이를 `brand_stat.top_category_id` 와 별도 `brand_category_stat`(브랜드×카테고리 상품수)로 물질화한다.

```sql
CREATE TABLE brand_category_stat (
  mall_id       BIGINT NOT NULL,
  category_id   INT    NOT NULL,   -- 브랜드
  cat_id        INT    NOT NULL,   -- 상품 카테고리
  root_cat_id   INT    NOT NULL,   -- 루트 카테고리 (패션/뷰티/리빙)
  product_count INT    NOT NULL,
  PRIMARY KEY (mall_id, category_id, cat_id),
  KEY idx_root (mall_id, root_cat_id, product_count DESC)
);
```

### 4-3. 인기 점수 — **폴백 사다리를 반드시 둔다**

스펙의 점수식은 그대로 채택한다.

```
popularity_score = w_view  × view_score
                 + w_like  × like_count
                 + w_blike × brand_like_count
                 + w_cart  × cart_count
                 + w_sales × sales_count
```

가중치는 `best_score_config`(몰별, `weight_sales=5 / weight_like=3 / weight_view=0`)를 재사용·확장한다.

> ⚠️ **현실**: 주문 22건, 브랜드찜 0건, 상품찜 소량. 지금 이 식을 그대로 쓰면 **거의 모든 브랜드가 0점**이고 인기 브랜드 섹션은 빈 화면이 된다.
>
> **폴백 사다리 (필수 구현):**
> 1. `popularity_score > 0` 인 브랜드를 우선 채운다.
> 2. 부족하면 `product_count DESC` 로 보충한다.
> 3. 그래도 부족하면 `last_product_at DESC` (최근 상품 등록) 로 보충한다.
>
> 이 폴백이 없으면 인기 브랜드는 **비어 보이고**, 있으면 "상품 많은 브랜드"라도 보여준다. 데이터가 쌓이면 자연스럽게 1번이 지배한다.

**급상승 브랜드**: `brand_stat` 스냅샷을 일 단위로 `brand_stat_daily` 에 적재해 전일 대비 점수 상승률로 산출한다. **2차 확장**으로 미룬다(현재 신호 부족).

### 4-4. 브랜드 ↔ 혜택 연결 — **DB 변경 최소**

`exhibition_product` · `deal_item` · `group_buy_product` 가 **전부 `product_id` 를 갖고 있다.** 따라서 상품 → `brand_category_id` 역추적만으로 "이 브랜드의 진행 중 혜택"이 나온다. 매핑 테이블 불필요.

| 혜택 | 테이블 | 브랜드 연결 |
|---|---|---|
| 쿠폰 | `coupons.scope_json` | **이미 있음** — `{"include":{"brandIds":[11]}}` (실제 "백세식품 브랜드 쿠폰" 존재) |
| 기획전 | `exhibition` + `exhibition_product` | `exhibition_type='BRAND'` 행이 이미 있으나 **어느 브랜드인지 컬럼이 없다** → `exhibition.brand_category_id` 신설 |
| 특가 | `deal` + `deal_item` | 상품 역추적 |
| 공동구매 | `group_buy` + `group_buy_product` | 상품 역추적 |
| 라이브 | **없음** | 테이블·코드 부재 → **3차로 미룸** |

```sql
ALTER TABLE exhibition
  ADD COLUMN brand_category_id INT NULL AFTER exhibition_type,
  ADD KEY idx_ex_brand (mall_id, brand_category_id);
-- exhibition_type='BRAND' 일 때 관리자 저장 시 필수 검증
```

### 4-5. 브랜드 베스트 — **이미 계산되고 있다**

`best_group.group_type='BRAND'` 가 몰당 5개씩 시드돼 있고 `best_ranking` 에 브랜드별 랭킹이 **이미 적재돼 있다**(백세식품 400행, LG전자 400행, 나이키 348행 등).

즉 브랜드 상세관의 "베스트" 탭은 **랭킹 엔진을 그대로 재사용**한다. 다만 5개 브랜드만 그룹이 있으므로:

- 상품 수가 임계치(예: 10개) 이상인 브랜드는 `best_group(group_type='BRAND')` 을 **자동 생성**하도록 배치를 확장한다.
- 그룹이 없는 소형 브랜드는 베스트 탭 대신 `products` 정렬(판매순/조회순)로 폴백한다.

---

## 5. 화면 설계

### 5-1. 브랜드 홈 `/brands`

```
┌────────────────────────────────────────────────────────┐
│  브랜드                                                 │
│  ┌────────────────────────────────────────────────┐   │
│  │ 🔍 브랜드명·초성으로 검색  (나이키, NIKE, ㄴㅇㅋ)  │   │
│  └────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────┤
│  인기 브랜드                          [전체] [카테고리별] │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│  │ 1  │ │ 2  │ │ 3  │ │ 4  │ │ 5  │ │ 6  │  → 가로스크롤 │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘            │
├────────────────────────────────────────────────────────┤
│  신규 입점 브랜드                              전체보기 > │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ [타일]   │ │ [타일]   │ │ [타일]   │  입점일·대표상품 │
│  └──────────┘ └──────────┘ └──────────┘               │
├────────────────────────────────────────────────────────┤
│  카테고리별 브랜드                                       │
│  [패션] [뷰티] [리빙] [가전] [식품] …   ← 루트 카테고리 탭 │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘            │
├────────────────────────────────────────────────────────┤
│  이번 주 브랜드 혜택                            전체보기 > │
│  ├ 백세식품 브랜드 위크 — 최대 30%        [기획전]        │
│  ├ 백세식품 브랜드 쿠폰 3,000원           [쿠폰]         │
│  └ LG전자 타임특가                         [특가]         │
├────────────────────────────────────────────────────────┤
│  전체 브랜드 (1,354)                                    │
│  ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ │ A B C … Z │ # │
│  [상품많은순] [가나다순] [신규순]                        │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘            │
│                    ‹ 1 2 3 … 23 ›                      │
└────────────────────────────────────────────────────────┘
```

**전체 브랜드 기본 정렬은 `상품많은순`이다.** 가나다순을 기본으로 두면 몰2에서 상품 1개짜리 잡음(599개, 44%)이 첫 화면을 덮는다.

### 5-2. 브랜드 상세관 `/brands/:id` — 리다이렉트 폐기

```
┌────────────────────────────────────────────────────────┐
│  [히어로 배너 — hero_image_url, 없으면 생략]             │
├────────────────────────────────────────────────────────┤
│  ┌──────┐  나이키  NIKE          [공식 ✔]              │
│  │ 로고 │  세상에 없던 스포츠                            │
│  │      │  상품 87개 · 스포츠/잡화                       │
│  └──────┘                        [♡ 관심 브랜드]        │
│  ┌──────────────────────────────────────────────┐     │
│  │ 🎟 사용 가능한 쿠폰 2장   [받기]                │     │
│  └──────────────────────────────────────────────┘     │
├────────────────────────────────────────────────────────┤
│  [ 홈 ] [ 베스트 ] [ 신상품 ] [ 전체 상품 ] [ 혜택 ]      │
├────────────────────────────────────────────────────────┤
│  (홈 탭)                                                │
│   진행 중 혜택 →  베스트 6 →  신상품 6 →  카테고리 바로가기 │
├────────────────────────────────────────────────────────┤
│  관련 브랜드                                            │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐   같은 카테고리·유사 가격대  │
└────────────────────────────────────────────────────────┘
```

- **홈 탭**은 나머지 탭의 요약이다. 상품이 적은 브랜드(1~3개)는 탭 없이 전체 상품만 보여준다.
- **베스트 탭**: `best_ranking` (group_type='BRAND') → 없으면 판매순 폴백
- **신상품 탭**: `products ORDER BY created_at DESC`
- **전체 상품 탭**: 기존 `/products/brand/:id` 로직 재사용 + 브랜드 내 카테고리 필터
- **혜택 탭**: 쿠폰·기획전·특가·공동구매 통합
- **관련 브랜드**: `brand_category_stat` 의 `top_category_id` 동일 + 가격대 유사

> `/products/brand/:id` 는 **유지**한다(사이트맵·기존 링크·`custom_menu` 가 참조). 브랜드 상세관의 "전체 상품" 탭이 이 경로를 가리킨다.

### 5-3. 브랜드 검색

`search_logs` 와 별개로, 브랜드 검색은 다음을 대상으로 한다.

| 입력 | 매칭 대상 |
|---|---|
| `나이키` | `categories.name` |
| `NIKE` | `brand_profile.name_en` |
| `나이키코리아` | `brand_profile.alias` |
| `ㄴㅇㅋ` | `brand_profile.initial_chosung` |

브랜드 1,354개는 `LIKE '%키워드%'` 로 충분하다(FULLTEXT 불필요). 자동완성은 `brand_stat` 조인으로 상품수·혜택수를 함께 반환한다.

```
[로고] 나이키                    ← 검색 결과 행
       공식 브랜드관 · 상품 87개 · 진행 중 혜택 3개   ♡
```

### 5-4. 공식 브랜드관 vs 일반 브랜드 페이지

**모든 브랜드는 기본 페이지를 자동 생성**한다(상품 데이터만으로). `official_yn=1` + `shop_enabled=1` 인 브랜드만 확장 요소를 켠다.

| | 일반 브랜드 페이지 | 공식 브랜드관 |
|---|---|---|
| 로고·브랜드명·상품목록·베스트·신상품 | ✔ 자동 | ✔ |
| 히어로 배너 | — | ✔ `hero_image_url` |
| 브랜드 스토리 | — | ✔ `story` |
| 공식 배지 | — | ✔ |
| 전용 기획전·단독 상품 | — | ✔ |
| 커스텀 섹션(페이지빌더) | — | **3차** |

---

## 6. 관리자 기능

### 6-1. 브랜드 관리 화면 신설 `/admin/brands`

현재 브랜드는 `/admin/categories` 의 "브랜드" 탭으로만 관리된다(`docs/사이트개선/admin_dev_plan.md:353`). 카테고리 트리 UI 안에서는 `brand_profile` 의 확장 속성을 다룰 수 없다. **전용 화면을 신설한다.**

```
/admin/brands            목록 (검색·정렬·공식여부·상품수·혜택수)
/admin/brands/:id/edit   기본정보 + 운영정보 + 연관정보 탭
/admin/brands/merge      중복 브랜드 병합
```

- 기본정보: 한글명(=`categories.name`) · 영문명 · 별칭 · 초성 · 로고 · 소개 · 국가 · 공식여부 · 노출순서 · 입점일
- 운영정보: 공식관 활성 · 히어로 이미지 · 스토리 · SEO · 셀러 구분(`is_seller`)
- 연관정보: 카테고리(파생, 읽기전용) · 쿠폰 · 기획전 · 관련 브랜드

`/admin/categories` 의 브랜드 탭은 **유지**하되(계층·활성 관리), 상세 편집은 `/admin/brands` 로 링크한다.

### 6-2. 브랜드 등록 프로세스 (2차)

브랜드명을 자유 텍스트로 입력하면 `Nike / NIKE / 나이키 / 나이키코리아` 로 분산된다. 현재 실제 중복은 1건("클린향수" vs "클린 향수")뿐이라 급하지 않지만, 상품 등록 UI를 **브랜드 마스터 선택 방식**으로 바꾼다.

```
상품 등록 → 브랜드 검색(마스터) → 선택
                              └ 없으면 신규 브랜드 신청 → 관리자 검토·병합 → 마스터 등록
```

`/admin/brands/merge` 는 A 브랜드를 B 로 병합하며 `products.brand_category_id`, `brand_likes.category_id`, `best_group.ref_id`, `coupons.scope_json.brandIds` 를 일괄 이관한다.

---

## 7. 관심 브랜드 활성화

`brand_likes` 테이블과 토글 API(`POST /likes/brand/toggle`), 마이페이지(`/mypage/brand-likes`)가 **이미 있다.** 등록 0건인 이유는 브랜드 화면 자체가 무가치했기 때문이다.

브랜드 허브가 살아나면 관심 브랜드를 연결한다.

```
마이페이지 > 관심 브랜드
├─ 최근 신상품     (관심 브랜드의 products ORDER BY created_at)
├─ 사용 가능한 쿠폰 (coupons.scope_json.brandIds ∩ 관심 브랜드)
└─ 진행 중 행사     (기획전·특가·공동구매)
```

알림(신상품·쿠폰·재입고·가격인하)은 발송 인프라(`emailService`)가 있으나 **2차로 미룬다.**

---

## 8. 변경 파일

### 신규

| 파일 | 내용 |
|---|---|
| `scripts/migrate_brand_hub.sql` | `brand_profile` · `brand_stat` · `brand_category_stat` · `exhibition.brand_category_id` |
| `scripts/backfill_brand_profile.js` | 1,379개 브랜드의 `initial` · `initial_chosung` · `seller_name` 백필 |
| `scripts/recalc_brand_stat.js` | `brand_stat` · `brand_category_stat` 재계산 배치 |
| `services/brand/brandService.js` | 목록·검색·상세·인기(폴백 사다리)·관련 브랜드 |
| `services/brand/brandStatService.js` | 집계 배치 로직 |
| `services/brand/benefitService.js` | 브랜드 혜택 통합 조회(쿠폰·기획전·특가·공동구매) |
| `shared/hangul.js` | 초성 추출 유틸 |
| `views/user/brands/home.ejs` | 브랜드 홈 (6영역) |
| `views/user/brands/detail.ejs` | 브랜드 상세관 (탭) |
| `views/partials/brand/tile.ejs` | 브랜드 타일 (로고/썸네일 degrade) |
| `views/partials/brand/initial_index.ejs` | 초성 인덱스 |
| `controllers/admin/brandController.js` | 관리자 브랜드 CRUD |
| `routes/admin/brands.js` | `/admin/brands` |
| `views/admin/brands/{list,form}.ejs` | 관리자 브랜드 화면 |

### 수정

| 파일 | 변경 |
|---|---|
| `controllers/brandController.js` | `getList` → 브랜드 홈. `redirectToBrandProducts` → **`getDetail`(상세관)** 으로 교체 |
| `routes/brands.js` | `/`, `/:id`, `/:id/:tab`, `/search`(자동완성 JSON) |
| `views/user/brands/list.ejs` | 폐기 → `home.ejs` 로 대체 |
| `services/display/resolvers/brand_carousel.js` | `brand_stat` 조인으로 전환(성능) |
| `services/display/resolvers/new_brand_list.js` | `onboarded_at` 백필 후 동작 |
| `controllers/admin/categoryController.js` | 브랜드 탭에서 `/admin/brands` 로 링크 |
| `routes/sitemap.js` | 브랜드 쿼리에 **`mall_id` 필터 누락** — 수정 |

---

## 9. 단계

### 1차 MVP (이번 작업)

1. **DB** — `brand_profile` · `brand_stat` · `brand_category_stat` 생성, `exhibition.brand_category_id` 추가
2. **백필** — 초성·영문명·셀러 구분, `brand_stat` 최초 계산
3. **브랜드 타일** — 로고/썸네일 degrade 컴포넌트
4. **브랜드 홈** — 검색 / 인기(폴백) / 신규 / 카테고리별 / 혜택 / 전체(초성+정렬+페이지네이션)
5. **브랜드 상세관** — 헤더 + 홈·베스트·신상품·전체상품·혜택 탭
6. **관심 브랜드** — 타일·상세관에 연결, 마이페이지 강화
7. **관리자 `/admin/brands`** — 목록 + 편집

> **입점일(`onboarded_at`) 백필이 선행돼야 "신규 입점 브랜드"가 렌더된다.** 실제 입점일 데이터가 없으므로, 1차에서는 **브랜드에 속한 최초 상품의 `created_at`** 을 입점일로 추정 백필하고, 관리자가 수정 가능하게 한다.

### 2차

- 브랜드 쿠폰 다운로드 · 기획전 명시적 연결 · 급상승 브랜드
- 관련 브랜드 추천 고도화 (함께 구매된 브랜드)
- 브랜드 알림 (신상품·쿠폰·재입고)
- 브랜드 등록 프로세스 · 중복 병합
- 브랜드/셀러 탭 분리 (데이터 축적 후 판단)

### 3차

- 공식 브랜드관 페이지빌더 (SDUI 커스텀 섹션)
- 브랜드 라이브 (테이블 신설 필요)
- 단독 상품·선출시 · 브랜드 성과 대시보드

---

## 10. 위험과 대응

| 위험 | 대응 |
|---|---|
| 몰2 로고 0개 | 썸네일 모자이크 폴백 (§3) — 설계의 전제 |
| 인기 점수 신호 0 | 폴백 사다리 (§4-3) — 없으면 빈 화면 |
| 브랜드 1,354개 렌더 | `brand_stat` 집계 + 페이지네이션 (§4-2) |
| 상품 1개짜리 44% | 기본 정렬 = 상품많은순 (§5-1) |
| 브랜드/셀러 혼재 | `is_seller` 배지, 1차는 통합 진열 (§4-1) |
| 입점일 0건 | 최초 상품 `created_at` 추정 백필 (§9) |
| 몰2 상품 30% 브랜드 미지정 | `provider` 값도 없는 상품 → 브랜드 허브 대상 외. 별도 정비 과제 |
