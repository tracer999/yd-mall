# 장바구니

## 1. 개요

- **Base URL:** `/cart`
- **라우트:** `routes/cart.js`
- **컨트롤러:** `controllers/cartController.js`
- **뷰:** `views/user/cart.ejs`, `views/user/cart_complete.ejs`

모든 장바구니 기능은 로그인 필수입니다. 비로그인 시 `/auth/login`으로 리다이렉트됩니다.

헤더의 장바구니 뱃지 수량은 `middleware/cartData.js` 가 매 요청마다 `SUM(carts.quantity)` 로 구해 `res.locals.cartCount` 에 싣습니다(비로그인은 0).

---

## 2. 장바구니 목록 (GET /cart)

- **동작:** carts + products 조인으로 해당 user_id의 장바구니 항목 조회. **`dealSvc.applyDeals(rows, { idKey: 'product_id' })` 로 활성 쇼핑특가를 반영**한 뒤 수량·금액 합계를 계산해 뷰에 전달합니다. 즉 장바구니 금액은 `products.price` 가 아니라 **특가가 반영된 가격** 기준입니다 → [promotions.md](./promotions.md) §쇼핑특가.
- **배송비:** `services/shipping/shippingCalculator.calcShippingFee({ mallId, subtotalAmount })` 로 몰별 정책(`shipping_policy`)을 조회해 `shipping` 을 전달합니다. 배송지가 아직 없으므로 **지역 할증 없이 기본 배송비만** 계산합니다(무료배송 임박 안내용). 계산 규칙은 [주문/결제](./checkout.md) §4 참고.
- **전달 변수:** title, items, totalQuantity, totalAmount, shipping(fee, baseFee, extraFee, zone, isFree, freeThreshold, remainingForFree), currentUser, stockError (?error=stock&max= 시 표시).

> ⚠️ **장바구니에는 쿠폰 미리보기가 없습니다.** 설계상 3차 범위이며, 현재 화면에 있는 혜택 UI 는 **무료배송 게이지**(`remainingForFree`) 하나뿐입니다. 쿠폰·포인트는 주문서(`/checkout`)에서만 계산합니다 — 장바구니에 쿠폰 계산을 얹으면 주문서와 두 벌로 갈라져 반드시 어긋납니다.

---

## 3. 장바구니 추가 (POST /cart/add)

- **요청 body:** product_id, quantity(기본 1).
- **동작:** 상품이 status='ON'이고 재고가 있을 때만 추가. 이미 동일 상품이 있으면 수량 합산. 합산 수량이 재고 초과 시 `/cart?error=stock&product=...&max=...`로 리다이렉트. 정상 시 INSERT 또는 UPDATE 후 `/cart`로 리다이렉트.

---

## 4. 항목 삭제 (POST /cart/remove/:id)

- **동작:** carts.id와 user_id로 1건 DELETE 후 `/cart`로 리다이렉트.

---

## 5. 수량 변경 (POST /cart/update/:id)

- **요청 body:** quantity.
- **동작:** quantity가 0 이하이면 해당 항목 DELETE. 그 외에는 재고 확인 후 초과 시 `/cart?error=stock&max=...`로, 정상 시 UPDATE 후 `/cart`로 리다이렉트.

---

## 6. 전체 구매 (POST /cart/checkout)

- **동작:** 장바구니 항목으로 주문 1건 생성(orders + order_items), status='PAID'로 저장 후 해당 사용자 장바구니 비우기(한 트랜잭션). 주문 번호 생성 규칙: ORD-YYYYMMDD-XXX(3자리 난수). 완료 후 `/cart/complete?orderNumber=...`로 리다이렉트. 장바구니가 비어 있으면 `/cart`로 리다이렉트.
- ⚠️ **간이 경로입니다.** 결제(토스)·배송비·쿠폰·포인트·재고 차감을 전혀 거치지 않습니다. 실제 구매 흐름은 `/checkout?cart=1`([주문/결제](./checkout.md))이며, 장바구니 화면의 주문 버튼도 그쪽을 씁니다.
- **특가 상품이 담겨 있으면 이 경로를 타지 않습니다.** 트랜잭션 진입 전에 `dealSvc.resolveForProducts()` 로 확인해 활성 특가가 하나라도 있으면 **`/checkout?cart=1` 로 리다이렉트**합니다. 이 경로에는 `products.stock` UPDATE 가 없는데(재고 미차감), 특가는 **선착순 수량을 원자적으로 소진**해야 하므로 여기서 처리하면 오버셀이 납니다.

---

## 7. 주문 완료 (GET /cart/complete)

- **동작:** 로그인 필수. `query.orderNumber` 로 **본인(user_id) 주문**을 1건 조회해 `orderSummary` 를 구성합니다 — subtotal_amount, total_amount, coupon_discount, point_used, payment_method + order_items 기반 items 배열(item_id(slug 우선), item_name, price, quantity, item_brand, item_category, currency='KRW'). 조회에 실패하면 `orderSummary = null` 로 두고 그대로 렌더합니다(전자상거래 이벤트 전송용 데이터).
- **뷰:** `user/cart_complete` — title: '주문 완료', orderNumber, orderSummary, currentUser.

---

*Last Updated: 2026-07-15*
