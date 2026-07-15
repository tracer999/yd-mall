# 프로모션 (기획전 · 전문관 · 이벤트 · 공동구매 · 쿠폰존 · 쇼핑특가 · 쇼핑라이브 · 아울렛 · 추천)

## 1. 개요

고객 화면의 프로모션은 **서로 다른 9개 모듈**입니다. 이름이 비슷하다고 섞지 마세요.

| 모듈 | 성격 | 라우트 | 컨트롤러 | 서비스 | 주 테이블 |
|------|------|--------|----------|--------|-----------|
| 기획전 | 상품 전시 랜딩(큐레이션). 구매는 개별 상품 상세에서 | `routes/exhibition.js` (`/exhibition`) | `exhibitionController.js` | `services/exhibition/exhibitionService.js` | `exhibition`, `exhibition_section`, `exhibition_product` |
| **전문관** | **상시 운영** 전시관. 기획전 테이블 재사용(`exhibition_type='SPECIALTY'`) | `routes/specialty.js` (`/specialty`) | `specialtyController.js`(목록) + `exhibitionController.getDetail`(상세) | 위와 동일 | **신규 테이블 0개** |
| 이벤트 | 응모·혜택 **참여**. 선착순 슬롯 | `routes/event.js` (`/event`) | `eventController.js` | `services/event/eventService.js` | `event`, `event_participant` |
| 공동구매 | 기간·목표수량 **조건부 판매**. 전용가로 바로구매 | `routes/group-buy.js` (`/group-buy`) | `groupBuyController.js` | `services/groupBuy/groupBuyService.js` | `group_buy`, `group_buy_product` |
| 쿠폰존 | 쿠폰을 **받는 곳**(다운로드·코드 등록) | `routes/coupon.js` (`/coupon`) | `couponController.js` | `services/coupon/*` | `coupons`, `coupon_download`, `user_coupons` |
| **쇼핑특가** | 기간·시간창·요일·선착순 조건부 **가격 인하**. **결제 금액에 실제 반영되는 유일한 모듈** | `routes/feature.js` (`/deals`) | `dealController.js` | `services/deal/dealService.js` | `deal_category`, `deal`, `deal_item` |
| **쇼핑라이브** | 라이브 방송 + 방송 전용가 **바로구매** | `routes/live.js` (`/live`) | `liveController.js` | `services/live/liveService.js` | `live_show`, `live_show_product`, `live_show_coupon`, `live_show_notice` |
| **아울렛** | 리퍼브·전시·임박 등 **사유 있는 상시 할인관** | `routes/outlet.js` (`/outlet`) | `outletController.js` | `services/outlet/outletService.js` | `outlet_product`, `outlet_setting` |
| **추천** | 개인화·MD·트렌딩 **추천 랜딩** | `routes/recommend.js` (`/recommend`) | `recommendController.js` | `services/recommend/recommendService.js` | `recommend_group`, `recommend_group_item` |

URL 은 전부 **단수형**이며(`/deals` 제외) `feature_menu.*.default_path` 와 1:1 로 고정입니다. 바꾸면 GNB 메뉴가 404 됩니다(각 라우트 파일 상단 주석).

⚠️ **`/specialty`·`/recommend`·`/outlet`·`/live`·`/coupon`·`/group-buy` 를 `routes/feature.js` 안에 두면 안 됩니다.** `featureRoutes` 가 `app.js` 에서 `'/'` 에 **먼저** 마운트되므로, 거기에 같은 경로 핸들러가 있으면 뒤의 전용 라우터가 **영영 닿지 못합니다**.

공통 규칙:
- 몰 스코프: 모든 조회에 `mall_id = req.mallId || 1`.
- 준비중 폴백: 보여줄 항목이 0건이면 빈 목록 대신 `views/user/coming_soon.ejs`(`routes/feature.js` 의 `COMING_SOON` 정의)를 렌더합니다. dev·prod 가 같은 DB 라서 생긴 배포 안전장치입니다. → [layout.md](./layout.md) §10.1
- 운영자 입력 HTML(description·notice·섹션 HTML)은 렌더 직전 `services/display/htmlSanitizer.sanitize()` 를 통과시킵니다.
- `phase`(예정/진행중/종료)는 **DB 에 저장하지 않고** `start_at`·`end_at` 에서 파생합니다. **예외: 쇼핑라이브의 `status` 는 관리자가 수동 전환**합니다(시간은 표시 보정에만 사용).
- **가격 표시:** 기획전·상품목록·상세·장바구니 등 대부분의 경로가 `dealSvc.applyDeals()` 를 거칩니다. 단 공동구매·쇼핑라이브 라인은 **전용가가 특가를 대신**합니다(§5, §8).

---

## 2. 라우트

| URL | 메서드 | 액션 | 인증 | 설명 |
|-----|--------|------|------|------|
| /exhibition | GET | exhibitionController.getList | - | 기획전 목록 (`?sort=`, `?page=`). **SPECIALTY 제외** |
| /exhibition/view/:id | GET | redirectToSlug | - | id → slug 301 |
| /exhibition/:slug | GET | getDetail | - | 기획전 상세 (`?tab=`) |
| /specialty | GET | specialtyController.getList | - | 전문관 목록 (`?sort=popular\|latest`, `?page=`) |
| /specialty/:slug | GET | **exhibitionController.getDetail** | - | 전문관 상세 (기획전 상세 공유). 유형이 어긋나면 **301** |
| /deals | GET | dealController.getIndex | - | 쇼핑특가 — 특가 카테고리별 섹션 |
| /deals/:code | GET | dealController.getIndex | - | 특정 특가 카테고리만(탭은 항상 전체 노출) |
| /deal/today | GET | — | - | **301 → `/deals`** (구 URL 보존) |
| /live | GET | liveController.getList | - | 쇼핑라이브 목록 |
| /live/:slug | GET | getDetail | - | 라이브 상세(3탭) |
| /live/:slug/buy | POST | postBuy | - | 바로구매 → `/checkout` 리다이렉트 |
| /outlet | GET | outletController.getList | - | 아울렛 (`?type=`·`?categoryId=`·`?price=`·`?sort=`·`?page=`) |
| /recommend | GET | recommendController.getIndex | - | 추천 랜딩 (`noindex,follow`) |
| /event | GET | eventController.getList | - | 이벤트 목록 (`?phase=`) |
| /event/view/:id | GET | redirectToSlug | - | id → slug 301 |
| /event/:slug | GET | getDetail | - | 이벤트 상세 |
| /event/:slug/apply | POST | postApply | 로그인 | 이벤트 참여(응모) |
| /group-buy | GET | groupBuyController.getList | - | 공동구매 목록 (`?phase=`, `?sort=`, `?page=`) |
| /group-buy/view/:id | GET | redirectToSlug | - | id → slug 301 |
| /group-buy/:slug | GET | getDetail | - | 공동구매 상세 |
| /group-buy/:slug/buy | POST | postBuy | - | 바로구매 → `/checkout` 리다이렉트 |
| /coupon | GET | couponController.getList | - | 쿠폰존 목록 (`?category=`, `?brand=`) |
| /coupon/:id | GET | getDetail | - | 쿠폰 소개 상세 (숫자 id 만) |
| /coupon/:id/claim | POST | postClaim | 로그인 | 쿠폰 받기 |
| /coupon/apply-code | POST | postApplyCode | 로그인 | 쿠폰 코드 등록 |

> `/view/:id` 는 반드시 `/:slug` 보다 **먼저** 선언되어 있습니다. 뒤에 두면 `'view'` 가 slug 로 잡힙니다.
> `/coupon` 은 Express 5(path-to-regexp v8)가 `:id(\d+)` 를 지원하지 않아 `requireNumericId` 미들웨어로 숫자 검증하고, `/:id/claim` 을 `/:id` 보다 먼저 둡니다.

---

## 3. 기획전 (/exhibition)

**목록** — `exhibitionService.getPublicList(mallId, { sort, page, limit: 12, excludeTypes: ['SPECIALTY'] })`
- 조건: `status='PUBLISHED' AND list_visible=1 AND NOT (ended_access_policy='BLOCK' AND end_at < NOW())`
- ⚠️ **전문관(`exhibition_type='SPECIALTY'`)은 기획전 목록에서 제외**됩니다. 종료일이 없는 상시 매장이라 "종료임박·기간 배지" 문법이 성립하지 않습니다. 전문관은 `/specialty` 가 따로 렌더합니다(§11).
- 정렬(`?sort=`): `latest`(기본) / `ending_soon` / `popular`
- 각 행에 노출 상품 수(`product_count`)를 서브쿼리로 붙입니다.
- **`result.total === 0 && page === 1` 이면 준비중 랜딩**(`COMING_SOON.exhibition`). "발행 행이 있는가" 를 따로 묻지 않고 목록 결과로 판정합니다 — 그래야 `list_visible=0`·종료차단으로 목록이 비는 경우도 폴백에 걸립니다.
- 전달 변수: exhibitions, pagination, sorts, sort, currentUser, seo

**상세(`/:slug`)** — `getPublicBySlug` (없으면 `next()` → 404)
- `phase === 'ENDED' && ended_access_policy === 'BLOCK'` 이면 상세도 열지 않습니다(404).
- 섹션(`exhibition_section`, `is_active=1`) + 상품(`exhibition_product` JOIN `products`, `visible=1 AND p.visibility='PUBLIC' AND p.status<>'OFF'`)을 조회합니다. `display_config_json.hide_sold_out` 이면 품절 상품도 제외.
- **탭:** `is_tab=1` 인 섹션 중 상품이 있거나 `section_type='HTML'` 인 것만. `?tab={section_code}` 로 서버가 고릅니다(JS 없이 동작). 미지정/미매칭이면 전체 탭 — 섹션 미배정 상품이 맨 앞, 이어서 섹션 순서대로 `groups` 배열.
- **기획전 상품 가격에도 쇼핑특가가 적용됩니다** (`exhibitionService` 가 조회 결과에 `dealSvc.applyDeals()`).
- `view_count` +1 은 await 하지 않습니다(화면을 막지 않음).
- `search_visible=0` 이면 `robots: 'noindex,nofollow'`.
- 전달 변수: exhibition, descriptionHtml, noticeHtml, tabs, activeCode, groups, productCount, currentUser, seo

**브랜드 귀속** — `exhibition.brand_category_id`(`categories` type=BRAND 참조). 현재는 **관리자 등록 화면에서만** 설정·표시하며, 고객 화면 조회 조건으로는 아직 쓰이지 않습니다.

---

## 4. 이벤트 (/event)

**목록** — `eventService.list(mallId, { phase })`
- `hasAny(mallId)`(= `status='PUBLISHED' AND list_visible=1` 1건 이상)가 false 면 준비중 랜딩(`COMING_SOON.event`).
- 필터(`?phase=`): `all`(기본) / `upcoming` / `ongoing` / `ended` — SQL 은 `start_at`·`end_at` 비교로 만듭니다.
- 정렬: 진행중 → 예정 → 종료, 그 안에서 `start_at DESC, id DESC`.
- 각 행에 파생 필드: `phase`, `phaseLabel`(예정/진행중/종료), `isOngoing`, `isFull`(`issued_count >= issue_limit`), `remaining`, `participable`.

**상세(`/:slug`)** — `findBySlug`(없으면 404). `view_count` +1. `content`·`notice` 는 sanitize 하여 `contentHtml`·`noticeHtml` 로 전달. 로그인 상태면 `event_participant` 로 `participated` 판정. `?r=` 쿼리가 `flash` 로 전달됩니다(ok/full/closed/duplicate/login).

**참여(POST /:slug/apply)** — `eventService.participate()`
- 비로그인이면 `?r=login` 으로 되돌립니다(라우터 미들웨어가 아니라 컨트롤러가 검사).
- `ev.participable` 이 false 면 `?r=closed`.
- **참여 가능 유형은 `APPLY` 뿐입니다**(`PARTICIPABLE_TYPES`). `ATTENDANCE`(UNIQUE 제약상 일별 출석 불가), `COUPON_PACK`(쿠폰 지급 로직 없음), `PURCHASE`(주문 검증 없음)는 참여 슬롯을 소모하지 못하게 막혀 있습니다.
- 선착순 경쟁 조건은 DB 로 막습니다: 기간·수량·유형을 조건에 넣은 `UPDATE event SET issued_count = issued_count + 1 ...` 의 `affectedRows` 로 슬롯을 먼저 확보하고, 그 다음 `event_participant` INSERT. 중복은 UNIQUE(event_id, user_id) 가 막고 `ER_DUP_ENTRY` 를 `'duplicate'` 로 변환합니다.
- 결과: `'ok' | 'full' | 'closed' | 'duplicate'` → `/event/:slug?r={결과}`.

---

## 5. 공동구매 (/group-buy)

**목록** — `groupBuyService.getPublicList(mallId, { phase, sort, page, limit: 12 })`
- `hasAnyPublic(mallId)` 가 false 면 준비중 랜딩(`COMING_SOON['group-buy']`).
- 필터(`?phase=`): `all` / `ACTIVE` / `CLOSING` / `SCHEDULED` / `ENDED`
- 정렬(`?sort=`): `ending_soon`(기본) / `popular` / `participants` / `discount` / `latest`
- 대표 상품은 **LEFT JOIN** 으로 붙입니다 — 상품을 연결하기 전에 발행할 수 있으므로, 대표 상품이 없어도 목록에서 사라지지 않습니다.

**파생 필드(`decorate`)**
- `phase`: `now < start_at` → SCHEDULED, `now > end_at` → ENDED, 종료 `closing_hours`(기본 24) 시간 이내 → CLOSING, 나머지 ACTIVE.
- `purchasable`: ACTIVE·CLOSING, 또는 ENDED + `ended_purchase_policy='ALLOW'`.
- `progressRate`: `target_enabled` 이고 `target_quantity > 0` 일 때 `current_quantity / target_quantity` (100% 상한), 아니면 null. `targetReached`, `endsAtMs`(클라이언트 타이머 기준 시각)도 함께.

**상세(`/:slug`)** — 상품 목록(`group_buy_product` JOIN `products`, `visible=1 AND visibility='PUBLIC' AND status<>'OFF'`, `role='MAIN'` 우선 정렬)과 관련 공동구매 4건(같은 몰의 진행중 다른 건)을 조회. `mainProduct = products[0]`. `?error=` 코드는 아래 표의 문구로 변환해 전달합니다.

**바로구매(POST /:slug/buy)** — `resolveLine(mallId, groupBuyId, product_id, quantity)` 로 서버가 검증·단가 확정 후 `/checkout?product_id=&quantity=&group_buy_id=` 로 리다이렉트합니다. **여기서 결제하지 않습니다.** 최종 금액은 `checkoutController` 가 `resolveLine()` 을 다시 불러 계산합니다(주문서 URL 을 직접 두드릴 수 있으므로 양쪽 다 검증).

| reason | 메시지 (`LINE_ERRORS`) |
|--------|------------------------|
| notfound | 판매 중인 상품을 찾을 수 없습니다. |
| closed | 지금은 구매할 수 없는 공동구매입니다. |
| disabled | 해당 상품은 현재 구매할 수 없습니다. |
| soldout | 품절된 상품입니다. |
| min | 최소 구매 수량보다 적습니다. |
| max | 최대 구매 수량을 초과했습니다. |
| stock | 재고가 부족합니다. |

- 결제 확정 시 `recordParticipation(conn, orderId)` 이 `order_items.source_type='GROUP_BUY'` 행을 읽어 `current_quantity`·`participant_count` 를 올립니다(체크아웃 트랜잭션 안에서).

### 5.1 ⚠️ 아직 없는 것 (1차 범위 밖)

| 항목 | 상태 |
|---|---|
| **장바구니 담기** | **미구현 — 바로구매만.** `carts` 에 가격·옵션 컬럼이 없어 전용가를 실을 수 없습니다 |
| 카테고리 필터 | 미구현 (목록 필터는 `phase`·`sort` 뿐) |
| 상단 배너 | 미구현 |
| 혜택 영역 | 미구현 |

### 5.2 ⚠️ `per_user_limit_quantity` 는 **작동하지 않습니다**

`group_buy_product.per_user_limit_quantity`(1인 구매 제한)는 **관리자 화면에서 저장만 되고, `resolveLine()` 이 검증하지 않습니다.** `min_order_quantity`·`max_order_quantity`·재고는 검증하지만 1인 누적 구매량은 아무 데서도 확인하지 않습니다 — 같은 사람이 여러 번 주문하면 제한을 넘습니다. (`live_show_product.per_user_limit_quantity` 도 동일한 상태입니다.)

운영자에게는 "설정했으니 제한된다"로 보이는 값이니, 실제로 막아야 한다면 `resolveLine()` 에 `order_items` 누적 수량 검증을 추가해야 합니다.

---

## 6. 쿠폰존 (/coupon)

**받는 곳(`/coupon`)과 보유함(`/mypage/coupons`)은 다릅니다.** 보유 쿠폰은 [mypage.md](./mypage.md) §6.

**목록(GET /coupon)** — 노출 대상은 "자동발급이 아닌" 쿠폰:
- `status='ACTIVE' AND (mall_id IS NULL OR mall_id = ?)`
- `issue_method='DOWNLOAD'` 이고 수령기간(`download_start_at`~`download_end_at`) 안이거나, `issue_method='CODE'`(상시 소개)
- 0건이면 준비중 랜딩(`COMING_SOON.coupon`).
- 적용 대상(`scope_json`)으로 그룹핑: `ALL`(전 상품) → `CATEGORY` → `BRAND` → `SHIPPING`(배송비). `?category=`·`?brand=` 로 필터하면 그룹 필터링이 걸립니다(둘 다 오면 category 우선).
- 버튼 상태는 **서버가 판정**합니다(`buttonState`): `code_required`(CODE 형) / `login`(비로그인) / `claimed` / `sold_out`(`issued_count >= issue_limit`) / `ended`(`download_end_at` 경과) / `available`.
- 혜택 문구는 `discountCalculator.benefitLabel()`.

**상세(GET /coupon/:id)** — 노출 대상 조건(`status='ACTIVE'`, 몰 스코프, `issue_method IN ('DOWNLOAD','CODE')`)을 만족하지 않으면 `/coupon` 리다이렉트.

**받기(POST /coupon/:id/claim)** — 로그인 필수. 한 트랜잭션에서 `SELECT ... FOR UPDATE` 로 쿠폰 행을 잠그고 `couponIssueService.claimDownloadCoupon()` 이 선착순 슬롯(`issued_count`)과 `coupon_download` PK 중복을 함께 처리합니다. 결과는 `?msg=` / `?err=` 로 되돌아옵니다(body 의 `redirect === 'detail'` 이면 상세로).

| reason | 메시지 |
|--------|--------|
| already_claimed / sold_out / ended / not_started / inactive / expired / not_downloadable | `CLAIM_MESSAGE` 매핑 (이미 받은 쿠폰 / 선착순 마감 / 수령 기간 종료 / 아직 수령 기간 아님 / 지금은 받을 수 없음 / 만료 / 다운로드 대상 아님) |

**코드 등록(POST /coupon/apply-code)** — 로그인 필수. `couponIssueService.redeemCouponCode(userId, coupon_code)`. 실패 사유는 `CODE_MESSAGE`(empty / not_found / already_held / issue_limit / inactive / expired). **체크아웃이 아니라 쿠폰존에 둔 이유:** 결제 도중 코드를 넣기보다 쿠폰함에 미리 담는 흐름이 자연스럽고 체크아웃 트랜잭션도 단순해집니다(컨트롤러 주석).

---

## 7. 쇼핑특가 (/deals)

**이 문서에서 가장 중요한 절입니다. 특가는 프로모션 중 유일하게 `products.price` 를 대신해 결제 금액에 들어갑니다.**

- 예전 '오늘특가'(`/deal/today`)는 상품그룹 하나를 상품목록으로 재사용한 큐레이션 화면이었습니다. 쇼핑특가가 그것을 **대체**하며, `/deal/today` → **301 `/deals`**.
- 홈에는 `deal_carousel` 섹션으로 나갑니다 → [home.md](./home.md) §4.2.

### 7.1 활성 판정 — **스케줄러가 없습니다**

특가의 시작·종료를 배치가 켜고 끄지 않습니다. **읽는 시점에 SQL 로 판정**합니다 (`dealService.ACTIVE_WHERE`).

```sql
d.is_active = 1
AND NOW() BETWEEN d.starts_at AND d.ends_at
AND (d.daily_start_time IS NULL OR CURTIME() BETWEEN d.daily_start_time AND d.daily_end_time)   -- 시간창
AND (d.weekdays IS NULL OR d.weekdays = '' OR FIND_IN_SET(WEEKDAY(NOW()) + 1, d.weekdays))      -- 요일
AND (di.qty_limit IS NULL OR di.sold_qty < di.qty_limit)                                        -- 선착순
-- + dc.is_active = 1  AND  di.deal_price < dp.price
```

- `WEEKDAY()` 는 0=월…6=일 이라 **+1** 해서 `weekdays` 컬럼 표기(1=월…7=일)에 맞춥니다.
- `daily_start_time` 이 NULL 이면 기간 내 상시 특가입니다.
- ⚠️ **`di.deal_price < dp.price` 가드를 지우지 마세요.** 관리자 등록 시점에 "특가가 < 정가"를 검증해도, 그 뒤 **정가를 특가보다 낮게 인하하면** 그 검증은 무의미해집니다. 가드가 없으면 리졸버가 가격을 **올려서** 덮어 8,000원짜리를 9,000원 "특가"로 결제시킵니다. 판정 단계에서 걸러야 표시·결제·수량 소진이 모두 일관됩니다. (= 정가 인하 시 그 특가는 **자동 무효**)
- **중복 특가:** 한 상품에 활성 특가가 여럿이면 `ROW_NUMBER()` 로 하나만 남깁니다 — **`d.priority DESC` → `di.deal_price ASC` → `di.id ASC`**.

### 7.2 화면 (`views/user/deals/index.ejs`)

- **특가 카테고리 탭** — `deal_category`(오늘의특가·타임특가·시즌특가…). `/deals/:code` 로 특정 카테고리만 볼 때도 **탭은 항상 전체**를 보여줍니다(다른 카테고리로 이동할 수 있어야 하므로).
- **카운트다운** — `product.deal.closesAtEpoch` 기준 클라이언트 타이머(`partials/sections/_deal_countdown`).
- **선착순 게이지** — `qty_limit` 이 있을 때 `soldQty / qtyLimit` 진행률 바.
- **오늘 열릴 타임특가**(`getUpcomingTimeDeals`)도 함께 전달합니다.
- **진행 중인 특가도, 오늘 열릴 타임특가도 0건이면** `dealController.getIndex` 가 `false` 를 리턴하고 라우트가 준비중 랜딩(`COMING_SOON.deals`)으로 폴백합니다.

### 7.3 결제 반영 (checkoutController)

| 단계 | 코드 |
|---|---|
| 표시 가격 | `dealSvc.applyDeals(rows)` — 목록·상세·장바구니·기획전·추천 등 |
| **주문서 금액** | `dealSvc.applyToScopeItems(items)` — **주문서 GET 과 `postForm` 양쪽**에서 각각 호출(주문서 URL 을 직접 두드릴 수 있으므로 양쪽 다 재계산) |
| 주문 항목 | `order_items.source_type = 'DEAL'` |
| 수량 소진 | 결제 승인 트랜잭션 안에서 `consumeDealQuota(conn, orderId)` — `deal_item.sold_qty` 를 원자적으로 올림 |
| 취소 | `restoreDealQuota(conn, orderId)` |

- 장바구니 간이 결제(`POST /cart/checkout`)는 재고를 차감하지 않으므로, **특가 상품이 담겨 있으면 `/checkout?cart=1` 로 리다이렉트**합니다(오버셀 방지) → [cart.md](./cart.md) §6.

---

## 8. 쇼핑라이브 (/live)

- **스트리밍을 우리가 하지 않습니다.** YouTube·Vimeo **임베드**입니다.
- ⚠️ **iframe HTML 을 저장하지 않습니다.** `provider` + `video_id` 만 저장하고(`parseVideoId()` 가 URL·ID 어느 쪽이 들어와도 id 를 추출), 재생 시 `embedUrl()` 이 조립합니다. 관리자가 붙여넣은 iframe 태그는 거부합니다(XSS·임의 도메인 삽입 차단).

### 8.1 공개 조건 · 상태

```sql
l.mall_id = ? AND l.status IN ('SCHEDULED','ON_AIR','ENDED') AND l.list_visible = 1
```

- 상태(`DRAFT | SCHEDULED | ON_AIR | ENDED | CANCELLED`)는 **관리자가 수동 전환**합니다. **코드가 시간을 보고 status 를 바꾸지 않습니다** — `start_at`·`end_at` 은 "곧 시작" 같은 **표시 보정**에만 씁니다.
- 종료 후 동작은 정책 컬럼이 정합니다:
  - `ended_access_policy = 'DISALLOW'` → 상세 접근 차단
  - `ended_purchase_policy = 'ALLOW'` → 종료 후에도 구매 가능
  - `replay_enabled = 1` → 다시보기(`replay_provider`/`replay_video_id`, 없으면 원본 사용)
- 다시보기 전용 경로(`/live/:slug/replay`)는 만들지 않습니다. 상세가 `ENDED` 면 알아서 다시보기를 렌더합니다.

### 8.2 상세 3탭

| 탭 | 소스 |
|---|---|
| 상품 | `live_show_product` (`role`, `live_price`, `min/max_order_quantity`, `purchase_enabled`, `visible`) |
| 혜택 | `live_show_coupon` — **연결만** 합니다. 쿠폰 다운로드는 기존 쿠폰 엔진(`/coupon`)이 처리 |
| 공지 | `live_show_notice` (`notice_level`, `display_location`, 노출기간) |

### 8.3 구매

- **바로구매 전용**입니다(`POST /live/:slug/buy` → `/checkout?...&live_show_id=`). 장바구니 미지원.
- 결제 단가는 `liveSvc.resolveLine()` 이 **서버에서 다시 계산**합니다(프론트가 보낸 가격은 표시용).
- `order_items.source_type = 'LIVE_SHOW'` — ⚠️ **이 라인은 쇼핑특가 리졸버가 건너뜁니다.** 라이브 전용가가 이미 적용된 라인에 특가를 또 얹으면 안 되기 때문입니다.
- 공개 라이브가 0건이면 GNB 콘텐츠 게이트가 메뉴를 숨기고, 직접 접근 시 `COMING_SOON.live` 로 폴백합니다.

---

## 9. 아울렛 (/outlet)

리퍼브·전시·포장훼손·유통기한 임박 등 **사유가 있는 상시 할인관**입니다.

- ⚠️ **`outlet_product` 에는 가격 컬럼이 없습니다.** 아울렛가는 `products.price` **그대로**입니다 — 아울렛은 "가격을 바꾸는 모듈"이 아니라 **"할인된 상품을 사유와 함께 모아 보여주는 모듈"** 입니다. 상세도 `/products/{slug}` 를 그대로 쓰고, **아울렛 고지 블록만 얹힙니다** → [products.md](./products.md) §3.1.
- 일반 상품 목록에서의 제외 여부는 `outlet_setting.show_in_normal_list` 가 정합니다.

### 9.1 필터 3축 · 정렬 5종

| 축 | 값 |
|---|---|
| 사유(`?type=`) | `outlet_setting.allowed_types` 안에 있고, 실제 상품이 있는 유형만 탭으로 노출 |
| 카테고리(`?categoryId=`) | 상품이 1건 이상인 카테고리만 |
| 가격대(`?price=`) | 1만 / 3만 / 5만 / 10만원 이하 |

| `?sort=` | ORDER BY |
|---|---|
| `discount` (**기본**) | `p.discount_rate DESC` |
| `price_asc` / `price_desc` | `p.price` |
| `stock_low` ("마지막 수량") | `p.stock ASC` |
| `latest` | `op.created_at DESC` |

### 9.2 GNB 콘텐츠 게이트

판매중 아울렛 상품 수가 `outlet_setting.min_product_count`(기본 30) 미만이면 **GNB 에서 메뉴가 자동으로 사라집니다** → [layout.md](./layout.md) §10. 그래서 준비중 랜딩(`COMING_SOON.outlet`)까지 오는 경로는 사실상 **직접 URL 접근뿐**입니다.

---

## 10. 추천 (/recommend)

`recommendService.getLanding(mallId, userId)` 이 섹션 배열을 만듭니다. **섹션당 12건**(`SECTION_LIMIT`).

| # | 섹션 | key | 근거 문구(`reason`) |
|---|------|-----|---|
| 1 | 회원님을 위한 추천(개인화) | `personal` | 최근 본 상품 기반 (카테고리 폴백 시 문구가 바뀜) |
| 2 | 추천 그룹 | `group:{id}` | `recommend_group.description` |
| 3 | MD 추천 | `md` | "MD가 직접 고른 상품" |
| 4 | 지금 많이 보는 상품 | `trending` | "최근 조회가 많은 상품" |

- **근거 문구는 필수입니다.** 왜 이 상품이 추천됐는지 못 밝히면 그냥 아무 상품 목록입니다.
- **뒤 섹션은 앞 섹션에 나온 상품을 제외**합니다(`excludeIds` 를 누적 전달) — 같은 상품이 네 번 나오면 추천이 아닙니다.
- **비로그인**이면 개인화 섹션 대신 로그인 유도 CTA 카드를 보여줍니다.
- **`robots: 'noindex,follow'`** — 사람마다 다른 화면이라 색인 대상이 아닙니다.
- 모든 섹션이 비면 `COMING_SOON.recommend` 로 폴백합니다.

---

## 11. 전문관 (/specialty)

**신규 테이블이 0개입니다.** `exhibition` 테이블을 `exhibition_type = 'SPECIALTY'` 로 재사용합니다(상시 운영 = `end_at` 비움).

| 항목 | 내용 |
|---|---|
| 목록 | `specialtyController.getList` — `getPublicList(mallId, { types: ['SPECIALTY'], limit: 12 })` |
| 정렬 | **`popular`(기본) / `latest` 뿐**입니다. 기획전의 `ending_soon`(종료임박)·기간 배지는 **없습니다** — 종료일이 없으니 성립하지 않습니다 |
| 상세 | `/specialty/{slug}` → **`exhibitionController.getDetail` 을 그대로 공유**. 같은 테이블·같은 섹션·같은 상품 매핑이라 렌더를 두 벌 만들 이유가 없습니다 |
| 정규 URL | `getDetail` 이 `req.baseUrl` 로 유형을 검사해, **경로가 어긋나면 301** 로 넘깁니다(기획전 slug 를 `/specialty/` 로 열면 `/exhibition/` 으로) |
| 목록 제외 | **`/exhibition` 목록에서는 SPECIALTY 를 뺍니다**(§3) |
| 0건 폴백 | `result.total === 0 && page === 1` → `COMING_SOON.specialty` |

---

## 12. DB

코드에서 참조하는 컬럼만 적습니다.

**`exhibition`** — id, mall_id, title, slug, summary, description, exhibition_type, list_thumbnail_url, pc_hero_image_url, mobile_hero_image_url, og_image_url, status(DRAFT/PUBLISHED/…), start_at, end_at, list_visible, search_visible, share_enabled, detail_template_type, display_config_json, ended_access_policy(ALLOW/BLOCK), ended_purchase_policy(ALLOW/BLOCK), view_count
**`exhibition_section`** — exhibition_id, section_name, section_code, section_type(PRODUCT_GRID/HTML), sort_order, is_tab, is_active, display_config_json
**`exhibition_product`** — exhibition_id, section_id, product_id, sort_order, is_fixed, display_badge, display_comment, visible, purchase_enabled

**`event`** — id, mall_id, title, slug, summary, content, notice, event_type(APPLY 만 참여 가능), thumbnail_url, pc_hero_url, mobile_hero_url, status, start_at, end_at, winner_announce_at, login_required, issue_limit, issued_count, list_visible, view_count
**`event_participant`** — event_id, user_id, status(APPLIED), memo, created_at. UNIQUE(event_id, user_id).

**`group_buy`** — id, mall_id, title, slug, summary, description, notice, list_thumbnail_url, pc_hero_image_url, mobile_hero_image_url, status, start_at, end_at, closing_hours, list_visible, search_visible, target_enabled, target_quantity, participant_count_visible, quantity_count_visible, progress_visible, current_quantity, participant_count, ended_purchase_policy, delivery_note, view_count
**`group_buy_product`** — group_buy_id, product_id, role(MAIN/…), sort_order, normal_price, group_buy_price, discount_rate, min_order_quantity, max_order_quantity, per_user_limit_quantity, purchase_enabled, visible

**`coupons`** — id, mall_id, name, thumbnail_url, summary, detail_content, notice, code, coupon_type, issue_method(AUTO_SIGNUP/ADMIN/CODE/DOWNLOAD), benefit_type(FIXED/PERCENT/SHIPPING_FREE/SHIPPING_FIXED), discount_amount, discount_rate, max_discount_amount, min_order_amount, valid_from, valid_to, valid_days, max_total_uses, download_start_at, download_end_at, issue_limit, issued_count, scope_json, status(DRAFT/ACTIVE/PAUSED/ENDED)
**`coupon_download`** — user_id, coupon_id, created_at. PK(user_id, coupon_id) — 중복 수령을 DB 가 막습니다.
**`user_coupons`** — 발급 결과. [mypage.md](./mypage.md) §12 참고.

**`deal_category`** — id, mall_id, code, name, description, schedule_type, badge_text, badge_color, sort_order, is_active
**`deal`** — id, mall_id, deal_category_id, title, subtitle, starts_at, ends_at, daily_start_time, daily_end_time, weekdays(1=월…7=일 CSV), priority, sort_order, is_active
**`deal_item`** — id, deal_id, product_id, deal_price, qty_limit, sold_qty, sort_order. **가격 컬럼은 여기에만** 있습니다.

**`live_show`** — id, mall_id, title, slug, summary, description, notice, list_thumbnail_url, pc/mobile_hero_image_url, og_image_url, **provider, video_id, replay_provider, replay_video_id**, status(DRAFT/SCHEDULED/ON_AIR/ENDED/CANCELLED — **수동**), start_at, end_at, purchase_enabled, ended_purchase_policy, ended_access_policy(ALLOW/**DISALLOW**), replay_enabled, list_visible, search_visible, share_enabled, view_count
**`live_show_product`** — live_show_id, product_id, role, sort_order, badge_text, normal_price, **live_price**, discount_rate, min_order_quantity, max_order_quantity, per_user_limit_quantity(⚠️ 미검증 — §5.2), purchase_enabled, visible
**`live_show_coupon`** — live_show_id, coupon_id, is_primary, sort_order, is_active
**`live_show_notice`** — live_show_id, title, content, notice_level, display_location, visible_start_at, visible_end_at, sort_order, is_active

**`outlet_product`** — id, mall_id, product_id, outlet_category_id, outlet_type, outlet_reason, condition_grade, defect_description, expiry_at, started_at, ended_at, sort_order, is_visible. **⚠️ 가격 컬럼 없음**(`products.price` 사용)
**`outlet_setting`** — mall_id(PK), allowed_types, min_discount_rate, min_product_count, show_in_normal_list, notice_html

**`recommend_group`** — id, mall_id, name, description(= 근거 문구), sort_order, is_active
**`recommend_group_item`** — recommend_group_id, product_id, sort_order

> 전문관은 **신규 테이블이 없습니다** — `exhibition.exhibition_type = 'SPECIALTY'`.
> `exhibition.brand_category_id` — 브랜드 귀속(관리자 전용, 고객 조회 미사용).

---

## 13. 주의사항

- **모듈의 성격이 전부 다릅니다.** 기획전 = 상품 전시 랜딩(구매는 상품 상세로) / 전문관 = 상시 전시관 / 이벤트 = 응모·참여(선착순 슬롯) / 공동구매·쇼핑라이브 = 전용가 바로구매 / **쇼핑특가 = 실제 결제가 인하** / 아울렛 = 사유 있는 상시 할인관(가격은 그대로) / 추천 = 개인화 랜딩.
- `default_path` 는 운영자가 바꿀 수 없습니다. 다른 URL 을 새로 만들면 GNB 가 404 됩니다.
- **전용 라우터를 `routes/feature.js` 안으로 되돌리지 마세요** — `featureRoutes` 가 `'/'` 에 먼저 마운트되어 전용 라우터가 영영 안 잡힙니다.
- 준비중 랜딩 폴백을 지우지 마세요. 개발 DB = 운영 DB 이므로 발행 0건 상태에서 빈 목록이 그대로 노출됩니다.
- 이벤트의 `event_type` 을 `APPLY` 외의 값으로 켜도 참여 버튼은 동작하지 않습니다(`PARTICIPABLE_TYPES` 화이트리스트).
- 공동구매·쇼핑라이브 상세 화면의 가격은 **표시용**입니다. 결제 단가는 `resolveLine()` 이 서버에서 다시 계산합니다.
- ⚠️ **`per_user_limit_quantity`(1인 구매 제한)는 공동구매·쇼핑라이브 양쪽 모두 검증되지 않습니다** — 저장만 되고 실제로 막지 않습니다(§5.2).
- ⚠️ **쇼핑특가의 `deal_price < products.price` 가드를 제거하지 마세요** — 정가를 인하하면 특가가 오히려 가격을 올려 결제시킵니다(§7.1).
- 쇼핑특가에는 **스케줄러가 없습니다.** 활성 판정은 조회 시점 SQL 입니다. "특가가 안 끝난다" 는 배치 문제가 아니라 `ACTIVE_WHERE` 조건 문제입니다.
- 쇼핑라이브의 `status` 는 **자동으로 바뀌지 않습니다**(수동 전환). 시간이 지나도 `ON_AIR` 로 남아 있으면 운영 실수입니다.
- 아울렛은 **가격을 바꾸지 않습니다**(`outlet_product` 에 가격 컬럼 없음). 아울렛가 = `products.price`.
- 쿠폰 `benefit_type` 중 `PERCENT` 는 `discount_rate`·`max_discount_amount` 를, `FIXED` 는 `discount_amount` 를 씁니다. 문구는 반드시 `benefitLabel()` 로 만드세요(뷰에서 분기 재조립 금지).

---

*Last Updated: 2026-07-15*
