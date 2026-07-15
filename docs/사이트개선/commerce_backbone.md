# 커머스 백본 — 주문 · 배송 · 클레임 · 쿠폰 · 배송비

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15 / 통합: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료 항목의 설계 산문·DDL·체크리스트는 삭제했습니다. 원문은 git 이력에서 확인하세요.
>
> **이 문서는 쿠폰 · 주문/배송/클레임 · 배송비 3개 계획서를 하나로 합친 것입니다.**
> (구 `coupon_design_and_development.md` · `order_claim_design_and_development.md` · `shipping_fee_design_and_development.md`)
> 세 모듈은 결제 총액 계산·부분 취소 배분·반품 배송비에서 서로 맞물리므로 함께 봅니다.

---

## 쿠폰

### 완료되어 이관된 항목

| 차수 | 항목 | 이관된 문서 |
|---|---|---|
| 0차 | 결제 우회 차단(총액 서버 계산) · 취소 시 쿠폰 복원 · `max_total_uses` 재검증 | `develop_guide/user/checkout.md` |
| 1차 (D1~D13) | 다운로드 쿠폰존 `/coupon` · 쿠폰 수령 · 쿠폰 코드 등록 UI · RESERVED 30분 점유 · 쿠폰함 4상태(사용가능·사용완료·기간만료·취소) | `develop_guide/user/promotions.md` · `develop_guide/user/mypage.md` · `develop_guide/admin/coupons.md` |
| 2차 (P1~P11) | 정률 할인 · 최대 할인액 상한 · `scope_json` 적용범위(카테고리·브랜드) · 무료배송/배송비 쿠폰 · 주문쿠폰 1장 + 배송비쿠폰 1장 · 할인 계산기 분리(`services/coupon/discountCalculator.js`) | `develop_guide/admin/coupons.md` · `develop_guide/user/checkout.md` |
| 운영 | 쿠폰 등록·지급·통계 화면 사용법 | `manual/admin/coupons.md` |

#### 원문 정정

원문 §7-1 의 *"다운로드 쿠폰이 0건이라 `/coupon` 은 준비중 랜딩"* 서술은 **낡았습니다.**
현재 `issued_by='DOWNLOAD'` 쿠폰 **5건이 ACTIVE** 이며 쿠폰존은 정상 렌더됩니다.

### 잔여 과제

원문 §13-1 의 **3차** 항목입니다. 순서(**부분취소 → 상품쿠폰 → 다중쿠폰**)를 지킵니다.

| # | 항목 | 선행 / 해제 조건 |
|---|---|---|
| 1 | **부분 취소 시 쿠폰 안분** — `order_items.coupon_discount_amount` 배분 | 없음. **3차 최우선.** 배분이 없으면 부분 취소·부분 클레임을 되돌릴 근거가 없다 |
| 2 | **상품 단위 쿠폰 (`PRODUCT` scope)** | 1번(부분 취소 배분) 선행 — 배분 없이 넣으면 되돌릴 근거가 없다 |
| 3 | **다중 쿠폰 (3장 이상)** — `order_coupons` 테이블 + `combination_group` | 2번(상품 쿠폰) 선행 |
| 4 | **발급 조건 확장** (등급·누적구매·생일) | `user_grade` 도입 |
| 5 | **`coupon_target` · `coupon_issue_condition` 테이블 분리** | 한 쿠폰에 **다중** 대상 규칙 또는 **다중** 발급 조건이 필요해질 때. 그전까지는 `coupons` 컬럼 확장 + `scope_json` 으로 충분 |
| 6 | **쿠폰 회수(REVOKED) · 변경 이력** | 없음. 운영 요구 발생 시 앞당김 |
| 7 | **반품 배송비 (쿠폰 연계)** | 반품 모듈 — 이 문서 [주문 · 배송 · 클레임](#주문--배송--클레임) 절 참조 |
| 8 | **장바구니 쿠폰 미리보기** | 없음. (장바구니 배송비 게이지는 완료) |

#### 보류 — 되살릴 조건

| 항목 | 되살릴 조건 |
|---|---|
| 적립금 지급 쿠폰 | 쿠폰과 무관하게 적립 지급 트리거가 필요해지면 이벤트 모듈에서 처리 |
| 사은품 쿠폰 | 사은품 마스터 + 주문 동봉 모델을 정의하면 착수 |
| Buy X Get Y | 장바구니 프로모션 규칙 엔진 도입 시 |
| 수량 할인 | 공동구매(`group_buy`)와 별개의 상시 수량 할인 요구가 생기면 |
| 결제수단(카드사) 할인 | 카드사 제휴가 실제로 맺어지면 |
| 사용 채널 제한(앱 전용) | 앱 출시 시 |
| 판매자 쿠폰 · 비용 부담 주체 | 입점형(오픈마켓) 전환 시 |
| 정책 엔진 5테이블 | 위 5번과 동일 조건 |

### 알려진 결함

#### `coupons.issued_count` 드리프트

회원 삭제 시 FK CASCADE 가 `user_coupons` 행만 지우고 **`coupons.issued_count` 카운터를 되돌리지 않는다.**

- 실측 — 쿠폰 `id=1`: `issued_count = 21` vs 실제 `user_coupons` **19행**.
- 현재 이 쿠폰은 `issue_limit = NULL` 이라 **무해**하다.
- 그러나 **선착순 쿠폰(`issue_limit` 설정)** 에서 회원 삭제가 반복되면 발급 한도가 **조기 소진**된다.
- 처리 방향: 회원 삭제 트랜잭션에서 `issued_count` 를 감산하거나, `issue_limit` 판정을 카운터가 아닌 `COUNT(user_coupons)` 실측으로 전환한다.

---

## 주문 · 배송 · 클레임

### 완료되어 이관된 항목

| 차수 | 항목 | 이관된 문서 |
|---|---|---|
| 0차 (결함 3종) | 고객 주문 취소 500 (`cancel_reason` 컬럼 부재) · 재고 이중 복원 (`resources_restored_at` 멱등 가드) · PG 취소 API 미호출 | `develop_guide/user/mypage.md` · `develop_guide/admin/claims.md` |
| 1차 (O1~O3) | 상태 4축 분리(`orders.status` 유지 + `payment_status`·`claim_status`·`refund_status`) · `order_status_logs` 변경 이력 · `restoreOrderResources` 멱등화 | `develop_guide/admin/claims.md` |
| 2차 (O5~O12) | 클레임 신청/승인/거절/철회 (`order_claims`) · 환불 (`order_refunds`, Toss 취소 · `payment_key` 없으면 `method='NONE'`) · 반품 배송비 귀책 판정 · 고객 `/mypage/claims` · 관리자 `/admin/claims` | `develop_guide/admin/claims.md` · `develop_guide/user/mypage.md` · `develop_guide/user/checkout.md` · `manual/admin/claims.md` |

### 잔여 과제

#### O4 — 상태 전이 단일화가 덜 됐다 (미완)

`orderStatusService.transition()` 은 만들었으나 **모든 경로가 이걸 쓰지는 않는다.**

```
controllers/checkoutController.js:161-164
  → 결제 확정 시 transition() 을 우회하고 UPDATE orders SET status='PAID' 를 직접 실행
```

→ 아래 **알려진 결함**과 같은 뿌리다. 함께 고친다.

#### §5-3 — `/admin/shipping` 확장 (미구현)

출고 처리(`READY_TO_SHIP` → `SHIPPED`), 송장 일괄 등록, 배송 상태 전이 UI 가 없다.
그 결과 `shipments.status` enum 8종 중 **5종이 죽은 값**이다:
`READY_TO_SHIP` · `SHIPPED` · `DELIVERY_FAILED` · `RETURNING` · `RETURNED`.

#### O13 — PG 실주문 환불 경로 미검증

이중 승인 방지 가드는 **코드로 존재**하나, 지금까지의 검증은 전부 `payment_key = NULL`(`method='NONE'`) 이었다.
`cancelTossPayment` 요청 형태(URL·인증·`cancelAmount`)는 fetch 스텁으로 확인했으나 **실제 토스 취소는 미검증**이다.
→ *해제 조건: 토스 테스트 시크릿으로 1회 실주문*

#### 3차 — 연기 (해제 조건 명시)

- [ ] **PG 호출을 트랜잭션 밖으로** — 환불 `REQUESTED` 커밋 → 트랜잭션 밖 토스 호출 → 짧은 2차 트랜잭션으로 `COMPLETED`/`FAILED`. 지금은 `approveInTransaction` 이 주문 행을 잠근 채 `fetch` 한다(저트래픽이라 무해하나 올바른 형태가 아니다) → *해제 조건: 없음. 트래픽 증가 전에*
- [ ] **부분 클레임 (상품별)** → *해제 조건: `order_items.coupon_discount_amount` 배분* (위 [쿠폰](#쿠폰) 3차 1번)
- [ ] **교환(EXCHANGE)** → *해제 조건: 부분 클레임 + 재출고 + 차액 결제*
- [ ] **분할 배송 · 합배송** → *해제 조건: `shipments` 가 주문당 1행인 제약 해제*
- [ ] **가상계좌 입금 확인 · 부분결제** → *해제 조건: Toss 가상계좌 연동*
- [ ] **정산 · 미수금 · 판매자별 주문** → *해제 조건: 입점형(오픈마켓) 전환*
- [ ] **구매확정** → *해제 조건: 정산 도입. 지금은 DELIVERED 가 종점*

### 알려진 결함

#### 🔴 HIGH — 결제 확정 시 `payment_status` 가 갱신되지 않는다

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

---

## 배송비

### 완료되어 이관된 항목

**S1~S16 전부 구현·검증 완료.**

| 항목 | 이관된 문서 |
|---|---|
| `shipping_policy` · `shipping_zipcode_zone` 테이블 · `orders.shipping_fee` | `develop_guide/admin/shipping.md` |
| `services/shipping/shippingCalculator.js` (서버 계산 — 클라이언트에서 배송비를 받지 않는다) | `develop_guide/admin/shipping.md` |
| 체크아웃 배송비 계산 · 주문 저장 | `develop_guide/user/checkout.md` |
| 장바구니 무료배송 게이지 | `develop_guide/user/cart.md` |
| 관리자 `/admin/shipping-policy` (정책 · 우편번호 대역 편집) | `develop_guide/admin/shipping.md` · `manual/admin/shipping.md` |
| 제주·도서산간 우편번호 대역 판정 | `develop_guide/admin/shipping.md` |
| 배송지 변경 시 배송비 재계산 (AJAX) | `develop_guide/user/checkout.md` |
| 취소 시 배송비 환불 | `develop_guide/user/mypage.md` |
| 배송비 쿠폰 연계 (`SHIPPING_FREE`·`SHIPPING_FIXED`, `orders.shipping_coupon_id`) | `develop_guide/admin/coupons.md` |

### 핵심 규칙 (요약만 유지 — 상세는 이관 문서로)

- **무료배송 판정은 쿠폰·적립금 차감 *전* 상품 금액(`subtotal_amount`) 기준.**
- **무료배송이어도 제주·도서산간 할증은 청구한다.** (기본료만 면제)
- 정책 행이 없으면 기본값 — 기본료 `3000` / 무료배송 기준 `50000` / 제주 `+3000` / 도서산간 `+5000`.
- `shipping_policy.is_active = 0` 이면 배송비 **전액 0**.

### 잔여 과제

원문 §8-4 의 **3차** 항목입니다.

- [ ] **부분 취소 시 배송비 안분** — 부분 취소로 무료배송 기준을 이탈하면 배송비 재판정 → *해제 조건: 부분 취소 모듈* (위 [쿠폰](#쿠폰) 3차 1번)
- [ ] **반품 배송비 소급 청구** → *해제 조건: 반품 모듈* (위 [주문 · 배송 · 클레임](#주문--배송--클레임) 절)
- [ ] **묶음배송 (주문 합배송) · 상품별 개별 배송비 · 판매자별 배송** → *해제 조건: 입점형(오픈마켓) 전환*
- [ ] 배송비 조건부 무료 (특정 브랜드·카테고리) → *해제 조건: 없음. 운영 요구 시*

### 알려진 결함

#### 스키마 드리프트 — `tables.sql` 누락

`tables.sql` 에 아래 정의가 **없다.** 마이그레이션 스크립트(`scripts/migrate_*.js`)에만 존재한다.

- `shipping_policy` 테이블
- `shipping_zipcode_zone` 테이블
- `orders.shipping_fee` 컬럼

→ `npm run init:db` 로 DB 를 새로 만들면 배송비 기능이 동작하지 않는다. `tables.sql` 동기화 필요.
