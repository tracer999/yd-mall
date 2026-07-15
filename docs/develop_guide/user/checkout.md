# 주문/결제

## 1. 개요

- **Base URL:** `/checkout`
- **라우트:** `routes/checkout.js`
- **컨트롤러:** `controllers/checkoutController.js`
- **서비스:** `services/shipping/shippingCalculator.js`(배송비), `services/coupon/discountCalculator.js`(할인 계산), `services/coupon/couponIssueService.js`(발급·점유), `services/groupBuy/groupBuyService.js`(공동구매), `services/order/orderCancelService.js`(취소 시 자원 복원), `services/order/orderStatusService.js`(상태 전이·이력)
- **뷰:** `views/user/checkout/choose.ejs`, `form.ejs`, `pay.ejs`, `fail.ejs`, `complete.ejs`

구매 방법 선택(비회원/회원), 주문 폼, 배송비 계산, 쿠폰·포인트 적용, 결제창(토스페이먼츠), 성공/실패/완료 페이지를 제공합니다.

**금액은 언제나 서버가 계산합니다.** 폼·쿼리스트링이 보낸 금액(상품가·배송비·할인액)은 어디에서도 쓰지 않습니다. 결제 승인 시점에도 주문 행(`orders`)이 유일한 근거입니다(§8).

**토스페이먼츠는 SDK 없이 `fetch` 로 REST 를 직접 호출**합니다(`/v1/payments/confirm`, `/v1/payments/{paymentKey}/cancel`). 키는 `global.systemSettings.tosspayments_client_key` / `tosspayments_secret_key`(없으면 `process.env`)에서 읽습니다.

---

## 2. 구매 방법 선택 (GET /checkout/choose)

- 이미 로그인되어 있으면 쿼리 유지한 채 `/checkout`으로 리다이렉트.
- 비로그인 시 "회원/비회원" 선택 뷰 렌더. title: '구매 방법 선택', query 전달.

---

## 3. 주문 폼 (GET /checkout)

- **비로그인:** `guest=1`이 없으면 `/checkout/choose`로 리다이렉트.
- **주문 대상(3분기):**
  - `cart=1`이고 로그인: 장바구니에서 status='ON' 상품만 조회.
  - `group_buy_id` + `product_id` + `quantity`: **공동구매 바로구매**. `groupBuyService.resolveLine()` 이 서버에서 단가(`group_buy_product.group_buy_price`)와 수량을 확정합니다. 실패하면 `/group-buy/{slug}?error={reason}`(slug 불명 시 `/group-buy`)로 리다이렉트 — reason: notfound, closed, disabled, soldout, min, max, stock.
  - `product_id` + `quantity`: 단일 상품 1건(status='ON').
  - 어느 것도 없거나 항목이 비면 `/products`로 리다이렉트.
- 각 라인에는 쿠폰 적용범위(`scope_json`) 판정용 속성이 함께 실립니다: `category_id`, `brand_id`(=products.brand_category_id), `badges`(=product_badge CSV).
- **배송비:** `calcShippingFee({ mallId, subtotalAmount, receiverZipcode })` (회원은 prefilled 우편번호 사용). **표시용**이며 총액의 근거가 아닙니다.
- **쿠폰:** 회원이면 사용 가능 쿠폰을 조회해 ORDER 그룹(`orderCoupons`)과 SHIPPING 그룹(`shippingCoupons`)으로 나눠 전달합니다. 각 옵션에는 서버가 판정한 `discount`·`applicable`·`reason`(사용 불가 사유)이 들어 있어, 뷰가 조건을 다시 조립하지 않습니다.
- 포인트 잔액과 최소 사용 단위(`pointMinUse` = `system_settings.point_min_use`, 기본 1000)를 조회. 배송/구매자 정보는 로그인 시 사용자 정보로 prefilled.
- **전달 변수:** title, items, totalAmount, isGuest, prefilled, query, **orderCoupons**, **shippingCoupons**, pointsBalance, pointMinUse, **shipping**, error, success.

### 3.1 사용 가능 쿠폰 조회 조건 (`loadUsableCoupons`)

`user_coupons uc JOIN coupons c` 에서 다음을 모두 만족하는 쿠폰:

- `uc.used_at IS NULL`, `c.status='ACTIVE'`, 몰 스코프(`c.mall_id IS NULL OR = req.mallId`)
- **미점유**: `uc.reserved_order_id IS NULL` 또는 점유가 30분 지난 것(`uc.reserved_at < NOW() - INTERVAL 30 MINUTE`)
- 유효기간: `c.valid_from <= NOW()` 이고 `COALESCE(uc.expires_at, c.valid_to) >= NOW()` (valid_days 발급분은 개인별 만료일)

`user_coupon_id` 는 `uc.id` 입니다(쿠폰 마스터 `c.id` 와 다름).

---

## 4. 배송비 계산 (`shippingCalculator`)

`shipping_policy`(몰당 1행) + `shipping_zipcode_zone`(할증 우편번호 대역)을 읽습니다. 정책 행이 없으면 기본값(base_fee 3000 / free_threshold 50000 / jeju_extra 3000 / island_extra 5000)으로 동작합니다.

1. `is_active = 0` 이면 배송비 0원.
2. **무료배송 판정 기준은 `subtotal_amount`**(쿠폰·포인트 차감 **전** 상품금액). `subtotal >= free_threshold` 이면 `baseFee = 0`.
3. 우편번호 5자리가 `shipping_zipcode_zone` 대역에 들면 `JEJU`/`ISLAND` 할증(`extraFee`)을 더합니다. **무료배송이어도 지역 할증은 청구**합니다.
4. `fee = baseFee + extraFee`. 반환 필드: fee, baseFee, extraFee, zone, isFree, freeThreshold, remainingForFree.

### 4.1 배송비 재조회 (POST /checkout/shipping-fee)

배송지 우편번호가 바뀔 때 호출하는 AJAX. **클라이언트는 우편번호만 보냅니다** — 상품 금액은 서버가 장바구니·상품·공동구매 라인에서 다시 구합니다. 응답 `{ ok, subtotalAmount, shipping }` 역시 표시용이며, 주문 생성 시 서버가 한 번 더 계산합니다.

---

## 5. 쿠폰 할인 계산 (`discountCalculator`)

- **혜택 유형 4종:** `FIXED`(정액), `PERCENT`(정률, `max_discount_amount` 상한 적용), `SHIPPING_FREE`(배송비 전액), `SHIPPING_FIXED`(배송비 정액).
- **조합 그룹은 benefit_type 에서 파생:** `SHIPPING_*` → SHIPPING 그룹(`orders.shipping_coupon_id`), 그 외 → ORDER 그룹(`orders.user_coupon_id`). **주문 쿠폰 1장 + 배송비 쿠폰 1장 동시 적용** 가능.
- **적용범위(`scope_json`):** `{ include: {productIds, categoryIds, brandIds, badges}, exclude: {...} }`. exclude 가 언제나 우선하고, include 가 있으면 그 조건을 만족하는 라인만 대상입니다. scope 가 없으면 전 상품. 대상 라인의 합계가 `couponable`(쿠폰 대상 상품금액)이며, **최소주문금액(`min_order_amount`) 판정 기준도 이 금액**입니다.
- **두 상한을 코드가 강제:** 상품 할인 ≤ couponable, 배송비 할인 ≤ `shipping_fee`.

---

## 6. 쿠폰 코드 등록 (POST /checkout/apply-coupon-code)

- 비로그인 시 `/checkout/choose`로.
- body: `coupon_code`. 코드 입력형 쿠폰은 `coupons.issue_method = 'CODE'` + `status='ACTIVE'` 로 식별합니다(`coupon_type='SPECIAL'` 아님). 실제 발급은 `couponIssueService.redeemCouponCode()` 가 트랜잭션 안에서 처리하며, 선착순 슬롯은 `UPDATE coupons SET issued_count = issued_count + 1 WHERE issue_limit IS NULL OR issued_count < issue_limit` 의 affectedRows 로 확보합니다.
- 실패 사유 → 리다이렉트 쿼리: `not_found` → `error=coupon_code_invalid`, `already_held` → `coupon_code_duplicate`, `issue_limit` → `coupon_code_limit`, 코드 미입력 → `coupon_code_empty`, 그 외 → `coupon_code_error`. 성공 시 `success=coupon_applied` 로 주문 폼 복귀(product_id·quantity·cart 파라미터 유지).

---

## 7. 주문 생성 (POST /checkout)

비로그인이고 `guest=1` 이 아니면 `/checkout/choose`로.

1. **주문 항목 재구성** — GET 과 동일한 3분기(cart / group_buy / 단일 상품). 공동구매는 `resolveLine()` 으로 **다시** 검증합니다(주문서를 거치지 않고 이 POST 를 직접 두드릴 수 있으므로). 재고 초과 시 `/cart?error=stock&...` 또는 `/products/{slug}?error=stock&max=...` 로 리다이렉트.
2. **`subtotalAmount`** = 서버가 구한 단가 × 수량 합계.
3. **배송비** `calcShippingFee(...)` 를 배송비 쿠폰보다 **먼저** 계산합니다(배송비 할인이 배송비를 넘을 수 없으므로).
4. **회원 한정 검증**
   - 주문 쿠폰(`user_coupon_id`): 사용 가능 목록에 있는지 → 그룹이 ORDER 인지 → `max_total_uses` 재검증(`usageLimitReached`) → `min_order_amount` 충족(`couponable` 기준). 실패 시 `error=coupon` / `coupon_limit` / `coupon_min`. 할인액이 0(적용범위에 걸림)이면 `error=coupon_scope`.
   - 배송비 쿠폰(`shipping_coupon_id`): 같은 검증 + SHIPPING 그룹. 할인액이 0이면(배송비 0원) **조용히 떼어 냅니다** — 주문은 진행되고 쿠폰은 소모되지 않습니다.
   - 포인트: 잔액 초과 → `error=point`, `point_min_use` 배수 아님 → `error=point_min`, `subtotal - couponDiscount` 초과 → `error=point_max`. 포인트로 배송비를 결제하지는 않습니다.
5. **총액 공식**
   ```
   total_amount = max(0, subtotal_amount − coupon_discount − point_used + shipping_fee − shipping_discount)
   ```
6. **트랜잭션 (하나)**
   - `orders` INSERT — `status='PENDING'`, 주문번호 `ORD-YYYYMMDD-XXXXX`(5자리), subtotal_amount, shipping_fee, shipping_discount, total_amount, coupon_discount, point_used, user_coupon_id, shipping_coupon_id, 수령인·배송지·배송메시지, 비회원이면 buyer_*.
   - **쿠폰 점유(RESERVED)** — 주문 쿠폰·배송비 쿠폰 각각 `reserveCouponForOrder()`. 조건부 UPDATE(`used_at IS NULL AND (reserved_order_id IS NULL OR reserved_at < NOW() - INTERVAL 30 MINUTE)`)의 affectedRows 로 판정하며, **하나라도 실패하면 롤백** 후 `error=coupon_reserved`. 같은 쿠폰을 두 PENDING 주문이 물어 "할인은 받았는데 쿠폰은 안 쓰인" 상태가 되는 것을 막습니다.
   - `order_items` INSERT — 공동구매 라인은 `source_type='GROUP_BUY'`, `source_id=group_buy.id`(일반 주문은 NULL).
   - 회원이고 `cart=1` 이면 장바구니 비우기.
   - commit.
7. 비회원 주문이면 주문번호를 `req.session.guestOrders`(최근 10건)에 남깁니다 — 주문 완료 화면의 소유자 판정용.
8. 성공 시 `/checkout/pay/:orderNumber`로 리다이렉트.

---

## 8. 결제창 (GET /checkout/pay/:orderId)

- `orderId` 는 order_number. 해당 주문이 존재하고 `status='PENDING'` 일 때만 결제창 뷰 렌더. 토스 `clientKey`, `successUrl`(`{domain}/checkout/success`), `failUrl` 전달. 그 외는 `/checkout/fail?reason=invalid` 로 리다이렉트.
- 결제창은 `order.total_amount` 로 결제를 요청합니다.

---

## 9. 결제 성공 콜백 (GET /checkout/success) — 금액 재검증

토스가 `paymentKey`, `orderId`(=order_number), `amount` 를 붙여 되돌려 보냅니다. **쿼리스트링의 amount 는 신뢰 대상이 아니라 대조 대상**입니다.

1. 세 값 중 하나라도 없으면 `fail?reason=missing`.
2. `orders` 에서 order_number 로 주문을 다시 읽어 **`status='PENDING'` 이 아니면** `fail?reason=invalid` (중복 승인·이미 처리된 주문 차단).
3. **`order.total_amount !== parseInt(amount)` 이면 `fail?reason=amount`** — 결제 금액 위·변조 차단. 승인 요청에 싣는 `expectedAmount` 는 `parseInt(amount)` 이지만, 이 대조를 통과했으므로 `order.total_amount` 와 값이 같습니다(다르면 여기서 이미 걸러짐).
4. secretKey 미설정이면 `fail?reason=config`.
5. `validateStockForOrder(order.id)` — 승인 전 재고 확인. 부족하면 `fail?reason=stock`(결제 승인 자체를 하지 않음).
6. **토스 승인:** `POST https://api.tosspayments.com/v1/payments/confirm` (Basic 인증 = base64(`secretKey:`)), body `{ paymentKey, orderId, amount: expectedAmount }`. 응답이 실패면 `fail?reason=approve`.
7. `completeOrderWithStockAndPaid(order.id, { paymentKey, paymentMethod: 'CARD' })` 실행(§10).
   - `{ ok: false }`(재고 부족으로 롤백)이면 **토스 결제 취소 API 를 호출**(`/v1/payments/{paymentKey}/cancel`, cancelReason: '재고 부족으로 인한 결제 취소') 후 `fail?reason=stock`.
8. 정상 시 `/checkout/complete?orderId={order_number}` 로 리다이렉트.
9. 예외 발생 시 `fail?reason=error`.

---

## 10. 결제 확정 트랜잭션 (`completeOrderWithStockAndPaid`)

**전부 한 트랜잭션**입니다. 쿠폰·포인트·배송비 값은 요청이 아니라 **`orders` 행에서 다시 읽습니다.**

1. `orders` 행 조회(coupon_discount, point_used, user_coupon_id, shipping_coupon_id, subtotal_amount, shipping_fee, shipping_discount, total_amount).
2. 라인별 `SELECT stock FROM products WHERE id = ? FOR UPDATE` → 수량 초과면 **rollback 후 `{ ok: false }` 반환**(예외를 던지지 않음) → 호출측이 결제를 취소합니다. 충분하면 `stock = stock - quantity`.
3. `orders` → `status='PAID'`, payment_key, payment_method, `paid_at = NOW()`.
4. **쿠폰 RESERVED → USED**: 주문 쿠폰·배송비 쿠폰 둘 다 `used_at = NOW(), order_id = ?, reserved_order_id = NULL, reserved_at = NULL`.
5. **포인트 사용**: `users.points_balance -= point_used` + `point_transactions`(`PURCHASE_USE`, 음수).
6. **적립**: 적립률 `system_settings.point_accumulate_rate`(기본 5%). 적립 기준액은 `total_amount - (shipping_fee - shipping_discount)` — **배송비에는 적립을 주지 않습니다.** `point_transactions`(`PURCHASE_ACCUMULATE`).
7. **공동구매 참여 기록**: `groupBuyService.recordParticipation(conn, orderId)` — 같은 트랜잭션에서 `order_items.source_type='GROUP_BUY'` 라인을 집계합니다(유니크 키 + INSERT IGNORE 로 재실행 안전).
8. commit. 중간에 예외가 나면 rollback 후 throw.

> **쇼핑특가 선착순 소진도 이 트랜잭션 안에서 일어납니다.** `dealSvc.consumeDealQuota(conn, orderId)`(`checkoutController.js:224`)가 `order_items.source_type='DEAL'` 라인의 `deal_item.sold_qty` 를 원자적으로 소진하고, 한도를 넘으면 재고 부족과 동일하게 **rollback + Toss 결제 취소**로 갑니다 → [deals.md](../admin/deals.md) §5.2.

---

## 11. 결제 실패 (GET /checkout/fail)

- 쿼리 `reason`(missing, invalid, amount, config, stock, approve, error 등)을 뷰에 전달. 뷰: `user/checkout/fail`.
- PENDING 주문에 걸린 쿠폰 점유는 30분 뒤 자동으로 다른 주문이 빼앗을 수 있습니다(§3.1). 별도 해제 배치는 없습니다.

---

## 12. 주문 완료 (GET /checkout/complete)

- 쿼리: `orderId`(=order_number), (개발 환경 한정) `test=1`.
- **소유자 검증(`isOrderOwner`)**: 회원 주문은 `req.user.id === orders.user_id`, 비회원 주문은 `req.session.guestOrders` 에 주문번호가 있어야 합니다. 아니면 `order = null` 로 렌더 — 남의 주문번호로 배송지를 볼 수 없습니다.
- **테스트 확정 경로**: `isTestCheckoutAllowed` = `process.env.NODE_ENV !== 'production' && req.query.test === '1'`. 조건을 만족하고 주문이 PENDING 이면 `completeOrderWithStockAndPaid(id, { paymentMethod: 'TEST' })` 로 확정합니다(재고 부족 시 `fail?reason=stock`).
  > ⚠️ 과거에는 `?test=1&coupon_discount=...&user_coupon_id=...&point_use_amount=...` 쿼리스트링을 **그대로 믿고** 주문을 PAID 로 확정했습니다. 결제 없이 주문 완료가 가능했고 남의 `user_coupon_id` 를 주입해 타인의 쿠폰을 소모시킬 수 있었습니다. 지금은 ① 쿠폰·포인트·배송비를 요청에서 읽지 않고(주문 행이 유일한 근거), ② 테스트 경로를 `NODE_ENV` 로 잠그고, ③ 소유자만 조회할 수 있습니다. **쿼리스트링의 금액 파라미터는 더 이상 어디에서도 읽지 않습니다.**
- 최종적으로 `status='PAID'` 인 주문만 `order` 로 전달합니다(subtotal_amount, coupon_discount, point_used, shipping_fee, shipping_discount, total_amount, 수령인·배송지, created_at). 뷰: `user/checkout/complete`.

---

## 13. 주문 상태 모델

`orders` 는 상태를 네 축으로 분리해 갖습니다(`services/order/orderStatusService.js`).

| 컬럼 | 값 |
|------|-----|
| `status` | PENDING, PAID, PREPARING, SHIPPED, DELIVERED, CANCELLED, REFUNDED — **주문 전체 상태(정본)** |
| `payment_status` | PENDING, PAID, CANCELLED, REFUNDED, PARTIAL_REFUNDED |
| `claim_status` | NONE, REQUESTED, APPROVED, REJECTED, COMPLETED (취소·반품) |
| `refund_status` | NONE, REQUESTED, COMPLETED, FAILED |

`status` 를 바꾼다고 `payment_status` 가 따라가지 않습니다 — 함께 움직여야 할 때만 호출측이 명시합니다. 모든 변경은 `orderStatusService.transition()` 을 거쳐 `order_status_logs` 에 이력으로 남습니다(관리자 주문/배송/클레임 처리에서 호출).

---

## 14. 취소 시 자원 복원 (`orderCancelService.restoreOrderResources`)

고객 화면(`/checkout`)에서 직접 호출하지는 않습니다. 취소·반품 승인 경로(마이페이지 신청 → 관리자 승인: `services/order/claimService.js`, `controllers/admin/orderController.js`, `controllers/admin/salesController.js`)가 트랜잭션 안에서 부릅니다. 결제 확정 로직과 짝을 이루므로 여기에 기록합니다.

- **멱등**: `UPDATE orders SET resources_restored_at = NOW() WHERE id = ? AND resources_restored_at IS NULL` 의 affectedRows 로 "첫 실행"을 확보합니다. 이미 복원된 주문이면 아무것도 하지 않습니다(재고 이중 복원 방지).
- **재고**: 결제 확정 상태(PAID·PREPARING·SHIPPED·DELIVERED)였던 주문만 `stock = stock + quantity`. PENDING 은 차감 전이라 되돌릴 것이 없습니다.
- **쿠폰**: `used_at`·`order_id` 와 **점유(`reserved_order_id`)를 함께 해제**합니다. PENDING 주문은 점유로만 묶여 있어 order_id 만 풀면 쿠폰이 영영 잠깁니다. `system_settings.coupon_restore_on_cancel` 로 끌 수 있습니다(미설정 시 복원).
- **적립금**: 사용분(`point_used`) 환급(`ORDER_CANCEL_RESTORE`) + 구매 적립분 회수(`ORDER_CANCEL_REVOKE`, 잔액을 음수로 만들지 않음). `point_transactions` 이력으로 중복을 막습니다.
- **쇼핑특가 선착순 복원**: `source_type='DEAL'` 라인의 소진 수량은 `dealSvc.restoreDealQuota(conn, orderId)`(`orderCancelService.js:67`)가 `GREATEST(0, sold_qty - ?)` 로 되돌립니다. 결제 확정 시 §10 의 `consumeDealQuota` 와 짝을 이룹니다 → [deals.md](../admin/deals.md) §5.2.
- ⚠️ PG(토스) 결제 취소 API 는 이 경로에서 호출하지 않습니다. 상태만 CANCELLED 로 바뀝니다. (결제 직후 재고 부족으로 인한 자동 취소만 §9-7 에서 토스 API 를 호출합니다.)

---

## 15. 결제 연동 요약

- 결제창(§8)에서 결제 완료 → 토스가 successUrl 로 `paymentKey`·`orderId`·`amount` 전달 → 서버가 **주문 행과 금액을 대조**(§9-3)하고 재고를 확인한 뒤 confirm API 호출 → `completeOrderWithStockAndPaid` 로 재고 차감·PAID·쿠폰 USED·포인트 차감/적립·공동구매 참여 기록을 한 트랜잭션에 확정(§10) → 실패 시 결제 취소 API 호출.
- 관련 문서: [장바구니](./cart.md), [상품](./products.md)

---

*Last Updated: 2026-07-11*
