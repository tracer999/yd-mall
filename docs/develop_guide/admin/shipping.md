# 배송 관리 (Shipping)

## 1. 개요

- **Base URL:** `/admin/shipping`  
- **관련 테이블:** `orders`, `shipments`  
- **컨트롤러:** `controllers/admin/shippingController.js`  
- **뷰:** `views/admin/shipping/list.ejs`

배송이 필요한 주문에 대해 송장을 입력하고 배송 상태를 반영합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/shipping` | getList | 배송 대상 목록 |
| POST | `/admin/shipping/tracking` | postTracking | 송장 입력 및 배송 처리 |

---

## 3. 배송 대상 목록 (GET /admin/shipping)

- **조건:** `orders.status IN ('PAID', 'PREPARING', 'SHIPPED', 'DELIVERED')`  
  - PENDING(입금대기), CANCELLED(취소), REFUNDED(환불) 제외  
- **쿼리:** `orders` LEFT JOIN `shipments` (tracking_number, courier_company, status as shipping_status), `ORDER BY o.created_at DESC`  
- **표시:** 주문 정보 + 기등록 시 송장/택배사, 송장 입력 폼 또는 수정 UI  
- **뷰 전달:** `orders`, `title: '배송 관리'`

---

## 4. 송장 입력 및 배송 처리 (POST /admin/shipping/tracking)

### 4.1 요청 파라미터

| name | 타입 | 설명 |
|------|------|------|
| order_id | number | 주문 ID |
| courier_company | string | 택배사 |
| tracking_number | string | 운송장 번호 |

### 4.2 처리 로직

1. **shipments 존재 여부:** `SELECT id FROM shipments WHERE order_id = ?`  
2. **있으면:**  
   - `UPDATE shipments SET courier_company=?, tracking_number=?, status='IN_TRANSIT', shipped_at=NOW() WHERE order_id=?`  
3. **없으면:**  
   - `INSERT INTO shipments (order_id, courier_company, tracking_number, status, shipped_at) VALUES (?, ?, ?, 'IN_TRANSIT', NOW())`  
4. **주문 상태 통일:** `UPDATE orders SET status = 'SHIPPED' WHERE id = ?`  
5. **리다이렉트:** `/admin/shipping`

송장을 등록하거나 수정하면 해당 주문의 상태가 자동으로 `SHIPPED`로 변경됩니다.

---

## 5. 배송 상태 (shipments.status)

- `READY`: 준비  
- `IN_TRANSIT`: 배송 중 (송장 입력 시 설정)  
- `DELIVERED`: 배송 완료  

현재 관리자 화면에서 배송 완료로 직접 변경하는 기능은 구현되어 있지 않으며, 송장 입력 시 `IN_TRANSIT`으로 설정됩니다.

---

*Last Updated: 2026-02-05*
