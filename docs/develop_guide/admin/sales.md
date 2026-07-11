# 주문 및 매출 관리 (Sales)

## 1. 개요

- **Base URL:** `/admin/sales`  
- **관련 테이블:** `orders`, `users`, `order_items`, `shipments`  
- **컨트롤러:** `controllers/admin/salesController.js`  
- **뷰:** `views/admin/sales/list.ejs`, `views/admin/sales/detail.ejs`

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/sales` | getList | 주문 목록 |
| GET | `/admin/sales/:id` | getDetail | 주문 상세 |
| POST | `/admin/sales/status` | postStatus | 주문 상태 변경 |

---

## 3. 주문 목록 (GET /admin/sales)

- **쿼리:** `orders` LEFT JOIN `users` (주문자 이름/이메일), `ORDER BY o.created_at DESC`  
- **표시:** 주문번호, 주문자(이름/이메일), 총액, 상태, 주문일 등. 상태별 뱃지 색상 구분  
- **뷰 전달:** `orders`, `title: '판매 관리'`

**주문 상태 (orders.status):**  
`PENDING`, `PAID`, `PREPARING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`

---

## 4. 주문 상세 (GET /admin/sales/:id)

- **주문 기본:** `orders` JOIN `users` 로 1건 조회. 없으면 `/admin/sales`로 리다이렉트  
- **주문 상품:** `order_items` WHERE order_id = ?  
- **배송 정보:** `shipments` WHERE order_id = ? (0 또는 1건, 있으면 shipment 객체 전달)  
- **뷰 전달:** `order`, `items`, `shipment` (없으면 null), `title: '주문 상세'`  
- 상세 페이지에서 상태 변경 드롭다운 제공

---

## 5. 주문 상태 변경 (POST /admin/sales/status)

- **파라미터:** `id` (주문 ID), `status` (변경할 상태값)  
- **동작:** `UPDATE orders SET status = ? WHERE id = ?`  
- **이후:** `res.redirect('/admin/sales/' + id)` 로 해당 주문 상세로 복귀  
- **예외:** 500 응답

---

*Last Updated: 2026-02-05*
