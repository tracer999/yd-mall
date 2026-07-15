# 아울렛 관리 (Outlet)

## 1. 개요

아울렛은 **"몰 안의 몰"** 입니다. `outlet_product` 매핑에 담긴 상품만 `/outlet` 에 진열합니다.

이 모듈이 지키는 **두 가지 불변식**(`services/outlet/outletService.js:8-16`):

1. **가격을 만들지 않습니다.** `outlet_product` 에는 **가격 컬럼이 아예 없습니다.** `products.original_price` / `price` / `discount_rate` 를 그대로 읽습니다. 아울렛 전용 가격을 두면 장바구니·주문·결제 검증이 전부 딸려옵니다.
2. **아울렛 상품은 '할인율이 높은 상품'이 아니라 '할인 사유(`outlet_type`)가 있는 상품'입니다.** `discount_rate` 로 상품을 긁어오는 자동 수집 방식은 2026-07-11 구현했다가 **되돌렸습니다.** 상품을 뽑는 유일한 경로는 사람이 사유를 붙여 담는 `outlet_product` 매핑입니다.

- **Base URL:** `/admin/outlet` (상품·설정), `/admin/outlet/categories` (카테고리)
- **관련 테이블:** `outlet_product`, `outlet_setting`, `categories`(type='OUTLET'), (참조) `products`
- **컨트롤러:** `controllers/admin/outletController.js`
- **서비스:** `services/outlet/outletService.js` (관리자·고객·GNB 게이트 공용)
- **뷰:** `views/admin/outlet/list.ejs`, `form.ejs`, `categories.ejs`
- **고객 화면:** `/outlet` 단일 페이지 (`routes/outlet.js`, `controllers/outletController.js`). **아울렛 전용 상품 상세는 없습니다** — `/products/{slug}` 에 고지 블록만 얹습니다.
- **권한:** `admin_menus` id=54(`/admin/outlet`) · id=55(`/admin/outlet/categories`), parent_id=32(상품 관리), `visible_roles = super_admin,admin,content_admin`

---

## 2. 라우트 (`routes/admin/outlet.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/outlet` | getList | 아울렛 상품 목록 + 설정 폼 |
| GET | `/admin/outlet/add` | getAdd | 상품 담기 폼 |
| POST | `/admin/outlet/add` | postAdd | 담기 (검증) |
| GET | `/admin/outlet/product-search` | getProductSearch | 상품 검색 모달 (JSON) |
| POST | `/admin/outlet/settings` | postSetting | 몰별 운영 규칙 저장 |
| GET | `/admin/outlet/categories` | getCategories | 아울렛 카테고리 목록 |
| POST | `/admin/outlet/categories/add` | postCategoryAdd | 카테고리 등록 |
| POST | `/admin/outlet/categories/:id/edit` | postCategoryEdit | 수정 (뎁스·순환 가드) |
| POST | `/admin/outlet/categories/:id/delete` | postCategoryDelete | 삭제 (자식 있으면 차단) |
| GET | `/admin/outlet/:id/edit` | getEdit | 아울렛 항목 수정 폼 |
| POST | `/admin/outlet/:id/edit` | postEdit | 수정 (검증) |
| POST | `/admin/outlet/:id/delete` | postDelete | 아울렛에서 빼기 |

**라우팅 주의:** Express 5 는 `:id(\d+)` 를 지원하지 않습니다. 정적 세그먼트(`/add`, `/settings`, `/categories`, `/product-search`)를 `/:id` 보다 **먼저** 선언하지 않으면 `/admin/outlet/categories` 가 `:id='categories'` 로 잡힙니다.

---

## 3. 할인 사유 · 상태 등급

**할인 사유 7종** (`OUTLET_TYPES`, `outletService.js:19-27`) — 아울렛의 **유일한 필수 분류축**입니다.

| code | 라벨 | 설명 | 등급 필수 |
|------|------|------|:---------:|
| SEASON_OFF | 시즌오프 | 지난 시즌 이월상품 | |
| DISCONTINUED | 단종·구형 | 단종 예정·구형 모델 | |
| OVERSTOCK | 재고정리 | 재고 과다 소진 | |
| DISPLAY | 전시상품 | 매장·행사 전시품 | ✓ |
| REFURBISHED | 리퍼브 | 점검·수리 후 재판매 | ✓ |
| PACKAGE_DAMAGE | 포장훼손 | 외부 포장 손상, 제품 정상 | ✓ |
| EXPIRY_SOON | 임박상품 | 유통기한 임박 | |

**상태 등급 3종** (`CONDITION_GRADES`): `A`(미개봉·새제품 수준) / `B`(경미한 사용·외관 하자) / `C`(눈에 띄는 하자 있음)

**`GRADE_REQUIRED_TYPES`** = `needsGrade: true` 인 사유(DISPLAY / REFURBISHED / PACKAGE_DAMAGE) — 등급을 빼먹으면 교환·반품 분쟁이 납니다.
**`DEFECT_REQUIRED_GRADES`** = `['B', 'C']` — 하자 고지 필수.

### 3.1 등록·수정 검증 (`outletService.validate`, :340-360)

`OutletValidationError` 를 던지고, 컨트롤러가 폼을 **입력값 그대로 다시 렌더**하며 메시지를 띄웁니다.

| 검증 | 메시지 |
|------|--------|
| `outlet_type` 이 7종 중 하나인가 | "할인 사유를 선택하세요." |
| 이 몰의 `allowed_types` 에 포함되는가 | "이 몰에서 사용하지 않는 할인 사유입니다" |
| **`products.discount_rate >= min_discount_rate`** | "아울렛 최소 할인율(N%)에 미달합니다. 상품 가격을 먼저 조정하세요." — **허위 할인 방지** |
| 등급 필수 사유인데 A/B/C 가 없는가 | "…상품은 상태 등급(A/B/C)이 필수입니다." |
| B·C 등급인데 하자 고지가 없는가 | "B·C 등급은 하자 고지 내용이 필수입니다. 미고지 시 교환·반품 분쟁이 발생합니다." |
| `EXPIRY_SOON` 인데 유통기한이 없는가 | "임박상품은 유통기한을 입력해야 합니다." |

> **관리자는 가격을 고칠 수 없습니다.** 할인율이 모자라면 `/admin/products` 에서 상품 가격을 먼저 조정해야 합니다(`outletController.js:12-15`).

### 3.2 상품 검색 모달 (`GET /admin/outlet/product-search`)

`products LEFT JOIN outlet_product` 로 각 행에 두 플래그를 내려줍니다.

- `already_in_outlet` — 이미 담긴 상품
- `eligible` = `discount_rate >= min_discount_rate && !already_in_outlet` — **선택 차단**

"담았더니 거부당함"을 줄이되, 할인율을 함께 내려 판단 근거를 줍니다.

---

## 4. 노출 조건 (`LIVE_CLAUSE`)

`outletService.js:67-73`. **GNB 게이트 카운트와 목록 조회가 같은 정의를 씁니다** — 안 그러면 "메뉴는 있는데 0건"이 생깁니다.

```sql
op.is_visible = 1
AND (op.started_at IS NULL OR op.started_at <= NOW())
AND (op.ended_at   IS NULL OR op.ended_at   >= NOW())
AND p.status IN ('ON', 'SOLD_OUT')
AND p.visibility = 'PUBLIC'
```

`started_at` NULL = 즉시 시작, `ended_at` NULL = 무기한(재고 소진까지).

---

## 5. 콘텐츠 게이트 (GNB 자동 숨김)

`services/menu/navigationService.js:160-243` 의 `CONTENT_GATES.OUTLET`:

```js
OUTLET: async (mallId) => {
    const [setting, count] = await Promise.all([
        outletService.getSetting(mallId),
        outletService.countLiveProducts(mallId),
    ]);
    return count >= (setting.min_product_count || 0);
}
```

**판매중 아울렛 상품 수가 `outlet_setting.min_product_count`(기본 30) 미만이면 GNB 에서 아울렛 메뉴를 자동으로 숨깁니다.** `module_ready` 는 "모듈이 개발됐는가"만 보므로, 관리자가 메뉴를 켠 채 상품을 안 넣으면 고객이 빈 화면을 보게 됩니다. 실제로 아울렛이 그 상태였습니다.

- **캐시:** 30초 TTL (`GATE_TTL_MS`). `menuData` 미들웨어가 **모든 페이지**에서 도므로 캐시가 없으면 전 페이지가 매번 COUNT+JOIN 을 칩니다.
- **무효화:** 관리자가 상품 담기·수정·삭제·설정 저장을 하면 `navigationService.invalidateContentGate(mallId)` (`outletController.js:159, 199, 221, 276`).
- **fail-safe:** 게이트 판정 중 예외가 나면 **숨기는 쪽**으로 갑니다(빈 메뉴를 보여주느니 메뉴가 없는 편이 낫다). 실패는 캐시하지 않습니다.
- 게이트가 GNB 를 막아도 **직접 URL 로 들어오는 경로**는 `controllers/outletController.js` 의 0건 폴백(`COMING_SOON.outlet`)이 막습니다.

> **아울렛만 게이트를 쓰는 게 아닙니다.** `CONTENT_GATES` 에는 `OUTLET` 외에 `GROUP_BUY`·`LIVE` 도 있습니다(`navigationService.js:179-180`). 다만 판정 기준이 다릅니다 — 아울렛은 상시 채널이라 `min_product_count`(기본 30) **임계치**를, 공동구매·라이브는 **"공개된 1건 이상"** 을 봅니다(`groupBuyService.hasAnyPublic`/`liveService.hasAnyPublic`). 한 건만 열려도 그 자체가 콘텐츠라서입니다. 세 게이트 모두 콘텐츠 0건이면 GNB 에서 메뉴를 조용히 숨깁니다.

---

## 6. 몰별 설정 (`outlet_setting`)

`POST /admin/outlet/settings` — `mall_id` 를 PK 로 `INSERT … ON DUPLICATE KEY UPDATE`.

| 컬럼 | 기본값 | 설명 |
|------|--------|------|
| `allowed_types` | 7종 전부 (CSV) | 이 몰이 쓰는 할인 사유. 건강식품몰이면 `EXPIRY_SOON` 만 쓰는 식 |
| `min_discount_rate` | 20 | 등록 최소 할인율. **허위 할인 방지** — 미달이면 등록 차단 |
| `min_product_count` | 30 | **GNB 노출 임계치** (§5) |
| `show_in_normal_list` | 1 | 아울렛 상품을 일반 상품 목록에도 함께 노출할지 |
| `notice_html` | NULL | 아울렛 공통 고지(교환·반품 조건 차이 등). 렌더 시 `sanitize()` |

**`show_in_normal_list = 0` 이면** `controllers/productController.js:100-108` 이 일반 상품 목록·검색 쿼리에 다음을 추가합니다.

```sql
AND id NOT IN (SELECT product_id FROM outlet_product WHERE mall_id = ?)
```

이월·리퍼브가 신상품 옆에 섞여 브랜드 이미지를 깎는 것을 막는 장치입니다. **기본값이 1(병행 노출)** 이라 대부분의 몰에서는 이 조건이 붙지 않습니다.

---

## 7. 아울렛 카테고리 (`categories.type='OUTLET'`)

**별도 테이블이 아닙니다.** `categories` 를 재사용하고 `type='OUTLET'` 으로 스코프합니다.

> ⚠️ **모든 쿼리에 `type='OUTLET'` 을 반드시 걸어야 합니다.** 안 걸면 일반 카테고리를 아울렛 화면에서 지우는 사고가 납니다(`outletController.js:281-284`).

계층 무결성은 `services/tree/depthGuard.js` 가 지킵니다(일반 카테고리와 동일).

| 위험 | 처리 |
|------|------|
| 뎁스 초과 | `assertDepthAllowed({ parentId, maxDepth })` — `maxDepth` 는 `navigation_config.category_max_depth` |
| 순환 참조 | `wouldCreateCycle()` 을 **UPDATE 전에** 호출. 순서를 어기면 `recalcSubtreeDepth` 가 DB 를 오염시킨 뒤 예외를 던진다 |
| 부모 삭제 | 자식이 있으면 **차단**. `categories.parent_id` 가 `ON DELETE SET NULL` 이라 자식이 조용히 최상위로 승격되고 depth 가 어긋난다 |

**카테고리를 지워도 상품은 살아남습니다** — `outlet_product.outlet_category_id` FK 가 `ON DELETE SET NULL` 이라 '미분류'로 남습니다.

---

## 8. 고객 화면 (`/outlet`)

**단일 페이지 + 쿼리 필터**입니다. 아울렛 사용자는 '무엇'보다 '얼마나 싼가'로 움직입니다.

| 축 | 쿼리 | 값 |
|----|------|-----|
| 카테고리 | `?category=` | `categories.type='OUTLET'` 중 상품이 있는 것만 |
| 할인 사유 | `?type=` | 몰의 `allowed_types` 중 **상품이 있는 사유만** 필터칩 노출 (`getTypeCounts`) |
| 가격대 | `?price=` | 1만 / 3만 / 5만 / 10만원 이하 (`PRICE_BANDS`) |
| 정렬 | `?sort=` | **`discount`(할인율 높은 순, 기본)** / `price_asc` / `price_desc` / `stock_low`(마지막 수량) / `latest` |

- 정렬은 항상 `op.sort_order ASC` 를 **먼저** 적용한 뒤 선택된 정렬을 겁니다(운영자 고정 노출이 우선).
- **0건 폴백:** 필터 없이 0건이고 `countLiveProducts() === 0` 이면 `COMING_SOON.outlet` 준비중 랜딩. **필터 때문에 0건인 경우는** 빈 결과를 그대로 보여줍니다("조건에 맞는 상품 없음").
- **상품 상세 고지 블록:** `productController.js:517, 532` 가 `outletService.getOutletInfoByProductId()` 로 `outletInfo` 를 주입하고, `views/user/products/detail.ejs:288-301` 이 사유·상태 등급·하자 고지를 그립니다. 아울렛이 아니면 `null` 이고 뷰는 아무것도 그리지 않습니다. **리퍼브·전시·포장훼손을 일반 상품처럼 보여주면 교환·반품 분쟁이 납니다.**

---

## 9. DB

### 9.1 `outlet_product` — **가격 컬럼 없음**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint PK | |
| mall_id | bigint | |
| product_id | int | FK CASCADE |
| outlet_category_id | int NULL | `categories.id`(type='OUTLET'). FK **ON DELETE SET NULL**. NULL = 미분류 |
| **outlet_type** | enum(7종) NOT NULL | 할인 사유. **아울렛의 존재 이유이자 유일한 필수 분류축** |
| outlet_reason | varchar(255) | 고객 노출 문구 (예: "25FW 시즌 이월") |
| condition_grade | enum('A','B','C') NULL | 리퍼브·전시·훼손만 필수 |
| defect_description | text | 하자 고지. **B/C 등급이면 필수** |
| expiry_at | date NULL | `EXPIRY_SOON` 전용 유통기한 |
| started_at / ended_at | datetime NULL | NULL = 즉시 시작 / 무기한 |
| sort_order | int | |
| is_visible | tinyint(1) | |

유니크: `uk_outlet_product (mall_id, product_id)` — 한 상품은 몰당 1건만.

### 9.2 `outlet_setting` (PK = `mall_id`)

`allowed_types`(CSV), `min_discount_rate`(20), `min_product_count`(30), `show_in_normal_list`(1), `notice_html` — §6 참고.

### 9.3 `categories` (type='OUTLET')

`id`, `mall_id`, `name`, `slug`, `parent_id`, `depth`, `display_order`, `is_active`, `description`

---

## 10. 주의사항

- **🔴 몰 프리셋을 재적용하면 아울렛 메뉴가 꺼집니다.** `services/mall/presets.js` 의 `featureMenus` 목록(`CATEGORY, SHOPPING_DEAL, BEST, NEW_PRODUCT, EVENT, EXHIBITION, BRAND, SPECIALTY`)에 **`OUTLET` 이 없습니다**(`GROUP_BUY`·`LIVE` 도 없습니다). "여기 없는 gnb 메뉴는 꺼진다"가 프리셋 규칙이므로, 새 몰을 프로비저닝하거나 프리셋을 다시 적용하면 아울렛 메뉴가 사라집니다.
- **가격은 절대 아울렛이 만들지 않습니다.** `outlet_product` 에 가격 컬럼을 추가하려는 충동을 참으세요 — 장바구니·주문·결제 검증이 전부 딸려옵니다. 할인율이 모자라면 상품 가격을 고쳐야 합니다.
- **할인율 자동 수집 방식은 이미 폐기됐습니다.** 2026-07-11 에 `discount_rate` 로 상품을 긁어오는 방식을 구현했다가 되돌렸습니다(설계서 §3-1). 다시 시도하지 마세요 — "할인율이 높은 상품"과 "할인 사유가 있는 상품"은 다릅니다.
- **GNB 게이트는 조용히 숨깁니다.** 운영자가 "메뉴를 켰는데 왜 GNB 에 없냐"고 물으면 `min_product_count` 미달 또는 30초 캐시를 의심하세요. `navigationService.checkContentGate()` 가 그 이유를 돌려줍니다.
- **`min_discount_rate` 를 나중에 올려도 기존 상품은 남습니다.** 검증은 **등록·수정 시점**에만 돕니다. 설정을 20 → 40 으로 올려도 이미 담긴 30% 상품은 계속 노출됩니다(수정 저장을 시도해야 거부됨).
- **아울렛 카테고리 쿼리에 `type='OUTLET'` 을 빠뜨리지 마세요.** 일반 카테고리와 같은 테이블입니다.
- **`show_in_normal_list=0` 의 서브쿼리는 `NOT IN` 입니다.** 아울렛 상품이 많아지면 상품 목록 쿼리 비용이 커집니다.

---

*Last Updated: 2026-07-15*
