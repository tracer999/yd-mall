# 주문 · 배송 · 클레임 설계/개발 설계

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료 항목의 설계 산문·DDL·체크리스트는 삭제했습니다. 원문은 git 이력에서 확인하세요.

---

## 완료되어 이관된 항목

| 차수 | 항목 | 이관된 문서 |
|---|---|---|
| 0차 (결함 3종) | 고객 주문 취소 500 (`cancel_reason` 컬럼 부재) · 재고 이중 복원 (`resources_restored_at` 멱등 가드) · PG 취소 API 미호출 | `develop_guide/user/mypage.md` · `develop_guide/admin/claims.md` |
| 1차 (O1~O3) | 상태 4축 분리(`orders.status` 유지 + `payment_status`·`claim_status`·`refund_status`) · `order_status_logs` 변경 이력 · `restoreOrderResources` 멱등화 | `develop_guide/admin/claims.md` |
| 2차 (O5~O12) | 클레임 신청/승인/거절/철회 (`order_claims`) · 환불 (`order_refunds`, Toss 취소 · `payment_key` 없으면 `method='NONE'`) · 반품 배송비 귀책 판정 · 고객 `/mypage/claims` · 관리자 `/admin/claims` | `develop_guide/admin/claims.md` · `develop_guide/user/mypage.md` · `develop_guide/user/checkout.md` · `manual/admin/claims.md` |

---

## 잔여 과제

### O4 — 상태 전이 단일화가 덜 됐다 (미완)

`orderStatusService.transition()` 은 만들었으나 **모든 경로가 이걸 쓰지는 않는다.**

```
controllers/checkoutController.js:161-164
  → 결제 확정 시 transition() 을 우회하고 UPDATE orders SET status='PAID' 를 직접 실행
```

→ 아래 **알려진 결함**과 같은 뿌리다. 함께 고친다.

### §5-3 — `/admin/shipping` 확장 (미구현)

출고 처리(`READY_TO_SHIP` → `SHIPPED`), 송장 일괄 등록, 배송 상태 전이 UI 가 없다.
그 결과 `shipments.status` enum 8종 중 **5종이 죽은 값**이다:
`READY_TO_SHIP` · `SHIPPED` · `DELIVERY_FAILED` · `RETURNING` · `RETURNED`.

### O13 — PG 실주문 환불 경로 미검증

이중 승인 방지 가드는 **코드로 존재**하나, 지금까지의 검증은 전부 `payment_key = NULL`(`method='NONE'`) 이었다.
`cancelTossPayment` 요청 형태(URL·인증·`cancelAmount`)는 fetch 스텁으로 확인했으나 **실제 토스 취소는 미검증**이다.
→ *해제 조건: 토스 테스트 시크릿으로 1회 실주문*

### 3차 — 연기 (해제 조건 명시)

- [ ] **PG 호출을 트랜잭션 밖으로** — 환불 `REQUESTED` 커밋 → 트랜잭션 밖 토스 호출 → 짧은 2차 트랜잭션으로 `COMPLETED`/`FAILED`. 지금은 `approveInTransaction` 이 주문 행을 잠근 채 `fetch` 한다(저트래픽이라 무해하나 올바른 형태가 아니다) → *해제 조건: 없음. 트래픽 증가 전에*
- [ ] **부분 클레임 (상품별)** → *해제 조건: `order_items.coupon_discount_amount` 배분* (쿠폰 문서 3차 1번)
- [ ] **교환(EXCHANGE)** → *해제 조건: 부분 클레임 + 재출고 + 차액 결제*
- [ ] **분할 배송 · 합배송** → *해제 조건: `shipments` 가 주문당 1행인 제약 해제*
- [ ] **가상계좌 입금 확인 · 부분결제** → *해제 조건: Toss 가상계좌 연동*
- [ ] **정산 · 미수금 · 판매자별 주문** → *해제 조건: 입점형(오픈마켓) 전환*
- [ ] **구매확정** → *해제 조건: 정산 도입. 지금은 DELIVERED 가 종점*

---

## 알려진 결함

### 🔴 HIGH — 결제 확정 시 `payment_status` 가 갱신되지 않는다

`controllers/checkoutController.js:161-164` 가 `transition()` 을 우회해 `UPDATE orders SET status='PAID'` 를 직접 실행한다. 그 결과:

- **신규 주문이 `status='PAID'` 인데 `payment_status='PENDING'` 으로 남는다.**
- 결제 확정 이력이 `order_status_logs` 에 **기록되지 않는다.**
- 기존 22건은 O1 의 백필로 값이 맞아 있어 **결함이 가려져 있다.** 새로 들어오는 주문부터 어긋난다.

**수정 방향**

```js
// AS-IS: UPDATE orders SET status='PAID' ... (직접 실행)
// TO-BE:
await transition(conn, orderId,
  { status: 'PAID', payment_status: 'PAID' },
  { actorType: 'SYSTEM' });
// payment_key · paid_at 은 별도 UPDATE 로 분리
```

이 수정이 곧 위 **O4(상태 전이 단일화)** 의 마무리다.
