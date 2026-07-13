# 쇼핑특가 (Shopping Deal) 설계서

> 작성: 2026-07-13
> 상태: 설계 확정 → 구현
> 대체 대상: 기존 GNB `오늘특가`(`feature_menu.TODAY_DEAL`, `/deal/today`)

---

## 1. 요구사항

1. GNB `오늘의 특가` → **`쇼핑특가`** 로 변경한다.
2. 쇼핑특가 페이지는 **특가 카테고리별로** 특가를 보여준다.
3. 특가 카테고리는 **관리자가 직접 생성**한다 (오늘의 특가 / 타임특가 / 시즌특가 …).
4. 특가는 **시작일 / 종료일**을 갖는다.
5. **타임특가**는 기간 내에 **시작시간 / 종료시간**을 두어, 기간 중 특정 시간대에만 특가로 노출·판매된다.
6. (확정된 추가 요구) **요일 지정**, **수량 한정(선착순)** 을 지원한다.
7. (확정) **특가는 실제 결제 금액에 반영된다.** 노출만 하는 큐레이션이 아니다.

### 범위 밖 (명시적 제외)

- **자정을 넘는 시간창** (예: 22:00 ~ 익일 02:00). `daily_end_time > daily_start_time` 을 검증으로 강제한다.
- **특가 × 쿠폰 중복 할인 차단.** 기본 동작은 *특가가 기준으로 쿠폰이 추가 적용*(할인 후 할인)이다. 차단이 필요하면 코드 변경 없이 쿠폰의 `scope_json.exclude.badges` 로 운영 대응한다 (`services/coupon/discountCalculator.js:72`).
- **공동구매 × 특가 동시 적용.** 공동구매 라인은 `groupBuyService.resolveLine()` 이 단가를 확정하며, **공동구매가가 특가를 이긴다**. 특가 리졸버는 공동구매 라인을 건드리지 않는다.

---

## 2. 핵심 아키텍처 결정 — read-time 유효가 리졸버

### 2.1 기각한 대안: 가격 실체화(materialization)

스케줄러가 특가 시작/종료 시점에 `products.price` 를 직접 갱신하고, 종료 시 스냅샷으로 복원하는 방식. "기존 20여 개 가격 조회 지점을 한 곳도 고칠 필요가 없다"는 유혹이 있으나 **기각**한다.

| 기각 사유 | 내용 |
|---|---|
| 공유 DB 오염 | **개발 DB = 운영 DB** 다. 로컬 `npm run dev` 의 스케줄러가 운영 상품 원가를 write 한다. 소스 오브 트루스(`products.price`)를 타이머가 상시 덮어쓰는 구조 자체가 위험. |
| 경계 부정확 | 1분 틱이면 20:00 정각 경계에서 최대 60초간 가격이 틀리다. **타임특가는 경계 정확성이 존재 이유**인데 이를 보장하지 못한다. read-time 판정은 초 단위로 정확하다. |
| 편집 충돌 | 특가 진행 중 관리자가 상품가를 수정하면, 종료 시 복원이 그 편집을 덮거나(데이터 손실) 복원을 포기(특가가 영구 방치)한다. 둘 다 사고. |
| 크래시 내성 | 복원 전에 프로세스가 죽으면 원가가 무기한 오염된다. read-time 방식은 이 상태가 아예 존재하지 않는다. |

### 2.2 채택: read-time 유효가 리졸버

**특가는 어떤 테이블에도 write 하지 않는다.** 읽는 시점에 활성 여부를 계산하고 가격을 덮어쓴다.

```
활성 특가 판정 (dealService.ACTIVE_WHERE)
  d.is_active = 1
  AND NOW() BETWEEN d.starts_at AND d.ends_at            -- 기간
  AND (d.daily_start_time IS NULL                         -- 타임특가 시간창
       OR CURTIME() BETWEEN d.daily_start_time AND d.daily_end_time)
  AND (d.weekdays IS NULL                                 -- 요일 지정
       OR FIND_IN_SET(WEEKDAY(NOW()) + 1, d.weekdays))    -- 1=월 … 7=일
  AND (di.qty_limit IS NULL OR di.sold_qty < di.qty_limit) -- 선착순 소진
```

- MySQL 서버 타임존은 `SYSTEM` = **KST** 로 실측 확인했다 (`NOW()` = 한국시각). `NOW()`/`CURTIME()` 을 그대로 쓴다.
- 스케줄러 · 배치 · 크론이 **전혀 없다.**

### 2.3 실패 기울기

이 설계의 안전성은 **누락의 실패 방향**에 있다.

- **결제 경로**(돈)에 리졸버를 꽂아야 하는 곳은 **단 2곳**이다 → 열거·검증 가능.
- **표시 경로**에서 리졸버를 빠뜨린 화면은 **정가(= 더 높은 가격)** 를 보여준다. 마케팅 노출 누락이지 **금전 사고가 아니다.**

---

## 3. 스키마 (신규 3테이블)

### 3.1 `deal_category` — 특가 카테고리 (관리자 CRUD)

```sql
CREATE TABLE deal_category (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  mall_id       INT NOT NULL DEFAULT 1,
  code          VARCHAR(40) NOT NULL,           -- TODAY / TIME / SEASON … 관리자 입력
  name          VARCHAR(60) NOT NULL,           -- 오늘의 특가 / 타임특가 / 시즌특가
  description   VARCHAR(200) NULL,
  schedule_type ENUM('PERIOD','TIME') NOT NULL DEFAULT 'PERIOD',
  badge_text    VARCHAR(20) NULL,               -- 카드 뱃지 문구
  badge_color   VARCHAR(20) NULL,               -- Tailwind 색 키 (rose/amber/…)
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deal_category_code (mall_id, code)
);
```

> `schedule_type` 은 **관리자 폼 UX 용**이다 (TIME 이면 시간창·요일 입력을 노출·필수화). **활성 판정 로직은 카테고리 타입을 보지 않고 `deal` 행의 실제 컬럼 값만 본다.** 판정을 데이터 하나에만 의존시켜 단순하게 유지한다.

### 3.2 `deal` — 특가 캠페인

```sql
CREATE TABLE deal (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  mall_id          INT NOT NULL DEFAULT 1,
  deal_category_id INT NOT NULL,
  title            VARCHAR(100) NOT NULL,
  subtitle         VARCHAR(200) NULL,
  starts_at        DATETIME NOT NULL,
  ends_at          DATETIME NOT NULL,
  daily_start_time TIME NULL,          -- 타임특가: 매일 반복 시작 시각
  daily_end_time   TIME NULL,          -- 타임특가: 매일 반복 종료 시각 (> start 강제)
  weekdays         VARCHAR(20) NULL,   -- '1,5,6' (1=월 … 7=일). NULL = 매일
  priority         INT NOT NULL DEFAULT 0,   -- 동일 상품 중복 특가 시 우선순위(큰 값 우선)
  sort_order       INT NOT NULL DEFAULT 0,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deal_category FOREIGN KEY (deal_category_id)
      REFERENCES deal_category(id) ON DELETE RESTRICT,
  KEY idx_deal_active (mall_id, is_active, starts_at, ends_at)
);
```

`daily_start_time`/`daily_end_time` 이 **둘 다 NULL** 이면 기간 내 상시 특가(= 오늘의특가·시즌특가). **둘 다 NOT NULL** 이면 타임특가. 한쪽만 채우는 것은 검증에서 거부한다.

### 3.3 `deal_item` — 특가 대상 상품

```sql
CREATE TABLE deal_item (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  deal_id    INT NOT NULL,
  product_id INT NOT NULL,
  deal_price INT NOT NULL,          -- 특가 판매가(원)
  qty_limit  INT NULL,              -- 선착순 한정 수량 (NULL = 무제한)
  sold_qty   INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deal_item (deal_id, product_id),
  CONSTRAINT fk_deal_item_deal FOREIGN KEY (deal_id)
      REFERENCES deal(id) ON DELETE CASCADE,
  CONSTRAINT fk_deal_item_product FOREIGN KEY (product_id)
      REFERENCES products(id) ON DELETE CASCADE,
  KEY idx_deal_item_product (product_id)
);
```

> **materialization 용 `base_price` 스냅샷 컬럼은 없다.** 원가는 `products` 에 그대로 남아 있으므로 복원 개념 자체가 불필요하다.

---

## 4. 유효가 리졸버 — `services/deal/dealService.js`

동일 상품에 활성 특가가 여럿이면 `priority DESC, deal_price ASC, deal_item.id ASC` 로 **하나만** 고른다 (MySQL 8.4 윈도우 함수 `ROW_NUMBER()`).

### 4.1 세 가지 사용 형태

| API | 용도 | 특징 |
|---|---|---|
| `applyDeals(rows)` | **표시 경로** 전반 | 상품 행 배열을 받아 `price`/`original_price`/`discount_rate` 를 특가로 덮고 `row.deal` 을 붙인다. **SELECT 절을 건드리지 않으므로** `productController.js:226` 의 `query.replace('SELECT *', 'SELECT COUNT(*)…')` 카운트 쿼리 파손 함정을 피한다. 각 지점에 **한 줄**만 추가된다. |
| `dealJoinSql(alias)` | **정렬이 필요한 쿼리** | `LEFT JOIN (…) ad ON ad.product_id = p.id AND ad.rn = 1` 프래그먼트 + `COALESCE(ad.deal_price, p.price) AS effective_price` 를 제공. 쇼핑특가 페이지의 `ORDER BY` 에서 사용. 기존 6개 정렬 지점은 필요 시 점진 retrofit(안 해도 graceful). |
| `resolveForProducts(ids)` | **결제 경로** | `product_id → { dealItemId, dealId, dealPrice }` 맵. 체크아웃이 이걸로 단가를 재확정한다. |

### 4.2 표시 필드

`applyDeals` 가 붙이는 것:

```js
row.price          = dealPrice                    // 특가가로 덮어씀 → 기존 EJS가 그대로 특가 표시
row.original_price = max(원 original_price, 원 price)  // 취소선 기준가 보정
row.discount_rate  = round((1 - dealPrice / original_price) * 100)
row.deal = { id, dealId, categoryName, badgeText, badgeColor,
             endsAt, todayEndsAt, qtyLimit, soldQty, remainQty }
```

`todayEndsAt` 은 타임특가 카운트다운용(오늘의 `daily_end_time` 을 datetime 으로 환산). 상시 특가는 `endsAt` 을 쓴다.

---

## 5. 결제 경로 (돈) — 반드시 정확해야 하는 2곳

### 5.1 `controllers/checkoutController.js`

`toScopeItem()` (`:35-44`) 이 체크아웃 3분기(cart / group_buy / 단품)의 **공통 게이트**다. 각 분기가 아이템 배열을 만든 직후 특가를 적용한다.

```js
items = await dealSvc.applyToScopeItems(items);   // price 덮어쓰기 + source 부착
```

- 특가 적용 라인에 **`source_type = 'DEAL'`, `source_id = deal_item.id`** 를 붙인다.
- `order_items` INSERT(`:659-662`)가 `item.source_type || null, item.source_id || null` 을 그대로 저장하므로 **추가 배선이 필요 없다.** (공동구매가 이미 `'GROUP_BUY'` 로 쓰는 경로)
- 공동구매 라인(`source_type = 'GROUP_BUY'`)은 **건너뛴다.**

한 번 덮으면 아래가 전부 자동으로 따라온다:

```
items[].price
  → subtotalAmount              (checkoutController.js:517)
  → couponableAmount            (discountCalculator.js:89)  ※ 쿠폰은 특가가 기준
  → totalAmount                 (checkoutController.js:607)
  → order_items.product_price   (:659)
  → orders.total_amount
  → Toss 결제 amount            (:728 — orders 행이 유일한 근거)
```

### 5.2 선착순 수량 소진 — provenance 원칙

**결제 확정 시점에 특가를 재조회하지 않는다.** 주문 생성(postForm)과 결제 승인(getSuccess) 사이에는 수 분의 간격이 있어, 그 사이 타임특가 시간창이 닫히면 "고객은 특가로 결제했는데 소진 카운터는 스킵되는" 버그가 난다. **postForm 에서 잠근 `deal_item.id` 를 `order_items.source_id` 로 운반해, 커밋 트랜잭션은 그 id 로만 소진한다.**

`completeOrderWithStockAndPaid()` (`:118-214`) 안, `groupBuySvc.recordParticipation(conn, orderId)` 와 **같은 자리**에:

```js
const ok = await dealSvc.consumeDealQuota(conn, orderId);
if (!ok) { await conn.rollback(); return { ok: false }; }   // → 호출부가 cancelTossPayment
```

```sql
-- order_items 에 기록된 deal_item 별 수량 합계로 원자적 소진
UPDATE deal_item
   SET sold_qty = sold_qty + ?
 WHERE id = ?
   AND (qty_limit IS NULL OR sold_qty + ? <= qty_limit)
-- affectedRows = 0 → 선착순 소진 → 롤백
```

재고 부족 시와 **동일한 실패 처리 경로**(`:766` `cancelTossPayment`)를 재사용한다.

### 5.3 주문 취소 → 수량 복원

`services/order/orderCancelService.js` 의 재고 복원(`:61`)과 같은 트랜잭션에서 `dealSvc.restoreDealQuota(conn, orderId)` 로 `sold_qty` 를 되돌린다.

### 5.4 `cartController.checkoutAll` (`:161-237`)

두 번째 주문 생성 경로. **재고를 차감하지 않는 기존 결함**이 있어 선착순 특가에서 오버셀 구멍이 된다.
→ **이 경로는 특가를 적용하지 않고, 특가 상품이 장바구니에 있으면 정규 `/checkout` 으로 유도한다.** (별도 이슈로 폐기 검토)

---

## 6. 스토어프론트

### 6.1 메뉴 전환

| | 기존 | 신규 |
|---|---|---|
| `feature_menu` | `TODAY_DEAL` / 오늘특가 / `/deal/today` | **`SHOPPING_DEAL` / 쇼핑특가 / `/deals`** |
| `mall_feature_menu` | `is_enabled = 1` | 기존 행 `is_enabled = 0`, 신규 행 추가 |

- `required_module = 'deal'`, `module_ready = 1` (아니면 `navigationService` 가 렌더하지 않는다).
- `/deal/today` → `/deals` **301 리다이렉트** (기존 링크·북마크 보존).

### 6.2 `/deals` — 쇼핑특가 페이지

- 상단: 활성 특가가 있는 **카테고리 탭** (`deal_category.sort_order`).
- 본문: 카테고리별 섹션 → 그 아래 특가 카드 그리드.
- `/deals/:code` — 해당 카테고리만.
- **타임특가**: 진행 중이면 `todayEndsAt` 기준 **카운트다운**, 오늘 시작 전이면 `20:00 오픈` 배지.
- **선착순**: `remainQty` 게이지 (`sold_qty / qty_limit`).
- 활성 특가가 하나도 없으면 기존 `comingSoon` 랜딩 재사용.

---

## 7. 관리자

| 화면 | 경로 | 내용 |
|---|---|---|
| 특가 카테고리 | `/admin/deal-categories` | CRUD. `schedule_type`, 뱃지, 정렬, 활성. |
| 특가 관리 | `/admin/deals` | CRUD + 상품 큐레이션(add / remove / reorder) + 행별 `deal_price`, `qty_limit`. |

- `routes/admin.js` 에 `requireMenuAccess('/admin/deals')` 로 마운트.
- **`admin_menus` INSERT 필수** — 없으면 `super_admin`·`admin` 외 전부 403 (`middleware/adminRoleGuard.js`).
- Express 5(path-to-regexp v8)는 `:id(\d+)` 를 지원하지 않는다 → `routes/admin/product-groups.js:11-16` 의 **`requireNumericId(param)` 가드 패턴을 그대로 사용**한다.
- 검증: `ends_at > starts_at`, 타임특가는 `daily_end_time > daily_start_time`(자정 넘김 거부), `deal_price > 0` 및 `deal_price < products.price`(정가보다 비싼 "특가" 거부).

---

## 8. 구현 순서

1. 스키마 3테이블 + `tables.sql` 동기화
2. `services/deal/dealService.js` (리졸버 + quota)
3. 결제 경로 배선 (checkout / cancel)
4. 관리자 CRUD + `admin_menus`
5. `/deals` 페이지 + GNB 전환 + `/deal/today` 리다이렉트
6. 표시 경로 retrofit — `applyDeals` 한 줄 삽입: 상품목록·상세·검색·장바구니·홈 섹션 리졸버
7. 검증
