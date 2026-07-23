# B2B 주문 · 클레임 (B2B Orders & Claims)

## 1. 개요

- **Base URL:** `/admin/b2b/orders`, `/admin/b2b/claims`
- **관련 테이블:** `orders`(`order_type`·`supply_amount`·`vat_amount`·`stock_deducted_at`), `b2b_order_detail`, `business_profile`, `order_items`, `shipments`, `order_claims`, `order_refunds`, `order_status_logs`
- **컨트롤러:** `controllers/admin/b2bOrderController.js`, `controllers/admin/b2bClaimController.js`
- **서비스:** `services/b2b/b2bOrderService.js`(승인·입금확인·출고·배송완료·취소·기한초과 회수), `services/order/claimService.js`, `services/order/refundService.js`, `services/order/orderCancelService.js`, `services/order/orderStatusService.js`
- **뷰:** `views/admin/b2b/orders.ejs`, `order_detail.ejs`, `claims.ejs`, `claim_detail.ejs`
- **라우트:** `routes/admin/b2b.js` (`/admin/b2b` 마운트 시 `requireMenuAccess('/admin/b2b/members')` 로 한 번 검사)

> 이 문서는 **기업 주문의 처리 흐름**만 다룹니다. 기업회원 승인·가격 정책·견적은
> [B2B 사업자몰 구현설계](../../사이트개선/b2b_사업자몰_구현설계.md) 와 [B2B 관리 매뉴얼](../../manual/admin/b2b.md) 을 보세요.

관련 문서: [주문 및 매출 관리](./sales.md) · [배송 관리](./shipping.md) · [클레임 관리](./claims.md)

---

## 2. 왜 화면이 갈라져 있나 (가장 중요)

**주문 엔진은 B2C 와 공통입니다.** `orders` / `order_items` / `shipments` / `orderStatusService` 를 그대로 씁니다. 새 상태머신을 만들지 않고 기존 4축에 매핑하며, 판매자 승인 단계만 `b2b_order_detail.approval_status` 가 따로 듭니다.

그런데 **관리 화면은 완전히 갈랐습니다.** 이유는 두 가지입니다.

### 2-1. 정합성 — 승인 단계를 모르는 화면이 상태를 뒤집는다

`/admin/sales` 는 `approval_status` 와 `orders.stock_deducted_at` 을 모릅니다. 분리 전에는 다음이 가능했습니다.

| 조작 | 결과 |
|---|---|
| 판매 관리에서 B2B 주문을 `PAID` 로 변경 | `approval_status` 는 `REQUESTED` 그대로, `stock_deducted_at` 은 NULL → **재고를 차감하지 않은 채 결제완료** |
| B2B 화면에서 승인한 주문을 판매 관리에서 `CANCELLED` | 재고는 복원되지만 `approval_status='APPROVED'` 가 남아 **B2B 목록 "입금 대기" 탭에 계속 노출** |

### 2-2. 규칙 — B2B 에만 있는 제약을 공용 화면이 검사하지 않는다

- 출고는 **입금 확인(`payment_status='PAID'`) 후에만** 가능합니다. 선입금이 원칙이라 미입금 출고는 곧 미수금입니다. `/admin/shipping` 에는 이 검사가 없습니다.
- 환불은 **자동으로 나가지 않습니다**(§5). `/admin/claims` 에는 계좌 이체 마감 절차가 없습니다.

### 2-3. 잠금 방식

| 화면 | 잠금 | 이탈 처리 |
|---|---|---|
| `/admin/sales` | 목록 `o.order_type='B2C'` | 상세·`POST /status` 에서 B2B 면 `/admin/b2b/orders/:id` 로 302 |
| `/admin/shipping` | 목록 `o.order_type='B2C'` | `POST /tracking`·`/delivered` 에서 B2B 면 302 |
| `/admin/claims` | 목록 `o.order_type='B2C'` | 상세·승인·거절·수동환불에서 `divertIfB2b()` 로 302 |

즐겨찾기·과거 링크·직접 POST 로 들어와도 전용 화면으로 넘어갑니다.

> `controllers/admin/orderController.js` 와 `routes/admin/orders.js`(`/admin/orders`)는 **삭제됐습니다.** `routes/admin.js` 가 마운트한 적이 없어 도달 불가였습니다.

---

## 3. 상태 매핑

`orders.status` enum 에 B2B 전용 값을 추가하지 **않습니다.** 승인 단계는 `b2b_order_detail.approval_status` 가 듭니다.

| 업무 단계 | `orders.status` | `payment_status` | `approval_status` | 부가 |
|---|---|---|---|---|
| 접수 | `PENDING` | `PENDING` | `REQUESTED` | 재고 손대지 않음 |
| 검토 중 | `PENDING` | `PENDING` | `UNDER_REVIEW` | |
| 승인·입금대기 | `PENDING` | `PENDING` | `APPROVED` | **재고 차감** · `payment_due_at` 설정 |
| 입금 확인 | `PAID` | `PAID` | `APPROVED` | `paid_at`, `payment_method='BANK_TRANSFER'` |
| 출고 | `SHIPPED` | `PAID` | `APPROVED` | `shipments` upsert |
| 배송완료 | `DELIVERED` | `PAID` | `APPROVED` | `delivered_at` |
| 반려·취소 | `CANCELLED` | `CANCELLED` | `REJECTED` | 재고 복원 |

화면 라벨은 `b2bOrderController.stageOf()` 가 네 축을 사람 말로 합칩니다(`접수`·`검토 중`·`입금 대기`·`입금확인 · 준비중`·`출고`·`배송완료`·`취소/반려`). **화면이 규칙을 새로 만들지 않습니다** — 뷰의 `canApprove`/`canShip` 등은 서비스의 판정과 같은 조건입니다.

### 승인 시점에 재고를 깎는 이유

입금 기한이 기본 7일입니다. 그동안 아무 확보가 없으면 마지막 재고를 두 거래처가 동시에 승인받고 한쪽이 출고 불가가 됩니다. 차감 사실은 `orders.stock_deducted_at` 에 남고, 취소·기한만료 시 `orderCancelService.restoreOrderResources` 가 그 값을 보고 되돌립니다(**멱등**).

> ⚠️ 스케줄러가 없습니다. 기한초과 주문은 목록 상단 작업함에서 관리자가 직접 회수합니다(`postCancelOverdue`). 회수하지 않으면 그 수량은 계속 팔 수 없습니다.

---

## 4. 라우트 및 동작

### 4-1. 주문

| 메서드 | 경로 | 컨트롤러 | 설명 |
|---|---|---|---|
| GET | `/admin/b2b/orders` | getList | 단계 탭·검색(`?stage=`, `?q=`), 기한초과 작업함 |
| POST | `/admin/b2b/orders/cancel-overdue` | postCancelOverdue | 기한초과 일괄 취소 + 재고 회수 |
| GET | `/admin/b2b/orders/:id` | getDetail | 상세 + 변경 이력 + 클레임 요약 |
| POST | `/admin/b2b/orders/:id/action` | postAction | `review`·`approve`·`deposit`·`ship`·`delivered`·`reject` |
| POST | `/admin/b2b/orders/:id/tax-invoice` | postTaxInvoice | 세금계산서 상태·승인번호 기록(수동 발행) |

`postAction` 하나로 받고 판정은 서비스가 합니다.

| action | 서비스 | 가드 |
|---|---|---|
| `approve` | `approve()` | 재고 부족이면 승인하지 않음(주문은 접수 상태 유지) |
| `deposit` | `confirmDeposit()` | 승인 전이면 거부. 재고 미차감 상태면 여기서 차감(데이터 보정 대비) |
| `ship` | `ship()` | 택배사·송장번호 필수. `payment_status='PAID'` 아니면 거부. 취소 주문 거부 |
| `delivered` | `markDelivered()` | `status='SHIPPED'` 인 주문만 |
| `reject` | `cancel()` | 출고·배송완료 주문은 거부(클레임으로 처리) |

거래처 안내 메일은 `notify()` 가 `REQUESTED`·`APPROVED`·`PAID`·`SHIPPED`·`DELIVERED`·`REJECTED` 단계에 보냅니다. **메일 실패는 주문 처리를 되돌리지 않습니다.**

`notify()` 는 이제 문구를 갖고 있지 않고 `orderMailer.notifyB2bOrder(orderId, kind)` 로 위임합니다 — 제목·본문은 `b2b_order_*` 템플릿에서 오고, 관리자가 `/admin/email-templates` 에서 고칠 수 있습니다(→ [`email_templates.md`](./email_templates.md)). B2B 클레임 승인·반려·환불완료 안내는 `orderMailer.notifyB2bClaim()` 이 담당합니다.

### 4-2. 클레임

| 메서드 | 경로 | 컨트롤러 | 설명 |
|---|---|---|---|
| GET | `/admin/b2b/claims` | getList | 클레임 목록 + **이체 대기 환불 작업함** |
| POST | `/admin/b2b/claims/refund-complete` | postRefundComplete | 계좌 환불 완료 처리 (목록·상세 양쪽에서 호출) |
| GET | `/admin/b2b/claims/:id` | getDetail | 상세 (귀책·반품배송비·환불 내역) |
| POST | `/admin/b2b/claims/:id/approve` | postApprove | `claimService.approveClaim` |
| POST | `/admin/b2b/claims/:id/reject` | postReject | `claimService.rejectClaim` |

`refund-complete` 는 `:id` 보다 **먼저** 선언해야 합니다(라우트 순서). 처리 전 해당 환불이 B2B 주문의 것인지 확인합니다.

---

## 5. 환불 — B2B 는 자동으로 나가지 않는다

`refundService.refundOrder` 는 원래 환불 수단을 `orders.payment_key` 유무로만 판정했습니다. B2B 는 무통장이라 `payment_key` 가 없어 "결제 없던 주문"으로 분류됐고, **한 푼도 보내지 않았는데 `method='NONE'` · `status='COMPLETED'` 로 기록**됐습니다.

지금은 B2B 를 따로 판정합니다.

| 조건 | `order_refunds.method` | `order_refunds.status` | 반환값 | 뜻 |
|---|---|---|---|---|
| B2B · `payment_status='PAID'` · 환불액>0 | `MANUAL` | `REQUESTED` | `{ok:false, pending:true}` | **이체 대기** |
| B2B · 입금 전 | `NONE` | `COMPLETED` | `{ok:true}` | 받은 돈이 없음 |
| B2C · `payment_key` 있음 | `PG` | Toss 응답에 따름 | `{ok:true/false}` | 자동 환불 |

`claimService.approveInTransaction` 이 이를 주문에 반영합니다.

```
refund.ok       → refund_status='COMPLETED', payment_status='REFUNDED'
refund.pending  → refund_status='REQUESTED', payment_status='CANCELLED'   ← B2B 대기
그 외(실패)      → refund_status='FAILED',    payment_status='CANCELLED'
```

> **`REQUESTED`(대기)와 `FAILED`(실패)를 반드시 구분하세요.** 실패는 재시도 대상이고, 대기는 정상 흐름의 한 단계입니다. 섞으면 운영자가 이체해야 할 건을 오류로 오인합니다.

마감은 `postRefundComplete` → `markRefundManual()`(`method='MANUAL'`, `status='COMPLETED'`) + `orders.refund_status='COMPLETED'` · `payment_status='REFUNDED'` 입니다. 이체 메모는 별도 컬럼이 없어 `order_refunds.failed_reason` 에 적습니다(실패 사유가 아니라 처리 메모).

---

## 6. 알려진 한계 · 후속 과제

- **교환(`EXCHANGE`)** 은 `claimService` 가 아직 막아 두었습니다(반품 후 재주문 안내).
- **부분 취소·부분 반품** 은 미지원입니다. 클레임은 주문 단위입니다.
- `refundOrder` 가 트랜잭션 안에서 PG `fetch` 를 호출하는 구조 이슈는 그대로입니다([claims.md](./claims.md) 참고). B2B 경로는 외부 호출이 없어 무관합니다.
- 기한초과 자동 취소 스케줄러가 없습니다(설계 §14.2 결정 대기).
- **대시보드 매출 집계는 B2C·B2B 합산**입니다. 의도된 동작이며 분리하지 않았습니다.
