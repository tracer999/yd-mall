# 쇼핑특가 관리 (Deals)

## 1. 개요

쇼핑특가는 **기간·시간창·요일·선착순 조건이 맞을 때만 상품 판매가를 덮어쓰는 read-time 리졸버**입니다. 캠페인(`deal`)에 상품(`deal_item`)을 담고 특가를 매기면, 그 값이 표시 가격이자 **실제 결제 단가**가 됩니다.

> **스케줄러도 배치도 없습니다.** 어떤 테이블에도 가격을 write 하지 않습니다. 활성 판정은 **요청이 들어온 그 순간** `services/deal/dealService.js` 의 SQL 조건(`ACTIVE_WHERE`)이 합니다. 이유는 `dealService.js:3-19` 주석에 있습니다 — ① 개발 DB = 배포 DB 라 타이머가 `products.price`(소스 오브 트루스)를 상시 write 하면 로컬 서버가 상품 원가를 오염시킨다 ② 타임특가의 20:00 정각 경계를 1분 틱 스케줄러는 못 지킨다 ③ 특가 중 상품가를 수정하면 종료 시 원가 복원이 그 편집을 덮거나 포기해야 한다.

| | 쇼핑특가 (`deal`) | 공동구매 (`group_buy`) | 쇼핑라이브 (`live_show`) |
|---|---|---|---|
| 결제 단가 | `deal_item.deal_price` (전 판매 경로에 자동 적용) | `group_buy_product.group_buy_price` | `live_show_product.live_price` |
| 적용 범위 | **모든 일반 상품 라인** (source_type 없는 것) | 공동구매 바로구매 라인만 | 라이브 바로구매 라인만 |
| 활성 판정 | **요청 시각에 SQL 로 계산** | 기간에서 phase 파생 | 관리자 수동 status |
| 선착순 | `deal_item.qty_limit` / `sold_qty` (결제 시 원자 소진) | `target_quantity`(달성률 표시용) | 없음 |
| `order_items.source_type` | `'DEAL'` (source_id = `deal_item.id`) | `'GROUP_BUY'` (deal 이 안 붙음) | `'LIVE_SHOW'` (deal 이 안 붙음) |

- **Base URL:** `/admin/deals` (`routes/admin.js:65`), `/admin/deal-categories` (`routes/admin.js:66`)
- **관련 테이블:** `deal_category`, `deal`, `deal_item`, (참조) `products`, `order_items`
- **컨트롤러:** `controllers/admin/dealController.js`, `controllers/admin/dealCategoryController.js`
- **서비스:** `services/deal/dealService.js` (관리자·고객·결제 공용)
- **뷰:** `views/admin/deals/list.ejs`, `views/admin/deals/form.ejs` (등록·수정 공용), `views/admin/deal-categories/`
- **고객 화면:** `/deals`, `/deals/:code` (`routes/feature.js:98-99`, `controllers/dealController.js`)
- **권한:** `admin_menus` id=51(`/admin/deals`) · id=52(`/admin/deal-categories`), parent_id=32(상품 관리), `visible_roles = super_admin,admin,content_admin`

---

## 2. 라우트

### 2.1 특가 (`routes/admin/deals.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/deals` | getList | 목록 (카테고리 필터 `category_id`) |
| GET | `/admin/deals/new` | getNew | 등록 폼 |
| POST | `/admin/deals` | postCreate | 등록 처리 |
| GET | `/admin/deals/:id` | getEdit | 수정 폼 (기본정보 + 상품 큐레이션) |
| POST | `/admin/deals/:id` | postUpdate | 기본정보 수정 |
| POST | `/admin/deals/:id/delete` | postDelete | 삭제 (`deal_item` CASCADE) |
| GET | `/admin/deals/:id/product-search` | getProductSearch | 상품 조회 팝업 (JSON) |
| POST | `/admin/deals/:id/items` | postAddItem | 상품 1건 담기 |
| POST | `/admin/deals/:id/items/bulk` | postAddItems | 상품 여러 건 담기 (AJAX) |
| POST | `/admin/deals/:id/items/save` | postSaveItems | 특가·한정수량 인라인 일괄 저장 |
| POST | `/admin/deals/:id/items/reorder` | postReorderItems | 순서 변경 (AJAX) |
| POST | `/admin/deals/:id/items/:itemId/delete` | postRemoveItem | 상품 빼기 |

### 2.2 특가 카테고리 (`routes/admin/deal-categories.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/deal-categories` | getList | 목록 |
| GET | `/admin/deal-categories/new` | getNew | 등록 폼 |
| POST | `/admin/deal-categories` | postCreate | 등록 |
| GET | `/admin/deal-categories/:id` | getEdit | 수정 폼 |
| POST | `/admin/deal-categories/:id` | postUpdate | 수정 |
| POST | `/admin/deal-categories/:id/toggle` | postToggle | 사용 on/off |
| POST | `/admin/deal-categories/:id/delete` | postDelete | 삭제 (참조 중이면 차단) |

**라우팅 주의:** Express 5(path-to-regexp v8)는 `:id(\d+)` 를 지원하지 않습니다. 정적 세그먼트(`/new`)를 `/:id` 앞에 선언하고 숫자 검증은 `requireNumericId` 가 합니다(`routes/admin/deals.js:13-18`).

---

## 3. 활성 판정 (`dealService.ACTIVE_WHERE`)

특가가 걸리려면 아래 조건이 **모두** 참이어야 합니다(`services/deal/dealService.js:27-33`). 시간은 앱 서버가 아니라 **DB 의 `NOW()`/`CURTIME()`**(SYSTEM=KST)으로 판정합니다.

| 조건 | 의미 |
|------|------|
| `d.is_active = 1` | 특가 캠페인 사용 중 |
| `NOW() BETWEEN d.starts_at AND d.ends_at` | 캠페인 기간 내 |
| `d.daily_start_time IS NULL OR CURTIME() BETWEEN daily_start_time AND daily_end_time` | 시간창(타임특가). NULL 이면 기간 내 상시 |
| `d.weekdays IS NULL OR d.weekdays = '' OR FIND_IN_SET(WEEKDAY(NOW()) + 1, d.weekdays)` | 요일. MySQL `WEEKDAY()` 는 0=월이라 +1 해서 1=월…7=일 로 맞춤 |
| `di.qty_limit IS NULL OR di.sold_qty < di.qty_limit` | 선착순 잔여 |
| `dc.is_active = 1` | 카테고리 사용 중 (`WINNER_SQL`) |
| **`di.deal_price < dp.price`** | **특가가 현재 정가보다 싸다** (`WINNER_SQL:59`) |

> **마지막 조건이 결정적입니다.** 등록 시점에 "특가 < 정가"를 검증해도, 그 뒤 운영자가 **상품 정가를 특가보다 낮게 인하하면** 그 검증은 무의미해집니다. 가드가 없으면 리졸버가 가격을 **올려서** 덮어 8,000원짜리를 9,000원 "특가"로 결제시킵니다. 그래서 판정 자체에서 걸러 표시·결제·quota 가 모두 일관되게 만듭니다. **부작용:** 정가를 특가 이하로 내리면 그 특가는 조용히 무효화됩니다(관리자 화면에는 여전히 "진행중"으로 보임 — §7 참고).

**`deal_category.schedule_type`(PERIOD/TIME)은 판정에 관여하지 않습니다.** 관리자 폼 UX 힌트일 뿐입니다(TIME 이면 시간창 입력을 필수화). 판정 근거는 `deal` 행의 실제 컬럼 하나뿐입니다(`dealCategoryController.js:7-10`).

### 3.1 중복 특가 우선순위 (`WINNER_SQL`)

한 상품에 활성 특가가 여럿이면 `ROW_NUMBER()` 로 **상품당 1건**만 남깁니다.

```
ORDER BY d.priority DESC, di.deal_price ASC, di.id ASC
```

우선순위 큰 것 → 싼 것 → 먼저 만든 것.

---

## 4. 공개 API (`services/deal/dealService.js`)

| 함수 | 용도 | 호출부 |
|------|------|--------|
| `applyDeals(rows, {idKey})` | **표시 경로용 후처리.** 상품 행 배열의 `price`/`original_price`/`discount_rate` 를 특가로 덮고 `row.deal` 을 붙임 | 14곳 (§4.1) |
| `dealJoinSql(alias)` | 정렬이 필요한 쿼리에 끼우는 LEFT JOIN 프래그먼트 (`COALESCE(ad.deal_price, p.price) AS effective_price`) | (현재 실제 사용처 없음 — §7) |
| `resolveForProducts(ids, conn)` | product_id → dealInfo Map | `applyDeals`, `cartController:195` |
| `applyToScopeItems(items)` | **결제 경로용.** checkout items[] 의 단가를 덮고 `source_type='DEAL'`, `source_id=deal_item.id` 부착 | `checkoutController:351, 590` |
| `consumeDealQuota(conn, orderId)` | 선착순 수량 원자 소진. false 면 주문 확정 금지 | `checkoutController:224` |
| `restoreDealQuota(conn, orderId)` | 취소 시 소진 복원 | `services/order/orderCancelService.js:67` |
| `getActiveDealsByCategory(mallId, code)` | `/deals` 페이지용 카테고리별 묶음 | `controllers/dealController.js`, `resolvers/deal_carousel.js` |
| `getUpcomingTimeDeals(mallId)` | 오늘 아직 안 열린 타임특가 ("20:00 오픈") | `controllers/dealController.js:25` |
| `countActiveDealProducts(mallId)` | 활성 특가 상품 수 | 요약용 |

**`applyDeals` 는 SELECT 절을 건드리지 않습니다.** `productController` 의 카운트 쿼리가 `query.replace('SELECT *', 'SELECT COUNT(*)…')` 문자열 치환이라, JOIN 으로 컬럼을 추가하면 그 쿼리가 깨집니다. 그래서 JOIN 이 아니라 애플리케이션 후처리입니다(`dealService.js:123-132`).

### 4.1 `applyDeals` 삽입 지점 (14곳)

빠뜨린 화면은 **정가(= 더 비싼 값)** 를 보여줍니다 — 노출 누락이지 금전 사고는 아닙니다.

| 파일 | 라인 | 화면 |
|------|------|------|
| `controllers/productController.js` | 261, 376, 413, 619 | 상품목록 / 상세 / 연관추천 / 검색 |
| `controllers/cartController.js` | 24 | 장바구니 |
| `controllers/mainController.js` | 56 | 홈 히어로 슬라이드 |
| `controllers/mypageController.js` | 411, 472 | 찜 / 최근 본 상품 |
| `services/brand/brandService.js` | 321, 397, 434 | 브랜드 상세관 |
| `services/best/bestRankingService.js` | 366 | 베스트/랭킹 |
| `services/exhibition/exhibitionService.js` | 323 | 기획전 |
| `services/recommend/recommendService.js` | 267 | 추천 랜딩 |
| `services/display/productGroupService.js` | 58, 78 | 상품그룹 |
| `services/display/resolvers/_shared.js` | 106 | SDUI 공용 |
| `services/display/resolvers/benefit_bento.js` | 25 | 혜택 벤토 섹션 |
| `services/display/resolvers/recent_product.js` | 37 | 최근 본 상품 섹션 |

---

## 5. 결제 연동

### 5.1 금액 확정

`checkoutController` 는 **두 지점**에서 `dealSvc.applyToScopeItems(items)` 를 부릅니다.

1. **주문서 GET** (`:351`) — 화면에 보이는 금액
2. **금액 확정 postForm** (`:590`) — **실제 결제 금액**. 폼이 보낸 금액은 어디서도 쓰지 않습니다.

`applyToScopeItems` 는 **`source_type` 이 이미 있는 라인은 건너뜁니다**(`dealService.js:172`). 즉 공동구매·쇼핑라이브 라인에는 특가가 붙지 않습니다 — 공동구매가·라이브가가 특가를 이깁니다.

### 5.2 선착순 소진

결제 확정 트랜잭션 안에서 `consumeDealQuota(conn, orderId)` 를 호출합니다(`checkoutController:224`).

```sql
UPDATE deal_item SET sold_qty = sold_qty + ?
 WHERE id = ? AND (qty_limit IS NULL OR sold_qty + ? <= qty_limit)
```

`affectedRows = 0` → 선착순 소진 → **rollback + Toss 결제 취소**(재고 부족과 동일한 실패 경로).

> 소진은 **특가를 재조회하지 않고** `order_items.source_id`(=`deal_item.id`)로만 수행합니다. 재조회하면 주문 생성과 결제 승인 사이에 타임특가 시간창이 닫혔을 때, 고객은 특가로 결제했는데 소진 카운터는 건너뛰는 버그가 납니다(`dealService.js:163-169`).

취소 시 `restoreDealQuota()` 가 `GREATEST(0, sold_qty - ?)` 로 복원합니다.

### 5.3 장바구니 우회

`cartController.checkoutAll`(:195) 은 재고를 차감하지 않는 간이 결제 경로입니다. 특가 상품이 하나라도 담겨 있으면 **`/checkout?cart=1` 로 리다이렉트**해서 재고·선착순을 제대로 잠그는 정규 결제로 보냅니다.

---

## 6. 관리자 화면

### 6.1 목록 (`GET /admin/deals`)

`deal` JOIN `deal_category` + 서브셀렉트 2개(`item_count`, `sold_total`). 정렬 `priority DESC, sort_order ASC, id DESC`.

상태 뱃지는 **DB 의 `NOW()` 로 계산한 CASE 식**(`dealController.js:197-202`):

| status | 조건 |
|--------|------|
| INACTIVE | `is_active = 0` |
| SCHEDULED | `NOW() < starts_at` |
| ENDED | `NOW() > ends_at` |
| RUNNING | 그 외 |

> **뱃지는 기간만 봅니다.** 시간창·요일까지 반영하면 타임특가가 하루 23시간 "종료"로 보입니다. 뱃지는 캠페인의 생애주기만 말하고, 시간창·요일은 별도 컬럼으로 표시합니다(`dealController.js:21-23`).

> **상품 조회 팝업의 카테고리·브랜드 선택지.** 카테고리는 `categoryScope.usedCategoryOptions(mallId)`(이 몰 상품이 실제로 쓰는 것 + 조상), 브랜드는 셀렉트 대신 검색형 공용 위젯 `partials/admin/brand_picker`(데이터는 `/admin/brands/search.json`, 이쪽도 같은 기준)를 씁니다. 상품그룹·추천그룹·기획전도 동일 — 근거와 주의사항은 [상품 관리 §3](products.md) 참고.

### 6.2 기본정보 폼 (`normalizeForm`, `dealController.js:106-152`)

| name | 컬럼 | 검증 |
|------|------|------|
| deal_category_id | `deal_category_id` | 필수. **이 몰의 카테고리인지 재확인**(`findCategory`, 요청 위조 차단) |
| title | `title` | **필수**, 100자 |
| subtitle | `subtitle` | 200자 |
| starts_at / ends_at | 동명 | **둘 다 필수**, `ends_at > starts_at` |
| daily_start_time / daily_end_time | 동명 | **둘 다 입력하거나 둘 다 비움**. `daily_end > daily_start` |
| weekdays | `weekdays` | 체크박스 → `'1,3,5'` CSV. **전부 선택 == 미선택 == NULL**(매일) |
| priority | `priority` | 중복 특가 우선순위 |
| sort_order | `sort_order` | 목록 정렬 |
| is_active | `is_active` | 체크박스 |

검증 실패 메시지(`normalizeForm`):
- 시간창을 **한쪽만** 채우면 거부 — 리졸버가 `CURTIME() BETWEEN start AND NULL` → NULL(=false)로 평가해 **특가가 영원히 안 걸립니다**. 조용히 죽는 대신 거부합니다.
- `daily_end <= daily_start` 거부 — **자정을 넘는 시간창(22:00~02:00)은 지원하지 않습니다.**
- 카테고리가 `schedule_type='TIME'` 인데 시간창이 없으면 거부.

### 6.3 상품 큐레이션

- **담기**(`postAddItem` / `postAddItems`): 다른 몰 상품 거부. **초기 `deal_price` 는 정가**(할인 0%)입니다. `deal_item` 에는 행별 활성 플래그가 없어서, 진행 중인 특가에 상품을 담으면 즉시 판매가가 됩니다. 실패 방향이 "할인이 안 걸린다"(노출 누락)여야지 "의도 없이 싸게 판다"(금전 사고)여서는 안 되기 때문입니다(`dealController.js:15-19`). 다만 그 상태로는 `deal_price < price` 를 어겨 인라인 저장이 통과하지 않으므로, 운영자가 반드시 특가를 명시해야 합니다.
- **인라인 저장**(`postSaveItems`): **한 행이라도 검증에 걸리면 전부 롤백**합니다. 공동구매처럼 잘못된 행을 조용히 건너뛰면 운영자는 "저장됨"을 보고 떠나는데 가격은 그대로입니다 — 돈이 걸린 필드에선 그게 사고입니다.
  - 정가는 폼 값이 아니라 **DB(`products.price`)에서 다시 읽습니다.**
  - `deal_price > 0`, `deal_price < products.price`, `qty_limit` 은 NULL(무제한) 또는 1 이상.
- 중복 담기는 `uk_deal_item (deal_id, product_id)` 가 막고 `ER_DUP_ENTRY` → "이미 담긴 상품입니다."

### 6.4 특가 카테고리

`code`(대문자 영숫자·언더스코어로 정규화), `name`, `description`, `schedule_type`(PERIOD/TIME), `badge_text`, `badge_color`(rose/amber/emerald/sky/indigo/violet/slate, 기본 rose), `sort_order`, `is_active`.

- **삭제보다 비활성.** `deal.deal_category_id` FK 는 `ON DELETE RESTRICT` 입니다. 참조 중이면 DB 가 막지만, 먼저 COUNT 로 세어 사람이 읽을 메시지로 돌려줍니다(`postDelete`).
- **`is_active = 0` 토글이 즉시 종료 수단입니다.** 카테고리를 끄면 `WINNER_SQL` 의 `dc.is_active = 1` 에서 탈락해 그 카테고리의 특가가 **전부 즉시** 꺼집니다.
- `code` 는 `(mall_id, code)` 유니크. 고객 URL `/deals/:code` 가 이 값을 씁니다.

---

## 7. 고객 화면

- **`/deals`** (전체, 카테고리별 섹션) / **`/deals/:code`** (특정 카테고리) — `routes/feature.js:98-99` → `controllers/dealController.js:getIndex`
- **`/deal/today` → 301 `/deals`** (`routes/feature.js:102`). 예전 '오늘특가'는 상품그룹을 상품목록 컨트롤러로 재사용한 큐레이션 화면이었고, 쇼핑특가가 그것을 대체했습니다.
- **0건 폴백:** 활성 특가도, 오늘 열릴 타임특가도 없으면 `getIndex` 가 `false` 를 리턴하고 라우트가 `comingSoon('deals')` 준비중 랜딩을 렌더합니다.
- 탭은 코드 지정과 무관하게 항상 전체 카테고리를 보여줍니다(다른 카테고리로 이동할 수 있어야 하므로).
- **고객 노출 조건**은 관리자 판정보다 엄격합니다 (`getActiveDealsByCategory`, `dealService.js:270-274`): `ACTIVE_WHERE` + `dc.is_active=1` + **`p.status='ON'` + `p.visibility='PUBLIC'`** + `di.deal_price < p.price`.
- 홈 SDUI 섹션: `deal_carousel` (`services/display/resolvers/deal_carousel.js`).
- 카운트다운: 타임특가는 **오늘의 `daily_end_time`**, 상시 특가는 캠페인 `ends_at` 이 기준입니다(`toDealInfo`).

---

## 8. DB

### 8.1 `deal_category`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| mall_id | int | |
| code | varchar(40) | `uk_deal_category_code (mall_id, code)`. 고객 URL `/deals/:code` |
| name | varchar(60) | |
| description | varchar(200) | |
| schedule_type | enum('PERIOD','TIME') | **판정에 관여하지 않음.** 관리자 폼 UX 힌트 |
| badge_text / badge_color | varchar(20) | 비면 `name` / `'rose'` 로 폴백 |
| sort_order | int | |
| is_active | tinyint(1) | **0 이면 이 카테고리 특가 전부 즉시 비활성** |

### 8.2 `deal`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| mall_id | int | |
| deal_category_id | int | FK **ON DELETE RESTRICT** |
| title | varchar(100) NOT NULL | |
| subtitle | varchar(200) | |
| starts_at / ends_at | datetime **NOT NULL** | 캠페인 기간 |
| daily_start_time / daily_end_time | time NULL | 시간창. **둘 다 있거나 둘 다 NULL.** 자정 넘김 미지원 |
| weekdays | varchar(20) | `'1,3,5'` CSV (1=월…7=일). NULL/`''` = 매일 |
| priority | int | 중복 특가 우선순위 (DESC) |
| sort_order | int | |
| is_active | tinyint(1) | |

인덱스: `idx_deal_active (mall_id, is_active, starts_at, ends_at)`

### 8.3 `deal_item`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int PK | **`order_items.source_id` 가 이 값을 가리킨다** |
| deal_id | int | FK CASCADE |
| product_id | int | FK CASCADE |
| deal_price | int NOT NULL | **결제 단가.** `< products.price` 여야 활성 |
| qty_limit | int NULL | 선착순 한도. NULL = 무제한 |
| sold_qty | int | 소진 수량. `consumeDealQuota` 만 증가, `restoreDealQuota` 만 감소 |
| sort_order | int | |

유니크: `uk_deal_item (deal_id, product_id)`
**행별 활성 플래그가 없습니다** — 담는 순간 활성입니다.

---

## 9. 주의사항

- **저장하는 값이 곧 결제 금액입니다.** 승인 단계도, 스케줄러도 없습니다. `deal_price` 의 마지막 방어선은 컨트롤러의 저장 시 검증(`deal_price > 0`, `< products.price`, 정가는 DB 재조회)과 리졸버의 `di.deal_price < dp.price` 가드 두 겹뿐입니다.
- **정가를 내리면 특가가 조용히 무효화됩니다.** `products.price` 를 `deal_price` 이하로 인하하면 `WINNER_SQL` 의 가드에 걸려 특가가 안 잡힙니다. 그런데 **관리자 목록의 상태 뱃지는 여전히 "진행중"** 입니다(뱃지는 기간만 보므로). 특가가 안 걸린다는 신고가 오면 먼저 `products.price` 를 확인하세요.
- **자정을 넘는 시간창은 지원하지 않습니다.** `CURTIME() BETWEEN 22:00 AND 02:00` 은 항상 false 입니다. 폼이 저장 자체를 거부합니다.
- **가격순 정렬에 특가가 반영되지 않습니다.** `applyDeals` 는 SELECT 후 후처리라 `ORDER BY price` 를 바꾸지 못합니다. `dealJoinSql()` 이 그걸 위해 있지만 **현재 어느 목록 쿼리에도 적용돼 있지 않습니다**(retrofit 미완). 상품목록을 "낮은 가격순" 으로 정렬하면 정가 기준으로 줄 세워집니다.
- **선착순 예약이 없습니다.** `sold_qty` 는 **결제 확정 시점**에만 깎입니다. 주문서를 띄워둔 것만으로는 수량이 잡히지 않아, 마지막 1개를 두 명이 동시에 주문서에 올릴 수 있습니다. 늦은 쪽은 결제 승인 후 rollback + 자동 결제 취소로 처리됩니다.
- **`source_type` 이 있는 라인에는 특가가 붙지 않습니다.** 공동구매·쇼핑라이브로 산 상품은 특가 대상이 아닙니다(설계상 의도).
- **몰 스코프.** `deal_item` 에는 `mall_id` 가 없습니다. 반드시 `findOwned(mallId, id)` 로 부모 `deal` 을 먼저 확인하고 손대세요. 상품·카테고리도 `mall_id` 를 재확인합니다(`findCategory`, `postAddItem`).
- **시간은 전부 DB 시계 기준입니다.** MySQL 서버 타임존이 SYSTEM=KST 임을 전제로 `NOW()`/`CURTIME()`/`WEEKDAY()` 를 그대로 씁니다. 앱 서버 시계와 DB 시계가 어긋나면 판정이 흔들립니다.

---

*Last Updated: 2026-07-15*
