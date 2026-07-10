# 배송비 설계/개발 설계

> 작성 2026-07-10. **[`coupon_design_and_development.md`](./coupon_design_and_development.md) 의 선행 과제.**
> 무료배송 쿠폰은 이 문서가 끝나야 성립한다. 다만 이 문서의 존재 이유는 쿠폰이 아니다 —
> **이미 고객에게 고지한 배송 정책이 시스템에 구현돼 있지 않다.**

---

## 0. 문제 — 고지한 정책과 청구하는 금액이 다르다

`views/user/guide.ejs:68-84` 는 고객에게 이렇게 안내한다.

| 구분 | 고지된 정책 |
|---|---|
| 일반 택배 | **5만원 이상 무료, 미만 시 3,000원** |
| 추가 배송비 | **제주 +3,000원 / 도서산간 +5,000원** |
| 배송 기간 | 출고 후 수도권 1~2일, 비수도권 2~3일 |

그런데 결제 화면은 배송비를 **계산하지 않는다.**

```html
<!-- views/user/checkout/form.ejs:131-134 -->
<div class="flex justify-between">
    <span class="text-gray-600">배송비</span>
    <span>0원</span>          <!-- ← 정적 문자열. id 가 없어 JS 갱신 대상도 아니다 -->
</div>
```

**시스템 어디에도 배송비가 없다** (전수 확인, 2026-07-10).

```text
orders          배송비 컬럼 없음 (total_amount / subtotal_amount / coupon_discount / point_used)
products        배송 관련 컬럼 없음
checkoutController  배송비 계산 코드 0건
cartController      배송비 계산 코드 0건
system_settings     배송 관련 키 0건
site_settings       배송 관련 컬럼 0건
DB 테이블            shipments (송장 추적 전용 — 배송비와 무관)
```

즉 `total_amount = MAX(0, subtotal − coupon_discount − point_used)` 로 끝난다(`checkoutController.js:464`). **5만원 미만 주문에서 받기로 고지한 3,000원이 청구되지 않고, 제주·도서산간 할증도 청구되지 않는다.**

> 주문이 22건인 현 시점에서는 회계상 영향이 작다. 그러나 **고지와 청구가 어긋난 상태**이며,
> 이 상태로 주문이 쌓이면 소급 정정이 불가능하다.

---

## 1. 설계 원칙

### 1-1. 배송비는 서버가 계산한다 — 클라이언트에서 받지 않는다

이것이 이 문서의 첫 번째 규칙이다. 쿠폰 문서 §3 의 **C3 (결제 우회 결함)** 이 정확히 이 원칙을 어겨서 발생했다.

```js
// controllers/checkoutController.js:625-628 — 이렇게 하면 안 된다
const isTest = req.query.test === '1';
const couponDiscount = req.query.coupon_discount != null ? parseInt(...) : null;
```

`shipping_fee` 를 폼 필드나 쿼리스트링으로 받으면 **같은 결함을 하나 더 만드는 것**이다. 배송비는 항상:

- 주문 생성(`postForm`) 시 **서버가 장바구니 내용과 배송지로 계산**해 `orders.shipping_fee` 에 기록
- 결제 확정(`completeOrderWithStockAndPaid`) 시 **주문 행에서 읽는다.** 요청에서 읽지 않는다
- 화면 표시는 참고값일 뿐, 총액의 근거가 아니다

> **선행 순서.** 쿠폰 문서의 **C3 를 먼저 고친 뒤** 배송비를 그 위에 올린다.
> C3 를 남겨둔 채 배송비를 넣으면, 조작 가능한 총액 계산식에 항목이 하나 더 늘 뿐이다.

### 1-2. 무료배송 판정 기준은 `subtotal_amount` 다

기준 금액을 무엇으로 볼지가 정책의 핵심이다. 레퍼런스([`쿠폰관리.md`](./쿠폰관리.md) §3-5)의 4가지 후보 중:

| 후보 | 이 저장소에서의 의미 | 채택 |
|---|---|---|
| `ORIGINAL_AMOUNT` | 상품 할인 전 정가 합계 | ✗ |
| **`SALE_AMOUNT`** | **상품 할인 적용 후 = `orders.subtotal_amount`** | **✅** |
| `COUPONABLE_AMOUNT` | 쿠폰 적용 대상 상품 합계 | ✗ (scope 개념 부재) |
| `PAYMENT_AMOUNT` | 모든 할인 후 실결제액 | ✗ |

**`PAYMENT_AMOUNT` 를 쓰면 안 되는 이유가 실질적이다.** 5만원어치를 담고 5,000원 쿠폰을 쓰면 결제액이 45,000원이 되어 배송비 3,000원이 붙는다. 고객 입장에서 "쿠폰을 썼더니 배송비가 생겼다"가 된다. 쿠폰 사용을 벌하는 정책은 쓰지 않는다.

### 1-3. 배송비 정책은 몰별로 다를 수 있다

`site_settings` 는 `mall_id` 로 몰 스코프를 가진다(컬럼형). mall 1(건강식품)과 mall 2(종합관)는 상품 구성이 달라 배송 정책도 달라질 수 있다. **정책은 몰별로 저장한다.**

`site_settings` 에 컬럼 4개를 더하는 방법도 있으나, 도서산간 판정에 **우편번호 대역 테이블**이 별도로 필요하므로 처음부터 전용 테이블로 둔다.

---

## 2. 데이터 모델

### 2-1. 1차 — 기본 배송비 + 무료배송 기준

```sql
CREATE TABLE shipping_policy (
  id             INT NOT NULL AUTO_INCREMENT,
  mall_id        BIGINT NOT NULL,
  base_fee       INT NOT NULL DEFAULT 3000,      -- 기본 배송비
  free_threshold INT NULL,                       -- 이 금액 이상 무료. NULL = 무료배송 없음
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_shipping_policy_mall (mall_id)   -- 몰당 1행
);

-- 고지된 정책으로 초기화 (guide.ejs)
INSERT INTO shipping_policy (mall_id, base_fee, free_threshold) VALUES (1, 3000, 50000), (2, 3000, 50000);
```

```sql
ALTER TABLE orders
  ADD COLUMN shipping_fee      INT NOT NULL DEFAULT 0 AFTER subtotal_amount,
  ADD COLUMN shipping_discount INT NOT NULL DEFAULT 0 AFTER shipping_fee;
```

> **기존 22건 백필.** `shipping_fee = 0`, `shipping_discount = 0` 이면 현재의
> `total_amount = subtotal − coupon − point` 와 **정확히 일치**한다. 과거 주문의 총액은 바뀌지 않는다.

### 2-2. 2차 — 지역 할증 (제주·도서산간)

`orders.receiver_zipcode` 는 이미 있다. 없는 것은 **우편번호 대역 데이터**다.

```sql
CREATE TABLE shipping_zipcode_zone (
  id          INT NOT NULL AUTO_INCREMENT,
  zone_type   ENUM('JEJU','ISLAND') NOT NULL,
  zipcode_from CHAR(5) NOT NULL,
  zipcode_to   CHAR(5) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_zipcode_range (zipcode_from, zipcode_to)
);

ALTER TABLE shipping_policy
  ADD COLUMN jeju_extra   INT NOT NULL DEFAULT 3000,
  ADD COLUMN island_extra INT NOT NULL DEFAULT 5000;
```

판정: `SELECT zone_type FROM shipping_zipcode_zone WHERE ? BETWEEN zipcode_from AND zipcode_to LIMIT 1`.

> **대역 데이터는 만들어야 한다.** 제주(63000~63644)는 단순하지만 도서산간은 우체국·택배사마다
> 목록이 다르다. 운영 기준을 하나 정해 시드 스크립트로 적재하고, 관리자에서 편집 가능하게 한다.
> 데이터가 없다는 것이 이 기능을 미루는 이유가 될 수 없다 — **없으면 만든다.**

### 2-3. 2차 — 배송비 쿠폰 (무료배송)

쿠폰 문서 §5-3 의 `benefit_type` 을 확장한다.

```sql
-- coupons.benefit_type ENUM('FIXED','PERCENT')  →  + 'SHIPPING_FREE', 'SHIPPING_FIXED'
ALTER TABLE orders
  ADD COLUMN shipping_coupon_id INT NULL AFTER user_coupon_id,
  ADD CONSTRAINT fk_orders_shipping_coupon
      FOREIGN KEY (shipping_coupon_id) REFERENCES user_coupons(id) ON DELETE SET NULL;
```

**`shipping_coupon_id` 를 `user_coupon_id` 와 분리하는 이유는 §3 을 보라.**

---

## 3. 배송비 쿠폰이 쿠폰 1장 제약을 깬다

쿠폰 문서 §6-1 은 "주문당 쿠폰 1장"을 1·2차 정책으로 확정했다. `orders.user_coupon_id` 가 단수이기 때문이다.

**배송비 쿠폰이 들어오는 순간 이 제약은 유지될 수 없다.**

```text
5,000원 할인 쿠폰을 쓰면  →  무료배송 쿠폰을 쓸 수 없다
무료배송 쿠폰을 쓰면      →  5,000원 할인 쿠폰을 쓸 수 없다
```

어느 쇼핑몰도 이렇게 동작하지 않는다. 레퍼런스 §4 도 **"배송비 쿠폰 + 상품 쿠폰 = 허용"** 으로 명시한다.

**결정: 조합 그룹의 최소 구현 — 주문 쿠폰 1장 + 배송비 쿠폰 1장.**

```text
combination_group     ORDER      →  orders.user_coupon_id       (기존)
                      SHIPPING   →  orders.shipping_coupon_id   (신규)
                      PRODUCT    →  3차 (order_coupons 테이블)
```

두 장을 초과하는 다중 적용(`stackable` · `max_stack_count` · `priority`)은 여전히 3차다. 그러나 **ORDER 1 + SHIPPING 1 은 2차에 반드시 포함한다.** 컬럼 하나로 해결되고, 없으면 무료배송 쿠폰이 무의미하다.

---

## 4. 계산 순서 (확정)

```text
subtotal_amount              상품 할인(products.discount_rate) 적용 후 상품 금액 합계
  − coupon_discount          주문 쿠폰 (ORDER)
  − point_used               적립금
  + shipping_fee             배송비   ← subtotal_amount 기준 판정 + 지역 할증 (§1-2)
  − shipping_discount        배송비 쿠폰 (SHIPPING). shipping_fee 를 초과할 수 없다
  = total_amount
```

**두 가지 상한을 코드로 강제한다.**

```js
shippingDiscount = Math.min(shippingDiscount, shippingFee);   // 배송비보다 많이 깎을 수 없다
totalAmount      = Math.max(0, ...);                          // 음수 방지 (기존 유지)
```

**배송비 계산 함수** — `services/shipping/shippingCalculator.js` 신규.

```js
// 서버 전용. 요청 본문/쿼리스트링을 인자로 받지 않는다.
async function calcShippingFee({ mallId, subtotalAmount, receiverZipcode }) {
    const policy = await getPolicy(mallId);                       // shipping_policy
    if (!policy || !policy.is_active) return 0;

    // 무료배송 기준을 넘기면 기본 배송비만 면제한다 (§7 미결 1 — 권장안 A)
    const isFree = policy.free_threshold != null && subtotalAmount >= policy.free_threshold;
    let fee = isFree ? 0 : policy.base_fee;

    // 지역 할증은 무료배송이어도 청구한다
    const zone = await resolveZone(receiverZipcode);               // 2차: JEJU | ISLAND | null
    if (zone === 'JEJU')   fee += policy.jeju_extra;
    if (zone === 'ISLAND') fee += policy.island_extra;
    return fee;
}
```

> **무료배송이어도 지역 할증은 붙는가?** 고지 문구("5만원 이상 무료" + "추가 배송비 제주 +3,000")는
> 두 해석이 가능하다. 위 코드는 **권장안 A(기본료만 면제, 할증은 청구 — 택배사 관행)** 로 작성했다.
> §7 미결 1 에서 확정되면 `guide.ejs` 문구도 오해 없게 다듬는다("5만원 이상 기본 배송비 무료").
> 안 B(전액 무료)로 결정되면 `isFree` 일 때 즉시 `0` 을 반환하도록 바꾼다.

---

## 5. 화면

### 5-1. 체크아웃 (`views/user/checkout/form.ejs`)

정적 `0원` 을 실제 값으로 바꾸고 **배송지 변경 시 재계산**한다.

```text
상품금액                     48,000원
쿠폰 할인                  −  5,000원
적립금 사용                −  1,000원
배송비                     +  3,000원      ← 5만원 미만
  제주 추가                +  3,000원      ← 2차
배송비 쿠폰                −  3,000원      ← 2차
────────────────────────────────────
결제금액                    42,000원
```

- 무료배송까지 남은 금액을 안내한다: **"2,000원 더 담으면 무료배송"**
- 배송지 우편번호 입력·변경 시 AJAX 로 배송비 재조회 (`POST /checkout/shipping-fee`)
- **화면 값은 표시용이다.** 주문 생성 시 서버가 다시 계산한다(§1-1)

### 5-2. 장바구니 (`views/user/cart/`)

무료배송 임박 안내가 가장 효과적인 자리다. 1차에 포함한다.

```text
┌────────────────────────────────────────┐
│ 상품금액 48,000원   배송비 3,000원      │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░  2,000원 더!      │
│ 2,000원 더 담으면 무료배송              │
└────────────────────────────────────────┘
```

### 5-3. 주문 상세 · 마이페이지 · 관리자 주문

`shipping_fee` · `shipping_discount` 를 금액 내역에 표시한다. **주문 취소 시 배송비도 함께 환불**한다(§6).

### 5-4. 관리자 배송비 정책 (`/admin/shipping-policy`)

몰별 1행 편집 폼. 기본 배송비 · 무료배송 기준금액 · 제주/도서산간 할증 · 활성 여부. 2차에서 우편번호 대역 편집 화면을 더한다.

> 기존 `/admin/shipping` 은 **송장 관리**(`shipments`)다. 별도 메뉴로 둔다.

---

## 6. 주문 취소·환불

현재 취소는 `status='CANCELLED'` UPDATE 하나뿐이고, 재고·포인트·쿠폰 어느 것도 되돌리지 않는다(쿠폰 문서 C1). 배송비를 넣으면 여기에 항목이 하나 더 붙는다.

| 시점 | 배송비 처리 |
|---|---|
| 출고 전 전체 취소 | **전액 환불** (`shipping_fee` 포함) |
| 출고 후 취소·반품 | 반품 배송비 정책에 따름 — `guide.ejs` 는 "단순 변심은 고객 부담(왕복 배송비)" |
| 부분 취소 | **3차.** 배송비는 주문 단위라 상품별 배분 대상이 아니다. 남은 상품이 무료배송 기준 아래로 떨어지면 배송비를 소급 청구할지 결정해야 한다 |

**1차 범위: 출고 전 전체 취소 시 배송비 전액 환불.** 반품 배송비 청구는 3차(반품 모듈과 함께).

---

## 7. 미결 사항

| # | 항목 | 선택지 | 권장 |
|---|---|---|---|
| 1 | 무료배송 시 지역 할증 | (A) 기본 배송비만 면제, 할증은 청구 / (B) 전액 무료 | **(A)** — 택배사 관행. `guide.ejs` 문구도 그에 맞게 다듬는다 |
| 2 | 무료배송 판정 기준 | `subtotal_amount` (쿠폰 차감 전) | **확정 (§1-2)** |
| 3 | 배송비 쿠폰 + 주문 쿠폰 동시 사용 | (A) 허용 / (B) 불가 | **(A)** — §3 |
| 4 | `shipping_policy` 위치 | (A) 전용 테이블 / (B) `site_settings` 컬럼 | **(A)** — 우편번호 대역 확장 대비 |
| 5 | 도서산간 대역 기준 | 우체국 / CJ대한통운 / 자체 | 운영 결정 필요. 시드 후 관리자 편집 |
| 6 | 반품 배송비 | 3차(반품 모듈) | — |

---

## 8. 개발 계획

### 8-0. 선행

- [ ] **쿠폰 문서 C3 (결제 우회) 수정** — 총액을 서버가 권위 있게 계산하도록 만든 뒤 배송비를 올린다 🔴

### 8-1. 1차 — 기본 배송비 (무료배송 기준)

- [ ] **S1** `shipping_policy` 테이블 + `orders.shipping_fee` · `shipping_discount` ALTER + 기존 22건 백필(0)
- [ ] **S2** `services/shipping/shippingCalculator.js` — `calcShippingFee({mallId, subtotalAmount})`. **서버 전용**
- [ ] **S3** `checkoutController.postForm` 에서 배송비 계산 → `orders.shipping_fee` 기록. `total_amount` 식 갱신
- [ ] **S4** `completeOrderWithStockAndPaid` 가 **주문 행에서** `shipping_fee` 를 읽도록 (요청에서 읽지 않음)
- [ ] **S5** 체크아웃 화면 — 정적 `0원` 제거, 실제 배송비 표시, "N원 더 담으면 무료배송" 안내
- [ ] **S6** 장바구니 — 배송비 + 무료배송 임박 게이지
- [ ] **S7** 주문 상세 · 마이페이지 · 관리자 주문에 배송비 표시
- [ ] **S8** 관리자 `/admin/shipping-policy` 몰별 정책 편집
- [ ] **S9** 취소 시 배송비 환불 (쿠폰 문서 C1 복원 작업과 같은 트랜잭션)
- [ ] **S10** 검증 — 4.9만원 주문 3,000원 / 5만원 주문 0원 / 쿠폰 사용 후 4.5만원이 되어도 **배송비 0원 유지**(§1-2)
- [ ] **S11** 검증 — 클라이언트가 `shipping_fee` 를 조작해도 서버 계산값이 이긴다

### 8-2. 2차 — 지역 할증

- [ ] **S12** `shipping_zipcode_zone` 테이블 + 제주·도서산간 대역 시드
- [ ] **S13** `shipping_policy.jeju_extra` · `island_extra` + `resolveZone()` 판정
- [ ] **S14** 배송지 변경 시 배송비 재계산 AJAX (`POST /checkout/shipping-fee`)
- [ ] **S15** 관리자 — 우편번호 대역 편집 화면
- [ ] **S16** 검증 — 제주·도서산간 우편번호에 할증이 붙는지, 무료배송 기준을 넘겨도 할증은 청구되는지(§7 미결 1)

### 8-3. 2차 — 배송비 쿠폰 (**체크박스는 쿠폰 문서가 소유**)

무료배송 쿠폰을 만드는 것은 쿠폰 작업이다. **실행 항목을 여기 두지 않는다.**
[`coupon_design_and_development.md`](./coupon_design_and_development.md) **§10-2-2 의 P7~P9** 를 따른다.

| 쿠폰 문서 항목 | 이 문서가 제공해야 하는 것 |
|---|---|
| P7 `benefit_type` 에 `SHIPPING_FREE`·`SHIPPING_FIXED` | `orders.shipping_fee` 가 이미 계산돼 있을 것 (S1~S4) |
| P8 `orders.shipping_coupon_id` — 주문 쿠폰 1장 + 배송비 쿠폰 1장 | §3 의 조합 그룹 결정 |
| P9 `shipping_discount ≤ shipping_fee` 상한 | §4 의 계산식 |

### 8-4. 3차

- [ ] 부분 취소 시 배송비 재판정 (무료배송 기준 이탈) → *해제 조건: 부분 취소 모듈*
- [ ] 반품 배송비 청구 → *해제 조건: 반품 모듈*
- [ ] 상품별 개별 배송비 · 묶음배송 · 판매자별 배송 → *해제 조건: 입점형(오픈마켓) 전환*
- [ ] 배송비 조건부 무료 (특정 브랜드·카테고리) → *해제 조건: 없음. 운영 요구 시*
