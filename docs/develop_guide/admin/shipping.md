# 배송 관리 (Shipping)

## 1. 개요

배송 관련 관리자 화면은 **두 개이며 서로 별개**입니다.

| 화면 | Base URL | 하는 일 |
|------|----------|---------|
| 배송 관리 (송장) | `/admin/shipping` | 주문별 택배사·운송장 입력, 배송완료 처리 |
| 배송비 정책 | `/admin/shipping-policy` | 몰별 기본 배송비·무료배송 기준·지역 할증 대역 |

- **관련 테이블:** `orders`, `shipments`, `order_status_logs` / `shipping_policy`, `shipping_zipcode_zone`, `mall`  
- **컨트롤러:** `controllers/admin/shippingController.js`, `controllers/admin/shippingPolicyController.js`  
- **서비스:** `services/order/orderStatusService.js`, `services/shipping/shippingCalculator.js`  
- **뷰:** `views/admin/shipping/list.ejs`, `views/admin/shipping-policy/index.ejs`  
- **메뉴 권한(`admin_menus`):** `/admin/shipping` → `super_admin`·`customer_admin` / `/admin/shipping-policy` → `super_admin`·`admin`

배송이 필요한 주문에 대해 송장을 입력하고 배송 상태를 반영합니다. 배송비를 **얼마 받을지**는 §7 의 별도 화면이 정합니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/shipping` | shippingController.getList | 배송 대상 목록 |
| POST | `/admin/shipping/tracking` | shippingController.postTracking | 송장 입력 및 배송 처리 |
| POST | `/admin/shipping/delivered` | shippingController.postDelivered | 배송완료 처리 |
| GET | `/admin/shipping-policy` | shippingPolicyController.getList | 배송비 정책 + 할증 대역 화면 |
| POST | `/admin/shipping-policy` | shippingPolicyController.postSavePolicy | 몰별 정책 저장(upsert) |
| POST | `/admin/shipping-policy/zones` | shippingPolicyController.postAddZone | 할증 우편번호 대역 추가 |
| POST | `/admin/shipping-policy/zones/:id/delete` | shippingPolicyController.postDeleteZone | 대역 삭제 |

---

## 3. 배송 대상 목록 (GET /admin/shipping)

- **조건:** `orders.status IN ('PAID', 'PREPARING', 'SHIPPED', 'DELIVERED')`  
  - PENDING(입금대기), CANCELLED(취소), REFUNDED(환불) 제외  
- **쿼리:** `orders` LEFT JOIN `shipments` (tracking_number, courier_company, status as shipping_status) LEFT JOIN `users`(주문자 표시), `ORDER BY o.created_at DESC`  
- **표시:** 주문번호 / 받는 분·주문자·주소 / 현재 상태 / 배송 정보 입력 / 관리  
- **택배사 선택지(뷰 하드코딩):** CJ대한통운, 우체국택배, 한진택배, 롯데택배, 로젠택배  
- **뷰 전달:** `orders`, `title: '배송 관리'`

---

## 4. 송장 입력 및 배송 처리 (POST /admin/shipping/tracking)

### 4.1 요청 파라미터

| name | 타입 | 설명 |
|------|------|------|
| order_id | number | 주문 ID |
| courier_company | string | 택배사 |
| tracking_number | string | 운송장 번호 |

### 4.2 처리 로직 (단일 트랜잭션)

1. **shipments 존재 여부:** `SELECT id FROM shipments WHERE order_id = ?`  
2. **있으면:**  
   - `UPDATE shipments SET courier_company=?, tracking_number=?, status='IN_TRANSIT', shipped_at=NOW() WHERE order_id=?`  
3. **없으면:**  
   - `INSERT INTO shipments (order_id, courier_company, tracking_number, status, shipped_at) VALUES (?, ?, ?, 'IN_TRANSIT', NOW())`  
4. **주문 상태:** `transition(conn, order_id, { status: 'SHIPPED' }, { actorType: 'ADMIN', memo: '송장 등록 (…)' })`  
   - 직접 UPDATE 가 아니라 `orderStatusService.transition()` 을 경유하므로 `order_status_logs` 에 이력이 남습니다.  
   - 이미 `SHIPPED` 면 값이 같아 no-op 입니다.
5. **리다이렉트:** `/admin/shipping`

송장을 등록하거나 수정하면 해당 주문의 상태가 자동으로 `SHIPPED`로 변경됩니다.

---

## 5. 배송완료 처리 (POST /admin/shipping/delivered)

- **파라미터:** `order_id`  
- **동작 (단일 트랜잭션):**  
  1. `UPDATE shipments SET status='DELIVERED', delivered_at=NOW() WHERE order_id=?`  
  2. `transition(conn, order_id, { status: 'DELIVERED' }, { actorType: 'ADMIN', memo: '배송완료 처리' })`  
- **리다이렉트:** `/admin/shipping`

> `shipments.delivered_at` 은 **반품 가능 기간(수령 후 7일)의 기준 시각**입니다. 이 값이 비어 있으면 반품 신청 시 기간 검사를 통과해 버립니다. → [클레임 관리](./claims.md)

---

## 6. 배송 상태 (shipments.status)

DB enum 은 8개입니다: `READY`, `READY_TO_SHIP`, `SHIPPED`, `IN_TRANSIT`, `DELIVERED`, `DELIVERY_FAILED`, `RETURNING`, `RETURNED`.

**코드가 실제로 쓰는 값은 3개뿐입니다.**

| 값 | 설정 시점 |
|----|-----------|
| `READY` | 컬럼 DEFAULT |
| `IN_TRANSIT` | 송장 입력 시 (`POST /admin/shipping/tracking`) |
| `DELIVERED` | 배송완료 처리 시 (`POST /admin/shipping/delivered`) |

나머지 5개(`READY_TO_SHIP`·`SHIPPED`·`DELIVERY_FAILED`·`RETURNING`·`RETURNED`)는 enum 에만 있고 어떤 코드도 설정하지 않습니다. 주문 상세 화면(`views/admin/sales/detail.ejs`)의 한글 라벨도 위 3개만 정의합니다.

---

## 7. 배송비 정책 (`/admin/shipping-policy`)

**송장 관리와 무관한 별개 화면**입니다.

### 7.1 화면 구성 (GET)

- 활성 몰(`mall.is_active = 1`) 각각의 정책 카드를 **한 화면에 나란히** 렌더합니다. 우측 상단 몰 선택기(`req.adminMallId`)와 무관합니다 — 정책은 두 개뿐이고 비교할 일이 잦기 때문.
- 하단에 할증 우편번호 대역 추가 폼 + 대역 목록 테이블(구분 / 우편번호 대역 / 지역명 / 삭제).
- **뷰 전달:** `malls`, `policyByMall`(Map), `zones`, `saved`, `error`

### 7.2 정책 저장 (POST /admin/shipping-policy)

| name | 설명 |
|------|------|
| mall_id | 몰 ID (없으면 에러 리다이렉트) |
| base_fee | 기본 배송비 (음수 방지) |
| free_threshold | 무료배송 기준액. **빈 문자열 = NULL = 무료배송 없음.** `0` 과 반드시 구분(0 이면 전 주문 무료배송) |
| jeju_extra | 제주 할증 |
| island_extra | 도서산간 할증 |
| is_active | 체크 해제 시 배송비를 청구하지 않음 |

`INSERT ... ON DUPLICATE KEY UPDATE` — 몰당 1행(`uk_shipping_policy_mall`). 성공 시 `?saved=1` 로 리다이렉트.

### 7.3 할증 대역 (POST /admin/shipping-policy/zones · /zones/:id/delete)

- **파라미터:** `zone_type`(`JEJU`|`ISLAND`), `zipcode_from`, `zipcode_to`, `label`  
- **검증:** 우편번호는 숫자만 남긴 뒤 **정확히 5자리**여야 하고 `from <= to` 여야 합니다. 대역 판정이 문자열 `BETWEEN` 이라 자리수가 어긋나면 조용히 오작동합니다.  
- 대역은 **몰 스코프가 없습니다** — 제주가 어디인지는 몰마다 다르지 않습니다.

### 7.4 계산 규칙 (`services/shipping/shippingCalculator.js`)

- 배송비는 **서버가 계산**합니다. 요청 본문·쿼리스트링의 금액을 받지 않습니다.
- 무료배송 판정 기준은 **`subtotal_amount`(쿠폰·적립금 차감 전)** 입니다. 결제액 기준이면 "쿠폰을 썼더니 배송비가 생겼다"가 됩니다.
- **무료배송이어도 지역 할증은 청구합니다.** 무료가 되는 것은 `base_fee` 뿐입니다.
- `is_active = 0` 이면 배송비 0.
- **정책 행이 없으면** `DEFAULT_POLICY`(base 3000 / free 50000 / jeju 3000 / island 5000)로 동작합니다 — 무배송비 상태로 새지 않게.
- 반품 배송비는 `refundService.calcReturnShippingFee()` 가 `shipping_policy.base_fee × 2`(왕복)로 계산하며, 귀책이 판매자면 0 입니다. → [클레임 관리](./claims.md)

---

## 8. DB 스키마

### shipments

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | 배송 ID |
| order_id | INT FK → orders (ON DELETE CASCADE) | 주문 ID |
| tracking_number | VARCHAR(100) | 운송장 번호 |
| courier_company | VARCHAR(50) | 택배사 |
| status | ENUM (§6) DEFAULT 'READY' | 배송 상태 |
| shipped_at | TIMESTAMP NULL | 출고일시 |
| delivered_at | TIMESTAMP NULL | 배송완료일시 (반품 기한 기준) |
| created_at | TIMESTAMP | 등록일시 |

### shipping_policy (몰당 1행)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | |
| mall_id | BIGINT UNIQUE | 몰 ID |
| base_fee | INT DEFAULT 3000 | 기본 배송비 |
| free_threshold | INT NULL | 이 금액(subtotal) 이상이면 기본 배송비 면제. NULL = 무료배송 없음 |
| jeju_extra | INT DEFAULT 3000 | 제주 할증 |
| island_extra | INT DEFAULT 5000 | 도서산간 할증 |
| is_active | TINYINT(1) DEFAULT 1 | 0 이면 배송비 미청구 |

### shipping_zipcode_zone

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | |
| zone_type | ENUM('JEJU','ISLAND') | 할증 구분 |
| zipcode_from / zipcode_to | CHAR(5) | 5자리 신우편번호 대역(끝 포함) |
| label | VARCHAR(100) | 지역명(운영자 식별용) |

계산 결과가 기록되는 주문 컬럼: `orders.shipping_fee`(지역 할증 포함), `orders.shipping_discount`(배송비 쿠폰 할인, `shipping_fee` 초과 불가), `orders.receiver_zipcode`(할증 판정 입력값).

---

## 9. 주의사항

- `/admin/shipping` 과 `/admin/shipping-policy` 는 이름만 비슷할 뿐 **테이블도 담당도 다릅니다.**
- `free_threshold` 를 `0` 으로 저장하면 **전 주문 무료배송**이 됩니다. "무료배송 없음"은 빈 값(NULL)입니다.
- 우편번호 대역은 문자열 `BETWEEN` 비교입니다. 5자리가 아닌 값이 들어가면 판정이 조용히 어긋납니다.
- 배송완료 처리를 빠뜨리면 `delivered_at` 이 비어 반품 가능 기간(7일) 검사가 사실상 무제한이 됩니다.

---

*Last Updated: 2026-07-11*
