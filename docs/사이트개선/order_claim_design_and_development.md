# 주문 · 배송 · 클레임 설계/개발 설계

> 작성 2026-07-11. 입력 레퍼런스: [`주문배송관리.md`](./주문배송관리.md) (일반론·업계 표준).
> 이 문서는 그 일반론을 **이 저장소의 실제 코드·DB 위에 접지**시킨다.
>
> **선행 완료**: [`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md)(배송비) ·
> [`coupon_design_and_development.md`](./coupon_design_and_development.md)(0~2차).
> 취소 시 재고·쿠폰·적립금 복원(`services/order/orderCancelService.js`)이 이미 있다.
> **클레임은 그것을 호출한다. 다시 구현하지 않는다.**

---

## 0. 현행 실태 (실측 2026-07-11)

```text
orders.status   enum('PENDING','PAID','PREPARING','SHIPPED','DELIVERED','CANCELLED','REFUNDED')
                → 주문·결제·배송·클레임 상태를 한 컬럼이 겸한다
shipments       order_id · tracking_number · courier_company · status('READY','IN_TRANSIT','DELIVERED')
order_items     product_id · quantity · total_price   ※ 클레임/환불 배분 컬럼 없음
DB              order_claims · order_refunds · order_status_logs 없음
관리자 화면      /admin/sales (주문) · /admin/shipping (송장)  ※ /admin/orders 는 마운트 안 됨(죽은 라우트)
고객 화면        /mypage/orders · /mypage/orders/:id (+ 취소 모달)
```

### 0-1. 🔴 고객 주문 취소가 항상 500 이다

```text
mypageController.js:490   UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?
orders 테이블              cancel_reason 컬럼이 없다  →  ER_BAD_FIELD_ERROR
```

트랜잭션이 롤백되므로 데이터는 안전하지만 **고객은 주문을 취소할 수 없다.**
`admin/orderController.cancelOrder` 도 같은 컬럼을 쓰지만 그 라우트는 마운트돼 있지 않다.

### 0-2. 🔴 재고 복원이 멱등하지 않다

`restoreOrderResources` 는 적립금만 이력으로 중복을 막고, **재고는 조건 없이 더한다.**

```js
// services/order/orderCancelService.js
if (wasPaid) { for (const item of items) UPDATE products SET stock = stock + ? }
```

지금은 취소 경로가 하나(`salesController.postStatus`)뿐이라 도달할 수 없다.
**클레임 승인이라는 두 번째 경로가 생기는 순간 재고가 이중 복구된다.**

### 0-3. 결제 취소 API 를 아무도 호출하지 않는다

`checkoutController.cancelTossPayment()` 는 결제 승인 직후 재고 부족 시에만 쓰인다.
주문 취소 경로 어디에서도 부르지 않는다. **상태만 `CANCELLED` 가 되고 돈은 돌아가지 않는다.**

---

## 1. 설계 원칙

### 1-1. 복원 경로는 하나다 — 그리고 멱등해야 한다

클레임 승인은 `restoreOrderResources` 를 **호출**한다. 재고·쿠폰·적립금을 다시 구현하지 않는다.
대신 그 함수를 **멱등하게** 만든다.

```sql
ALTER TABLE orders ADD COLUMN resources_restored_at DATETIME NULL;
```

`resources_restored_at IS NOT NULL` 이면 즉시 반환한다. 어느 경로가 몇 번 부르든 재고는 한 번만 돌아온다.
적립금의 `point_transactions` 이력 검사보다 이쪽이 상위 가드다(적립금·재고·쿠폰을 함께 막는다).

> 적립금 이력 검사는 남겨 둔다. 두 겹이 손해는 아니고, `coupon_restore_on_cancel=0` 인 운영에서도
> 적립금 중복 환급을 막아야 한다.

### 1-2. 상태를 분리한다 — 단, 실제로 구동하는 것만

레퍼런스 §4 는 7개 상태 필드를 든다. **쓰지 않을 컬럼을 만들지 않는다.**

| 레퍼런스 | 이 저장소 | 채택 |
|---|---|---|
| `order_status` | `orders.status` (기존) | **유지 — 하위호환 미러** |
| `payment_status` | 없음 | **✅ 신규** (결제대기·완료·취소·환불) |
| `fulfillment_status` | `orders.status` 가 겸함 | ✗ 배송 상태로 흡수 |
| `delivery_status` | `shipments.status` (3종) | **✅ 확장** (9종) |
| `claim_status` | 없음 | **✅ 신규** |
| `refund_status` | 없음 | **✅ 신규** |
| `settlement_status` | — | ✗ 단일 판매자. 정산 개념 없음 |

> **`orders.status` 를 지우지 않는다.** dev·prod 가 같은 DB 라 운영이 옛 코드를 돌리는 동안
> 그 코드가 `status` 를 읽는다(쿠폰 `is_active` 와 같은 이유). **`status` 가 계속 정본**이고
> 새 컬럼은 그것을 세분화한다. 읽기 지점 교체는 한 배포에 묶는다.

### 1-3. 화면 메뉴는 단순하게, 도메인은 분리해서

레퍼런스 §5 가 명시한다. 관리자 메뉴는 **`클레임 관리` 하나**만 더한다(7개로 쪼개지 않는다).
내부적으로 `order_claims` 가 취소·반품·교환을 유형으로 구분한다.

---

## 2. 데이터 모델

### 2-1. 1차 — 상태 분리 + 변경 이력

```sql
ALTER TABLE orders
  ADD COLUMN payment_status  enum('PENDING','PAID','CANCELLED','REFUNDED','PARTIAL_REFUNDED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN claim_status    enum('NONE','REQUESTED','APPROVED','REJECTED','COMPLETED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN refund_status   enum('NONE','REQUESTED','COMPLETED','FAILED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN cancel_reason   varchar(255) NULL,          -- 0-1 의 결함
  ADD COLUMN resources_restored_at datetime NULL;        -- 0-2 의 멱등 가드

CREATE TABLE order_status_logs (          -- 레퍼런스 §2.1 "주문 변경 이력"
  id, order_id, field, old_value, new_value, actor_type('CUSTOMER','ADMIN','SYSTEM'), actor_id, memo, created_at
);
```

### 2-2. 2차 — 클레임 + 환불

```sql
CREATE TABLE order_claims (
  id, order_id,
  claim_type   enum('CANCEL','RETURN','EXCHANGE'),      -- EXCHANGE 는 3차 (신청 차단)
  status       enum('REQUESTED','APPROVED','REJECTED','COMPLETED','WITHDRAWN'),
  reason_type  enum('CHANGE_OF_MIND','DEFECT','WRONG_DELIVERY','OTHER'),
  reason_detail, responsible enum('CUSTOMER','SELLER'),
  return_shipping_fee int,                              -- 귀책이 고객이면 청구
  requested_by enum('CUSTOMER','ADMIN'), requested_at, processed_at, processed_by, admin_memo
);

CREATE TABLE order_refunds (
  id, order_id, claim_id,
  refund_amount, shipping_fee_refund, return_shipping_fee_deducted,
  method enum('PG','MANUAL','NONE'),                    -- payment_key 없으면 NONE
  status enum('REQUESTED','COMPLETED','FAILED'),
  pg_response text, failed_reason, created_at, completed_at
);
```

**`order_claims` 는 주문 단위다.** 상품별(부분) 클레임은 3차 — 쿠폰 할인액 배분이 선행이다
(쿠폰 문서 §13-3: 부분 취소 → 상품 쿠폰 → 다중 쿠폰).

### 2-3. 배송 상태 확장

```sql
-- shipments.status enum('READY','IN_TRANSIT','DELIVERED')
--   → + 'READY_TO_SHIP','SHIPPED','DELIVERY_FAILED','RETURNING','RETURNED'
```

---

## 3. 계산 — 환불 금액

```text
환불액 = total_amount                       (= 상품 − 쿠폰 − 적립금 + 배송비 − 배송비쿠폰)
       − return_shipping_fee                반품 배송비 (귀책이 고객일 때만)
```

- **출고 전 취소**: 배송비 포함 전액 환불. `return_shipping_fee = 0`
- **출고 후 반품 · 단순 변심**: 고객 귀책 → 왕복 배송비 청구 (`guide.ejs` 고지)
- **불량 · 오배송**: 판매자 귀책 → 전액 환불, 반품 배송비 0

적립금은 `restoreOrderResources` 가 환급·회수하므로 환불액에서 다시 빼지 않는다.
(사용한 적립금은 포인트로 돌려주고, 지급했던 구매적립은 회수한다.)

---

## 4. 결제 취소 (0-3 해결)

`services/order/refundService.js` 신규.

```text
payment_key 있음  →  Toss `/v1/payments/{key}/cancel` 호출. 성공 시 refund COMPLETED
payment_key 없음  →  PG 결제가 없던 주문(TEST/무료). method='NONE', 즉시 COMPLETED
호출 실패         →  refund FAILED + failed_reason. 주문 상태는 되돌리지 않는다
                     (재고·쿠폰은 이미 복원됐다. 운영자가 수동 환불 후 완료 처리)
```

> **PG 취소 실패 시 클레임을 롤백하지 않는다.** 롤백하면 "재고는 돌아왔는데 취소는 안 된" 상태와
> "취소는 됐는데 환불은 안 된" 상태 중 후자가 낫다. 전자는 재고가 새고, 후자는 운영자가 처리할 수 있다.

---

## 5. 화면

### 5-1. 고객 — `/mypage/orders/:id`

| 상태 | 가능한 액션 |
|---|---|
| PENDING · PAID | **주문 취소** 신청 (즉시 승인 — 출고 전) |
| PREPARING | **취소 신청** (관리자 승인 대기) |
| SHIPPED · DELIVERED | **반품 신청** (수령 후 7일 이내 — `guide.ejs`) |
| 클레임 진행 중 | 진행 상태 표시, 철회 |

`/mypage/claims` — 클레임 내역 목록.

### 5-2. 관리자 — `/admin/claims` (신규 메뉴 1개)

목록(유형·상태 필터) → 상세(승인/거절 + 귀책·반품배송비 지정) → 승인 시 복원+환불 실행.

### 5-3. 관리자 — `/admin/shipping` 확장

출고 처리(READY_TO_SHIP → SHIPPED), 송장 일괄 등록, 배송 상태 전이.

---

## 6. 개발 계획

### 6-1. 1차 — 상태 분리 + 이력 (돈이 움직이지 않는다)

- [ ] **O1** `orders` ALTER (`payment_status`·`claim_status`·`refund_status`·`cancel_reason`·`resources_restored_at`) + 기존 22건 백필
- [ ] **O2** `order_status_logs` 테이블 + `orderStatusService.logChange()`
- [ ] **O3** `restoreOrderResources` 멱등화 (`resources_restored_at`)
- [ ] **O4** 상태 전이를 한 곳으로 — `orderStatusService.transition()`. `salesController`·`checkout` 이 이걸 쓴다
- [ ] **O5** 고객 취소 500 수정 (`cancel_reason`)
- [ ] **O6** 관리자 주문 상세에 결제/클레임/환불 상태 + 변경 이력 표시

### 6-2. 2차 — 클레임 + 환불

- [ ] **O7** `order_claims` · `order_refunds` 테이블
- [ ] **O8** `services/order/refundService.js` — Toss 취소. `payment_key` 없으면 `method='NONE'`
- [ ] **O9** `services/order/claimService.js` — 신청·승인·거절. 승인 시 복원 + 환불
- [ ] **O10** 고객 신청 UI (취소·반품) + `/mypage/claims`
- [ ] **O11** 관리자 `/admin/claims` 목록·상세·승인/거절 (메뉴 `is_active=0` 으로 등록)
- [ ] **O12** 반품 배송비 — 귀책 판정 + 환불액 차감
- [ ] **O13** 검증 — 이중 승인에도 재고가 한 번만 복구되는지, PG 실패 시 상태

### 6-3. 3차 — 연기 (해제 조건 명시)

- [ ] **PG 호출을 트랜잭션 밖으로** — 환불 `REQUESTED` 커밋 → 트랜잭션 밖 토스 호출 → 짧은 2차 트랜잭션으로 `COMPLETED`/`FAILED`. 지금은 `approveInTransaction` 이 주문 행을 잠근 채 `fetch` 한다(저트래픽이라 무해하나 올바른 형태가 아니다) → *해제 조건: 없음. 트래픽 증가 전에*
- [ ] **PG 환불 경로 실주문 검증** — 현재 검증은 전부 `payment_key=NULL`(method='NONE')이었다. `cancelTossPayment` 요청 형태는 fetch 스텁으로 확인했으나(URL·인증·cancelAmount) **실제 토스 취소는 미검증**이다 → *해제 조건: 토스 테스트 시크릿으로 1회 실주문*
- [ ] **부분 클레임 (상품별)** → *해제 조건: `order_items.coupon_discount_amount` 배분* (쿠폰 문서 §13-3)
- [ ] **교환(EXCHANGE)** → *해제 조건: 부분 클레임 + 재출고 + 차액 결제*
- [ ] **분할 배송 · 합배송** → *해제 조건: `shipments` 가 주문당 1행인 제약 해제*
- [ ] **가상계좌 입금 확인 · 부분결제** → *해제 조건: Toss 가상계좌 연동*
- [ ] **정산 · 미수금 · 판매자별 주문** → *해제 조건: 입점형(오픈마켓) 전환*
- [ ] **구매확정** → *해제 조건: 정산 도입. 지금은 DELIVERED 가 종점*

---

## 7. 미결 사항

| # | 항목 | 선택지 | 권장 |
|---|---|---|---|
| 1 | 출고 전 고객 취소 | (A) 즉시 승인 / (B) 관리자 승인 | **(A)** — PENDING·PAID 는 즉시. PREPARING 부터 승인 |
| 2 | PG 취소 실패 시 | (A) 클레임 유지 + 환불 FAILED / (B) 전체 롤백 | **(A)** — §4 |
| 3 | 반품 가능 기간 | 수령 후 7일 (`guide.ejs`) | 확정 |
| 4 | 반품 배송비 금액 | 왕복 = `base_fee × 2` | `shipping_policy.base_fee` 에서 파생 |
| 5 | 교환 | 3차 | — |
