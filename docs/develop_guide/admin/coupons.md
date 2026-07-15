# 쿠폰 관리 (Coupons)

## 1. 개요

- **Base URL:** `/admin/coupons` (마운트: `routes/admin.js:72`, `requireMenuAccess('/admin/coupons')`)
- **관련 테이블:** `coupons` (마스터), `user_coupons` (회원 보유), `coupon_download` (다운로드 수령 이력), `orders` (사용 결과), `mall` (몰 스코프)
- **컨트롤러:** `controllers/admin/couponController.js`
- **서비스:** `services/coupon/couponIssueService.js` (발급·점유), `services/coupon/discountCalculator.js` (혜택 계산·라벨·범위 판정)
- **뷰:** `views/admin/coupons/list.ejs`, `form.ejs`, `detail.ejs`, `issue.ejs`, `usage.ejs`
- **고객 화면:** 쿠폰존 `/coupon` (`routes/coupon.js`, `controllers/couponController.js`), 체크아웃 적용 (`controllers/checkoutController.js`)

쿠폰은 **세 축**으로 정의합니다.

| 축 | 컬럼 | 값 | 역할 |
|----|------|-----|------|
| 목적 | `coupon_type` | NEW_SIGNUP / EVENT / SEASON / SPECIAL | **분류 라벨. 동작 분기 없음** |
| 발급 방식 | `issue_method` | AUTO_SIGNUP / ADMIN / CODE / DOWNLOAD | 실제 동작을 결정 |
| 혜택 유형 | `benefit_type` | FIXED / PERCENT / SHIPPING_FREE / SHIPPING_FIXED | 할인 계산 방식 |

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/coupons` | getList | 쿠폰 목록 (상태·발급방식·키워드 필터) |
| GET | `/admin/coupons/search-targets` | searchTargets | 적용 대상 picker 자동완성 (JSON) |
| GET | `/admin/coupons/resolve-targets` | resolveTargets | id 목록 → 이름 (picker 프리필, JSON) |
| GET | `/admin/coupons/create` | getCreate | 쿠폰 등록 폼 |
| POST | `/admin/coupons` | postCreate | 쿠폰 등록 처리 |
| GET | `/admin/coupons/detail/:id` | getDetail | 쿠폰 상세 + 발급 대상 + 통계 |
| GET | `/admin/coupons/edit/:id` | getEdit | 쿠폰 수정 폼 |
| POST | `/admin/coupons/edit/:id` | postEdit | 쿠폰 수정 처리 |
| POST | `/admin/coupons/end/:id` | postEnd | 쿠폰 **종료**(status=ENDED) — 삭제 라우트는 없음 |
| GET | `/admin/coupons/issue` | getIssue | 관리자 수동 지급 폼 |
| POST | `/admin/coupons/issue` | postIssue | 회원 선택/전체 지급 처리 |
| GET | `/admin/coupons/usage` | getUsage | 쿠폰 발급·사용 내역 |

> `search-targets` / `resolve-targets` 는 `/:id` 동적 라우트보다 **먼저** 선언되어야 합니다 (`routes/admin/coupons.js:6-8`).

---

## 3. 목록 (GET /admin/coupons)

- **필터:** `status`, `issue_method`, `keyword`(name·code LIKE)
- **쿼리:** `coupons c LEFT JOIN mall m`, 서브쿼리로 `issued_total` / `unused_count` / `used_count` (user_coupons 기준) 집계, `ORDER BY c.created_at DESC`
- **뷰 전달:** `coupons`, `benefitLabel`(계산기 함수 — 혜택 문구는 뷰에서 재조립하지 않음), `filters`
- **상단 버튼:** 쿠폰 등록 / 쿠폰 지급 / 사용 내역

---

## 4. 쿠폰 등록·수정 폼 (GET /admin/coupons/create, /edit/:id)

`renderForm()` 이 활성 몰 목록(`SELECT id, name FROM mall WHERE is_active = 1`)과 `tinymceKey` 를 함께 내려줍니다.

### 4.1 폼 필드 (`views/admin/coupons/form.ejs`)

| 섹션 | name | 타입 | 설명 |
|------|------|------|------|
| 기본 정보 | `name` | text (필수) | 쿠폰명 |
| | `summary` | text | 쿠폰존 카드 한 줄 소개 |
| | `thumbnail_url` | hidden + file | 썸네일. 파일 선택 시 `POST /admin/uploads/tinymce` 로 자동 업로드 후 URL 주입 |
| | `coupon_type` | select | NEW_SIGNUP / EVENT / SEASON / SPECIAL (라벨) |
| | `mall_id` | select | 빈 값 = 전 몰 공용 |
| | `status` | select | DRAFT / ACTIVE / PAUSED / ENDED |
| 상세 소개 | `detail_content` | textarea (TinyMCE) | 쿠폰존 상세 `/coupon/:id` 본문 |
| | `notice` | textarea (TinyMCE) | 유의사항 |
| 혜택 | `benefit_type` | select | FIXED / PERCENT / SHIPPING_FREE / SHIPPING_FIXED |
| | `discount_amount` | text | FIXED·SHIPPING_FIXED 일 때만 노출 |
| | `discount_rate` | text | PERCENT 전용 (1~100) |
| | `max_discount_amount` | text | **PERCENT 필수** |
| | `min_order_amount` | text | 최소 주문 금액 (기준 = 쿠폰 대상 상품금액) |
| 적용 대상 | `scope_json` | hidden | picker 가 직렬화. 카테고리/브랜드 검색 칩 + 제외 뱃지 체크박스 |
| 발급 | `issue_method` | select | AUTO_SIGNUP / ADMIN / CODE / DOWNLOAD |
| | `code` | text | CODE 일 때만 노출·저장 |
| | `download_start_at` / `download_end_at` | datetime-local | DOWNLOAD 일 때만 노출·저장 (**수령** 기간) |
| | `issue_limit` | text | 선착순 수령 수량. 비우면 무제한 |
| 사용 조건 | `valid_from` / `valid_to` | datetime-local | **사용** 기간 |
| | `valid_days` | text | 발급 후 N일 (개인별 만료일) |
| | `max_total_uses` | text | 전체 **사용** 한도 |

제외 뱃지 후보: `BEST`, `NEW`, `RECOMMEND`, `DEADLINE_SALE`, `GREENHUB_SPECIAL` (`form.ejs:203`).

### 4.2 적용 대상 picker

브랜드는 별도 테이블이 아니라 `categories.type = 'BRAND'` 입니다(카테고리는 `type='NORMAL'`).

- `GET /admin/coupons/search-targets?type=NORMAL|BRAND&q=검색어` → `SELECT id, name FROM categories WHERE type = ? AND name LIKE ? LIMIT 20`
- `GET /admin/coupons/resolve-targets?ids=1,2,3` → `SELECT id, name, type FROM categories WHERE id IN (?)`

### 4.3 scope_json 형식

```json
{
  "include": { "categoryIds": [10, 20], "brandIds": [100] },
  "exclude": { "productIds": [10001], "categoryIds": [], "brandIds": [], "badges": ["DEADLINE_SALE"] }
}
```

- `include` 가 있으면 그 조건을 만족하는 상품만 대상, 없으면 **전 상품**
- `exclude` 는 언제나 우선한다 (`discountCalculator.js:65-84`)
- 저장 시 `parseScopeJson()` 이 JSON 파싱 검증. 깨진 JSON 은 저장 거부(에러 리다이렉트)

---

## 5. 등록·수정 처리 (POST /admin/coupons, /edit/:id)

`normalizeForm()` 이 폼 값을 정규화합니다.

- **검증(에러 시 폼으로 리다이렉트):**
  - PERCENT: `discount_rate` 1~100 필수, `max_discount_amount` 필수 (없으면 고액 주문에서 할인이 무한정 커짐)
  - `scope_json` JSON 형식
- **무의미한 필드 정리:**
  - `code` → `issue_method='CODE'` 일 때만 저장, 그 외 NULL
  - `download_start_at`/`download_end_at` → `issue_method='DOWNLOAD'` 일 때만 저장
  - `discount_amount` → PERCENT·SHIPPING_FREE 이면 0
  - `discount_rate`/`max_discount_amount` → PERCENT 가 아니면 NULL
- **기본값:** `valid_from` 미입력 시 현재시각, `valid_to` 미입력 시 1년 뒤
- **is_active 동기화:** `is_active = (status === 'ACTIVE' ? 1 : 0)` — 매 저장마다 `status` 와 함께 기록

---

## 6. 쿠폰 종료 (POST /admin/coupons/end/:id)

```sql
UPDATE coupons SET status = 'ENDED', is_active = 0 WHERE id = ?
```

**삭제 라우트는 의도적으로 없습니다.** `user_coupons.coupon_id` FK 가 `ON DELETE CASCADE` 라, 쿠폰을 지우면 회원 보유 쿠폰과 사용 이력까지 함께 사라집니다.

---

## 7. 쿠폰 상세 (GET /admin/coupons/detail/:id)

- 쿠폰 1건 + 발급 대상 목록(`user_coupons JOIN users LEFT JOIN orders`, `ORDER BY issued_at DESC`)
- **통계(`stats`):**
  - `issuedTotal` = 발급 건수, `usedCount` = `used_at IS NOT NULL` 건수
  - `totalDiscount` = `SUM(orders.coupon_discount)` (사용된 쿠폰의 주문 기준)
  - `claimRate` = `issued_count / issue_limit * 100` (issue_limit 없으면 null)
  - `useRate` = `usedCount / issuedTotal * 100`

---

## 8. 관리자 수동 지급 (GET/POST /admin/coupons/issue)

- **폼:** `status='ACTIVE' AND valid_to >= NOW()` 인 쿠폰만 선택 가능. 회원 검색 모달(`/js/user-search-modal.js` → `GET /admin/users/search`)로 다건 선택
- **파라미터:** `issue_type` (`all` = 전 회원 / `user` = 선택 회원), `coupon_id`, `user_ids[]`
- **처리:** 회원 1명당 트랜잭션 1개. 각 트랜잭션에서 `SELECT * FROM coupons WHERE id = ? FOR UPDATE` 후 `issueCoupon(conn, { userId, coupon, issuedBy: 'ADMIN' })`
- **한 명이 실패해도 나머지는 진행**되며, 결과를 `req.session.couponIssueResult` 에 담아 리다이렉트 후 1회 표시
- **실패 사유 라벨:** `already_held`(이미 보유), `issue_limit`(발급 한도 소진), `inactive`(활성 상태 아님), `expired`(만료)

---

## 9. 사용 내역 (GET /admin/coupons/usage)

- **필터:** `user_id`, `coupon_id`, `from`, `to`(발급일 기준)
- **쿼리:** `user_coupons JOIN users JOIN coupons LEFT JOIN orders`, `ORDER BY uc.issued_at DESC LIMIT 500`

---

## 10. 발급 경로 (5종) — `services/coupon/couponIssueService.js`

발급은 이 서비스 한 곳에 모여 있습니다. `user_coupons.issued_by` 에 경로가 기록됩니다.

| issued_by | 경로 | 진입점 |
|-----------|------|--------|
| AUTO | 가입 시 자동지급 (`issue_method='AUTO_SIGNUP' AND status='ACTIVE'` 쿠폰 전부) | `routes/auth.js:345-370` |
| ADMIN | 관리자 수동지급 | `couponController.postIssue` |
| CODE | 쿠폰 코드 입력 → `redeemCouponCode()` | 쿠폰존 `POST /coupon/apply-code`, 체크아웃 `postApplyCouponCode` |
| DOWNLOAD | 쿠폰존 다운로드 → `claimDownloadCoupon()` | `POST /coupon/:id/claim` |
| EVENT | (enum 은 존재하나 현재 발급 코드 없음 — `controllers/admin/eventController.js:20` 참고) | — |

### 10.1 선착순 판정은 DB 가 한다

COUNT 후 INSERT 하면 동시 요청에 초과 발급됩니다. **조건부 UPDATE 의 affectedRows** 로 슬롯을 먼저 확보한 뒤 행을 넣습니다.

```sql
UPDATE coupons SET issued_count = issued_count + 1
 WHERE id = ? AND (issue_limit IS NULL OR issued_count < issue_limit)
```

INSERT 가 실패하면 `releaseIssueSlot()` 이 `issued_count` 를 되돌립니다.

### 10.2 중복 수령 차단

- `issueCoupon(..., skipIfHeld=true)`: **미사용 상태로 이미 보유** 중이면 `already_held` 로 건너뜀 (가입·관리자 지급·코드)
- 다운로드: `coupon_download` PK(user_id, coupon_id)가 DB 레벨에서 1인 1회 보장 → `ER_DUP_ENTRY` → `already_claimed`

### 10.3 유효기간

- `valid_days` 가 있으면 발급 시점 + N일을 `user_coupons.expires_at` 에 계산해 박음
- 없으면 `expires_at = NULL` → `coupons.valid_to` 를 사용 (조회는 `COALESCE(uc.expires_at, c.valid_to)`)
- **수령 기간(`download_*`)과 사용 기간(`valid_*`)은 별개** — "7월에 받아 8월까지 사용"이 가능

---

## 11. 할인 계산 — `services/coupon/discountCalculator.js`

### 11.1 조합 그룹

| 그룹 | benefit_type | 주문 컬럼 |
|------|--------------|-----------|
| SHIPPING | SHIPPING_FREE, SHIPPING_FIXED | `orders.shipping_coupon_id` |
| ORDER | FIXED, PERCENT | `orders.user_coupon_id` |

**한 주문에 주문 쿠폰 1장 + 배송비 쿠폰 1장**까지 붙습니다(같은 그룹 중복 불가).

### 11.2 상한

- `calcOrderDiscount`: PERCENT → `floor(couponable * rate / 100)` → `max_discount_amount` 로 상한 → 다시 `couponable` 로 상한. FIXED → `min(discount_amount, couponable)`
- `calcShippingDiscount`: SHIPPING_FREE → 배송비 전액, SHIPPING_FIXED → `min(discount_amount, shipping_fee)`. **배송비를 초과할 수 없음**
- `meetsMinOrder`: 기준은 전체 상품금액이 아니라 **쿠폰 대상 상품금액(`couponableAmount`)**
- 절사 단위 `ROUND_UNIT = 1` (원 단위)

### 11.3 쿠폰존 그룹핑

`scopeGroup()` 우선순위: 배송비 쿠폰(SHIPPING) > 브랜드 include(BRAND) > 카테고리 include(CATEGORY) > 전 상품(ALL). 쿠폰존 리스트가 이 순서로 섹션을 쌓습니다(`controllers/couponController.js:41-46`).

---

## 12. 체크아웃 적용 (`controllers/checkoutController.js`)

1. **사용 가능 쿠폰 조회** (`loadUsableCoupons`, :54): `used_at IS NULL` + `status='ACTIVE'` + 몰 스코프(`mall_id IS NULL OR = ?`) + 유효기간(`COALESCE(uc.expires_at, c.valid_to)`) + **점유되지 않음**(`reserved_order_id IS NULL OR reserved_at < NOW() - INTERVAL 30 MINUTE`)
2. **주문 생성 시 검증** (`validateCoupon`, :542): 그룹 일치 → `usageLimitReached`(max_total_uses 재검증) → `meetsMinOrder` → 할인액 계산
3. **점유(RESERVED)** (`reserveCouponForOrder`, `couponIssueService.js:172`): `reserved_order_id`, `reserved_at` 기록. 실패하면 `?error=coupon_reserved`
4. **결제 확정** (`completeOrderWithStockAndPaid`, :162): 주문 행에 저장된 값만 신뢰하여 `used_at = NOW(), order_id = ?, reserved_order_id = NULL` 로 소모
5. **금액 공식** (:607): `total = subtotal − coupon_discount − point_used + shipping_fee − shipping_discount` (0 하한)
6. **주문 취소 시 복원** (`services/order/orderCancelService.js:72-79`): `used_at`·`order_id`·`reserved_order_id`·`reserved_at` 을 모두 NULL 로 되돌림 (점유만 걸린 PENDING 주문도 함께)

---

## 13. DB 스키마

### 13.1 `coupons` (쿠폰 마스터)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | |
| mall_id | BIGINT NULL | NULL = 전 몰 공용 |
| name | VARCHAR(100) | 쿠폰명 |
| thumbnail_url | VARCHAR(500) | 쿠폰존 카드 썸네일 |
| summary | VARCHAR(500) | 한 줄 소개 |
| detail_content | TEXT | 상세 본문(HTML) |
| notice | TEXT | 유의사항(HTML) |
| code | VARCHAR(50) UNIQUE | 쿠폰 코드 (`issue_method='CODE'` 전용) |
| coupon_type | ENUM('NEW_SIGNUP','EVENT','SEASON','SPECIAL') | 목적 라벨 |
| issue_method | ENUM('AUTO_SIGNUP','ADMIN','CODE','DOWNLOAD') | 발급 방식 (기본 ADMIN) |
| benefit_type | ENUM('FIXED','PERCENT','SHIPPING_FREE','SHIPPING_FIXED') | 혜택 유형 (기본 FIXED) |
| discount_amount | INT | 할인 금액(원) |
| discount_rate | DECIMAL(5,2) NULL | PERCENT 할인율(%) |
| max_discount_amount | INT NULL | PERCENT 필수 상한 |
| scope_json | JSON NULL | 포함/제외 규칙 |
| min_order_amount | INT | 최소 주문 금액 |
| valid_from / valid_to | DATETIME | **사용** 기간 |
| valid_days | INT NULL | 발급 후 N일 (상대 유효기간) |
| download_start_at / download_end_at | DATETIME NULL | **수령** 기간 (DOWNLOAD 전용) |
| issue_limit | INT NULL | 수령(발급) 한도. NULL=무제한 |
| issued_count | INT | 현재 발급 수 (선착순 판정) |
| max_total_uses | INT NULL | **사용** 한도. NULL=무제한 |
| is_active | TINYINT(1) | 하위호환 미러 (status 에서 파생) |
| status | ENUM('DRAFT','ACTIVE','PAUSED','ENDED') | **정본** |
| created_at / updated_at | TIMESTAMP | |

인덱스: `uk_coupons_code`(code UNIQUE), `idx_coupons_download`(issue_method, status, download_end_at)

### 13.2 `user_coupons` (회원 보유 쿠폰)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | 체크아웃의 `user_coupon_id` — 쿠폰 마스터 id 와 다름 |
| user_id / coupon_id | INT FK | 둘 다 ON DELETE CASCADE |
| issued_at | TIMESTAMP | 발급일 |
| expires_at | DATETIME NULL | valid_days 계산 결과. NULL 이면 `coupons.valid_to` |
| used_at | TIMESTAMP NULL | 사용 시각 |
| order_id | INT NULL FK | 사용된 주문 (ON DELETE SET NULL) |
| reserved_order_id | INT NULL FK | 점유 중인 PENDING 주문 |
| reserved_at | DATETIME NULL | 점유 시각 (30분 TTL 판정) |
| issued_by | ENUM('AUTO','ADMIN','CODE','DOWNLOAD','EVENT') | 발급 경로 |

### 13.3 `coupon_download` (다운로드 수령 이력)

`PRIMARY KEY (user_id, coupon_id)` — 1인 1회 수령을 DB 가 보장. 두 FK 모두 ON DELETE CASCADE.

---

## 14. 주의사항

- **`coupon_type` 으로 동작을 분기하지 마세요.** 코드형 쿠폰은 `issue_method='CODE'` 로 식별합니다. `coupons.code` 컬럼 코멘트("SPECIAL 타입용")는 옛 설계의 잔재로 **현재 코드와 어긋납니다**.
- **`issue_limit`(수령 한도)과 `max_total_uses`(사용 한도)는 다른 축**입니다. 전자는 발급 시 `issued_count` 로, 후자는 결제 시 `used_at IS NOT NULL` COUNT 로 검증합니다.
- **`status` 가 정본, `is_active` 는 미러**입니다. 직접 SQL 로 상태를 바꿀 때 둘을 함께 갱신하세요.
- **쿠폰 삭제 금지.** FK CASCADE 때문에 발급·사용 이력이 함께 삭제됩니다. 종료(`ENDED`)를 쓰세요.
- **점유 해제 배치가 없습니다.** 결제하지 않고 이탈한 PENDING 주문의 점유는 남아 있고, 조회·점유 양쪽에서 **30분 지난 점유를 무시/탈취**하는 방식으로만 처리됩니다(`RESERVE_TTL_MINUTES = 30`). 조회 기준과 점유 기준이 어긋나면 "목록엔 보이는데 선택은 실패"가 생기므로 두 값을 함께 바꿔야 합니다.
- **PERCENT 쿠폰에는 `max_discount_amount` 가 필수**입니다. 관리자 폼이 막지만, 계산기도 과거 데이터·직접 INSERT 를 신뢰하지 않고 상한이 있을 때만 적용합니다.
- 깨진 `scope_json` 은 계산기에서 "범위 제한 없음"(전 상품)으로 해석됩니다(`parseScope` catch). 관리자 폼은 저장을 거부하지만 직접 INSERT 한 데이터는 걸러지지 않습니다.
- 쿠폰존(`/coupon`)은 `issue_method IN ('DOWNLOAD','CODE')` 이고 `status='ACTIVE'` 인 쿠폰만 노출합니다. 노출 대상이 0건이면 "준비 중" 랜딩으로 폴백합니다.
- `user_coupons.issued_by` 에 `EVENT` 값이 있으나, 이벤트 모듈은 아직 쿠폰을 지급하지 않습니다(`controllers/admin/eventController.js:20`).

### 14.1 ⚠️ `coupons.issued_count` 카운터 드리프트

`issued_count` 는 선착순 판정(§10.1)의 **유일한 근거**인데, `user_coupons` 행 수와 어긋날 수 있습니다.

- **회원 삭제.** `user_coupons.user_id` FK 가 `ON DELETE CASCADE` 라 회원을 지우면 보유 쿠폰 행이 함께 사라집니다. 그런데 **`issued_count` 는 되돌아가지 않습니다** — 저장소 어디에도 회원 삭제 시 `issued_count` 를 감산하는 코드가 없습니다. (`releaseIssueSlot()` 은 발급 트랜잭션 안에서 INSERT 가 실패했을 때만 되돌립니다.)
- **결과:** `issue_limit` 이 걸린 선착순 쿠폰에서 같은 일이 생기면, 실제로 보유한 사람은 한도보다 적은데 **한도가 조기 소진**되어 아무도 더 받을 수 없게 됩니다.
- **실측(2026-07-15):** 쿠폰 `id=1` 은 `issued_count = 21` 인데 실제 `user_coupons` 행은 **19건**입니다(2건 드리프트). 이 쿠폰은 현재 `issue_limit IS NULL`(무제한)이라 실무 영향은 없습니다.
- **선착순 쿠폰을 운영하기 전에** `UPDATE coupons c SET issued_count = (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id)` 로 한 번 맞추거나, 회원 삭제 경로에 감산을 넣어야 합니다.

### 14.2 미착수 (3차 범위)

| 항목 | 현재 상태 |
|------|-----------|
| 부분 취소 시 쿠폰 할인 안분 | **없음.** `order_items` 에 `coupon_discount_amount` 컬럼이 없어 품목별 할인액을 되돌릴 수 없습니다(주문 단위 전체 취소만) |
| 다중 쿠폰 (한 주문에 3장 이상) | **없음.** `order_coupons` 테이블이 없습니다. 주문 쿠폰 1 + 배송비 쿠폰 1이 상한(§11.1) |
| 상품 단위 쿠폰 (PRODUCT scope) | **없음.** `scope_json` 의 `include` 는 카테고리·브랜드만 (제외는 상품 id 도 가능) |
| 쿠폰 회수(REVOKED) · 변경 이력 | 없음. 상태는 DRAFT/ACTIVE/PAUSED/ENDED 4종뿐 |
| 반품 배송비 처리 | 없음 |
| 장바구니 쿠폰 미리보기 | 없음. 쿠폰 선택·계산은 체크아웃에서만 |

---

*Last Updated: 2026-07-15*
