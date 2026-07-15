# 주문 및 매출 관리 (Sales)

## 1. 개요

- **Base URL:** `/admin/sales`  
- **관련 테이블:** `orders`, `users`, `order_items`, `shipments`, `user_coupons`, `order_status_logs`, `order_claims`, `order_refunds`  
- **컨트롤러:** `controllers/admin/salesController.js`  
- **서비스:** `services/order/orderStatusService.js`, `services/order/orderCancelService.js`, `services/order/refundService.js`  
- **뷰:** `views/admin/sales/list.ejs`, `views/admin/sales/detail.ejs`  
- **메뉴 권한(`admin_menus`):** `super_admin`, `admin`, `customer_admin`

운영자가 주문을 조회하고 상태를 바꾸는 **유일한 화면**입니다.

> ⚠️ **`/admin/orders` 는 살아 있지 않습니다.** `routes/admin/orders.js` 와 `controllers/admin/orderController.js` 는 저장소에 남아 있지만 `routes/admin.js` 가 마운트하지 않아 `/admin/orders` 는 404 입니다. 같은 폴더의 `routes/admin/list.ejs`·`routes/admin/detail.ejs` 도 그 화면이 쓰던 잔재입니다. 따라서 그 컨트롤러에만 있는 엑셀 다운로드(`/download`)·일괄 상태 변경(`/bulk-status`) 은 현재 접근할 수 없습니다. 주문 상태 변경 경로는 아래 `POST /admin/sales/status` 하나뿐입니다.

관련 문서: [클레임 관리](./claims.md) · [배송 관리](./shipping.md)

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/sales` | getList | 주문 목록 (`?status=` 상태 필터, `?mallId=` 몰 필터) |
| GET | `/admin/sales/:id` | getDetail | 주문 상세 |
| POST | `/admin/sales/status` | postStatus | 주문 상태 변경 (취소·환불 시 자원 복원 + PG 환불) |

---

## 3. 주문 목록 (GET /admin/sales)

- **쿼리:** `orders` LEFT JOIN `users` (주문자 이름/이메일/프로필) LEFT JOIN `mall` (소속 몰 이름/코드/기본여부), `ORDER BY o.created_at DESC`  
- **필터:** 아래 두 조건을 `AND` 로 합쳐 `WHERE` 를 만듭니다(둘 다 없으면 전체 조회).
  - `?status=` — 값이 주문 상태 7종에 포함될 때만 `o.status = ?`. 그 외 값은 무시
  - `?mallId=` — 정수로 파싱되면 `o.mall_id = ?`. **주문은 몰별로 "관리"하지 않고 통합 조회하며, 몰 필터는 조회 편의일 뿐 기본은 전 몰 통합**입니다. 소속 몰은 손님 결제 시 `checkoutController` 가 `orders.mall_id` 에 기록합니다([checkout](../user/checkout.md)).
- **표시:** 주문번호, **몰**(뱃지, 기록 없으면 "미확인"), 주문일시, 주문자, 결제금액, 상태, 관리. 상태별 뱃지 색상 구분  
- **뷰 전달:** `orders`, `statusFilter`, `malls`(몰 셀렉트용), `selectedMallId`(없으면 null), `title: '판매 관리'`

> ℹ️ **레거시 주문은 `mall_id = NULL`.** `orders.mall_id` 도입 前 생성된 주문은 몰이 비어 있어 몰 필터에 걸리지 않고 "전체" 조회에서만 보입니다(목록엔 "미확인" 뱃지). 필요 시 기본몰로 backfill 하는 1회성 UPDATE 로 보정합니다.

**주문 상태 (`orders.status` enum):**  
`PENDING`, `PAID`, `PREPARING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`

---

## 4. 주문 상태 축 (4개로 분리)

`orders.status` 하나로 모든 것을 표현하지 않습니다. "주문접수 + 결제완료 + 상품준비중"이 동시에 성립하므로 결제·클레임·환불을 별도 컬럼으로 뗐습니다.

| 컬럼 | enum | 의미 |
|------|------|------|
| `status` | PENDING · PAID · PREPARING · SHIPPED · DELIVERED · CANCELLED · REFUNDED | 주문 전체 상태 (**정본**) |
| `payment_status` | PENDING · PAID · CANCELLED · REFUNDED · PARTIAL_REFUNDED | 결제 상태 |
| `claim_status` | NONE · REQUESTED · APPROVED · REJECTED · COMPLETED | 취소·반품 진행 상태 |
| `refund_status` | NONE · REQUESTED · COMPLETED · FAILED | 환불(금액 반환) 상태 |

- `status` 를 바꿔도 `payment_status` 가 자동으로 따라가지 **않습니다.** 취소·환불처럼 둘이 함께 움직일 때만 호출측이 명시합니다.
- 네 컬럼의 변경은 모두 `orderStatusService.transition()` 을 거치며 `order_status_logs` 에 필드별 1행씩 남습니다(값이 같으면 아무 것도 하지 않음).
- 송장 등록처럼 주문 필드를 바꾸지 않고 이력만 남길 때는 `log()` 를 씁니다.

---

## 5. 주문 상세 (GET /admin/sales/:id)

- **주문 기본:** `orders` LEFT JOIN `users` 로 1건 조회. 없으면 `/admin/sales` 로 리다이렉트  
- **주문 상품:** `order_items` WHERE order_id = ?  
- **배송 정보:** `shipments` WHERE order_id = ? (0 또는 1건, 있으면 shipment 객체 전달)  
- **쿠폰:** `orders.user_coupon_id`(주문 쿠폰)·`orders.shipping_coupon_id`(배송비 쿠폰)를 각각 `user_coupons` JOIN `coupons` 로 조회  
- **이력·클레임·환불:** `order_status_logs`(`history()`), `order_claims`, `order_refunds` 를 주문별 최신순 조회  
- **뷰 전달:** `order`, `items`, `shipment`(없으면 null), `usedCoupon`, `shippingCoupon`, `logs`, `claims`, `refunds`, `title: '주문 상세'`  
- 상세 하단에 클레임 카드(→ [`/admin/claims/:id`](./claims.md))와 상태 변경 이력 타임라인이 렌더됩니다.

**상태 변경 드롭다운:** `PENDING · PAID · PREPARING · SHIPPED · DELIVERED · CANCELLED` 6개만 노출합니다. `REFUNDED` 는 서버는 허용하지만 UI 선택지에 없습니다.

---

## 6. 주문 상태 변경 (POST /admin/sales/status)

- **파라미터:** `id` (주문 ID), `status` (주문 상태 7종 중 하나. 아니면 그대로 상세로 리다이렉트)  
- **이후:** `res.redirect('/admin/sales/' + id)`  
- **예외:** 롤백 후 500 응답

### 6.1 처리 로직 (단일 트랜잭션)

1. `SELECT ... FROM orders WHERE id = ? FOR UPDATE` — 주문 행 잠금
2. **취소 전이 판정:** 새 상태가 `CANCELLED`·`REFUNDED` 이고 현재 상태가 그 둘이 아니면 "취소로 넘어가는 중"
3. 취소 전이일 때만
   - `restoreOrderResources(conn, order)` — 재고·쿠폰·적립금 복원
   - `refundOrder(conn, { order, reason: '관리자 취소' })` — 환불 실행
4. `transition()` 으로 상태 반영 + 이력 기록. 취소 전이면 4개 축을 함께 씁니다.
   - `payment_status` = 환불 성공 `REFUNDED` / 실패 `CANCELLED`
   - `claim_status` = `COMPLETED`
   - `refund_status` = 성공 `COMPLETED` / 실패 `FAILED` / 환불 시도 없음 `NONE`
5. 커밋

### 6.2 자원 복원 (`orderCancelService.restoreOrderResources`)

**멱등합니다.** `orders.resources_restored_at` 을 조건부 UPDATE 로 선점하므로, 클레임 승인이 이미 되돌린 주문을 이 화면에서 또 취소해도 재고가 두 번 늘지 않습니다.

- **재고:** 결제 확정 상태(`PAID`·`PREPARING`·`SHIPPED`·`DELIVERED`)였던 주문만 `products.stock` 복구. `PENDING` 은 차감 전이라 되돌릴 것이 없음  
- **쿠폰:** `user_coupons` 의 `used_at`·`order_id`·`reserved_order_id`·`reserved_at` 해제. `system_settings.coupon_restore_on_cancel` 로 끌 수 있음(미설정이면 복원)  
- **적립금:** 사용분(`point_used`) 환급 + 구매 적립분 회수. `point_transactions` 에 `ORDER_CANCEL_RESTORE` / `ORDER_CANCEL_REVOKE` 로 기록하며 잔액을 음수로 만들지 않음

### 6.3 환불 (`refundService.refundOrder`) — Toss Payments REST 직접 호출

- **환불액 = `total_amount` − 반품 배송비.** 적립금은 6.2 가 처리하므로 여기서 다시 빼지 않습니다.
- **PG 호출 여부는 `orders.payment_key` 가 결정합니다.**
  - 있음 → `POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel` (Basic 인증. 시크릿키는 `global.systemSettings.tosspayments_secret_key` → `process.env.TOSSPAYMENTS_SECRET_KEY` 순)
  - 없거나 환불액 0 → `method='NONE'` 으로 즉시 완료 (TEST 결제·전액 적립금·무료 주문)
- **전액 환불이면 `cancelAmount` 를 보내지 않습니다.** 반품 배송비 차감이 있을 때만 부분 취소 금액을 명시합니다.
- 결과는 `order_refunds` 에 `REQUESTED` → `COMPLETED`/`FAILED` 로 기록되고 PG 응답 원문이 `pg_response` 에 남습니다.
- **PG 가 실패해도 취소를 되돌리지 않습니다.** "취소는 됐는데 환불이 안 된" 상태로 두고, 운영자가 [클레임 관리](./claims.md)에서 수동 환불로 마감합니다.

---

## 7. 주의사항

- 취소·환불 전이는 되돌릴 수 없습니다. 실제 PG 결제 취소가 나가고 재고·쿠폰·적립금이 복원됩니다.
- `refundOrder()` 는 트랜잭션 안에서 토스 `fetch` 를 호출합니다. 주문 행을 `FOR UPDATE` 로 잠근 채 PG 응답을 기다리므로 커넥션을 붙듭니다(알려진 한계, 후속 과제).
- `orders.status` 를 SQL 로 직접 UPDATE 하면 `order_status_logs` 가 남지 않습니다. 반드시 `transition()` 을 경유하세요.

---

*Last Updated: 2026-07-15*
