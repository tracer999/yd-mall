# 클레임 관리 (Claims)

## 1. 개요

- **Base URL:** `/admin/claims`  
- **관련 테이블:** `order_claims`, `order_refunds`, `orders`, `order_items`, `order_status_logs`, `users`  
- **컨트롤러:** `controllers/admin/claimController.js`  
- **서비스:** `services/order/claimService.js`(승인·거절·철회), `services/order/refundService.js`(환불·Toss), `services/order/orderCancelService.js`(자원 복원), `services/order/orderStatusService.js`(상태 전이·이력)  
- **뷰:** `views/admin/claims/list.ejs`, `views/admin/claims/detail.ejs`  
- **메뉴 권한(`admin_menus`):** `super_admin`, `admin`, `customer_admin`

취소·반품·환불을 한 화면에서 처리합니다. 화면은 하나이고, 유형(`claim_type`)으로 구분합니다.

**반품과 환불은 다른 업무입니다.** 반품은 상품을 회수하는 물류 업무, 환불은 돈을 되돌리는 금융 업무입니다. 출고 전 취소처럼 반품 없이 환불만 발생할 수도 있습니다.

> ⚠️ **일반(B2C) 주문 전용입니다.** 목록은 `o.order_type = 'B2C'` 로 잠겨 있고, 상세·승인·거절·수동환불에 B2B 클레임 ID 가 들어오면 `/admin/b2b/claims/:id` 로 리다이렉트합니다(`divertIfB2b`). 갈라진 이유는 **환불 수단**입니다 — B2C 는 `payment_key` 로 PG 취소가 자동 실행되지만, B2B 는 무통장이라 `payment_key` 가 없습니다. 분리 전에는 그 때문에 `refundOrder` 가 "결제 없음 → 즉시 COMPLETED" 로 처리해 **돈을 보내지 않았는데 환불 완료로 찍혔습니다.** 지금은 B2B 를 `method='MANUAL'` · `status='REQUESTED'`(이체 대기)로 남기고, 운영자가 `/admin/b2b/claims` 에서 마감합니다. 컨트롤러는 `controllers/admin/b2bClaimController.js`.

관련 문서: [주문 및 매출 관리](./sales.md) · [배송 관리](./shipping.md) · [B2B 관리 매뉴얼](../../manual/admin/b2b.md)

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/claims` | getList | 클레임 목록 (`?status=`, `?claim_type=` 필터) |
| GET | `/admin/claims/:id` | getDetail | 클레임 상세 |
| POST | `/admin/claims/:id/approve` | postApprove | 승인 — 자원 복원 + 환불 + 상태 전이 |
| POST | `/admin/claims/:id/reject` | postReject | 거절 |
| POST | `/admin/claims/:id/manual-refund` | postManualRefund | PG 환불 실패분 수동(계좌) 마감 |

고객 측 신청 경로는 마이페이지입니다 — `POST /mypage/orders/:id/cancel`(신청), `POST /mypage/claims/:id/withdraw`(철회), `GET /mypage/claims`(내역).

---

## 3. 클레임 목록 (GET /admin/claims)

- **쿼리:** `order_claims` JOIN `orders` LEFT JOIN `users`. `ORDER BY c.status = 'REQUESTED' DESC, c.created_at DESC` — 처리 대기건이 항상 위로 옵니다. `LIMIT 500`  
- **필터:** `status`(5종 중 하나일 때만), `claim_type`(`CANCEL`|`RETURN`|`EXCHANGE`)  
- **표시:** 신청일 / 주문번호 / 고객 / 유형 / 사유 / 금액 / 상태 / 상세  
- **뷰 전달:** `claims`, `filters`, `title: '클레임 관리'`

---

## 4. 클레임 상세 (GET /admin/claims/:id)

- `order_claims` JOIN `orders` LEFT JOIN `users` 로 1건. 없으면 `/admin/claims` 로 리다이렉트  
- **주문 상품:** `order_items WHERE order_id = ?`  
- **환불 이력:** `order_refunds WHERE order_id = ?` (최신순)  
- **반품 배송비 미리보기(`suggestedReturnFee`):** `calcReturnShippingFee({ mallId, responsible, claimType })` 로 계산해 승인 폼의 기본값으로 제시  
- **뷰 전달:** `claim`, `items`, `refunds`, `suggestedReturnFee`, `error`(쿼리스트링), `refund_failed`(`?refund_failed=1`)  
- 화면 하단에 승인 폼(귀책 선택 + 반품 배송비 + 메모), 거절 폼(사유 메모), 실패한 환불에 대한 수동 환불 폼이 있습니다.

---

## 5. 승인 (POST /admin/claims/:id/approve)

### 5.1 요청 파라미터

| name | 설명 |
|------|------|
| responsible | `CUSTOMER` \| `SELLER` (그 외 값은 무시하고 기존 값 유지) |
| return_shipping_fee | 환불액에서 차감할 반품 배송비. 비우면 자동 계산값 사용. 음수 방지 |
| memo | 관리자 메모 (`admin_memo`) |

### 5.2 처리 로직 (`claimService.approveClaim` → `approveInTransaction`, 단일 트랜잭션)

1. `SELECT * FROM order_claims WHERE id = ? FOR UPDATE` — 상태가 `REQUESTED` 가 아니면 "이미 처리된 클레임"으로 거부
2. 주문 행도 `FOR UPDATE` 로 잠금
3. **반품 배송비 확정** — 폼 값이 있으면 그 값, 없으면 `calcReturnShippingFee()`
4. **자원 복원** — `restoreOrderResources(conn, order)`: 재고·쿠폰·적립금. `orders.resources_restored_at` 으로 **멱등**하므로 [판매 관리](./sales.md)에서 이미 취소된 주문을 여기서 또 승인해도 재고가 두 번 늘지 않습니다.
5. **환불** — `refundOrder()` (§7)
6. **클레임 마감** — `order_claims`: `status='COMPLETED'`, `responsible`, `return_shipping_fee`, `processed_at=NOW()`, `processed_by`(관리자 승인 시에만), `admin_memo`
7. **상태 전이** — `transition()` 으로 4개 축을 함께 기록
   - `orders.status = 'CANCELLED'`
   - `payment_status` = 환불 성공 `REFUNDED` / 실패 `CANCELLED`
   - `claim_status = 'COMPLETED'`
   - `refund_status` = 성공 `COMPLETED` / 실패 `FAILED`
8. PG 환불이 실패했으면 `?refund_failed=1` 로 상세에 돌아와 수동 처리를 안내합니다.

> **승인 후에도 `orders.status` 는 `CANCELLED` 입니다.** 반품이라고 해서 별도 주문 상태가 되지 않습니다.

### 5.3 반품 배송비 (`refundService.calcReturnShippingFee`)

- `claim_type !== 'RETURN'` 이거나 귀책이 `SELLER` 면 **0**  
- 고객 귀책 반품이면 `shipping_policy.base_fee × 2` (왕복). 정책 행이 없으면 3000 × 2  
- 관리자가 승인 시 폼에서 뒤집을 수 있습니다 → [배송비 정책](./shipping.md#7-배송비-정책-adminshipping-policy)

---

## 6. 거절 (POST /admin/claims/:id/reject)

- **파라미터:** `memo`(거절 사유, 500자 절단)  
- `REQUESTED` 상태가 아니면 거부  
- `order_claims`: `status='REJECTED'`, `processed_at`, `processed_by`, `admin_memo`  
- `orders.claim_status = 'REJECTED'` 로 전이. **주문 상태(`orders.status`)는 그대로 둡니다** — 클레임만 닫습니다.

---

## 7. 환불 (Toss Payments REST 직접 호출)

`refundService.refundOrder()` 가 승인 트랜잭션 안에서 실행됩니다.

- **환불액 = `orders.total_amount` − 반품 배송비.** 적립금은 자원 복원이 환급·회수하므로 여기서 다시 빼지 않습니다.
- **PG 호출 여부는 `orders.payment_key` 가 결정합니다.**
  - 있음 → `POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel` (Basic 인증. 시크릿키는 `global.systemSettings.tosspayments_secret_key` → `process.env.TOSSPAYMENTS_SECRET_KEY`)
  - 없거나 환불액 0 → `method='NONE'` 으로 즉시 완료 (TEST 결제·전액 적립금·무료 주문)
- **전액이면 `cancelAmount` 를 보내지 않습니다.** 반품 배송비 차감이 있을 때만 부분 취소 금액을 명시합니다.
- `order_refunds` 에 `REQUESTED` → `COMPLETED`/`FAILED` 로 기록하고 PG 응답 원문을 `pg_response` 에 남깁니다.
- **PG 실패해도 클레임을 되돌리지 않습니다.** "재고는 돌아왔는데 취소가 안 된" 상태보다 "취소는 됐는데 환불이 안 된" 상태가 낫습니다 — 후자는 운영자가 처리할 수 있습니다.

### 7.1 수동 환불 (POST /admin/claims/:id/manual-refund)

- **파라미터:** `refund_id`, `order_id`, `memo`  
- `order_refunds`: `status='COMPLETED'`, `method='MANUAL'`, `completed_at=NOW()`, `failed_reason`=메모  
- `orders`: `refund_status='COMPLETED'`, `payment_status='REFUNDED'` 로 직접 UPDATE  
- 계좌 이체 등으로 실제 돈을 돌려준 뒤 눌러 마감합니다. **이 경로는 `transition()` 을 경유하지 않으므로 `order_status_logs` 에 이력이 남지 않습니다.**

---

## 8. 신청 규칙 (`claimService.requestClaim`)

고객이 마이페이지에서 신청할 때 적용됩니다. 관리자 화면에서 신규 클레임을 만드는 기능은 없습니다(승인/거절만).

| 주문 상태 | 신청 가능 유형 |
|-----------|----------------|
| `PENDING`, `PAID`, `PREPARING` | **CANCEL** (취소) |
| `SHIPPED`, `DELIVERED` | **RETURN** (반품) |
| `CANCELLED`, `REFUNDED` | 불가 — "이미 취소된 주문" |

- `orders.claim_status = 'REQUESTED'` 인 주문은 중복 신청 불가.
- **반품 기한:** `shipments.delivered_at` 기준 **7일**(`RETURN_WINDOW_DAYS`). `delivered_at` 이 없으면 기한 검사를 건너뜁니다.
- **출고 전 자동 승인:** `PENDING`·`PAID` 상태에서의 취소는 관리자 승인 없이 그 자리에서 복원·환불까지 끝냅니다(`actorType: 'SYSTEM'`, 메모 "출고 전 취소 — 자동 승인"). 관리자 화면에 대기건으로 뜨지 않습니다. `PREPARING` 부터는 승인 대상입니다.
- **`EXCHANGE`(교환)는 enum 에만 있고 신청이 차단됩니다** — "반품 후 재주문해 주세요".
- **귀책 자동 판정:** `DEFECT`·`WRONG_DELIVERY` → `SELLER`, 그 외(`CHANGE_OF_MIND`·`OTHER`) → `CUSTOMER`. 관리자가 승인 시 뒤집을 수 있습니다.
- 클레임은 **주문 단위**입니다. 상품별 부분 클레임은 미지원.
- **철회:** 고객이 `REQUESTED` 상태의 클레임만 철회할 수 있고, `orders.claim_status` 는 `NONE` 으로 돌아갑니다.

---

## 9. DB 테이블 · 상태값

### order_claims

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| order_id | INT FK → orders (ON DELETE CASCADE) | |
| claim_type | ENUM('CANCEL','RETURN','EXCHANGE') | EXCHANGE 는 신청 차단 |
| status | ENUM('REQUESTED','APPROVED','REJECTED','COMPLETED','WITHDRAWN') DEFAULT 'REQUESTED' | |
| reason_type | ENUM('CHANGE_OF_MIND','DEFECT','WRONG_DELIVERY','OTHER') DEFAULT 'OTHER' | |
| reason_detail | VARCHAR(500) | |
| responsible | ENUM('CUSTOMER','SELLER') DEFAULT 'CUSTOMER' | 고객 귀책이면 반품 배송비 청구 |
| return_shipping_fee | INT DEFAULT 0 | 환불액에서 차감 |
| requested_by | ENUM('CUSTOMER','ADMIN') DEFAULT 'CUSTOMER' | |
| requested_at / processed_at | DATETIME | |
| processed_by | INT NULL | `admins.id`. FK 없음(자동 승인 시 NULL) |
| admin_memo | VARCHAR(500) | |
| created_at / updated_at | DATETIME | |

> `APPROVED` 는 enum 에 있지만 코드가 설정하지 않습니다. 승인은 복원·환불까지 한 트랜잭션에서 끝나므로 곧바로 `COMPLETED` 가 됩니다.

### order_refunds

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| order_id | INT FK → orders (CASCADE) | |
| claim_id | BIGINT FK → order_claims (SET NULL) | 클레임 없는 환불이면 NULL |
| refund_amount | INT | 실제 반환 금액 (`total_amount` − 반품배송비) |
| shipping_fee_refund | INT DEFAULT 0 | 환불에 포함된 배송비(참고용) |
| return_shipping_fee_deducted | INT DEFAULT 0 | 차감한 반품 배송비 |
| method | ENUM('PG','MANUAL','NONE') DEFAULT 'PG' | PG=토스 취소 / MANUAL=계좌 수동 / NONE=결제 없던 주문 |
| status | ENUM('REQUESTED','COMPLETED','FAILED') DEFAULT 'REQUESTED' | |
| pg_response | TEXT | PG 응답 원문 (60,000자 절단) |
| failed_reason | VARCHAR(500) | 실패 사유 / 수동 처리 메모 |
| created_at / completed_at | DATETIME | |

### 연동되는 orders 컬럼

`claim_status`(NONE·REQUESTED·APPROVED·REJECTED·COMPLETED), `refund_status`(NONE·REQUESTED·COMPLETED·FAILED), `payment_status`, `cancel_reason`, `resources_restored_at`. 자세한 축 구분은 [주문 관리 §4](./sales.md#4-주문-상태-축-4개로-분리) 참고.

모든 상태 변경은 `order_status_logs` 에 `field`/`old_value`/`new_value`/`actor_type`(CUSTOMER·ADMIN·SYSTEM)/`actor_id`/`memo` 로 남습니다.

---

## 10. 주의사항

- **승인은 되돌릴 수 없습니다.** 실제 PG 결제 취소가 나가고 재고·쿠폰·적립금이 복원됩니다.
- `refundOrder()` 는 주문 행을 `FOR UPDATE` 로 잠근 트랜잭션 안에서 토스 `fetch` 를 호출합니다. PG 응답이 느리면 그동안 행 잠금과 DB 커넥션을 붙듭니다. 올바른 형태는 "환불 REQUESTED 커밋 → 트랜잭션 밖 PG 호출 → 2차 트랜잭션으로 COMPLETED/FAILED" 이며, 별도 과제로 분리돼 있습니다(알려진 한계).
- 수동 환불(`/manual-refund`) 은 `orders` 를 직접 UPDATE 하므로 `order_status_logs` 에 이력이 남지 않습니다.
- 자원 복원은 멱등하지만, **복원 경로가 둘**([판매 관리](./sales.md)의 상태 변경 · 이 화면의 승인)이라는 점을 늘 염두에 두세요. 가드는 `orders.resources_restored_at` 하나뿐입니다.
- `PREPARING` 이후의 취소 신청은 관리자가 승인하기 전까지 아무 것도 일어나지 않습니다(재고도 그대로). 대기건을 방치하면 고객은 돈을 못 돌려받은 상태로 남습니다.

---

*Last Updated: 2026-07-11*
