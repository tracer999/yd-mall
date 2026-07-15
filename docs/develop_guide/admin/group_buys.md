# 공동구매 관리 (Group Buys)

## 1. 개요

공동구매는 **기간·목표수량·공동구매가가 있는 조건부 판매 캠페인**입니다. 셋 중 유일하게 **결제 금액을 바꾸고(주문 단가를 재계산하고) 주문에 흔적을 남깁니다**(`order_items.source_type='GROUP_BUY'` → `group_buy_participation`). 기획전이 "전시", 이벤트가 "참여"라면 공동구매는 "판매"입니다.

| | 공동구매 (`group_buy`) | 기획전 (`exhibition`) | 이벤트&혜택 (`event`) |
|---|---|---|---|
| 목적 | 조건부 판매 캠페인 | 상품 전시 랜딩 | 참여·혜택 (응모) |
| 결제 단가 | **`group_buy_product.group_buy_price` 로 서버가 재계산** | 상품가 그대로 | 없음 |
| 주문 연동 | `checkoutController` → `resolveLine()` / `recordParticipation()` | 없음 | 없음 |
| 기간 | `end_at` **NOT NULL** (기간이 본질) | `end_at` NULL 허용 | `end_at` NULL 허용 |
| 목표 | `target_enabled` + `target_quantity` (달성률 bar) | 없음 | `issue_limit` (선착순 인원) |
| 수량 제한 | 최소/최대/1인 누적 | 없음 | 없음 |
| 삭제 | 참여 기록 있으면 **차단** | 커스텀 메뉴 걸리면 차단 | 무조건 CASCADE |

- 코드 근거: `controllers/admin/groupBuyController.js:151` (subtitle "기간·목표 수량·공동구매가가 있는 조건부 판매 캠페인을 관리합니다."), `services/groupBuy/groupBuyService.js:3-23`
- **Base URL:** `/admin/group-buys` (`routes/admin.js:50`, `requireMenuAccess('/admin/group-buys')`)
- **관련 테이블:** `group_buy`, `group_buy_product`, `group_buy_participation`, (참조) `products`, `orders`, `order_items`, `users`
- **컨트롤러:** `controllers/admin/groupBuyController.js`
- **서비스:** `services/groupBuy/groupBuyService.js` (관리자·고객·주문 공용)
- **뷰:** `views/admin/group-buys/list.ejs`, `views/admin/group-buys/edit.ejs` (등록·수정 공용) — 디렉터리명은 하이픈 `group-buys`
- **이미지 업로드:** Multer 3종 `gb_list_thumbnail` / `gb_pc_hero_image` / `gb_mobile_hero_image` (`routes/admin/group-buys.js:27-31`). 저장 경로 `public/uploads/group-buys/` (`middleware/upload.js:28-32`, `49-50`), 이미지 MIME 만 허용, 상한 `MAX_UPLOAD_FILE_MB`(기본 20MB)
- **권한:** `admin_menus.visible_roles = super_admin,admin,content_admin` (DB, id=46)
- **메뉴 위치:** `admin_menus` 상 `parent_id=31` — **페이지/전시 관리** 하위입니다(기획전 관리와 같은 그룹).

> **이미지 필드에 `gb_` 접두어가 붙는 이유:** multer 의 destination 이 fieldname 으로만 저장 경로를 고르는데, 접두어가 없으면 기획전의 `list_thumbnail` 과 이름이 겹쳐 같은 폴더로 섞입니다(`routes/admin/group-buys.js:21-26`).

---

> ### ⚠️ CRITICAL — 1인 구매 제한은 **동작하지 않습니다**
>
> 관리자 상품/가격 폼의 **1인 구매 제한**(`per_user_limit_quantity`, `views/admin/group-buys/edit.ejs:311`)은 입력하면 `group_buy_product` 에 **저장은 되지만**(`groupBuyController.js:431,442`), 구매 시점의 유일한 판정 지점인 `services/groupBuy/groupBuyService.js` 의 `resolveLine()`(:330-378)이 이 값을 **전혀 읽지 않습니다.** 검사하는 것은 `min_order_quantity` · `max_order_quantity` · 재고뿐입니다.
>
> **즉 운영자가 "1인 2개 제한"을 걸어도 고객은 몇 번이든 살 수 있습니다.** 폼에 값이 남아 있어 "제한이 걸린다"고 오인하기 쉬운 상태이니, 수량 통제가 필요하면 `max_order_quantity`(1회 주문당 최대 수량)를 쓰거나 `resolveLine()` 에 누적 구매량 검사를 구현해야 합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/group-buys` | getList | 목록 (검색 `q`, 상태 필터 `status`) |
| GET | `/admin/group-buys/add` | getAdd | 등록 폼 |
| POST | `/admin/group-buys/add` | postAdd | 등록 처리 (multipart) |
| GET | `/admin/group-buys/product-search` | getProductSearch | 상품 검색 모달용 AJAX (JSON) |
| GET | `/admin/group-buys/:id/edit` | getEdit | 수정 폼 (기본정보 + 상품/가격 + 참여자) |
| POST | `/admin/group-buys/:id/edit` | postEdit | 기본정보 수정 (multipart) |
| POST | `/admin/group-buys/:id/delete` | postDelete | 삭제 (참여 기록 있으면 차단) |
| POST | `/admin/group-buys/:id/products` | postSaveProducts | 상품/가격 일괄 저장 |
| POST | `/admin/group-buys/:id/products/add` | postAddProduct | 대상 상품 담기 |
| POST | `/admin/group-buys/:id/products/:mappingId/delete` | postRemoveProduct | 상품 빼기 |

**라우팅 주의** (`routes/admin/group-buys.js:10-19`): Express 5 는 `:id(\d+)` 를 지원하지 않아 정적 세그먼트를 `/:id` 앞에 두고 `requireNumericId` 로 숫자 검증합니다(기획전과 동일).

설계서 §7-2 는 REST JSON API 를 그렸지만, 실제 구현은 **폼 POST + EJS + redirect** 입니다. 이 저장소 관리자가 전부 SSR 폼이라, 혼자 JSON API 를 얹으면 인증·CSRF·에러 렌더가 갈라지기 때문입니다(`groupBuyController.js:10-13`). JSON 은 상품 검색 하나뿐입니다.

---

## 3. 목록 (GET /admin/group-buys)

`group_buy` + 서브셀렉트 5개 (`groupBuyController.js:129-145`):

- `main_price` — 대표 상품의 `group_buy_price` (`role='MAIN'` 우선, sort_order)
- `main_product_name` — 대표 상품명
- `product_count` — 담긴 상품 수
- `order_count` — `group_buy_participation` 중 `status IN ('PAID','CONFIRMED')` 건수
- `revenue` — 같은 조건의 `SUM(quantity * unit_price)` (CANCELLED/REFUNDED 제외)

필터는 **검색어 `q`(공동구매명·slug LIKE)와 상태 `status` 두 개뿐**입니다(`groupBuyController.js:118-124`). 카테고리·기간·브랜드·목표달성 필터는 **없습니다**. 정렬은 `g.id DESC` 고정. 각 행은 `svc.decorate()` 로 `phase`·`progressRate`·`targetReached` 등을 붙입니다.

`order_count`·`revenue` 는 `group_buy_participation` 중 **`status IN ('PAID','CONFIRMED')` 행만** 집계합니다(CANCELLED/REFUNDED 제외 — 다만 그 두 상태를 실제로 쓰는 코드가 없다는 점은 §7 참고).

---

## 4. 등록·수정 폼

등록·수정 모두 `views/admin/group-buys/edit.ejs` 를 씁니다(`renderForm`, `groupBuyController.js:167-205`). 등록 폼 기본값은 `start_at=now`, `end_at=now+7일`, `closing_hours=24`, `ended_purchase_policy='DISALLOW'` (208-228행).

수정 화면은 세 블록입니다.
1. **기본정보** (POST `/:id/edit`)
2. **상품/가격** (POST `/:id/products`, `/:id/products/add`, `/:id/products/:mappingId/delete`) — 관리자에겐 비공개·판매중지 상품도 보여줍니다(`publicOnly: false`, 174행. 왜 고객 화면에서 빠졌는지 알아야 하므로)
3. **참여 현황** — `group_buy_participation` LEFT JOIN `orders`·`users`, 최근 100건 **읽기 전용** (176-185행)

### 4.1 기본정보 필드 (`buildFields`, 75-99행)

| name | 저장 컬럼 | 비고 |
|------|-----------|------|
| title | `title` | 필수, 200자 |
| slug | `slug` | 비우면 title 에서 생성. `svc.ensureUniqueSlug` 가 `(mall_id, slug)` 유니크 보장 |
| summary | `summary` | 500자 |
| description / notice | 동명 컬럼 | HTML, 저장 시 `sanitize()` |
| status | `status` | DRAFT / PUBLISHED / HIDDEN |
| start_at | `start_at` | **필수** |
| end_at | `end_at` | **필수** (공동구매는 기간이 필수) |
| closing_hours | `closing_hours` | 종료 N시간 전부터 "마감임박". 양수 아니면 24 |
| list_visible / search_visible | 동명 컬럼 | 체크박스 |
| target_enabled | `target_enabled` | 목표 수량 사용 |
| target_quantity | `target_quantity` | `target_enabled=0` 이면 **NULL 로 지움** (다시 켰을 때 옛 목표가 되살아나지 않도록, 91-92행) |
| participant_count_visible / quantity_count_visible / progress_visible | 동명 컬럼 | 표시 옵션 |
| ended_purchase_policy | `ended_purchase_policy` | **DISALLOW**(기본) / ALLOW |
| delivery_note | `delivery_note` | 배송 예정 안내 (200자) |
| `gb_*` / `gb_*_clear` | `*_url` 3종 | 파일 업로드 / 삭제 체크 |

**검증** (`validate`, 102-109행): 제목·시작·종료 필수, `end_at <= start_at` 거부, `target_enabled` 인데 `target_quantity` 없으면 거부.

### 4.2 상품/가격 매핑

- **담기(POST /:id/products/add):** 다른 몰 상품 거부(353-356행). **첫 상품은 `role='MAIN'`, 이후는 `'SUB'`** (361행). 초기값은 `normal_price = products.original_price || price`, `group_buy_price = products.price`, `discount_rate` 는 서버 계산 (363-377행)
- **일괄 저장(POST /:id/products):** `products[i][mapping_id|role|sort_order|normal_price|group_buy_price|min_order_quantity|max_order_quantity|per_user_limit_quantity|purchase_enabled|visible]`
  - `group_buy_price` 가 없는 행은 **건너뜁니다** (결제 금액을 정할 수 없으므로, 412-414행)
  - `max < min` 이면 `max` 를 NULL 로 (아무 수량도 못 사게 되는 상황 방지, 419-420행)
  - `discount_rate` 는 폼 값을 무시하고 `svc.calcDiscountRate(normal, gb)` 로 **서버가 계산** (433행)
- 중복 담기는 `uk_gb_product (group_buy_id, product_id)` 가 막고 `ER_DUP_ENTRY` → "이미 담긴 상품입니다." (381-383행)

---

## 5. DB 테이블

### 5.1 `group_buy` (캠페인)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint PK | |
| mall_id | bigint | 몰 ID |
| title / slug / summary | varchar | `uk_group_buy_mall_slug (mall_id, slug)` |
| description / notice | text | HTML |
| list_thumbnail_url / pc_hero_image_url / mobile_hero_image_url | varchar(500) | |
| status | varchar(30) | **DRAFT** / PUBLISHED / HIDDEN |
| start_at | datetime NOT NULL | 판매 시작 |
| end_at | datetime **NOT NULL** | 판매 종료. NULL 을 허용하지 않는다 |
| closing_hours | int (기본 24) | 종료 N시간 전 = CLOSING(마감임박) |
| list_visible / search_visible | tinyint(1) | |
| target_enabled / target_quantity | tinyint(1) / int NULL | 목표 수량 |
| participant_count_visible / quantity_count_visible / progress_visible | tinyint(1) | 표시 옵션 |
| current_quantity | int | **현재 참여 수량 합계 (비정규화 카운터)** |
| participant_count | int | **현재 참여자 수 = 주문 건수 (비정규화 카운터)** |
| ended_purchase_policy | varchar(30) | **DISALLOW**(기본) / ALLOW |
| delivery_note | varchar(200) | |
| view_count | int | |

> **`minimum_success_quantity` · `fail_policy` 컬럼은 없습니다.** 목표 수량(`target_quantity`)은 달성률 bar 를 그리는 **표시용**일 뿐이고, 목표 미달 시 주문을 취소·환불하는 처리는 **미구현**입니다. 설계상의 목표달성형·단계별가격형(2·3차)은 착수하지 않았습니다.
> **`group_buy_coupon` · `group_buy_notice` 테이블도 만들지 않았습니다.** 유의사항은 `group_buy.notice` TEXT 컬럼 하나로 대체합니다.

### 5.2 `group_buy_product` (대상 상품/가격)

`id`, `group_buy_id`(FK CASCADE), `product_id`(FK CASCADE, **int**), `role`(**MAIN**/SUB), `sort_order`, `normal_price`(NULL 이면 products.price 사용), `group_buy_price`(**NOT NULL** — 결제 금액을 항상 이 값으로 재계산), `discount_rate`(자동 계산), `min_order_quantity`(기본 1), `max_order_quantity`(NULL=재고까지), `per_user_limit_quantity`(**2차 — 현재 검증 로직 없음**), `purchase_enabled`, `visible`
유니크: `uk_gb_product (group_buy_id, product_id)`

### 5.3 `group_buy_participation` (참여 = 결제 확정 기록)

`id`, `group_buy_id`(FK CASCADE), `user_id`(int NULL — 비회원 주문), `order_id`(int NULL), `order_item_id`(int NULL, **멱등성 키**), `product_id`, `quantity`, `unit_price`(결제 시점 공동구매가), `status`(**PAID**/CONFIRMED/CANCELLED/REFUNDED)
유니크: `uk_gb_participation_order_item (order_item_id)`

### 5.4 상태 모델

`status` 는 "발행했는가"만, **phase 는 기간에서 파생**합니다(`groupBuyService.js:70-80`). CLOSING 은 ACTIVE 의 부분집합입니다.

| phase | 조건 | 라벨 |
|-------|------|------|
| SCHEDULED | now < start_at | 예정 |
| ACTIVE | 기간 내 && 남은시간 > closing_hours | 진행중 |
| CLOSING | 기간 내 && 남은시간 ≤ closing_hours | 마감임박 |
| ENDED | now > end_at | 종료 |

구매 가능 여부: `phase ∈ {ACTIVE, CLOSING}` 이거나 `phase=ENDED && ended_purchase_policy='ALLOW'` (`decorate`, 94-95행).

---

## 6. 고객 화면 · 주문 연계

- 라우트: [`routes/group-buy.js`](../../../routes/group-buy.js) — `GET /group-buy`(목록), `GET /group-buy/view/:id`(→ slug 301), `GET /group-buy/:slug`(상세), `POST /group-buy/:slug/buy`(바로구매)
- 컨트롤러: [`controllers/groupBuyController.js`](../../../controllers/groupBuyController.js)
- URL 은 `/group-buy` 고정 (`feature_menu.GROUP_BUY.default_path`)
- **0건 폴백:** 발행+목록노출 공동구매가 0건이면 `user/coming_soon` 준비중 랜딩 (`controllers/groupBuyController.js:59`)
- 목록 필터: `phase`(all/ACTIVE/CLOSING/SCHEDULED/ENDED), 정렬: `ending_soon`(기본)/popular/participants/discount/latest
- 상품 노출: `gbp.visible=1 AND p.visibility='PUBLIC' AND p.status <> 'OFF'` (`groupBuyService.js:279`)

### 6.1 구매 → 결제 → 참여 기록

1. `POST /group-buy/:slug/buy` → `svc.resolveLine()` 이 구매 가능 여부·단가 확정 → `/checkout?product_id=&quantity=&group_buy_id=` 로 리다이렉트 (`controllers/groupBuyController.js:159-180`). **1차는 바로구매만** (장바구니는 `carts` 에 가격 컬럼이 없어 2차)
2. `checkoutController` 가 주문서 렌더(`:278`)·주소 검증(`:400`)·주문 생성(`:488`) **세 지점 모두**에서 `resolveLine()` 을 다시 호출합니다. 프론트가 보낸 가격은 절대 신뢰하지 않습니다(`groupBuyService.js:318-329`)
3. 주문 항목에 `source_type='GROUP_BUY'`, `source_id=group_buy.id` 저장 (`checkoutController.js:496-497`, `659`)
4. 결제 확정 트랜잭션 안에서 `groupBuySvc.recordParticipation(conn, orderId)` 호출 (`checkoutController.js:204`) → `order_items` 중 `source_type='GROUP_BUY'` 를 `INSERT IGNORE INTO group_buy_participation` 하고, **실제로 INSERT 된 행에 대해서만** `current_quantity += quantity`, `participant_count += 1` (`groupBuyService.js:392-422`)

`resolveLine` 실패 사유(`reason`)와 고객 메시지: `notfound` / `closed` / `disabled` / `soldout` / `min` / `max` / `stock` (`controllers/groupBuyController.js:44-52`)

---

## 7. 주의사항

- **결제 금액은 항상 서버가 재계산합니다.** 화면·폼의 가격은 표시용입니다. 가격 로직을 고칠 때는 `resolveLine()` 한 곳만 보면 됩니다(`groupBuyService.js:330-378`).
- **`current_quantity` / `participant_count` 는 비정규화 카운터입니다.** `recordParticipation()` 만 갱신하고 **관리자는 읽기만** 합니다(`groupBuyController.js:19-22`). 관리자 폼에 이 컬럼을 노출하면 실제 참여와 어긋납니다.
- **주문 취소·환불이 카운터를 되돌리지 않습니다.** `group_buy_participation.status` 에 CANCELLED/REFUNDED 값이 정의돼 있지만, 저장소 전체에서 `group_buy_participation` 을 UPDATE/DELETE 하거나 `current_quantity`·`participant_count` 를 감산하는 코드는 **없습니다**(유일한 쓰기는 `recordParticipation()` 의 `INSERT IGNORE` + 카운터 증가). 즉 두 상태값은 현재 죽은 값이고, 목록의 `order_count`·`revenue` 집계만 `PAID`/`CONFIRMED` 로 걸러질 뿐입니다. 취소·환불 연동은 미구현입니다.
- **참여 기록이 있으면 삭제 불가.** `group_buy_participation` 이 `ON DELETE CASCADE` 라 함께 지워지는데, 그 안에 결제된 주문의 출처가 들어 있어 CS 추적이 끊깁니다. `postDelete` 가 COUNT 로 차단하고 "'숨김' 으로 바꾸세요" 를 안내합니다(311-322행).
- **몰 스코프.** `group_buy_product` 에는 `mall_id` 가 없습니다. 반드시 `findOwned(mallId, id)` 로 부모를 먼저 확인해야 합니다(15-17행).
- **⚠️ `per_user_limit_quantity` 는 저장만 되고 구매를 막지 않습니다.** 문서 상단의 CRITICAL 경고를 참고하세요. `resolveLine()`(`groupBuyService.js:330-378`)은 `min_order_quantity`·`max_order_quantity`·재고만 검사합니다.
- **참여 기록은 재실행해도 안전합니다.** `recordParticipation()` 이 결제 확정 트랜잭션 안에서 `INSERT IGNORE`(`order_item_id` UNIQUE) 로 행을 만들고, **실제로 INSERT 된 행에 대해서만** 같은 자리에서 카운터를 올립니다. 같은 주문으로 두 번 호출돼도 중복 집계되지 않습니다.
- **`role='MAIN'` 은 강제되지 않습니다.** 첫 상품에 자동 부여될 뿐, 일괄 저장에서 운영자가 여러 행을 MAIN 으로 만들 수 있습니다. 고객 상세는 정렬 첫 행 하나만 구매 대상으로 씁니다(`controllers/groupBuyController.js:115`).
- **HTML 이중 새니타이즈.** `description`·`notice` 는 저장 시와 렌더 시 양쪽에서 `htmlSanitizer` 를 통과합니다.

### 7.1 미구현 (알고 있어야 할 것)

| 항목 | 현재 상태 |
|------|-----------|
| 1인 구매 제한 | **저장만 됨 — 구매를 막지 않음** (문서 상단 CRITICAL) |
| 목표 미달 처리 | **없음.** `minimum_success_quantity`·`fail_policy` 컬럼 자체가 없음 |
| 장바구니 담기 | **없음. 바로구매만.** `carts` 에 가격·옵션 컬럼이 없어 공동구매가를 실을 곳이 없습니다 |
| 옵션 / SKU | 없음 (상품 단위 1행) |
| 관리자 목록 카테고리·기간·브랜드 필터 | 없음 (검색어 + 상태뿐) |
| 상단 배너 | 없음 |
| 혜택 영역 (전용 쿠폰·사은품) | 없음. `group_buy_coupon` 테이블 미생성 |
| 이벤트 로그 · 성과 통계 | 없음. 목록의 주문 수·매출 집계가 전부 |
| 주문 취소·환불 시 카운터 복원 | 없음 (위 주의사항 참고) |

---

*Last Updated: 2026-07-15*
