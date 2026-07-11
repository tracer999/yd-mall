# 포인트 관리 (Points)

## 1. 개요

- **Base URL:** `/admin/points` (마운트: `routes/admin.js:73`, `requireMenuAccess('/admin/points')`)
- **관련 테이블:** `point_transactions` (거래 이력 원장), `users.points_balance` (잔액), `orders` (적립·사용 근거)
- **컨트롤러:** `controllers/admin/pointController.js`
- **뷰:** `views/admin/points/list.ejs`, `grant.ejs`, `deduct.ejs`
- **연동 코드:** `controllers/checkoutController.js` (적립·사용), `services/order/orderCancelService.js` (환급·회수), `controllers/admin/settingsController.js` (적립률·최소 사용 단위)

포인트는 **잔액(`users.points_balance`) + 원장(`point_transactions`)** 이중 구조입니다. 잔액은 비정규화된 값이며, 모든 변경 지점에서 **원장 INSERT 와 잔액 UPDATE 를 같은 트랜잭션**으로 처리합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/points` | getList | 포인트 거래 내역 (필터) |
| GET | `/admin/points/grant` | getGrant | 포인트 지급 폼 |
| POST | `/admin/points/grant` | postGrant | 포인트 일괄 지급 |
| GET | `/admin/points/deduct` | getDeduct | 포인트 차감 폼 |
| POST | `/admin/points/deduct` | postDeduct | 포인트 차감 |

---

## 3. 거래 내역 (GET /admin/points)

- **필터:** `q`(회원명·이메일·전화번호·생년월일 `YYYY-MM-DD` / `YYYYMMDD` LIKE), `transaction_type`, `from`, `to`
- **쿼리:** `point_transactions pt JOIN users u`, `ORDER BY pt.created_at DESC LIMIT 500`
- **뷰 표시:** 일시 / 회원(프로필·OAuth 뱃지·전화번호) / 금액(±, 부호별 색상) / 유형 / 사유(description) / **보유잔액**(`users.points_balance` — 거래 시점 잔액이 아니라 **현재 잔액**)
- **뷰 전달:** `transactions`, `filters`, `success`, `error`
- 상단 버튼: 포인트 지급 / 포인트 차감

---

## 4. 포인트 지급 (GET/POST /admin/points/grant)

- **폼 필드:** `amount`(필수, 천단위 콤마 입력), `description`(선택, 기본값 `'관리자 지급'`), `user_ids[]`(회원 검색 모달로 다건 선택)
- **회원 선택:** `/js/user-search-modal.js` → `GET /admin/users/search?q=` (다중 선택 모드). hidden input `user_ids[]` 로 제출되며, 1명도 없으면 클라이언트에서 submit 차단
- **검증:** 대상 0명이거나 `amount <= 0` 이면 `?error=회원과 지급 포인트를 확인하세요` 로 리다이렉트. 금액은 `Math.abs()` 처리
- **처리(트랜잭션 1개, 전 대상 일괄):**
  1. `INSERT INTO point_transactions (user_id, amount, transaction_type, description) VALUES (?, ?, 'ADMIN_GRANT', ?)`
  2. `UPDATE users SET points_balance = points_balance + ? WHERE id = ?`
  3. 대상 전원 처리 후 commit (한 명이라도 실패하면 **전체 rollback**)
- **결과 표시:** `req.session.pointGrantResult` 에 지급 목록을 담아 `/admin/points/grant` 로 리다이렉트 후 1회 표시(표시 후 세션에서 삭제)

---

## 5. 포인트 차감 (GET/POST /admin/points/deduct)

- **폼:** `user_id`(select — 최근 가입 300명, 잔액 함께 표시), `amount`, `description`(기본값 `'관리자 차감'`)
- **검증:** `user_id` 없거나 `amount <= 0` → 에러 리다이렉트 / 보유 포인트 부족(`points_balance < amt`) → `?error=보유 포인트가 부족합니다`
- **처리(트랜잭션):**
  1. `INSERT INTO point_transactions (..., 'ADMIN_DEDUCT', ...)` — **amount 는 음수(`-amt`)** 로 기록
  2. `UPDATE users SET points_balance = points_balance - ? WHERE id = ?`
- **성공 시:** `/admin/points?success=포인트가 차감되었습니다`

> 지급은 다건, 차감은 단건입니다. 잔액 확인이 트랜잭션 밖 `SELECT` 라 `FOR UPDATE` 잠금은 없습니다.

---

## 6. 적립금 흐름 (관리자 화면 밖)

### 6.1 설정값 (`system_settings`)

| 키 | 기본값 | 설명 | 설정 화면 |
|----|--------|------|-----------|
| `point_accumulate_rate` | 5 | 구매 적립률(%) | `/admin/settings` (`settingsController.js:285`) |
| `point_min_use` | 1000 | 포인트 최소 사용 단위(원) | `/admin/settings` (`settingsController.js:286`) |

코드에서는 `global.systemSettings.point_accumulate_rate` / `point_min_use` 로 읽습니다.

### 6.2 결제 시 사용 (`controllers/checkoutController.js`)

- 주문 생성(`postForm`, :587-601) 검증:
  - `point_use_amount > points_balance` → `?error=point`
  - `point_use_amount % point_min_use !== 0` → `?error=point_min`
  - `point_use_amount > subtotal − coupon_discount` → `?error=point_max`
- 사용액은 `orders.point_used` 에 기록되고, 총액 공식은 `total = subtotal − coupon_discount − point_used + shipping_fee − shipping_discount`
- **결제 확정 시점(`completeOrderWithStockAndPaid`, :169-178)** 에 실제 차감:
  - `UPDATE users SET points_balance = points_balance - ?`
  - `INSERT INTO point_transactions (... 'PURCHASE_USE', order_id, '주문 결제 사용')` — amount 음수

### 6.3 결제 시 적립 (`checkoutController.js:180-194`)

```
netShipping = shipping_fee − shipping_discount
payAmount   = max(0, total_amount − netShipping)
accumulate  = floor(payAmount * rate / 100)
```

**배송비에는 적립이 붙지 않습니다.** `PURCHASE_ACCUMULATE` 로 원장에 기록하고(`구매 적립 (N%)`) 잔액을 증가시킵니다.

### 6.4 주문 취소 시 (`services/order/orderCancelService.js:81-121`)

- PENDING 주문은 아직 정산되지 않았으므로 적립금 처리 없음
- 결제된 주문:
  - 사용 포인트 환급: `ORDER_CANCEL_RESTORE` (+`point_used`)
  - 구매 적립 회수: `ORDER_CANCEL_REVOKE` (−`min(적립액, 현재 잔액)` — 이미 써버린 적립금은 회수하지 않고 잔액을 음수로 만들지 않음)
- **멱등 가드:** 해당 주문에 `ORDER_CANCEL_RESTORE`/`ORDER_CANCEL_REVOKE` 이력이 이미 있으면 아무것도 하지 않음

---

## 7. DB 스키마

### 7.1 `point_transactions` (포인트 거래 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | |
| user_id | INT FK (users, CASCADE) | 회원 |
| amount | INT | **부호 포함**. 적립·지급 = +, 사용·차감·회수 = − |
| transaction_type | ENUM (6종, 아래) | 거래 유형 |
| order_id | INT NULL FK (orders, SET NULL) | 주문 연동 거래일 때 |
| description | VARCHAR(255) NULL | 사유 |
| created_at | TIMESTAMP | |

### 7.2 `transaction_type` enum (6종)

| 값 | 부호 | 발생 지점 |
|----|------|-----------|
| `PURCHASE_ACCUMULATE` | + | 결제 확정 시 구매 적립 (checkoutController) |
| `PURCHASE_USE` | − | 결제 확정 시 포인트 사용 (checkoutController) |
| `ADMIN_GRANT` | + | `/admin/points/grant` |
| `ADMIN_DEDUCT` | − | `/admin/points/deduct` |
| `ORDER_CANCEL_RESTORE` | + | 주문 취소 — 사용 적립금 환급 (orderCancelService) |
| `ORDER_CANCEL_REVOKE` | − | 주문 취소 — 구매 적립 회수 (orderCancelService) |

### 7.3 `users.points_balance`

현재 보유 포인트(비정규화 잔액). 관리자 회원 상세(`views/admin/users/detail.ejs:178`), 체크아웃, 마이페이지에서 이 값을 그대로 씁니다.

---

## 8. 주의사항

- **관리자 화면은 enum 6종 중 4종만 다룹니다.** `views/admin/points/list.ejs:106` 의 유형 라벨 삼항식은 `PURCHASE_ACCUMULATE`/`PURCHASE_USE`/`ADMIN_GRANT` 를 제외한 나머지를 전부 **'관리자차감'으로 표시**합니다 — 즉 `ORDER_CANCEL_RESTORE`(환급, +)도 '관리자차감'으로 오표기됩니다. 거래유형 필터 드롭다운(`list.ejs:40-44`)에도 취소 관련 2종이 없습니다.
- `controllers/admin/pointController.js:3` 의 `TX_TYPES` 상수는 **어디서도 사용되지 않으며** 취소 관련 2종이 빠져 있습니다.
- 목록의 "보유잔액" 컬럼은 각 거래 시점의 잔액이 아니라 **회원의 현재 잔액**입니다(같은 회원의 여러 행이 모두 같은 값).
- 잔액은 원장의 합계와 자동으로 맞춰지지 않습니다. 직접 SQL 로 `point_transactions` 만 넣거나 `users.points_balance` 만 바꾸면 **즉시 어긋납니다.** 항상 같은 트랜잭션에서 둘을 함께 갱신하세요.
- 차감은 트랜잭션 밖에서 잔액을 확인하므로(`pointController.js:152`) 동시 요청 시 이론상 초과 차감이 가능합니다(orderCancelService 는 `FOR UPDATE` 사용).
- 목록 조회는 `LIMIT 500` 으로 잘립니다. 페이징이 없습니다.
- 적립률·최소 사용 단위는 `.env` 가 아니라 **`system_settings` 테이블**에서 옵니다. 코드의 폴백값(5, 1000)은 DB 에 값이 있으면 쓰이지 않습니다.

---

*Last Updated: 2026-07-11*
