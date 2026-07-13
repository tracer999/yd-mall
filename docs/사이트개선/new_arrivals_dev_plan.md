# 신상품 · 신규 입점 브랜드 재설계 개발 계획서

작성일: 2026-07-13 · 상태: **설계 확정 대기** (아래 "미결 사항" 승인 후 착수)

---

## 1. 배경 — 지금 "신상품"은 정의가 세 벌이다

| 지점 | 현재 판별 기준 | 문제 |
|---|---|---|
| GNB `/new` 페이지 | `product_badge` 에 `NEW` 포함 (관리자 수동 체크) | 등록해도 체크를 잊으면 신상품이 아니고, 체크하면 **영원히** 신상품 |
| 테마 카테고리 6번 | `theme_category_id=6` **OR** `product_themes(6)` **OR** NEW 뱃지 | `/new` 보다 넓은 집합 — 같은 이름, 다른 결과 |
| `/rss.xml` | `created_at DESC LIMIT 50` (뱃지 무시) | 뱃지 방식이 거부한 "자동 최신순"이 여기만 살아 있음 |

근거: `routes/feature.js:57`, `controllers/productController.js:104-108`·`180-182`, `routes/sitemap.js:207`.

직전 커밋 `e48ee05` 는 오늘특가·베스트를 **자동 판정 → 관리자 수동 큐레이션**으로 뒤집었다. 그 이유는 `created_at` 최신순으로 자르면 *"신상품 = 전체 카탈로그"* 가 되기 때문이다(`routes/feature.js:55-56` 주석). 이번 재설계는 그 판단을 뒤집는 게 아니라, **판정 앵커를 `created_at`(DB 적재 시각)에서 `sale_start_date`(관리자가 관리하는 판매 시작일)로 옮겨** 자동 판정을 가능하게 만드는 것이다. 판매 시작일은 관리자가 의미를 부여하는 필드이므로 "전체가 신상품" 문제가 재현되지 않는다.

브랜드 쪽은 더 단순하다 — **입점일을 저장할 곳이 아예 없다.** 브랜드는 별도 테이블이 아니라 `categories.type='BRAND'` 행이고(mall 1: 25건 / mall 2: 1354건), `categories` 에는 `created_at` 컬럼조차 없다.

---

## 2. 확정된 결정사항

1. **상품 신상품 = 판매 시작일 기준 100일 이내 (자동)**, 여기에 **관리자가 NEW 뱃지를 체크한 상품은 기간과 무관하게 강제 포함**(OR 조건). 자동을 원칙으로 하되 수동 강제노출 수단을 남긴다.
2. **신규 입점 브랜드는 별도 기간**을 쓰고, 그 기간은 `system_settings` 로 관리자가 조정한다(상품 100일과 독립).
3. `/new` 는 단순 상품 목록에서 **여러 섹션을 조립하는 랜딩 페이지**로 승격한다: 상단 배너 → 카테고리별 신상품 → 브랜드별 신상품 → 신규 입점 브랜드 리스트 → 전체 신상품 목록.

---

## 3. 스키마 변경

> ⚠️ 이 저장소는 **개발 DB 와 상용 DB 가 같다**(`dev_mall` @ ydata.co.kr). 모든 DDL 은 `/alter-table` 스킬로 DB 반영 + `tables.sql` 역반영을 함께 수행한다. `tables.sql` 은 이미 실제 DB 와 어긋나 있으므로(products 의 `mall_id`·`brand_category_id`·`visibility`·`badge_expire_date` 누락, categories 의 `type`·`logo_image_path` 주석 미갱신) 이번 작업에서 **해당 두 테이블만이라도 실제 DB 기준으로 교정**한다.

### 3-1. `products.sale_start_date`

```sql
ALTER TABLE products
  ADD COLUMN sale_start_date DATE NULL COMMENT '판매 시작일 (신상품 판정 기준)' AFTER status,
  ADD INDEX idx_products_sale_start (mall_id, sale_start_date);
```

- `DATE` 타입 (시각 불필요, 인덱스·비교 단순).
- **NULL 허용**. NULL 은 "판매 시작일 미지정" 이며 **신상품이 아니다**(안전한 기본값 — 자동으로 신상품이 되어 목록을 오염시키지 않는다).
- 인덱스는 `(mall_id, sale_start_date)` 복합 — 모든 조회가 몰 스코프를 타므로.

### 3-2. `categories.onboarded_at` (브랜드 입점일)

```sql
ALTER TABLE categories
  ADD COLUMN onboarded_at DATE NULL COMMENT '브랜드 입점일 (type=BRAND 에서만 의미)' AFTER logo_image_path,
  ADD INDEX idx_categories_onboarded (mall_id, type, onboarded_at);
```

- `categories` 는 NORMAL/THEME/BRAND 를 공유하는 테이블이므로 nullable 로 두고 **BRAND 행에서만 의미를 부여**한다(관리자 폼에서도 브랜드 탭에서만 노출).

### 3-3. `system_settings` 신규 2키

| 키 | 기본값 | 설명 |
|---|---|---|
| `new_product_days` | `100` | 판매 시작일로부터 N일 이내면 신상품 |
| `new_brand_days` | `180` | 입점일로부터 N일 이내면 신규 입점 브랜드 |

`loadSystemSettingsAndApplyEnv()` 가 `system_settings` 전 행을 `global.systemSettings` 에 담으므로 판정 모듈은 `global.systemSettings.new_product_days` 를 바로 읽는다. **`config/systemSettings.js` 의 `process.env` 매핑 추가는 불필요**(그 매핑은 외부 SDK 에 env 로 넘겨야 하는 키 전용). 값이 없거나 파싱 불가면 코드 기본값(100 / 180)으로 폴백한다. 편집 화면은 `/admin/sys-settings`.

---

## 4. 백필 — 여기가 이번 작업의 가장 큰 함정

`created_at` 을 그대로 `sale_start_date` 로 복사하면 **mall_id=2 가 통째로 신상품이 된다.**

```
mall_id=1 : 324건   (NEW 뱃지 10건)  created_at 2026-03-05 ~ 2026-07-10
mall_id=2 : 9,677건 (NEW 뱃지 200건) created_at 전부 2026-07-10  ← 대량 임포트
```

mall 2 의 9,677건은 전부 같은 날 적재된 임포트 데이터라 `created_at` 이 판매 시작일의 대리 지표로 전혀 쓸모없다. 따라서 백필을 몰별로 가른다.

| 대상 | 백필 정책 | 결과 |
|---|---|---|
| mall 1 상품 324건 | `sale_start_date = DATE(created_at)` | 2026-04-04 이후 등록분이 신상품으로 자동 인식(기준일 2026-07-13, 100일) |
| **mall 2 상품 9,677건** | **`sale_start_date = NULL` 유지** | 신상품 0건에서 시작. 관리자가 실제 판매 시작일을 넣거나 신규 등록분부터 채워진다 |
| BRAND 카테고리 1,379건 | `onboarded_at = NULL` 유지 | 신규 입점 브랜드 0건에서 시작 |

> **수용해야 할 초기 상태**: 백필 직후 mall 2 의 신상품과 전 몰의 신규 입점 브랜드 리스트는 **비어 있다**(NEW 뱃지가 걸린 상품만 강제노출로 나온다). 소급 판정할 근거 데이터가 존재하지 않기 때문이며, 이는 잘못된 날짜를 지어내는 것보다 낫다. 섹션은 0건일 때 **렌더 자체를 건너뛰도록**(빈 섹션 미노출) 구현한다.
>
> 운영 측에 필요한 것: mall 2 주력 상품과 주요 브랜드의 실제 판매 시작일 / 입점일을 채워 넣는 일회성 작업. 이를 위해 관리자 상품 목록에 **일괄 지정** 기능을 제공한다(§6-1).

마이그레이션 스크립트: `scripts/migrate_new_arrival_fields.js` (기존 `migrate_brand_categories.js` 패턴 — 컬럼 존재 여부를 확인하고 없을 때만 추가하는 멱등 스크립트).

---

## 5. 판정 로직은 단 한 곳에 — `services/catalog/newArrival.js`

현재 NEW 정의가 세 벌로 갈라진 게 문제의 근원이므로, 새 규칙은 **모듈 하나**에서만 정의하고 모든 소비처가 이를 재사용한다.

```js
// services/catalog/newArrival.js
// 신상품 판정: 판매시작일이 N일 이내이거나(자동), 관리자가 NEW 뱃지를 건 상품(수동 강제노출).
// 미래 날짜(예약 발매)는 아직 판매 전이므로 제외한다.
function newProductPredicate(alias = 'p') {
  const days = Number(global.systemSettings?.new_product_days) || 100;
  return {
    sql: `((${alias}.sale_start_date IS NOT NULL
            AND ${alias}.sale_start_date <= CURDATE()
            AND ${alias}.sale_start_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY))
           OR FIND_IN_SET('NEW', ${alias}.product_badge))`,
    params: [days]
  };
}

function newBrandPredicate(alias = 'c') { /* onboarded_at 기준, new_brand_days */ }
function isNewProduct(product) { /* 뷰 카드 뱃지 표시용 JS 판정 — 같은 규칙 */ }
```

**뱃지를 다시 쓰는(materialize) 방식은 채택하지 않는다.** 동적 술어로 계산하면 100일이 지난 상품이 배치 작업 없이 자동으로 빠지고, 관리자가 `new_product_days` 를 바꾸면 즉시 반영된다. 기존 `DEADLINE_SALE` 이 `badge_expire_date` 를 조회 시점에 검사하는 패턴(`productController.js:190`)과 동일한 결이다.

### 재사용처 (전부 이 모듈로 교체)

| 파일 | 현재 | 변경 |
|---|---|---|
| `controllers/productController.js:180-182` | `FIND_IN_SET('NEW', product_badge)` | `newProductPredicate()` |
| `controllers/productController.js:104-108` | 테마 6번 OR 조건 | 신상품 술어로 통일 (테마 6번 = 신상품이라는 이중 정의 제거) |
| `routes/sitemap.js:207` (RSS) | `created_at DESC LIMIT 50` | 신상품 술어 + `sale_start_date DESC` |
| `services/display/productGroupService.js:60` | condition 그룹의 화이트리스트 조건(`badge`/`category_id`/`min_discount`/`in_stock`) | **`isNew` 조건 추가** — `if (cond.isNew) { const p = newProductPredicate('p'); where.push(p.sql); params.push(...p.params); }`. §7-2 의 캐러셀·그리드 섹션이 이것에 의존하므로 **선행 필수** |
| `views/partials/product_card.ejs:35-46` | `product_badge` 문자열 파싱 | `isNewProduct()` 결과로 NEW pill 표시 |
| `views/user/products/list.ejs:323`, `detail.ejs:92` | 뱃지맵 **중복 정의 2벌** | `product_card.ejs` 로 통합 (덤으로 드리프트 제거) |

정렬에도 `sale_start_date DESC` 옵션을 추가한다. 기존 `new: 'created_at DESC'`(라벨 "최근등록")는 **적재순**이라는 다른 의미이므로 남겨두고, 신상품 페이지의 기본 정렬만 판매시작일순으로 바꾼다.

**구현 시 지킬 컨벤션 — 파라미터 정렬.** 술어는 `?` 를 품은 SQL 조각과 params 를 함께 돌려준다. 기존 소비처는 문자열 이어붙이기 + `params.push()` 방식이라, 조각을 넣는 위치와 params 삽입 순서가 어긋나면 **에러 없이 조용히 틀린 결과**가 나온다. 반드시 조각과 params 를 같은 줄에서 함께 넣는다.

```js
const np = newProductPredicate('p');
query += ` AND ${np.sql}`;  params.push(...np.params);   // ← 한 지점에서 같이
```

**신상품 목록 URL.** 현재 필터 파라미터는 `?badge=NEW`(`productController.js:66`)다. 이를 **`?filter=new` 로 개명**하고(뱃지가 더 이상 유일 기준이 아니므로 이름이 거짓말이 된다) 새 술어를 태운다. `?badge=NEW` 는 뱃지 단독 필터로서 하위호환 유지(관리자·쿠폰 scope 가 뱃지 단위를 계속 쓴다). `/new` 랜딩의 "전체 신상품" 섹션 더보기는 `/products?filter=new` 로 건다.

---

## 6. 관리자 화면

### 6-1. 상품 (`views/admin/products/form.ejs`, `list.ejs`)

- **등록/수정 폼**: `판매 시작일` date input 추가. 위치는 `status`(판매 상태) 바로 아래. **신규 등록 시 오늘 날짜를 기본값으로 프리필**한다(비워두면 신상품에서 누락되는 함정 방지). 필드 옆에 "이 날짜로부터 100일간 신상품으로 노출됩니다" 헬프 텍스트 — 100 은 설정값을 읽어 출력.
- **NEW 뱃지 체크박스**: 라벨을 `NEW` → **`NEW (기간 무관 강제 노출)`** 로 바꿔 자동 판정과의 관계를 화면에서 드러낸다.
- **상품 목록**: `판매시작일` 컬럼 + 신상품 여부 칩 표시. 판매시작일 미지정 상품을 걸러보는 필터와, **체크박스 다중 선택 → 판매 시작일 일괄 지정** 액션(§4 의 mall 2 백필 공백을 운영이 메꾸는 수단).

### 6-2. 브랜드 (`views/admin/categories/list.ejs` 브랜드 탭)

- 브랜드 탭의 추가 모달·인라인 편집 폼에 **`입점일` date input** 추가 (`logo_image` 와 마찬가지로 **브랜드 탭에서만 노출**).
- 목록 행에 입점일 표시 + `신규` 칩.
- `controllers/admin/categoryController.js` 의 `postAdd`/`postEdit` 에서 `onboarded_at` 처리. **`type === 'BRAND'` 일 때만** 값을 저장한다(NORMAL/THEME 로 오염 방지).
- 브랜드 탭 정렬 옵션에 `입점일 최신순` 추가.

### 6-3. 설정 (`/admin/sys-settings`)

`new_product_days`(신상품 노출 기간, 일) / `new_brand_days`(신규 입점 브랜드 노출 기간, 일) 두 항목.

---

## 7. `/new` 랜딩 페이지 구성

### 7-1. 렌더링 경로 — SDUI 페이지빌더 재사용

`/new` 를 전용 뷰로 하드코딩하지 않고, 이미 있는 SDUI 인프라(`page` / `page_section` + `services/display/` + 리졸버 14종)를 그대로 쓴다. `page` 테이블에 `slug='new'` 페이지를 만들고, `routes/feature.js` 의 `/new` 핸들러를 이렇게 바꾼다.

```
GET /new
  → page(slug='new', mall_id, published) 있으면  → SDUI 섹션 조립 렌더
  → 없으면                                      → 기존 productController.getList 목록 (폴백)
```

이 방식의 이점: 관리자가 **페이지빌더에서 섹션 순서·노출기간·PC/모바일 노출을 직접 제어**할 수 있고, 몰별로 다른 구성이 가능하며, 코드 배포 없이 섹션을 껐다 켤 수 있다. `/best`, `/deal/today` 도 나중에 같은 방식으로 승격할 수 있는 길이 열린다.

### 7-2. 섹션 구성 (기본 프리셋)

| 순서 | 섹션 타입 | 신규? | 내용 |
|---|---|---|---|
| 1 | `promotion_banner` | **재사용 (검증됨)** | 상단 배너 영역. 리졸버가 `config.groupKey` 를 직접 받으므로(`resolvers/promotion_banner.js:11`) 섹션 설정에 `groupKey = 'menu:NEW'` 만 넣으면 된다. 이 배너 그룹은 이미 관리자에 존재(`bannerController.js:17`). **코드 변경 0** |
| 2 | `product_carousel` | 재사용 (**선행조건 있음**) | **이번 주 신상품** — 판매시작일 최신 12건. 이 섹션은 `dataSource: 'product_group'` 이라 상품을 직접 쿼리하지 않는다. → §5 의 `productGroupService` 에 `isNew` 조건을 추가하고, `filter_condition_json = {"isNew":true}` · `sort_type=newest` 인 **condition 타입 상품그룹을 만들어 연결**해야 한다 |
| 3 | **`new_by_category`** | **신규 리졸버** | **카테고리별 신상품** — 신상품이 있는 NORMAL 카테고리를 탭으로 두고 탭별 상품 그리드. `ranking_tabs.js` 의 탭 구조를 참고해 구현 |
| 4 | **`new_by_brand`** | **신규 리졸버** | **브랜드별 신상품** — 신상품 보유 브랜드별 묶음(브랜드 로고 + 해당 브랜드 신상품 N개 가로 스크롤) |
| 5 | **`new_brand_list`** | **신규 리졸버** | **신규 입점 브랜드** — `onboarded_at` 기준 신규 브랜드 카드(로고·브랜드명·입점일·대표 상품 3개·브랜드 바로가기). `brand_carousel.js` 를 확장 |
| 6 | `product_grid` | 재사용 (**동일 선행조건**) | **전체 신상품** — 위와 같은 신상품 상품그룹에 연결. 더보기 → `/products?filter=new` (페이지네이션 있는 전체 목록은 여기가 담당) |

> **의존 관계 주의**: 2·6 번은 "기존 섹션 재사용" 이지만 `product_group` 을 데이터소스로 요구하므로, **§5 의 `isNew` condition 추가가 선행되지 않으면 붙지 않는다.** 8장 작업 순서가 3단계(판정 술어 소비처 교체) → 5·6단계(섹션)인 이유다.

신규 리졸버 3종은 `services/display/resolvers/` 에 추가하고 `sectionRegistry.js` 에 등록한다(view · label · dataSource · fields 스키마). 이 3종은 `product_group` 을 거치지 않고 `newArrival.js` 술어로 **직접 쿼리**한다(카테고리/브랜드별로 묶는 구조라 단일 그룹으로 표현 불가). 각 섹션은 **결과 0건이면 `resolve()` 가 `null` 을 반환해 렌더를 건너뛴다** — `promotion_banner.js:19` 가 이미 쓰는 패턴이며, §4 의 빈 초기 상태에서 텅 빈 섹션 헤더만 남는 것을 막는다.

### 7-3. 화면 스케치 (PC)

```
┌──────────────────────────────────────────────┐
│  [ 상단 배너 / 캐러셀  group_key=menu:NEW ]     │  ← 관리자 배너 관리
├──────────────────────────────────────────────┤
│  이번 주 신상품                        더보기 > │
│  [카드][카드][카드][카드]  ← 가로 캐러셀          │
├──────────────────────────────────────────────┤
│  카테고리별 신상품                             │
│  ( 전체 | 유산균 | 비타민 | 오메가3 … )  ← 탭     │
│  [카드][카드][카드][카드]                       │
├──────────────────────────────────────────────┤
│  브랜드별 신상품                               │
│  ▸ [로고] 브랜드A     [카드][카드][카드] →       │
│  ▸ [로고] 브랜드B     [카드][카드][카드] →       │
├──────────────────────────────────────────────┤
│  ✨ 신규 입점 브랜드                           │
│  [로고/브랜드명/입점일/대표상품 3] × N           │
├──────────────────────────────────────────────┤
│  전체 신상품            [정렬: 판매시작일순 ▾]   │
│  [그리드 4×N + 페이지네이션]                    │
└──────────────────────────────────────────────┘
```

모바일은 각 섹션을 1~2열 + 가로 스크롤로 접는다(기존 섹션 partial 의 반응형 규칙을 따름).

---

## 8. 작업 단계

각 단계는 독립 커밋. 푸시 = 즉시 운영 배포이므로 **단계마다 로컬 검증 후 사용자 승인**을 받고 진행한다.

| # | 단계 | 산출물 | 비고 |
|---|---|---|---|
| 1 | 스키마 + 백필 | `scripts/migrate_new_arrival_fields.js`, `tables.sql` 교정 | `/alter-table` 사용. mall 2 는 NULL 유지 |
| 2 | 판정 모듈 | `services/catalog/newArrival.js` + `system_settings` 2키 | 단독으로는 동작 변화 없음 |
| 3 | 소비처 교체 | productController · sitemap RSS · productGroupService · 뷰 뱃지맵 통합 | 여기서 신상품 정의가 **하나로** 수렴 |
| 4 | 관리자 화면 | 상품 폼/목록(일괄 지정 포함), 브랜드 탭 입점일, sys-settings | 운영이 데이터를 채울 수 있게 됨 |
| 5 | 신규 섹션 리졸버 3종 | `new_by_category` · `new_by_brand` · `new_brand_list` + partial + registry | |
| 6 | `/new` SDUI 전환 | `routes/feature.js` 분기 + `page(slug='new')` 시드 | 폴백 유지로 안전하게 |

3·4 단계 사이에 운영이 판매시작일을 채울 시간이 필요하다면 4를 먼저 배포해도 된다(4는 3에 의존하지 않는다).

---

## 9. 미결 / 추가 검토 사항

**승인 필요**

1. **테마 카테고리 6번("신상품" THEME)의 처리.** 지금 이 카테고리는 자체 판정 로직을 갖고 있어 `/new` 와 결과가 다르다. 신상품이 자동 판정으로 바뀌면 **이 테마 카테고리는 존재 이유가 없어진다** → 삭제(또는 비노출) 하고 `/new` 로 리다이렉트하는 것을 권장. 삭제 시 `theme_category_id=6` 인 상품의 해당 값 정리 필요.
2. **mall 2(종합관, 9,677건)의 신상품 정책.** 백필 근거가 없어 초기 0건이다. (a) 운영이 주요 상품에 판매시작일을 일괄 지정할지, (b) mall 2 는 신상품 메뉴를 당분간 숨길지 결정 필요.

**스코프 밖으로 명시(이번엔 하지 않음)**

3. `sale_start_date` 를 **노출 게이트**로 쓰는 것(미래 날짜 = 예약 발매, 그 전에는 상품 자체를 숨김). 지금은 `status='COMING_SOON'` 이 그 역할을 하므로 이번에는 **신상품 판정 앵커로만** 쓴다. 미래 날짜 상품은 신상품에서 제외되지만 노출은 된다.
4. 브랜드 페이지(`/brands`)에 신규 입점 브랜드 섹션·정렬 추가 — 자연스러운 후속이지만 이번 스코프에서 분리.
5. 신상품 RSS·사이트맵의 정렬 기준을 전부 `sale_start_date` 로 통일하는 것은 3단계에 포함하되, SEO 영향(URL 변화 없음, 순서만 변경)은 미미하다.

**참고로 발견한 별건 (이번 작업과 무관, 별도 처리 권장)**

6. `controllers/likeController.js:53` 의 브랜드 찜 검증이 `type='BRAND'` 만 확인하고 `mall_id` 를 보지 않아 타 몰 브랜드도 찜할 수 있다.
7. `tables.sql` 전반이 실제 DB(49~62테이블)와 어긋나 있다. 이번엔 `products`·`categories` 만 교정한다.
