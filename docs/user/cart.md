# 장바구니

## 1. 개요

- **Base URL:** `/cart`
- **라우트:** `routes/cart.js`
- **컨트롤러:** `controllers/cartController.js`
- **뷰:** `views/user/cart.ejs`, `views/user/cart_complete.ejs`

모든 장바구니 기능은 로그인 필수입니다. 비로그인 시 `/auth/login`으로 리다이렉트됩니다.

---

## 2. 장바구니 목록 (GET /cart)

- **동작:** carts + products 조인으로 해당 user_id의 장바구니 항목 조회. 수량·금액 합계 계산 후 뷰에 전달.
- **전달 변수:** title, items, totalQuantity, totalAmount, currentUser, stockError (?error=stock&max= 시 표시).

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

- **동작:** 장바구니 항목으로 주문 1건 생성(orders + order_items), status='PAID'로 저장 후 해당 사용자 장바구니 비우기. 주문 번호 생성 규칙: ORD-YYYYMMDD-XXX. 완료 후 `/cart/complete?orderNumber=...`로 리다이렉트. 장바구니가 비어 있으면 `/cart`로 리다이렉트.

---

## 7. 주문 완료 (GET /cart/complete)

- **동작:** 로그인 필수. query.orderNumber 전달. 뷰: `user/cart_complete`, title: '주문 완료', orderNumber, currentUser.

---

*Last Updated: 2026-02-08*
