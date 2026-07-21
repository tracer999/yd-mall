# B2B(사업자) 몰 구현 설계 — yd-mall 기준

> 원문 제안서: [`b2b 몰설계안.md`](./b2b%20몰설계안.md) — 일반론(Shopify B2B / Adobe Commerce 참조) 문서다.
> 이 문서는 그 제안서를 **yd-mall 실제 코드·스키마에 맞춰 재설계한 구현 설계서**다. 원문은 참고자료로 남기고, 개발은 이 문서를 근거로 한다.

---

## §0. 제품 원칙 — 별도 몰을 만들지 않는다

**B2B 몰을 새로 만드는 것이 아니다.** 같은 몰, 같은 URL, 같은 상품, 같은 재고, 같은 화면을 쓴다.
사용자가 **사업자로 가입 → 관리자 승인 → 로그인**하면, 서버가 그 사용자에게 **거래 컨텍스트(B2B)** 를 부여하고 **동일한 화면 안에서 몇몇 요소만** 바뀐다.

```
        같은 상품 마스터 (products / product_sku / stock)
        같은 화면 (views/user/**)
        같은 주문 엔진 (orders / order_items / shipments)
                        │
        ┌───────────────┴───────────────┐
   ctx = B2C                        ctx = B2B (승인된 사업자)
   판매가 / 즉시결제               전용가 / 주문접수 → 승인 → 입금 → 출고
```

바뀌는 것은 다음 8가지뿐이다. **화면 구조·레이아웃·디자인은 그대로 둔다.**

| # | 요소 | B2C | B2B |
|---|------|-----|-----|
| 1 | 표시 가격 | 판매가(부가세 포함) | 전용가 + 공급가/부가세 분리 표기 |
| 2 | 수량 규칙 | 1개부터 | MOQ·주문단위·수량구간가 |
| 3 | 액션 버튼 | `장바구니` `바로 구매` | `장바구니` `주문 요청` `견적 요청` |
| 4 | 장바구니 | 그대로 | `cart_type=B2B`, 혼합 금지 |
| 5 | 주문서 | 결제수단 선택 → 즉시 결제 | 발주번호·납기희망일·세금계산서 → **주문 접수** |
| 6 | 결제 | 토스 즉시 결제 | 무통장 입금대기(관리자 확인) |
| 7 | 할인 | 쿠폰·포인트·등급할인 | 기본 미적용(계약가 레인) |
| 8 | 마이페이지 | 주문내역 | + 견적함 / 세금계산서 / 사업자정보 |

---

## §1. 원문 제안서 검토 결과

| 원문 | 판정 | 사유 |
|------|------|------|
| §2 상품을 B2C/B2B로 복제하지 않는다 | **채택** | yd-mall은 이미 `products` + `product_sku` 단일 마스터. 복제하면 재고·연동이 깨진다 |
| §3 가격은 컬럼이 아니라 정책 계층 | **채택(간소화)** | 7단계 → **5단계**로 축약(§4.2). `price_policy` / `price_policy_item` / `volume_price` 3테이블 구조는 유지 |
| §4 Company + Company User (회사-다중사용자) | **보류** | 요구는 "사용자가 사업자로 가입". 1단계는 `business_profile` 1:1. 회사 다중담당자·내부승인·구매한도는 4단계 |
| §5 같은 URL·같은 상세화면 | **채택** | 본 설계의 최상위 제약 |
| §6 장바구니 논리 분리 | **채택** | `carts.cart_type` 추가. B2C/B2B 혼합 금지 |
| §7 견적·협상 별도 도메인 | **채택(전체)** | 상태 10종·버전(revision)·메시지·첨부·PDF 전부 포함 |
| §8 견적→주문 스냅샷 복사 | **채택** | 현재가 재조회 금지. 확정 단가를 그대로 복사 |
| §9 주문 엔진 공통 + `b2b_order_detail` 확장 | **채택** | `orders`를 쪼개지 않는다 |
| §10 주문번호 구분 | **채택** | `ORD-` / `B2B-` / `Q-` (§7.4) |
| §12 B2B 주문 상태 11종 신설 | **수정** | `orders`는 이미 `status`/`payment_status`/`claim_status`/`refund_status`가 분리돼 있다(orders 스키마). **새 상태머신을 만들지 않고 기존 enum에 매핑**(§7.2) |
| §13 재고: 견적 중 차감 금지 / 수락 시 예약 | **채택(예약 단계 추가)** | 견적 진행 중에는 손대지 않는다. 다만 원문이 구분한 **예약**과 **차감**을 합치면 안 된다 — B2B는 입금까지 최대 7일이 뜨므로 승인 시점에 예약이 필요하다(§7.3) |
| §14 공급가/부가세 분리 저장 | **채택(1단계)** | 한국형 B2B 필수. 뒤로 미루지 않는다 |
| §16 모듈형 모놀리스 | **채택** | `services/b2b/`, `services/quote/` 디렉터리로 |
| §17 안티패턴 4종 | **채택** | §12에 그대로 옮김 |
| 여신·후불·미수금 | **보류** | 결제는 입금대기(무통장) 중심. 여신은 4단계 |
| 분할출고·ERP 연동 | **보류** | 4단계 |

### 확정된 범위 (사용자 결정)

- 회원 구조: **사업자 프로필 1:1** (`users` ↔ `business_profile`)
- 견적: **협상까지 전부** (상태 10종 + 버전관리 + 메시지/첨부 + PDF)
- 결제: **입금대기(무통장) 중심** + 세금계산서. 여신/후불은 후속

---

## §2. 거래 컨텍스트 — 설계의 척추

모든 분기는 **서버가 만든 단 하나의 컨텍스트 객체**에서 파생한다. 뷰·컨트롤러가 각자 조건을 재조립하면 반드시 어긋난다.

### 2.1 주입 지점

```
config/passport.js:169  deserializeUser  → req.user (users 행)
        ↓
middleware/b2bContext.js  (신규)         → req.b2b
        ↓
app.js:211 부근 res.locals              → res.locals.b2b
```

`middleware/mallContext.js` 다음, `cartData` 앞에 끼운다. 몰 스코핑(`req.mallId`)이 확정된 뒤여야 한다.

### 2.2 컨텍스트 객체

```js
// req.b2b — 비로그인/일반회원이면 항상 INACTIVE 상수(불변 객체)
{
  active: true,                 // 승인된 사업자만 true
  state: 'APPROVED',            // NONE | PENDING | UNDER_REVIEW | APPROVED | SUSPENDED | REJECTED
  userId: 1234,
  mallId: 28,
  businessProfileId: 17,
  companyName: '(주)그린허브유통',
  businessNumber: '1234567890',
  tierId: 3,                    // b2b_tier.id (등급)
  tierCode: 'DEALER_VIP',
  pricePolicyId: 30,            // 전용 계약 정책 (없으면 null)
  taxDisplay: 'EXCLUSIVE',      // 공급가 별도 표기
  permissions: ['VIEW_B2B_PRICE','PLACE_ORDER','REQUEST_QUOTE','NEGOTIATE_QUOTE'],
}
```

### 2.3 판정 규칙 (원문 §17.1 준수)

`active = true` 는 **아래를 전부 통과**해야 한다. **로그인 여부만으로 판정하지 않는다.**

1. `req.user` 존재
2. `business_profile` 행 존재 (몰 무관 — §2.5)
3. `business_profile.status = 'APPROVED'`
4. `users.is_active = 1`
5. 계약 유효기간(`contract_valid_from ~ contract_valid_to`) 내

(B2B 기능 자체는 모든 몰에서 켜져 있다 — §2.4)

하나라도 실패하면 `state`에 사유를 담고 `active=false`. 화면은 `state`에 따라 안내만 달리한다(§6.1).

### 2.4 몰 빌더 관점 — 몰별 설정을 두지 않는다 (2026-07-21 결정)

**B2B는 모든 몰에서 기본 동작한다.** 몰별 on/off 토글이 없다.

초안에는 `mall_b2b_setting`(몰당 1행, `is_enabled` 스위치)이 있었으나 폐기했다. 이유는 몰 빌더 성격 그 자체다.

- 새로 찍어낸 몰은 그 행이 없다 → 기능이 꺼진 채로 납품된다. 켜려면 누군가 DB에 행을 넣어야 하는데,
  **최종 사용자는 그런 작업을 할 수 없다**(CLAUDE.md「사용자 전제」).
- 몰을 만들 때마다 등급·설정을 복제해 주는 시드 스크립트가 필요해지는데, 이는
  「일회성 스크립트로 데이터를 미리 만들어 두지 마세요」 규칙에 정면으로 걸린다.

그래서 이렇게 바꿨다.

| 항목 | 어디에 | 행이 없으면 |
|------|--------|------------|
| 기능 on/off | **없음** | 항상 켜짐 |
| 동작 설정(입금기한·세액표기·계좌안내 등) | `system_settings` (전역) | **코드 기본값**으로 동작 |
| 거래처 등급 | `b2b_tier` (전역) | 등급 없이 승인. 관리자가 화면에서 만든다 |
| 사업자 신원 | `business_profile` (전역) | — |
| 상품 전용가 | `product_b2b_setting` (상품 1:1) | 그 상품은 B2B 판매 안 함 |

**핵심은 "행이 하나도 없어도 정상 동작한다"** 는 것이다. 아무 데이터도 없는 새 몰에서
사업자가 가입 → 관리자가 승인 → 상품에 전용가 입력, 이 흐름이 전부 관리자 화면에서 끝난다.

설정 기본값은 `middleware/b2bContext.js` 의 `DEFAULTS` 하나가 소스다.
`getSettings()` 가 `global.systemSettings` 를 덮어 읽으므로 추가 쿼리도 없다.

가드는 여전히 **fail-close** 다 — 판정에 실패하면 B2B 를 켜지 않는다
(Shopify 가드의 fail-open은 이 프로젝트의 알려진 함정이다).

### 2.5 사업자 신원은 몰 스코프가 아니다

`business_profile` / `b2b_tier` 에는 `mall_id` 가 없다. 사업자등록증으로 확인한 회사는
어느 몰에서 보든 같은 회사이기 때문이다. 몰마다 다시 신청·승인받게 하면
같은 등록증을 여러 번 심사하는 낭비가 되고, `?mall=` 로 몰을 옮기는 순간
승인된 사업자가 갑자기 일반회원으로 보이는 버그처럼 동작한다.

반면 **전용가는 자연히 몰 스코프를 따른다** — `product_b2b_setting` 이 `products` 에 1:1로 매달려 있고
`products.mall_id` 가 이미 몰을 가른다. 별도 스코핑이 필요 없다.

(`customer_membership` 이 몰별인 것과 대비된다. B2C 등급은 몰별 구매실적에서 나오지만,
사업자 신원은 실적이 아니라 법인 그 자체다.)

---

## §3. 사업자 회원 · 승인

### 3.1 가입 흐름

**로그인 페이지를 분리하지 않는다.** 가입 폼만 한 갈래 늘린다.

```
/auth/signup            일반 회원가입            (기존, routes/auth.js:181)
/auth/signup?type=biz   사업자 회원가입          (신규 — 같은 폼 + 사업자 필드 블록)
/auth/business          이미 가입한 회원의 사업자 전환 신청 (신규)
```

- 화면: `views/auth/signup_form.ejs` 에 `_business_fields.ejs` 파샬을 조건부 include.
  `views/auth/_profile_fields.ejs` 를 두 경로가 공유하는 기존 패턴(profileService.js 주석)을 그대로 답습한다.
- 서버: `services/auth/profileService.js` 옆에 **`services/b2b/businessProfileService.js`** 를 두고
  `normalizeBusinessInput / validateBusiness / saveBusinessProfile` 을 profileService와 동일한 시그니처로 만든다.
- 로그인은 기존 `/auth/login` 하나. 로그인 후 §2 미들웨어가 컨텍스트를 붙인다.

### 3.2 입력 항목

| 필드 | 필수 | 검증 |
|------|------|------|
| `company_name` 상호 | ✔ | |
| `business_number` 사업자등록번호 | ✔ | 10자리 + **체크섬 검증**(국세청 알고리즘), 몰 내 UNIQUE |
| `representative_name` 대표자명 | ✔ | |
| `business_type` 업태 / `business_category` 종목 | ✔ | |
| `tax_invoice_email` 계산서 수신 이메일 | ✔ | |
| `manager_name` / `manager_phone` 담당자 | ✔ | |
| `license_file` 사업자등록증 사본 | ✔ | `middleware/upload.js` 재사용, `public/uploads/business/` |
| 배송지 | — | 기존 profileService 필드 재사용 |

**진위 확인 방식 — 사업자등록증 첨부 + 관리자 검토** (2026-07-21 결정)

국세청 진위확인 API(공공데이터포털)는 **쓰지 않는다.** 확인 책임은 승인 프로세스가 진다.

1. 가입 시 **사업자등록증 사본 첨부를 필수**로 받는다 (jpg/png/pdf, 10MB 이하).
2. 서버는 **사업자등록번호 체크섬**(국세청 검증 알고리즘)만 기계적으로 검증한다 — 오타 걸러내기 용도다.
3. 관리자가 승인 화면에서 **첨부 파일을 열어 입력값과 대조**한 뒤 승인/반려한다.
   상호·사업자번호·대표자명이 등록증과 다르면 반려 사유에 적어 되돌린다.

첨부 파일 보안: `public/uploads/business/` 는 정적 서빙 경로 안이라 URL 을 아는 사람은 누구나 받을 수 있다.
**사업자등록증은 개인정보다.** 다음 중 하나로 막는다.

- 저장 파일명을 추측 불가능한 랜덤 토큰으로 (`bl_<32자 hex>.pdf`), **또는**
- `public/` 밖(`storage/business/`)에 저장하고 `GET /admin/b2b/members/:id/license` 라우트가
  `adminAuth` 통과 시에만 스트리밍 (권장)

`middleware/upload.js` 가 현재 `public/uploads/` 를 향하므로, 후자를 택하면 저장 경로 분기가 필요하다.

### 3.3 승인 상태 전이

```
가입 신청 → PENDING
              ├─ 관리자 검토 시작 → UNDER_REVIEW
              ├─ 승인            → APPROVED   (전용가 노출 시작)
              ├─ 반려            → REJECTED   (사유 노출 + 재신청 가능)
              └─ (승인 후) 정지  → SUSPENDED  (전용가 즉시 차단, B2C로 강등)
```

- 승인/반려 시 `services/emailService.js` 로 메일 발송.
- 승인 시 기본 `b2b_tier`(기본 등급)를 자동 배정한다 — `membershipService.ensureMembership` 과 같은 패턴.
- **`SUSPENDED`/`REJECTED` 전환 즉시** 해당 사용자의 B2B 장바구니를 잠그고(주문 진입 차단), 진행 중 견적은 `CANCELLED` 로 만든다.

### 3.4 B2C 멤버십 등급과의 관계

기존 `membership_grade` / `customer_membership` 은 **B2C 전용으로 남긴다.** B2B 등급(`b2b_tier`)은 별도 축이다.
사업자 컨텍스트에서는 등급 정률할인·적립·무료배송 혜택을 **적용하지 않는다**(§4.5).
`membershipBenefitService.getOrderBenefits()` 는 B2B 라인에서 호출하지 않고 `ZERO` 를 쓴다.

---

## §4. 가격 — read-time 리졸버

### 4.1 원칙: 어떤 테이블에도 가격을 write 하지 않는다

`services/deal/dealService.js` 의 설계 원칙(파일 상단 주석)을 그대로 계승한다.

> 특가는 어떤 테이블에도 가격을 write 하지 않는다. 읽는 시점에 활성 여부를 계산하고 가격을 덮어쓰는 read-time 리졸버다.

**개발 DB = 운영 DB** 인 이 프로젝트에서 B2B 가격이 `products.price` 를 건드리면 소스 오브 트루스가 오염된다.
따라서 `services/b2b/b2bPricingService.js` 는 **조회 시점에만** 단가를 덮는다.

### 4.2 우선순위 (원문 7단계 → 5단계)

```
1. 확정 견적가        quote_item.final_unit_price      (quote.status = BUYER_ACCEPTED / SELLER_ACCEPTED)
2. 사업자별 계약가    b2b_price_item (policy_type = CUSTOMER_CONTRACT)
3. 등급(티어) 가격    b2b_price_item (policy_type = TIER)
4. 수량 구간가        b2b_volume_price  (min_quantity 이하 중 최대)
5. 기본 B2B가         product_b2b_setting.b2b_price
─────────────────────────────────────────────────────────
   폴백               products.price / product_sku.price  (B2C 판매가)
```

- 각 단계는 **유효기간(`valid_from`/`valid_to`)과 `status`** 를 통과해야 한다.
- 같은 단계에 복수 정책이 걸리면 `priority DESC → 낮은 단가 → id ASC`. dealService의 `WINNER_SQL` ROW_NUMBER 패턴을 그대로 쓴다.
- **가격을 올려서 덮지 않는다.** dealService가 `di.deal_price < dp.price` 가드를 둔 것과 같은 이유로,
  리졸버 결과가 B2C 판매가보다 비싸면 **적용하지 않는다**(단, 확정 견적가는 예외 — 협상 결과가 절대적이다).

### 4.3 서비스 인터페이스

`membershipBenefitService` 와 같은 모양(컨텍스트 → 산출값, 실패 시 안전한 기본값)으로 만든다.

```js
// services/b2b/b2bPricingService.js

/** 단건 — 상품 상세·목록용 */
resolveForProduct({ b2b, productId, skuId, quantity }) -> {
  unitPrice, listPrice, priceSource, taxExcluded, taxAmount,
  minOrderQty, orderUnit, maxOrderQty, transactionMode, tiers: [...]
}

/** 다건 — 목록/장바구니/주문서용. 상품 N개를 쿼리 1~2회로 */
resolveForProducts(b2b, productIds) -> Map<productId, {...}>

/** 주문 라인 적용 — dealSvc.applyToScopeItems 와 동일 시그니처 */
applyToScopeItems(b2b, items) -> items   // price 를 덮고 source_type='B2B' 를 찍는다
```

`priceSource` 값: `B2B_DEFAULT` | `VOLUME` | `TIER` | `CUSTOMER_CONTRACT` | `NEGOTIATED_QUOTE` | `B2C_FALLBACK`

### 4.4 특가·공동구매·라이브와의 관계 — 코드가 이미 준비돼 있다

`dealService.applyToScopeItems` 는 **`source_type` 이 이미 붙은 라인을 건너뛴다**(dealService.js:172).

```js
const targets = (items || []).filter((i) => i && !i.source_type);
```

따라서 **B2B 리졸버를 dealSvc 호출 직전에 실행**하고 `source_type='B2B'` 를 찍으면,
특가·공동구매·라이브 레인과 자동으로 분리된다. **기존 특가 코드를 한 줄도 고치지 않는다.**

```js
// controllers/checkoutController.js — getForm(:297 내), postForm(:543 내) 두 곳
items = await b2bPricingSvc.applyToScopeItems(req.b2b, items);  // ← 추가 (먼저)
items = await dealSvc.applyToScopeItems(items);                  // 기존 (B2B 라인은 스킵됨)
```

- 사업자가 공동구매·라이브 링크로 진입하면? → **B2B 컨텍스트에서는 해당 진입을 차단**한다(프로모션은 B2C 채널 정책).
  차단은 `groupBuySvc.resolveLine` / `liveSvc.resolveLine` 호출 앞에서 `req.b2b.active` 검사로 한다.

### 4.5 쿠폰·포인트·등급할인 중첩 — 기본 미적용

B2B 전용가는 이미 계약가다. 여기에 쿠폰·포인트·등급 정률할인을 얹으면 마진 관리가 불가능해진다.

| 항목 | B2B 기본값 | 비고 |
|------|-----------|------|
| 쿠폰(ORDER) | 미적용 | 주문서에서 쿠폰 슬롯 자체를 숨긴다 |
| 배송비 쿠폰 | 미적용 | |
| 포인트 사용/적립 | 미적용 | `point_use_amount` 무시, 적립 0 |
| 등급 정률할인 | 미적용 | `membershipBenefitService.ZERO` 사용 |
| 배송비 | **B2B 전용 정책** | `system_settings.b2b_free_ship_threshold` (예: 300만원 이상 무료) |

`system_settings.b2b_allow_coupon_stacking` 으로 예외를 열 수는 있으나 기본값은 `0`.

### 4.6 공급가액 / 부가세 (원문 §14)

B2B는 **공급가 별도** 표기가 기본이다. 금액을 하나만 저장하면 안 된다.

```
표시:  B2C → 110,000원 (부가세 포함)
       B2B → 공급가 100,000원 + VAT 10,000원 = 110,000원
```

`orders` 에 다음을 추가한다(§9.3):
`supply_amount`(공급가액), `vat_amount`(부가세), `tax_rate`, `tax_display`.
`order_items` 에도 라인별 `supply_price`, `vat_price` 를 남긴다 — 세금계산서 발행 근거다.

기존 `products.price` 는 **부가세 포함가**로 계속 운용하고, B2B 표시에서만 `공급가 = round(price / 1.1)`, `VAT = price - 공급가` 로 분해한다.

**반올림 정합성 — 세금계산서 버그의 단골 원인.**
라인별로 `round(price/1.1)` 을 구해 합산하면 주문 합계에서 계산한 공급가액과 1~2원 어긋난다.
규칙을 하나로 고정한다: **주문 총액(부가세 포함)을 고정값으로 두고 → 공급가액을 라인 합으로 구한 뒤 → 부가세 = 총액 − 공급가액**.
즉 부가세를 역산한다. `Σ order_items.supply_price = orders.supply_amount` 와
`orders.supply_amount + orders.vat_amount = orders.total_amount` 가 **항상** 성립해야 하며,
잔차는 마지막(또는 금액이 가장 큰) 라인에 흡수시킨다.

### 4.7 과세 구분(`products.tax_type`) — 왜 필요한가 · **승인 대기**

B2B 때문에 새로 생기는 요구가 아니라, **이미 파이프라인에 반쯤 들어와 있는데 저장할 곳이 없는** 값이다.

1. **공급처가 이미 과세구분을 준다.** `supplier_product.tax_type` 컬럼이 존재하고 도매꾹에서 `'과세상품'` 으로 들어온다
   (`services/sourcing/supplier/domeggook/normalize.js:230`, 현재 29건 전부 과세). `products` 로 옮겨 담을 컬럼이 없어 버려진다.
2. **네이버 스마트스토어 등록이 하드코딩이다.** `services/sourcing/channel/naverMapper.js:234` 가 `taxType: 'TAX'` 로 고정돼 있다.
   네이버 API 필수 필드인데, 면세 상품을 소싱해 등록하면 **잘못된 과세구분으로 등록된다.** B2B 와 무관한 기존 결함이다.
3. **B2B 세금계산서가 갈린다.** 과세는 **세금계산서**, 면세는 **계산서** — 서식이 다르다. 한 주문에 섞이면 분리 발행해야 한다.
4. **공급가 분해가 틀린다.** 면세 상품에 `price / 1.1` 을 적용하면 공급가가 9% 낮게 잡히고, 걷지 않아야 할 부가세를 기록한다.

이 몰의 표준 예시(건강기능식품 — 정제·캡슐)는 전부 과세다. 다만 `식품`(categories.id=225) 카테고리가 있고
미가공 농·수·축산물은 면세이며, **무엇보다 이 프로젝트는 몰 빌더라 다음 몰이 무엇을 팔지 모른다.**

```sql
ALTER TABLE products
  ADD COLUMN tax_type ENUM('TAXABLE','TAX_FREE','ZERO_RATED') NOT NULL DEFAULT 'TAXABLE'
  COMMENT '과세구분 — 과세/면세/영세율. 세금계산서 서식과 공급가 분해를 가른다';
```

기본값이 `TAXABLE` 이라 **기존 상품·화면·주문은 아무것도 바뀌지 않는다.** 얻는 것은 세 가지다:
소싱 매핑(`'과세상품'` → `TAXABLE`) 정상화, 네이버 하드코딩 제거, B2B 계산서 분리 근거.

- `TAX_FREE` 라인: 공급가 = 판매가, 부가세 = 0.
- 한 주문에 과세·면세가 섞이면 `orders.supply_amount` / `vat_amount` 는 과세 라인만으로 계산하고,
  면세 합계는 `orders.tax_free_amount` 로 따로 둔다.

> **B2B 밖으로 새는 작업**: `supplier_product.tax_type` → `products.tax_type` 매핑과
> `naverMapper.js:234` 하드코딩 제거는 소싱·네이버 연동 쪽 수정이다. B2B 1단계에서 컬럼만 만들고,
> 매핑 반영은 소싱 담당 작업으로 따로 티켓을 낸다. 여기서 같이 고치면 변경 범위가 뒤섞인다.

---

## §5. 상품의 B2B 판매 설정

상품당 1행(`product_b2b_setting`). 없으면 "B2B 판매 안 함"이다.

| 필드 | 뜻 |
|------|-----|
| `is_b2b_sale` | B2B 판매 여부 |
| `sales_channel` | `B2C_ONLY` / `B2B_ONLY` / `BOTH` (기본 BOTH) |
| `b2b_price` | 기본 B2B가(부가세 포함가 기준) |
| `min_order_qty` | MOQ (예: 10) |
| `order_unit` | 주문 단위 (예: 5 → 10,15,20…) |
| `max_order_qty` | 상한(NULL=무제한) |
| `transaction_mode` | `DIRECT_ORDER` / `QUOTE_OPTIONAL` / `QUOTE_REQUIRED` |
| `quote_required_qty` | 이 수량 이상이면 견적 필수(NULL=없음) |
| `price_visibility` | `PUBLIC` / `APPROVED_ONLY`(기본) / `HIDDEN`(문의) |

**목록 노출 규칙**

- `sales_channel = B2B_ONLY` 상품은 B2C 컨텍스트에서 **목록·검색·상세 모두 404**. `products.visibility` 와 별개 축이다.
- `sales_channel = B2C_ONLY` 상품은 B2B 컨텍스트에서도 보이되 **B2C 가격 + 일반 구매**로 처리한다(전용가 없음).
- 필터링은 목록 쿼리에 조건을 얹는다: `controllers/productController.js:71 getList`, `:639 searchPage`.

---

## §6. 사용자 화면 — 무엇만 바뀌는가

### 6.1 상품 상세 (`views/user/products/detail.ejs`)

같은 파일, 같은 레이아웃. 가격 블록(`#panelPrice`, :354)과 액션 버튼 블록(:371 부근)만 컨텍스트로 분기한다.

**A. 일반회원 / 비로그인 (`b2b.active = false`, `state = NONE`)**
```
  판매가  110,000원
  [장바구니 담기]  [바로 구매]
```
→ 지금과 완전히 동일. **한 픽셀도 바뀌지 않는다.**

**B. 승인된 사업자 (`state = APPROVED`)**
```
  기업 전용가   공급가 77,000원  (VAT 별도 · 부가세 포함 84,700원)
  일반 판매가   110,000원  (30% ↓)

  최소 주문수량 10개 · 5개 단위

  10개 이상   77,000원
  50개 이상   72,000원
  100개 이상  견적 요청

  [장바구니 담기]  [주문 요청]  [견적 요청]
```

**C. 승인 대기 (`state = PENDING | UNDER_REVIEW`)**
```
  기업 전용가는 승인 후 확인할 수 있습니다.  (심사 중 · 평균 1영업일)
  판매가  110,000원
  [장바구니 담기]  [바로 구매]      ← 일반회원으로는 정상 구매 가능
```

**D. 반려·정지 (`REJECTED | SUSPENDED`)** → C와 동일 화면 + 사유 안내 + 재신청 링크.

> 구현 메모: `price_visibility = APPROVED_ONLY` 인 상품의 전용가는 **서버에서 아예 응답에 넣지 않는다.**
> 뷰에서 `hidden` 처리하는 방식은 금지다(원문 §17.2).

### 6.2 상품 목록 / 검색

카드 컴포넌트는 그대로. 가격 텍스트만 `b2b.active` 면 전용가로 치환하고 `기업가` 뱃지를 붙인다.
정렬(가격순)은 dealService의 `dealJoinSql()` 처럼 **B2B 가격 JOIN 프래그먼트**를 만들어 SQL 레벨에서 `effective_price` 로 정렬한다. 애플리케이션 후처리로는 정렬을 만들 수 없다.

### 6.3 장바구니 (`controllers/cartController.js`)

- `carts.cart_type` 추가 (`B2C` / `B2B`, 기본 `B2C`).
- 담을 때 `req.b2b.active` 로 타입을 결정한다.
- **혼합 금지**: 다른 타입의 항목이 이미 있으면 담기를 막고 "구매 유형이 다른 상품이 담겨 있습니다" 안내 + 비우기 유도.
- 조회(`cartController.js:15`)·주문전환(`:184`)의 `p.price` 를 `b2bPricingService` 결과로 덮는다.
- MOQ·주문단위 검증은 **담을 때와 주문할 때 두 번** 한다.

### 6.4 마이페이지

기존 메뉴 그대로 + 사업자 컨텍스트에서만 3개 추가:
`견적함` / `세금계산서` / `사업자 정보`.
`controllers/mypageController.js` 의 기존 액션 옆에 추가하고, 메뉴는 `b2b.active` 로 조건 렌더.

---

## §7. 주문 절차 — 즉시 결제가 아니다

### 7.1 흐름

```
B2C:  주문서 → 결제(토스) → 결제완료 → 재고차감 → 배송준비
B2B:  주문서 → 주문 요청  → 접수(PENDING) → 관리자 확인/승인 →
      입금 안내(계좌·기한) → 입금 확인 → 재고차감 → 배송준비 → 출고 → 세금계산서
```

핵심: **주문 생성 시점에 결제를 요구하지 않는다.** `getPay`(checkoutController.js:867) 로 넘기지 않고,
주문 접수 완료 페이지로 바로 보낸다.

### 7.2 상태 매핑 — 새 상태머신을 만들지 않는다

`orders` 는 이미 4축이 분리돼 있다. 원문 §12의 11개 상태는 **기존 enum 조합으로 전부 표현된다.**

| 업무 단계 | `status` | `payment_status` | 부가 |
|---|---|---|---|
| 주문 접수 | `PENDING` | `PENDING` | `approval_status = REQUESTED` · 재고 미확보 |
| 판매자 검토중 | `PENDING` | `PENDING` | `approval_status = UNDER_REVIEW` |
| 승인·입금대기 | `PENDING` | `PENDING` | `approval_status = APPROVED`, `payment_due_at` 세팅 · **여기서 재고 예약**(§7.3) |
| 입금 확인 | `PAID` | `PAID` | `paid_at` 기록 · 예약 확정 |
| 상품 준비 | `PREPARING` | `PAID` | |
| 출고 | `SHIPPED` | `PAID` | `shipments` |
| 배송완료 | `DELIVERED` | `PAID` | |
| 반려 | `CANCELLED` | `CANCELLED` | `cancel_reason` |

추가로 `orders.status` enum 에 값을 넣을 필요가 **없다.** 승인 단계는 `b2b_order_detail.approval_status` 가 담는다.
→ 기존 `orderStatusService` / `claimService` / `refundService` / 대시보드 집계가 **그대로 동작한다.**

### 7.3 재고 예약 — "즉시 결제가 아님"이 만드는 공백

B2C는 주문과 결제 사이가 수 초라 재고를 결제 확정 시점에만 깎아도 문제가 없다.
**B2B는 승인 → 입금까지 기본 7일(`payment_due_days`)이 뜬다.** 이 구간에 아무 확보가 없으면
마지막 재고를 두 거래처가 동시에 승인받고, 한쪽이 입금 후 출고 불가가 된다. 이 공백은 "즉시 결제가 아니다"라는
요구가 직접 만들어내는 것이므로 반드시 처리한다.

**확정안 — 승인 시점 실차감 + 기한 만료 자동 복원** (2026-07-21 결정)

```
주문 접수(REQUESTED)   재고 손대지 않음
승인(APPROVED)         재고 차감 + payment_due_at 세팅   ← 예약
입금 확인(PAID)        예약 확정 (추가 차감 없음)
기한 만료 / 반려       재고 복원 + orders.resources_restored_at 기록
```

이 방식을 고르는 이유:

- `orders.resources_restored_at`("재고·쿠폰·적립금을 되돌린 시각") 이 **이미 존재한다.** 복원 경로가 기성품이다.
- 재고 차감 로직(`skuService` 경유 트랜잭션)을 새로 만들지 않고, `completeOrderWithStockAndPaid`(checkoutController.js:127)
  를 **차감 트랜잭션**과 **상태 확정**으로 분리해 앞부분만 승인 시점에 호출한다.
- 별도 예약 테이블을 두면 모든 재고 조회 지점(`가용재고 = stock - Σ예약`)을 고쳐야 한다 — 회귀 위험이 훨씬 크다.

**필요한 배치 1개**: 입금 기한이 지난 `approval_status=APPROVED && payment_status=PENDING` 주문을
자동 취소 + 재고 복원한다. 배치가 없으면 미입금 주문이 재고를 영구 점유한다.
(현재 저장소에 스케줄러가 없으므로 관리자 화면의 "기한초과 주문" 목록 + 수동 일괄취소를 1차로 두고,
`node-cron` 도입은 2단계에서 결정 — §14)

검토했다가 버린 대안: 예약 테이블(`b2b_stock_reservation` — 모든 재고 조회 지점을 `stock - Σ예약` 으로 고쳐야 해 회귀 위험이 큼),
선착순(확보 없음 — 입금 후 출고 불가가 발생해 B2B 신뢰를 깎음).

**구현 시 주의 — 사용자 화면의 재고 표시.**
승인 즉시 `products.stock` / `product_sku.stock` 이 줄어들므로, 아직 입금 전인 주문이 B2C 사용자에게
"품절"로 보일 수 있다. 이는 **의도된 동작**이다(먼저 승인받은 거래처가 물량을 잡는다).
다만 관리자 재고 화면에서는 실재고와 구분되어야 하므로, `b2b_order_detail.approval_status='APPROVED'
AND payment_status='PENDING'` 주문의 수량 합을 **"입금대기 점유"** 로 별도 표시한다.

### 7.4 주문서 화면 (`views/user/checkout/form.ejs`)

같은 화면, 블록 단위 교체:

| 블록 | B2C | B2B |
|------|-----|-----|
| 주문자 | 이름/연락처 | + 상호·사업자번호(읽기전용, 프로필에서) |
| 배송지 | 그대로 | 그대로 |
| 쿠폰 | 표시 | **숨김** |
| 포인트 | 표시 | **숨김** |
| 금액 | 상품금액/배송비/할인/결제금액 | 공급가액 / 부가세 / 배송비 / **주문금액** |
| — | — | **발주번호(PO)** 입력 (선택) |
| — | — | **납기 희망일** (선택) |
| — | — | **세금계산서 발행** 체크 + 수신 이메일 |
| — | — | **요청사항** (자유 텍스트) |
| 결제수단 | 카드/계좌이체/… | **무통장 입금** 고정(1단계) |
| 버튼 | `결제하기` | `주문 요청하기` |

### 7.5 주문번호

`generateOrderNumber()`(checkoutController.js:103) 를 접두어 인자를 받도록 확장한다.

```
B2C 주문   ORD-20260721-12345   (기존 유지 — 기존 데이터와 호환)
B2B 주문   B2B-20260721-00045
견적       Q-20260721-00018
```

DB PK는 기존대로 `orders.id`(INT). 위 번호는 **표시·검색용**이다.

### 7.6 주문 생성 시 재검증 (원문 §17.3)

`postForm`(checkoutController.js:543)의 B2B 분기에서 다음을 **전부 서버가 다시 확인**한다. 폼이 보낸 금액은 어디서도 쓰지 않는다(기존 원칙 그대로).

1. 사업자 상태가 여전히 `APPROVED` 인가
2. 계약/정책 유효기간이 살아 있는가
3. 상품이 `sales_channel` 상 B2B 판매 가능한가
4. MOQ·주문단위·상한 충족
5. 재고 가용 (기존 `skuService.resolveSkuForLine` 경로)
6. `transaction_mode = QUOTE_REQUIRED` 또는 `quote_required_qty` 초과 → **주문 차단, 견적으로 유도**
7. 견적 기반 주문이면 → 견적 상태 `*_ACCEPTED` + 유효기간 내 + **현재가가 아니라 확정 단가 사용**

---

## §8. 견적 · 협상 도메인

견적은 **주문의 임시 상태가 아니다.** 별도 도메인으로 만든다(원문 §7 채택).

### 8.1 상태 (10종)

```
DRAFT ──제출──▶ REQUESTED ──관리자 착수──▶ UNDER_REVIEW
                                              ├─ 제안 ─▶ SELLER_PROPOSED
                                              └─ 반려 ─▶ REJECTED

SELLER_PROPOSED ├─ 고객 재협상 ─▶ BUYER_COUNTERED
                ├─ 고객 수락   ─▶ BUYER_ACCEPTED
                └─ 기한 만료   ─▶ EXPIRED

BUYER_COUNTERED ├─ 관리자 재제안 ─▶ SELLER_PROPOSED
                ├─ 관리자 수락   ─▶ SELLER_ACCEPTED
                └─ 관리자 거절   ─▶ REJECTED

BUYER_ACCEPTED / SELLER_ACCEPTED ──주문 생성──▶ CONVERTED_TO_ORDER
(어느 단계든) 취소 ─▶ CANCELLED
```

전이는 `services/quote/quoteStatusService.js` 한 곳에서만 수행한다. 컨트롤러가 `UPDATE quote SET status` 를 직접 쓰지 않는다.
허용 전이 테이블을 상수로 두고, 불허 전이는 예외.

### 8.2 버전(revision) — 덮어쓰지 않는다

금액·수량·조건이 바뀔 때마다 `quote_revision` 에 스냅샷(JSON)을 남긴다.

```
v1  고객 요청   1,000개 @ 7,000원
v2  관리자 제안 1,000개 @ 6,800원
v3  고객 제안   1,200개 @ 6,500원
v4  최종 확정   1,200개 @ 6,600원
```

- `quote.version` 은 현재 리비전 번호.
- `quote_message` 는 **커뮤니케이션**(댓글), `quote_revision` 은 **금액·조건 변경 기록**. 둘을 섞지 않는다(원문 §17.4).
- 관리자 조작 이력은 별도 감사로그(`quote_audit_log`)에 남긴다.

### 8.3 견적 → 주문 전환 (원문 §8)

**현재 상품 가격을 다시 조회하지 않는다.** 확정 견적 내용을 주문 스냅샷으로 복사한다.

```
1. 견적 상태 검사 (BUYER_ACCEPTED | SELLER_ACCEPTED)
2. 유효기간(valid_until) 검사
3. 요청자 == 견적 소유자 검사
4. 재고 가용성 검사
5. orders + order_items 생성 (단가 = quote_item.final_unit_price)
   order_items.source_type = 'QUOTE', source_id = quote.id
6. b2b_order_detail.quote_id / quote_revision 기록
7. quote.status = CONVERTED_TO_ORDER, quote.converted_order_id 기록
8. 입금 안내 발송
```

**중복 생성 방지**: `POST /b2b/quotes/:id/convert` 는 `Idempotency-Key` 헤더를 받고,
`quote.converted_order_id IS NULL` 조건부 UPDATE 로 원자적으로 잠근다.
(`dealService.consumeDealQuota` 의 조건부 UPDATE + affectedRows 판정 패턴과 동일)

### 8.4 견적서 PDF — 3단계 필수 산출물

거래처에 메일로 보내고 결재 근거로 남기는 문서다. **HTML 화면 출력으로 대체하지 않는다.**

`quote` + `quote_item` + 확정 조건(단가·수량·할인·배송비·납기·결제조건·유효기간·공급가/VAT)을
전용 EJS 템플릿(`views/quote/pdf.ejs`)으로 렌더한 뒤 PDF 바이트를 만든다.

- 발행 시점에 **PDF 파일을 저장**한다(`public/uploads/quote/Q-YYYYMMDD-NNNNN_vN.pdf`).
  견적은 버전이 있으므로, 그때 보낸 문서가 그대로 남아야 분쟁이 없다.
- 다운로드: 고객 `GET /quotes/:id/pdf`, 관리자 `GET /admin/b2b/quotes/:id/pdf`. 소유자·권한 검사 필수.
- 메일 첨부는 기존 `services/emailService.js` 로.

### 8.5 PDF 생성 수단 — `pdfmake` 확정 (2026-07-21 결정)

| 안 | 판정 | 근거 |
|----|------|------|
| **`pdfmake`** | **채택** | 순수 JS(~2MB). 표 중심 문서를 선언형으로 정의. Chromium 불필요 → `npm install` 만으로 배포 완료 |
| `puppeteer` | 기각 | 패키지 ~300MB + **앱서버(192.168.1.4)에 Chromium 시스템 의존성 설치 필요**. PM2 **fork·`instances:1`** 환경에서 브라우저 프로세스가 메인 프로세스와 메모리를 다툰다 |
| `pdfkit` | 기각 | pdfmake 의 저수준 엔진. 표·페이지 반복 헤더를 직접 그려야 함 |

견적서는 **고정 레이아웃 표 문서**다. HTML 을 그대로 재현할 이유가 없어 브라우저 렌더러가 과잉이다.
현재 `package.json` 의존성은 27개로 가볍게 유지되고 있으며, 여기에 Chromium 을 들이면 배포 스크립트
(`yd-mall.sh build` = `npm install` + Tailwind 빌드)까지 손봐야 한다.

**한글 폰트**

pdfmake 는 Node 환경에서 `PdfPrinter` 에 폰트 파일 경로를 직접 등록한다. 브라우저용 `vfs_fonts` 는 쓰지 않는다.

```
public/fonts/NanumGothic-Regular.ttf   ← 저장소에 커밋 (SIL OFL 1.1, 재배포 허용)
public/fonts/NanumGothic-Bold.ttf
```

`assets/` 같은 새 최상위 디렉터리를 만들지 않는다 — 이 저장소의 정적 자산은 전부 `public/` 아래다.
`.gitignore` 가 무시하는 건 `/public/uploads/` 뿐이므로 `public/fonts/` 는 정상 커밋되고,
배포 서버가 `git reset --hard origin/main` 으로 받아갈 때 함께 내려간다.
(폰트가 URL 로 노출되지만 OFL 은 재배포를 허용하므로 문제없다.)

```js
// services/quote/quotePdfService.js
const PdfPrinter = require('pdfmake');
const path = require('path');

const FONT_DIR = path.join(__dirname, '../../public/fonts');
const printer = new PdfPrinter({
    NanumGothic: {
        normal: path.join(FONT_DIR, 'NanumGothic-Regular.ttf'),
        bold:   path.join(FONT_DIR, 'NanumGothic-Bold.ttf'),
    },
});

/** 견적 확정 시 호출 — PDF 를 만들어 파일로 저장하고 경로를 돌려준다. */
async function renderQuotePdf(quote, items, opts) { /* docDefinition → printer.createPdfKitDocument */ }
```

- `printer` 인스턴스는 **모듈 로드 시 1회 생성**해 재사용한다(폰트 파싱이 요청마다 일어나지 않게).
- 폰트는 `.gitignore` 대상이 아니어야 한다 — 배포 서버가 `git reset --hard` 로 받아가므로 커밋되어야 한다.

**견적서 레이아웃**

```
┌──────────────────────────────────────────────┐
│  견 적 서                    Q-20260721-00018 │
│                                   v3 · 2026-07-21 │
├─────────────────────┬────────────────────────┤
│ 수신  (주)그린허브유통 │ 공급자  와이디몰        │
│       담당 김철수     │  사업자번호 000-00-00000│
│                      │  대표 홍길동 · 직인      │
├──────────────────────────────────────────────┤
│ No │ 품목 │ 규격 │ 수량 │ 단가 │ 공급가 │ 부가세 │
│  1 │ …                                        │
├──────────────────────────────────────────────┤
│ 공급가액 합계 / 부가세 / 배송비 / 합계 금액      │
│ 유효기간 · 결제조건 · 납기 · 비고               │
└──────────────────────────────────────────────┘
```

- 품목이 많으면 **페이지마다 표 헤더를 반복**한다 (`table.headerRows: 1`).
- **직인 이미지**는 B2B 설정 화면에 업로드 항목을 두고 base64 로 삽입한다(선택).
- 금액 표기는 §4.6 반올림 규칙을 그대로 따른다 — 견적서 합계와 주문 금액이 1원도 어긋나면 안 된다.

**발행 시점과 보관**

```
견적 제안(SELLER_PROPOSED) · 확정(*_ACCEPTED) 시 자동 생성
  → storage/quote/Q-YYYYMMDD-NNNNN_vN.pdf 에 저장  (public 밖 — 정적 서빙 금지)
  → quote_revision.pdf_path 에 경로 기록 = "그때 보낸 문서" 영구 보관
  → 다운로드는 권한 검사 라우트로만 스트리밍
```

**`storage/` 는 새 최상위 디렉터리다.** 견적서 PDF와 사업자등록증(§3.2)이 여기 들어간다.
정적 서빙 경로(`public/`) 밖에 둬야 URL 추측으로 새지 않는다. 다음 두 가지를 함께 처리한다.

- `.gitignore` 에 `/storage/` 추가 — 업로드물이 커밋되면 안 된다 (`/public/uploads/` 와 같은 취급).
- 배포 서버에 디렉터리 선생성. `git reset --hard` 는 untracked 를 지우지 않으므로 기존 파일은 안전하다.

---

## §9. 스키마

> **1단계(§9.1)는 적용 완료.** 2·3단계(§9.2~9.4)는 아직 설계다.
> 신규 테이블에 `mall_id` 를 두지 않는다 — B2B 는 모든 몰 공통이고, 상품 관련 테이블은
> `products.mall_id` 를 통해 자연히 몰 스코프를 따른다(§2.4, §2.5).

### 9.1 사업자 회원 · 상품 설정 — **적용 완료** (1단계)

실제 적용된 DDL은 [`scripts/migrate_b2b_phase1.sql`](../../scripts/migrate_b2b_phase1.sql) 하나가 소스다
(`tables.sql` 에도 신규 설치용으로 동일하게 실려 있다). 여기서는 요지만 적는다.

| 테이블 | 키 | 몰 스코프 | 비고 |
|--------|-----|----------|------|
| `b2b_tier` | `uk_tier_code(tier_code)` | **없음** | 관리자가 화면에서 생성. 0건이어도 동작 |
| `business_profile` | `uk_bp_user(user_id)` · `uk_bp_bizno(business_number)` | **없음** | users 1:1. 사업자 신원은 몰 무관(§2.5) |
| `product_b2b_setting` | `PK(product_id)` | products 경유 | 행이 없으면 그 상품은 B2B 판매 안 함 |
| `b2b_volume_price` | `uk_vp(product_id, sku_id, tier_id, min_quantity)` | products 경유 | 수량 구간가 |
| `products.tax_type` | — | — | `TAXABLE`(기본) / `TAX_FREE` / `ZERO_RATED` |

- `mall_b2b_setting` 은 **만들지 않는다**(§2.4). 동작 설정은 `system_settings` 전역 키다:
  `b2b_auto_approve` · `b2b_tax_display` · `b2b_allow_coupon_stacking` · `b2b_free_ship_threshold` ·
  `b2b_payment_due_days` · `b2b_quote_valid_days` · `b2b_bank_account_info`.
  **행이 없으면 `middleware/b2bContext.js` 의 `DEFAULTS` 가 쓰인다** — 새 몰에서 그대로 동작하는 이유다.
- 마이그레이션 스크립트는 **재실행 가능**하다. MySQL 8.4 가 `ADD COLUMN IF NOT EXISTS` 를 지원하지 않아
  `products.tax_type` 은 INFORMATION_SCHEMA 조회 후 동적 실행한다.

### 9.2 가격 정책 (3단계 — 미적용)

1단계에 적용된 `product_b2b_setting`(기본 B2B가) · `b2b_volume_price`(수량 구간가)는 §9.1 에 있다.
아래 두 테이블은 **등급가·거래처 계약가**용이며 3단계에서 만든다.

```sql
CREATE TABLE b2b_price_policy (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  policy_type ENUM('TIER','CUSTOMER_CONTRACT') NOT NULL,
  tier_id     INT         NULL COMMENT 'policy_type=TIER 일 때',
  priority    INT         NOT NULL DEFAULT 0,
  valid_from  DATE        NULL,
  valid_to    DATE        NULL,
  status      ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pp (policy_type, status)
) COMMENT='B2B 가격 정책';

CREATE TABLE b2b_price_item (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  price_policy_id INT NOT NULL,
  product_id      INT NOT NULL,
  sku_id          INT NULL COMMENT 'NULL=상품 전체',
  fixed_price     INT NULL COMMENT '고정 단가(우선)',
  discount_rate   DECIMAL(5,2) NULL COMMENT '판매가 대비 % (fixed_price 없을 때)',
  UNIQUE KEY uk_ppi (price_policy_id, product_id, sku_id),
  CONSTRAINT fk_ppi_policy FOREIGN KEY (price_policy_id) REFERENCES b2b_price_policy(id) ON DELETE CASCADE
) COMMENT='정책별 상품 단가';
```

거래처별 계약 정책은 `business_profile.price_policy_id` 가 가리킨다(컬럼은 1단계에 이미 있다).

### 9.3 주문 확장

```sql
ALTER TABLE carts  ADD COLUMN cart_type ENUM('B2C','B2B') NOT NULL DEFAULT 'B2C' COMMENT '거래 유형(혼합 금지)';

ALTER TABLE products
  ADD COLUMN tax_type ENUM('TAXABLE','TAX_FREE','ZERO_RATED') NOT NULL DEFAULT 'TAXABLE'
  COMMENT '과세구분 — 세금계산서 서식과 공급가 분해를 가른다 (§4.7)';

ALTER TABLE orders
  ADD COLUMN order_type      ENUM('B2C','B2B') NOT NULL DEFAULT 'B2C',
  ADD COLUMN supply_amount   INT NULL COMMENT '공급가액(과세 라인)',
  ADD COLUMN vat_amount      INT NULL COMMENT '부가세',
  ADD COLUMN tax_free_amount INT NULL COMMENT '면세 라인 합계',
  ADD KEY idx_orders_type (mall_id, order_type, created_at);

ALTER TABLE order_items
  ADD COLUMN supply_price INT NULL COMMENT '라인 공급가액',
  ADD COLUMN vat_price    INT NULL COMMENT '라인 부가세',
  ADD COLUMN price_source VARCHAR(30) NULL COMMENT 'B2B_DEFAULT/VOLUME/TIER/CUSTOMER_CONTRACT/NEGOTIATED_QUOTE',
  ADD COLUMN list_price   INT NULL COMMENT '적용 전 정가(할인 근거)';

CREATE TABLE b2b_order_detail (
  order_id             INT PRIMARY KEY,
  business_profile_id  INT NOT NULL,
  quote_id             INT NULL,
  quote_revision       INT NULL,
  purchase_order_number VARCHAR(50) NULL COMMENT '고객사 발주번호',
  approval_status      ENUM('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'REQUESTED',
  approved_at          DATETIME NULL,
  approved_by          INT NULL,
  reject_reason        VARCHAR(255) NULL,
  payment_terms        ENUM('PREPAY','CREDIT') NOT NULL DEFAULT 'PREPAY',
  payment_due_at       DATETIME NULL COMMENT '입금 기한',
  deposit_name         VARCHAR(50) NULL COMMENT '입금자명',
  deposited_at         DATETIME NULL,
  tax_invoice_required TINYINT(1) NOT NULL DEFAULT 1,
  tax_invoice_status   ENUM('NOT_ISSUED','REQUESTED','ISSUED','CANCELLED') NOT NULL DEFAULT 'NOT_ISSUED',
  tax_invoice_no       VARCHAR(50) NULL,
  tax_invoice_issued_at DATETIME NULL,
  requested_delivery_date DATE NULL COMMENT '납기 희망일',
  buyer_note           TEXT NULL,
  admin_note           TEXT NULL,
  CONSTRAINT fk_bod_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) COMMENT='B2B 주문 확장정보';
```

### 9.4 견적

```sql
CREATE TABLE quote (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  mall_id             BIGINT       NOT NULL,
  quote_number        VARCHAR(50)  NOT NULL,
  business_profile_id INT          NOT NULL,
  requested_by        INT          NOT NULL COMMENT 'users.id',
  assigned_admin_id   INT          NULL,
  status              ENUM('DRAFT','REQUESTED','UNDER_REVIEW','SELLER_PROPOSED','BUYER_COUNTERED',
                           'BUYER_ACCEPTED','SELLER_ACCEPTED','REJECTED','EXPIRED',
                           'CONVERTED_TO_ORDER','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  version             INT          NOT NULL DEFAULT 1,
  catalog_total       INT          NOT NULL DEFAULT 0 COMMENT '정가 합계',
  proposed_total      INT          NULL,
  final_total         INT          NULL,
  supply_amount       INT          NULL,
  vat_amount          INT          NULL,
  shipping_amount     INT          NOT NULL DEFAULT 0,
  discount_amount     INT          NOT NULL DEFAULT 0,
  valid_until         DATE         NULL,
  payment_terms       VARCHAR(100) NULL,
  delivery_terms      VARCHAR(100) NULL,
  requested_delivery_date DATE     NULL,
  converted_order_id  INT          NULL COMMENT '중복 전환 방지 잠금',
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_quote_number (quote_number),
  KEY idx_quote_status (mall_id, status, created_at),
  KEY idx_quote_bp (business_profile_id)
) COMMENT='견적 (주문과 별도 도메인)';

CREATE TABLE quote_item (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  quote_id             INT NOT NULL,
  product_id           INT NULL,
  sku_id               INT NULL,
  product_name_snapshot VARCHAR(100) NOT NULL,
  sku_snapshot         VARCHAR(255) NULL,
  quantity             INT NOT NULL,
  catalog_unit_price   INT NOT NULL COMMENT '정가',
  requested_unit_price INT NULL COMMENT '고객 희망가',
  proposed_unit_price  INT NULL COMMENT '판매자 제안가',
  final_unit_price     INT NULL COMMENT '확정가 — 주문 전환의 유일한 근거',
  item_note            VARCHAR(255) NULL,
  CONSTRAINT fk_qi_quote FOREIGN KEY (quote_id) REFERENCES quote(id) ON DELETE CASCADE
);

CREATE TABLE quote_message (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  quote_id    INT NOT NULL,
  sender_type ENUM('BUYER','SELLER') NOT NULL,
  sender_id   INT NOT NULL,
  message     TEXT NOT NULL,
  visibility  ENUM('ALL','INTERNAL') NOT NULL DEFAULT 'ALL' COMMENT 'INTERNAL=관리자 전용 메모',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_qm_quote (quote_id, created_at),
  CONSTRAINT fk_qm_quote FOREIGN KEY (quote_id) REFERENCES quote(id) ON DELETE CASCADE
);

CREATE TABLE quote_attachment (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  quote_id    INT NOT NULL,
  uploaded_by INT NOT NULL,
  uploader_type ENUM('BUYER','SELLER') NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  storage_path VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(100) NULL,
  file_size   INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qa_quote FOREIGN KEY (quote_id) REFERENCES quote(id) ON DELETE CASCADE
);

CREATE TABLE quote_revision (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  quote_id        INT NOT NULL,
  revision_number INT NOT NULL,
  changed_by      INT NOT NULL,
  changer_type    ENUM('BUYER','SELLER') NOT NULL,
  status_after    VARCHAR(30) NOT NULL,
  snapshot_json   JSON NOT NULL COMMENT '해당 시점 quote + quote_item 전체',
  pdf_path        VARCHAR(255) NULL COMMENT '이 리비전으로 발행한 견적서 PDF (§8.5)',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_qr (quote_id, revision_number),
  CONSTRAINT fk_qr_quote FOREIGN KEY (quote_id) REFERENCES quote(id) ON DELETE CASCADE
);
```

---

## §10. 서비스 · 라우트 구성

```
middleware/
  b2bContext.js                       거래 컨텍스트 주입 (req.b2b / res.locals.b2b)
  b2bGuard.js                         requireB2B(permission) 라우트 가드

services/b2b/
  businessProfileService.js           사업자 프로필 CRUD·검증(사업자번호 체크섬)·승인 전이
  b2bPricingService.js                가격 리졸버 (read-time, 5단계 우선순위)
  b2bTaxService.js                    공급가/부가세 분해, 면세 처리
  b2bOrderService.js                  주문 접수·승인·입금확인 (기존 주문 엔진 위임)

services/quote/
  quoteService.js                     견적 CRUD·집계
  quoteStatusService.js               상태 전이 (허용 전이표 단일 소스)
  quoteRevisionService.js             스냅샷 기록
  quoteConvertService.js              견적 → 주문 (idempotent)

controllers/
  b2bController.js                    사업자 가입/전환 신청, 마이페이지 B2B 탭
  quoteController.js                  고객 견적함·요청·재협상·수락

controllers/admin/
  b2bMemberController.js              기업회원 승인·등급·계약
  b2bPricingController.js             가격 정책·계약가·수량가·CSV 일괄
  b2bOrderController.js               B2B 주문·승인·입금확인·세금계산서
  quoteAdminController.js             견적 관리·협상·주문전환·PDF

routes/
  b2b.js                              /b2b/**
  quotes.js                           /quotes/**
routes/admin/
  b2b-members.js  b2b-pricing.js  b2b-orders.js  quotes.js
```

### 10.1 API (원문 §15 반영)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/auth/business` | 사업자 전환 신청 |
| `GET`  | `/api/b2b/pricing/:productId?qty=` | 컨텍스트 기준 단가·수량구간·주문규칙 |
| `POST` | `/api/b2b/pricing/resolve` | 다건 시뮬레이션(장바구니 합계) |
| `POST` | `/quotes` | 견적 요청 생성 |
| `POST` | `/quotes/:id/counter` | 고객 재제안 |
| `POST` | `/quotes/:id/accept` | 고객 수락 |
| `POST` | `/quotes/:id/convert` | 주문 전환 (`Idempotency-Key` 필수) |
| `POST` | `/checkout/b2b` | B2B 주문 접수 (결제 없음) |

**프론트엔드는 가격을 계산하지 않는다.** 서버 응답 값을 그대로 표시만 한다(원문 §17.2).

---

## §11. 관리자 화면

### 11.1 메뉴 (`admin_menus` 행 추가)

```
B2B 관리                              /admin/b2b
 ├─ 기업회원 승인                     /admin/b2b/members          (PENDING 뱃지 카운트)
 ├─ 거래처 관리                       /admin/b2b/companies
 ├─ 거래처 등급                       /admin/b2b/tiers
 ├─ 가격 정책                         /admin/b2b/price-policies
 ├─ 거래처별 계약가                   /admin/b2b/contract-prices
 ├─ 수량별 가격                       /admin/b2b/volume-prices
 ├─ 견적 관리                         /admin/b2b/quotes           (REQUESTED 뱃지 카운트)
 ├─ B2B 주문                          /admin/b2b/orders
 ├─ 입금 확인                         /admin/b2b/deposits
 ├─ 세금계산서                        /admin/b2b/tax-invoices
 └─ B2B 설정                          /admin/b2b/settings
```

- `visible_roles` 는 기존 CSV RBAC 규칙(`middleware/adminRoleGuard.js` + `requireMenuAccess`)을 따른다.
- 기존 `주문 관리` 는 그대로 두고 **주문 유형 필터(전체/B2C/B2B)** 만 추가한다. 목록 화면을 복제하지 않는다.

### 11.2 상품 관리자 — 탭 하나 추가

`controllers/admin/productController.js` 의 상품 등록/수정 화면에 **`B2B 판매` 탭**을 추가한다.
기본정보·옵션/SKU·재고는 손대지 않는다.

```
[기본 정보] [옵션/SKU] [가격/재고] [B2B 판매] [배송] [SEO]
                                    ↑ 신규

B2B 판매 여부      ● 사용   ○ 미사용
판매 채널          ○ B2C 전용  ● 공통  ○ B2B 전용
기본 B2B가         77,000원   (판매가 대비 30% ↓ 자동표시)
최소 주문수량      10      주문 단위  5      최대  제한없음
거래 방식          ○ 즉시 주문  ● 견적 선택가능  ○ 견적 필수
견적 필수 수량     100개 이상
가격 공개          ○ 전체공개  ● 승인 기업회원만  ○ 비공개(문의)

수량별 가격  [+ 행 추가]
  10개 이상   77,000원
  50개 이상   72,000원
```

### 11.3 거래처 상세

```
상호 · 사업자번호 · 대표자 · 업태/종목 · 사업자등록증
승인 상태 · 등급 · 적용 가격정책 · 계약기간 · 담당 영업
결제 조건: 선결제(무통장)   입금 기한: 7일
무료배송 기준: 3,000,000원   세금계산서: 필수
──────────────────────────────
최근 주문 10건 · 누적 매출 · 진행 견적 · 미입금 주문
```

### 11.4 견적 상세 (관리자)

```
[기본정보] [상품·가격] [할인] [배송비] [납기] [결제조건]
[협상 메시지] [첨부파일] [변경 이력(v1~vN)] [주문 전환]

가능 작업: 품목 추가/삭제 · 수량 변경 · 품목 단가 변경 · 전체/품목 할인
          배송비 제안 · 납기 제안 · 유효기간 설정 · 내부메모
          견적 반려 · 견적 제안 · 주문 전환 · 견적서 출력
```

---

## §12. 반드시 지킬 규칙 (원문 §17 + 이 저장소 고유)

1. **로그인 여부로 B2B를 판정하지 않는다.** §2.3의 6개 조건 전부.
2. **뷰에서 가격을 숨기는 방식 금지.** 권한 없으면 서버 응답에 필드를 넣지 않는다.
3. **장바구니 가격을 주문 시 신뢰하지 않는다.** `postForm` 에서 전부 재계산·재검증(§7.6).
4. **확정 견적 주문은 현재가가 아니라 견적 확정가.** 재조회 금지.
5. **협상 내용을 댓글로만 저장하지 않는다.** `quote_revision` 스냅샷 필수.
6. **가격을 write 하지 않는다.** 개발 DB = 운영 DB. read-time 리졸버만.
7. **기존 B2C 경로에 회귀를 만들지 않는다.** `req.b2b.active === false` 면 모든 신규 코드가 no-op 이어야 한다.
   `b2bPricingService.applyToScopeItems(inactive, items)` 는 items를 그대로 반환한다.
8. **B2B 가드는 fail-close.** 설정을 못 읽으면 B2B 비활성으로 간주한다(Shopify 가드의 fail-open 실수를 반복하지 않는다).
9. **B2C/B2B 장바구니 혼합 금지.**
10. **주문 상태와 결제 상태를 섞지 않는다.** 후불 도입 시 "결제완료"를 출고 전제조건으로 쓰면 안 된다.
11. **재고를 확보했으면 반드시 놓아주는 경로가 있어야 한다.** 승인 시 예약한 재고는 입금 기한 만료·반려·취소에서
    전부 복원되어야 하며, 복원 시각을 `orders.resources_restored_at` 에 남겨 이중 복원을 막는다.

---

## §13. 단계별 구축 계획

### 1단계 — 사업자 회원 + 전용가 (기반)
- `business_profile` / `b2b_tier` / `product_b2b_setting` / `b2b_volume_price`
  (+ `products.tax_type` — **승인 시에만**. 미승인이면 전 상품 과세 가정)
- 사업자 가입·전환 신청 폼(**사업자등록증 첨부 필수**), 관리자 승인 화면(등록증 열람·대조)
- `middleware/b2bContext.js`, `services/b2b/b2bPricingService.js` (기본가 + 수량구간가만)
- 상품 상세·목록 가격 분기, MOQ·주문단위
- 공급가/부가세 분리 표시
- **검증 기준**: 일반회원 화면·주문이 1픽셀도 바뀌지 않는다

### 2단계 — B2B 주문 절차
- `carts.cart_type`, `orders.order_type`, `b2b_order_detail`
- B2B 주문서(쿠폰·포인트 숨김, PO·납기·세금계산서 입력), 주문 요청
- 관리자: 주문 승인 → **재고 예약**(§7.3) → 입금 안내 → 입금 확인 → 확정
- 입금 기한초과 주문 목록 + 일괄 취소·재고 복원
- B2B 주문번호(`B2B-`), 메일 알림
- 마이페이지 B2B 주문 상태 표시

### 3단계 — 가격 정책 + 견적·협상
- `b2b_price_policy` / `b2b_price_item` / `b2b_volume_price` + 등급·계약가·CSV 일괄등록
- 5단계 우선순위 리졸버 완성
- `quote` 도메인 전체(상태 10종·revision·메시지·첨부)
- 견적 → 주문 전환(idempotent)
- **견적서 PDF** — `pdfmake` 도입 + 나눔고딕 커밋 + 발행·저장·메일 발송(§8.4, §8.5)

### 4단계 — 기업 구매 고도화 (보류 항목)
회사-다중사용자(`company` / `company_user`) · 내부 승인 · 구매한도 · 후불/여신 · 미수금
분할 출고 · 월별 정산 · 세금계산서 API 연동 · ERP 연동

---

## §14. 열린 결정 (구현 착수 전 확인)

| # | 항목 | 잠정안 |
|---|------|--------|
### 14.1 확정된 결정 (2026-07-21)

| 항목 | 결정 | 반영 |
|------|------|------|
| 회원 구조 | 사업자 프로필 1:1 (`business_profile`) | §3, §9.1 |
| 견적 범위 | 협상까지 전부 (상태 10종 · revision · 메시지/첨부 · PDF) | §8 |
| 결제 | 무통장 입금대기 중심 | §7 |
| 입금대기 재고 | **승인 시 실차감** + 기한 만료 자동 복원 | §7.3 |
| 사업자 진위확인 | **사업자등록증 첨부 + 관리자 검토** (국세청 API 미사용) | §3.2 |
| 견적서 PDF | **`pdfmake`** + 나눔고딕 임베딩 | §8.5 |

### 14.2 남은 결정

| # | 항목 | 잠정안 |
|---|------|--------|
| 0 | **`products.tax_type` 컬럼 추가** | **권장 — 승인 대기.** 근거는 §4.7(소싱이 이미 과세구분을 주고 있음 · 네이버 하드코딩 · 계산서 서식 분리). `products` 는 코어 테이블이라 명시적 승인 후 진행한다. **미승인 시**: 전 상품 과세 가정으로 1단계를 진행하고, 면세 상품이 실제로 들어오는 시점에 재논의 |
| 1 | B2B 상품 노출 범위 | 전 상품 공통(BOTH) 기본. B2B 전용 카탈로그(거래처별 상품 제한)는 4단계 |
| 2 | 세금계산서 발행 | 1단계는 **수동 발행 + 상태 기록**. 팝빌/바로빌 API 연동은 4단계 |
| 3 | 기한초과 주문 자동취소 | 스케줄러(`node-cron`) 도입 vs 관리자 수동 일괄취소. **재고를 실차감하므로 2단계에서 반드시 결정** |
| 4 | 사업자등록증 파일 저장 위치 | `public/` 밖 + 권한 라우트 스트리밍(권장) vs 랜덤 파일명. `middleware/upload.js` 경로 분기 필요 |
| 5 | B2B 배송비 | `shipping_policy` 재사용 vs B2B 전용 정책 테이블 — 재사용 우선 검토 |
| 6 | 거래 컨텍스트 전환 | 잠정: **승인 사업자는 항상 B2B 컨텍스트**(개인 구매 전환 없음). 원문 §4.2의 토글이 필요하면 헤더 스위치 + `carts.cart_type` 분리 보관으로 확장 가능 |
| 7 | 견적서 직인 이미지 | B2B 설정 화면에 업로드 항목 추가 여부 (선택) |

---

---

## §15. 구현 현황 (2026-07-21)

**1~3단계 구현 완료.** 4단계(회사-다중사용자·여신·분할출고·ERP)는 미착수.

### 적용된 마이그레이션

| 스크립트 | 내용 |
|---|---|
| `scripts/migrate_b2b_phase1.sql` | `b2b_tier` · `business_profile` · `product_b2b_setting` · `b2b_volume_price` · `products.tax_type` |
| `scripts/migrate_b2b_phase2.sql` | `carts.cart_type` · `orders.order_type/supply_amount/vat_amount/tax_free_amount/stock_deducted_at` · `order_items.supply_price/vat_price/price_source/list_price` · `b2b_order_detail` |
| `scripts/migrate_b2b_phase3.sql` | `b2b_price_policy` · `b2b_price_item` · `quote` · `quote_item` · `quote_message` · `quote_attachment` · `quote_revision` |
| `scripts/migrate_b2b_admin_menus.sql` | 관리자 `B2B 관리` 메뉴 5종 |

전부 **재실행 가능**하다. MySQL 8.4 가 `ADD COLUMN IF NOT EXISTS` 를 지원하지 않아
컬럼 추가는 INFORMATION_SCHEMA 조회 후 동적 실행한다.

### 코드 구성

```
middleware/b2bContext.js               거래 컨텍스트 (app.js 전역 체인, siteSettings 뒤)
services/b2b/
  businessProfileService.js            사업자 프로필·체크섬·승인 전이
  b2bPricingService.js                 가격 리졸버 (5단계 우선순위, read-time)
  b2bTaxService.js                     공급가/부가세 분해 + 잔차 정합
  b2bOrderService.js                   접수→승인(재고차감)→입금확인→기한초과 회수
services/quote/
  quoteStatusService.js                상태 10종 전이표 (단일 소스)
  quoteService.js                      견적 CRUD·제안·재제안·수락·리비전
  quoteConvertService.js               견적→주문 (FOR UPDATE 잠금, 확정가 복사)
  quotePdfService.js                   pdfmake + 나눔고딕
controllers/  b2bController · quoteController
controllers/admin/  b2bMemberController · b2bSettingController · b2bProductController
                    b2bOrderController · quoteAdminController
routes/  b2b.js · quotes.js · admin/b2b.js
views/  user/b2b/ · user/quote/ · user/checkout/b2b_received.ejs · admin/b2b/
public/fonts/  NanumGothic-Regular.ttf · NanumGothic-Bold.ttf  (OFL, 커밋됨)
```

### 구현 중 발견해 고친 것

| 문제 | 영향 | 조치 |
|---|---|---|
| mysql2 가 DATE 를 `Date` 객체로 준다 | `String(d).slice(0,10)` → `'Wed Jan 01'` → **만료된 계약이 유효로 통과** | `toDateStr()` 로컬 연·월·일 조립 (`b2bContext.js`) |
| 재고 복원 판정이 `status` 기반 | B2B 는 PENDING 상태에서 차감 → **승인 후 미입금 취소에서 재고가 영영 안 돌아옴** | `orders.stock_deducted_at` 추가, 상태가 아니라 **사실**로 판정 (`orderCancelService.js`) |
| `getComplete` 가 테스트 모드에서 PENDING 을 자동 결제 처리 | B2B 주문이 그리로 가면 **승인 없이 재고 차감 + 결제완료** | 전용 `/checkout/b2b-received` 분리 |
| 견적 전환 잠금에 `converted_order_id = 0` | 이 컬럼은 `orders(id)` FK — **제약 위반으로 전환 자체가 실패** | 트랜잭션 내 `SELECT … FOR UPDATE` 로 직렬화 |
| pdfmake 0.3 은 `PdfPrinter` 를 export 하지 않음 | PDF 생성 불가 | 0.2.x 로 고정 |

### 검증

각 단계마다 컨트롤러를 직접 호출하되 `res.render` 를 **실제 EJS 렌더**로 바꿔 돌렸다
(HTTP 없이 locals 누락까지 검출). 누적 90여 항목 통과. 확인한 것 중 중요한 것:

- **B2C 회귀 없음** — 비활성 컨텍스트에서 가격·카드·장바구니·주문이 전부 예전 값 그대로
- 재고: 접수 시 미차감 → 승인 시 차감 → 재승인 시 이중차감 없음 → 취소·기한초과 시 전량 복원
- 가격 우선순위: 기본 → 수량구간 → 등급 → 계약가 순으로 뒤가 이김
- 견적: 잘못된 전이 차단, 재제안 시 제안가 무효화, 수락 시 확정가 고정, 중복 전환 차단, 만료 처리
- 보안: 등록증 경로 조작(`../../etc/passwd`) 403, 남의 견적·주문 접근 차단

> 검증에 쓴 임시 데이터는 전부 삭제했다. 영구 반영된 것은 스키마와 `admin_menus` 5행뿐이다.

### 남은 것

- 4단계 전체 (회사-다중사용자 · 내부 승인 · 여신/후불 · 분할출고 · 세금계산서 API · ERP)
- 기한초과 주문 **자동** 취소 (현재는 관리자 화면에서 수동 일괄 회수 — §14.2 #3)
- 견적 첨부파일 업로드 UI (테이블·스키마는 준비됨)
- `supplier_product.tax_type` → `products.tax_type` 매핑, `naverMapper.js:234` 하드코딩 제거 (소싱 쪽 작업)

---

---

## §16. 단순화 (2026-07-21, 사용자 지시)

구현해 놓고 보니 **설정 항목이 과했다.** 실제로 필요한 건 "이 상품을 사업자에게 팔 것인가 /
몇 개 이상부터 / 몇 % 할인" 세 가지뿐이고, 나머지는 **견적 단계에서 담당자가 협의**하면 된다.
쓰지 않는 설정을 미리 채워 두게 하면 운영 피로도만 올라간다.

### 없앤 것

| 없앤 것 | 대신 |
|---|---|
| 상품 B2B 설정 **별도 화면**(`/admin/products/b2b/:id`) | **상품 등록/수정 화면 안**의 `B2B(사업자) 판매` 섹션 — 클릭 한 번 줄었다 |
| 전용가 **금액** 입력 | **할인율(%)**. 판매가가 바뀌면 전용가도 따라 움직인다 |
| 수량 구간가(`b2b_volume_price`) | 견적에서 협의 |
| 가격 정책(`b2b_price_policy`·`b2b_price_item`) — 등급가·계약가 | **거래처 추가 할인율** 한 칸(`business_profile.extra_discount_rate`) |
| 거래처 등급(`b2b_tier`) | 등급별 가격이 없어져 이름표만 남으므로 제거 |
| 판매 채널(B2B 전용 상품) | 상품은 **언제나 B2C 판매**. B2B 는 얹는 옵션일 뿐 |
| 거래방식·견적필수수량·주문단위·최대수량·가격공개범위 | 제거. 견적에서 협의 |

### 남은 가격 규칙

```
전용가 = 판매가 × (1 − (상품 할인율 + 거래처 추가 할인율) / 100)      ← 단순 합산
```

층이 둘뿐이다. 우선순위 표(§4.2)는 더 이상 유효하지 않다.
**확정 견적가만 예외**로, 합의된 값이 모든 것에 우선한다(§8.3 그대로).

### 화면

```
상품 등록/수정  → B2B(사업자) 판매 섹션   판매 여부 · 할인율 · 최소수량 · 과세구분
B2B 관리
  ├─ 기업회원 승인      승인·반려·정지 + 거래 조건(추가 할인율·계약기간)
  ├─ 거래처 할인        거래처 목록 + 추가 할인율 일괄 편집
  ├─ B2B 주문          접수 → 승인(재고차감) → 입금확인
  ├─ 견적 관리          단가·조건 협의 ← 세밀한 조정은 전부 여기서
  └─ B2B 설정
```

### 과세구분은 거래처 속성 (2026-07-21 추가 결정)

기업회원 승인이 곧 "이 회사와 B2B 거래를 튼다" 는 뜻이므로, 세금계산서 서식도 그 회사에 대해
정한다. 상품 폼에서 빼고 `business_profile.tax_type` 으로 옮겼다.

```
과세     주문 금액을 공급가액 + 부가세로 분해
면세     부가세 0, 전액 면세 금액
영세율   부가세 0, 면세 금액으로 집계
```

⚠️ `products.tax_type` 은 **지우지 않았다.** B2B 와 무관하게 외부 채널이 쓴다 —
도매꾹이 '과세상품' 으로 값을 주고(`normalize.js:230`), 네이버 스마트스토어 등록은
`taxType` 이 필수 필드다(`naverMapper.js:234`, 현재 'TAX' 하드코딩).
B2B 세액 계산만 거래처 값을 쓰고 상품 컬럼은 채널 연동 몫으로 남긴다.

적용 스크립트: `scripts/migrate_b2b_simplify.sql`, `scripts/migrate_b2b_tax_by_company.sql` (재실행 가능).
기존 전용가 금액은 **할인율로 환산해 옮긴다** — 설정을 잃지 않는다.

---

**작성일** 2026-07-21 · **최종 수정** 2026-07-21 (단순화 반영)
