# 주문/결제

## 1. 개요

- **Base URL:** `/checkout`
- **라우트:** `routes/checkout.js`
- **컨트롤러:** `controllers/checkoutController.js`
- **뷰:** `views/user/checkout/choose.ejs`, `form.ejs`, `pay.ejs`, `fail.ejs`, `complete.ejs`

구매 방법 선택(비회원/회원), 주문 폼, 쿠폰 적용, 결제창(토스페이먼츠), 성공/실패/완료 페이지를 제공합니다.

---

## 2. 구매 방법 선택 (GET /checkout/choose)

- 이미 로그인되어 있으면 쿼리 유지한 채 `/checkout`으로 리다이렉트.
- 비로그인 시 "회원/비회원" 선택 뷰 렌더. title: '구매 방법 선택', query 전달.

---

## 3. 주문 폼 (GET /checkout)

- **비로그인:** `guest=1`이 없으면 `/checkout/choose`로 리다이렉트.
- **주문 대상:**  
  - `cart=1`이고 로그인: 장바구니에서 status='ON' 상품만 조회.  
  - `product_id` + `quantity`: 단일 상품 1건.  
  - 둘 다 없거나 비면 `/products`로 리다이렉트.
- 회원일 때 사용 가능 쿠폰(user_coupons), 포인트 잔액, 최소 사용 단위(pointMinUse) 조회. 배송/구매자 정보는 로그인 시 사용자 정보로 prefilled.
- **전달 변수:** title, items, totalAmount, isGuest, prefilled, query, userCoupons, pointsBalance, pointMinUse, error, success.

---

## 4. 주문 생성 (POST /checkout)

- 비로그인이고 guest가 아니면 `/checkout/choose`로.
- 주문 항목 구성은 GET과 동일(cart=1 또는 product_id+quantity). 재고 초과 시 장바구니/상품 상세로 에러 리다이렉트.
- 회원일 때: 포인트 사용량 검증(잔액·최소 단위·총액 초과 불가), 쿠폰 적용 시 user_coupon_id 검증 및 min_order_amount 확인. coupon_discount, point_used, total_amount 계산.
- orders INSERT: status='PENDING', 주문번호(ORD-YYYYMMDD-XXXXX), 수령인/배송지/구매자(비회원 시 buyer_* 저장). order_items INSERT. 회원이고 cart=1이면 장바구니 비우기.
- 성공 시 `/checkout/pay/:orderNumber`로 리다이렉트.

---

## 5. 쿠폰 코드 적용 (POST /checkout/apply-coupon-code)

- 비로그인 시 `/checkout/choose`로.
- body: coupon_code. SPECIAL 타입·유효기간·미사용 쿠폰인지 확인 후 user_coupons에 INSERT. 중복 보유·max_total_uses 초과 시 에러 쿼리로 폼 복귀. 성공 시 success=coupon_applied로 폼 복귀.

---

## 6. 결제창 (GET /checkout/pay/:orderId)

- orderId는 order_number. 해당 주문이 존재하고 status='PENDING'일 때만 결제창 뷰 렌더. 토스페이먼츠 clientKey, successUrl, failUrl 전달. 그 외는 `/checkout/fail?reason=invalid`로 리다이렉트.

---

## 7. 결제 성공 (GET /checkout/success)

- 쿼리: paymentKey, orderId, amount. 없으면 fail?reason=missing. 주문 조회 후 status가 PENDING이 아니거나 금액 불일치 시 fail. 재고 검증 후 토스 승인 API 호출. 성공 시 completeOrderWithStockAndPaid(재고 차감, PAID 업데이트, 쿠폰/포인트 처리, 적립) 실행. 재고 부족 시 토스 취소 API 호출 후 fail?reason=stock. 정상 시 `/checkout/complete?orderId=...`로 리다이렉트.

---

## 8. 결제 실패 (GET /checkout/fail)

- 쿼리 reason( missing, invalid, amount, config, stock, approve, error 등)을 뷰에 전달. 뷰: user/checkout/fail.

---

## 9. 주문 완료 (GET /checkout/complete)

- 쿼리: orderId, (선택) test=1, coupon_discount, user_coupon_id, point_use_amount. orderId로 status='PAID'인 주문 1건 조회하여 order로 전달. test=1인 경우 PENDING 주문에 대해 쿠폰/포인트 반영 후 completeOrderWithStockAndPaid 호출하는 테스트 플로우 있음. 뷰: user/checkout/complete, title: '주문 완료', order.

---

## 10. 결제 연동 요약

- **토스페이먼츠:** 결제창에서 결제 완료 시 success URL로 paymentKey, orderId, amount 전달. 서버에서 confirm API 호출 후 승인. completeOrderWithStockAndPaid에서 재고 차감·주문 PAID·쿠폰 사용·포인트 차감/적립 처리.

---

*Last Updated: 2026-02-08*
