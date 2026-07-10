# 쿠폰 관리 및 사용자 화면 설계/개발 설계

> 작성 2026-07-10. 입력 레퍼런스: [`쿠폰관리.md`](./쿠폰관리.md) (일반론·업계 표준).
> 이 문서는 그 일반론을 **이 저장소의 실제 코드·DB 위에 접지**시킨 설계·개발 문서다.
>
> **[`gnb_menu_design.md`](./gnb_menu_design.md) §2-8 · §7-2 · §8-3 M3 의 쿠폰 계획을 이 문서가 흡수한다.**
> GNB `/coupon` 메뉴(다운로드 쿠폰존)는 §7 의 1차 범위에 포함된다. gnb 문서의 결정
> (`issued_by='DOWNLOAD'`, `coupons` 다운로드 컬럼 ALTER, 중복 수령 방지)은 여기서 그대로 승계하되,
> **`UNIQUE(user_id, coupon_id)` 만은 관리자 재발급 경로와 충돌하므로 §6-3 에서 재검토했다.**
>
> **선행 문서: [`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md).**
> 무료배송 쿠폰(2차)은 배송비 모델 위에 선다. 배송비는 **이미 고객에게 고지된 정책인데 미구현**이므로
> 쿠폰보다 앞선 과제다(§4-3). 범위 전체 판정은 **§13** 을 보라.

---

## ✅ 구현 완료 (2026-07-11)

**0차(C1·C3·C4·C6) · 1차(D1~D13) · 2차(P1~P11) 전부 구현·검증 완료.**
커밋 `e8fd931`(0차 + 배송비) · `c460182`(1차) · `119dd1c`(2차).

| 미결 (§12) | 확정 |
|---|---|
| 1. `is_active` 제거 | **(B) 이중 유지 — 단 `status` 가 정본, `is_active` 는 미러.** dev·prod 가 같은 DB 라 운영이 옛 코드를 돌리는 동안 `is_active` 를 지울 수 없다. 배포 안정 후 별도 마이그레이션으로 제거 |
| 2. 다운로드 재수령 | (A) 1인 1회 영구 (`coupon_download` PK) |
| 3. 취소 시 복원 | (A) 복원. `system_settings.coupon_restore_on_cancel = 1` |
| 4. 만료 후 취소된 주문의 쿠폰 | (A) 복원하되 조회 시 유효기간으로 걸러짐 |
| 5. 절사 단위 | 1원 (`discountCalculator.ROUND_UNIT`) |
| 6. 쿠폰존 몰 스코프 | `mall_id IS NULL OR = ?` |
| 7. 무료배송 시 지역 할증 | (A) 기본료만 면제 |

**남은 운영 조치**

1. `max_total_uses` 의 의미가 바뀌었다 — 옛 코드는 **발급** 한도로 썼고 지금은 **사용** 한도다.
   기존 쿠폰의 발급 한도는 `issue_limit` 로 옮겨 담았다. 운영자에게 이 구분을 알릴 것.
2. 다운로드 쿠폰 마스터가 **0건**이라 `/coupon` 은 아직 준비중 랜딩이다(0건 폴백).
   `/admin/coupons` 에서 다운로드 쿠폰을 등록해야 화면이 열린다(D5).
3. `is_active` 제거 마이그레이션 — 배포 안정 후.

**3차로 남은 것**: 부분 취소 → 상품 쿠폰 → 다중 쿠폰(3장+). 이 순서를 지킨다(§13-3).
PENDING 점유 해제 배치도 3차다 — 그때까지는 조회·점유가 **30분 나이**로 방치된 점유를 무시한다.

> **범위 밖이지만 기록한다.** 주문 취소는 여전히 **토스 결제 취소 API 를 호출하지 않는다.**
> `cancelTossPayment()` 함수는 있으나 취소 경로 어디에서도 부르지 않는다(이 작업 이전부터 그랬다).
> 상태만 `CANCELLED` 로 바뀌고 실제 환불은 일어나지 않는다.

---

## 0. 설계 전제

| 항목 | 값 | 확인 |
|---|---|---|
| 쿠폰 마스터 | **3건** (신규가입축하 / 특별할인 / 봄맞이할인) | DB 실측 |
| 발급된 쿠폰 | **19건, 전부 `issued_by='AUTO'`** | DB 실측 |
| 사용된 쿠폰 | **0건** (`used_at IS NOT NULL` 0행) | DB 실측 |
| 주문 | 21~22건 | DB 실측 |
| 쿠폰 코드 | 3건 모두 `code IS NULL` | DB 실측 |
| 관련 테이블 | `coupons`, `user_coupons`, `event_coupon` (3종) | DB 실측 |

**사용 이력이 0건이라는 사실이 이 설계의 자유도를 결정한다.** 파괴적 스키마 변경(제약 추가·enum 확장)을 지금 하면 비용이 거의 없다. 주문이 쌓인 뒤에는 같은 변경이 마이그레이션 대상이 된다.

---

## 1. 현행 실태

### 1-1. 데이터 모델 (실측)

```text
coupons
  id, name, code, coupon_type ENUM('NEW_SIGNUP','EVENT','SEASON','SPECIAL'),
  discount_amount(int, 원), min_order_amount, valid_from, valid_to,
  max_total_uses(NULL=무제한), is_active, created_at, updated_at
  ※ mall_id 없음

user_coupons
  id, user_id, coupon_id, issued_at, used_at, order_id,
  issued_by ENUM('AUTO','ADMIN','CODE'), created_at
  ※ UNIQUE(user_id, coupon_id) 없음.  FK: coupon → ON DELETE CASCADE

orders
  ... coupon_discount(int, DEFAULT 0), point_used, user_coupon_id(FK → user_coupons.id)
  ※ user_coupon_id 는 단수.  배송비 컬럼 없음
```

세 가지가 이 시스템의 형태를 규정한다.

1. **`discount_amount` 만 있다** → 표현 가능한 혜택은 **정액 할인 하나**뿐이다.
2. **`orders.user_coupon_id` 가 단수다** → **주문당 쿠폰 1장**이 스키마 수준의 제약이다.
3. **배송비 컬럼이 없다** → 무료배송 쿠폰은 배송비 모델이 선행돼야 한다(§4-3).

### 1-2. `coupon_type` 의 실제 의미

enum 4종은 단순 분류가 아니다. **두 개는 동작을 바꾸고 두 개는 라벨일 뿐이다.**

| 값 | 실제 역할 | 근거 |
|---|---|---|
| `NEW_SIGNUP` | **자동발급 트리거.** 회원가입 시 이 타입·활성·기간유효 쿠폰을 전부 지급 | `routes/auth.js:341-365` |
| `SPECIAL` | **코드입력형.** `code` 컬럼을 이 타입일 때만 저장·조회 | `controllers/admin/couponController.js:54`, `checkoutController.js:314` |
| `EVENT` | 분류 라벨 (동작 분기 없음) | `views/admin/coupons/list.ejs:44-45` |
| `SEASON` | 분류 라벨 (동작 분기 없음) | 〃 |

즉 이 enum 은 레퍼런스의 "쿠폰 목적"(§3-1)과 "발급 방식"(§1-3)이 **한 컬럼에 뒤섞인 상태**다. 다운로드 수령을 추가하면 이 혼선이 곧바로 문제가 된다(§4-1).

### 1-3. 관리자 기능 (`/admin/coupons`, 권한 `super_admin,admin`)

| 기능 | 컨트롤러 | 상태 |
|---|---|---|
| 목록 (발급수·미사용·사용수 집계) | `getList` (L6-25) | ✅ |
| 등록 폼 / 저장 | `getCreate` / `postCreate` (L27-85) | ✅ |
| 상세 (수령자 목록) | `getDetail` (L87-114) | ✅ |
| 수정 폼 / 저장 | `getEdit` / `postEdit` (L116-181) | ✅ |
| **지급 (전체회원 / 선택회원)** | `getIssue` / `postIssue` (L183-294) | ✅ |
| 사용 내역 (필터, 최대 500건) | `getUsage` (L296-346) | ✅ |
| **삭제** | 없음 | ❌ 미구현 |
| **통계 지표(사용률 등)** | 없음 | ❌ 미구현 |

등록/수정 폼이 받는 필드는 **정확히 9개**다: `name`, `code`(SPECIAL 한정), `coupon_type`, `discount_amount`, `min_order_amount`, `valid_from`, `valid_to`, `max_total_uses`, `is_active`.

`postIssue` 는 이미 견고한 편이다 — 활성·만료 검증, 대상 회원 존재 확인, **미사용 동일 쿠폰 보유 시 스킵**(중복 방지), `max_total_uses` 대비 누적 발급수 확인까지 한다(L259-267). 다만 **이미 사용한 쿠폰은 재발급이 허용된다**(L259 의 조건이 `used_at IS NULL`). 이 동작이 §6-3 의 UNIQUE 제약과 정면 충돌한다.

### 1-4. 고객 기능

| 화면 | 경로 | 상태 |
|---|---|---|
| GNB 쿠폰존 | `/coupon` | ❌ **준비중 랜딩** (`routes/feature.js:149` `comingSoon('coupon')`) |
| 마이페이지 쿠폰함 | `/mypage/coupons` | ✅ 동작. 사용가능·사용완료·기간만료 3구분 |
| 체크아웃 쿠폰 선택 | `/checkout` | ✅ 모달에서 **1장** 선택 |
| 쿠폰 코드 입력 | `POST /checkout/apply-coupon-code` | ⚠️ **백엔드만 존재, UI 없음** (데드 엔드포인트) |
| 회원가입 자동 지급 | 가입 완료 시 | ✅ `NEW_SIGNUP` 전부 지급 |
| 장바구니 쿠폰 미리보기 | `/cart` | ❌ 없음 |

### 1-5. 사용 흐름 (실측)

```text
주문서 진입   getForm         사용가능 쿠폰 조회 (used_at IS NULL AND is_active AND 기간유효)
                              ※ max_total_uses 는 여기서 검증하지 않음
주문 생성     postForm        할인액 = MIN(discount_amount, subtotal)
                              최소주문금액 검증 → 미달 시 error=coupon_min
                              orders(PENDING) 에 user_coupon_id · coupon_discount 기록
                              ※ user_coupons 는 아직 손대지 않는다   ← 점유 공백
결제 확정     completeOrder…  트랜잭션 안에서
                              UPDATE user_coupons SET used_at=NOW(), order_id=?
```

---

## 2. 레퍼런스 대비 격차

[`쿠폰관리.md`](./쿠폰관리.md) 가 제시한 항목과 현행을 대조한다.

| 레퍼런스 항목 | 현행 | 격차 |
|---|---|---|
| 혜택 7종 (정액·정률·무료배송·수량·BuyXGetY·적립금·사은품) | **정액 1종** | 6종 부재 |
| 적용 단위 `PRODUCT` / `ORDER` / `SHIPPING` | **ORDER 단일** (구분 개념 없음) | 상품·배송 쿠폰 부재 |
| 발급 방식 8종 | AUTO(가입) · ADMIN(수동) · CODE(UI 없음) | **다운로드·이벤트·주문조건·API 부재** |
| 포함/제외 대상 규칙 (`include`/`exclude` JSON) | 없음. 전 상품 고정 | 전면 부재 |
| 발급 조건 (등급·누적구매·생일·휴면) | `NEW_SIGNUP` 하나 | 전면 부재 |
| 사용 조건 (채널·결제수단·회원조건·발급후 유효기간) | 최소주문금액 · 절대 기간만 | 대부분 부재 |
| 중복 정책 (`combination_group`, `stackable`, `priority`) | **스키마가 1장만 허용** | 개념 부재 |
| 정책 상태 6종 (DRAFT/SCHEDULED/ACTIVE/PAUSED/ENDED/CANCELLED) | `is_active` (0/1) + 기간 | 상태머신 부재 |
| 보유 쿠폰 상태 7종 (…RESERVED/REVOKED/RESTORED) | `used_at` NULL 여부 | **RESERVED·복원 부재** |
| 주문 취소 시 복원 | **없음** | §3 C1 |
| 5개 테이블 정책 엔진 | 2개 테이블 | §4-1 에서 유보 결정 |

---

## 3. 현행 결함 (코드로 확인)

> **✅ 2026-07-11 — C1~C8 전부 수정됐다.** 아래는 발견 당시의 기록이다.
> C1·C3·C4·C6 은 0차, C2·C5·C7 은 1차, C8(배송비)은 배송비 문서 1차에서 처리했다.

개발에 앞서 고쳐야 할 것들이다. **C1·C3 는 운영 사고로 직결된다.**

| # | 결함 | 위치 | 증상 | 등급 |
|---|---|---|---|---|
| **C1** | **주문 취소 시 쿠폰이 복원되지 않는다** | `mypageController.js:450-453`, `admin/orderController.js:144-172` | 고객이 주문을 취소하면 쓴 쿠폰이 그대로 소멸. 관리자 취소는 재고는 되돌리지만 쿠폰은 방치 | 🔴 |
| **C2** | RESERVED(임시점유) 개념 없음 | `checkoutController.js:476-485` | PENDING 주문 여러 건에 **같은 쿠폰을 중복 선택** 가능. 결제 확정이 먼저 도는 쪽만 살고 나머지는 할인만 받고 쿠폰은 안 쓰인 상태 | 🟠 |
| **C3** | `getComplete` 가 **쿼리스트링**으로 쿠폰을 재적용하고 주문을 결제 확정 | `checkoutController.js:625-667` | 아래 별도 설명 | 🔴🔴 |
| **C4** | `postForm` 할인 재검증에서 `max_total_uses` 미검증 | `checkoutController.js:423-442` | 전체 사용 한도를 넘겨 쓸 수 있다 | 🟠 |
| **C5** | 쿠폰 코드 입력 UI 미연결 | 백엔드 `checkoutController.js:296-348` / 뷰 0건 | `SPECIAL` 쿠폰을 만들어도 고객이 등록할 방법이 없다 | 🟡 |
| **C6** | 쿠폰함 뷰에 죽은 `percent` 분기 | `views/user/mypage/coupons.ejs:28` | `coupon_type` enum 에 `'percent'` 가 없어 항상 "원 할인"으로 표시. 정률 도입 시 오작동의 씨앗 | 🟡 |
| **C7** | 관리자 쿠폰 **삭제 기능 없음 + FK 가 CASCADE** | `tables.sql:546` | 지금은 삭제 경로가 없어 잠재적이지만, 삭제를 붙이는 순간 **회원 보유 쿠폰과 사용 이력이 함께 소멸**한다 | 🟠 |
| **C8** | **고지한 배송비가 청구되지 않는다** | `views/user/checkout/form.ejs:132`, `views/user/guide.ejs:68-84` | `guide.ejs` 는 "5만원 미만 3,000원 / 제주·도서산간 할증"을 안내하는데, 결제 화면은 배송비를 `0원` 정적 문자열로 표시하고 총액에도 넣지 않는다 | 🟠 |

### C3 상세 — 쿠폰 문제를 넘어선다

이것은 "test 모드라서 괜찮은" 코드가 아니다. **테스트 모드를 클라이언트가 켠다.**

```js
// controllers/checkoutController.js:625
const isTest = req.query.test === '1';          // ← 환경변수도 NODE_ENV 도 아니다
const couponDiscount = req.query.coupon_discount != null ? parseInt(...) : null;
const userCouponId   = req.query.user_coupon_id   != null ? parseInt(...) : null;
const pointUseAmount = req.query.point_use_amount != null ? parseInt(...) : null;
```

라우트는 **인증 미들웨어 없이** 공개돼 있다 — `routes/checkout.js:21` `router.get('/complete', checkoutController.getComplete)`. 함수 진입부(L623-627)에도 `req.user` 확인이나 **주문 소유자 검증이 없다.** PENDING 주문은 `order_number` 하나로 조회된다(L633-636).

그 안에서:

1. `?test=1` 이면 PENDING 주문을 조회한다 (L632-637)
2. 쿼리스트링의 `coupon_discount`·`user_coupon_id` 를 **검증 없이** `orders` 에 UPDATE 한다 (L645-647)
   - **쿠폰 소유자를 확인하지 않는다** — 남의 `user_coupon_id` 를 넣을 수 있다
   - **`coupons.discount_amount` 와 대조하지 않는다** — 할인액이 임의값이다
   - **`min_order_amount` 를 검증하지 않는다**
3. `total_amount = MAX(0, subtotal − couponDiscount − pointUseAmount)` 로 재계산한다 (L655-657)
4. **`completeOrderWithStockAndPaid()` 를 호출해 주문을 `PAID` 로 확정한다** (L667)

그리고 그 함수는 **결제를 검증하지 않는다** (`checkoutController.js:61-95`):

```js
async function completeOrderWithStockAndPaid(orderId, opts = {}) {
    const { paymentKey = null, paymentMethod = 'CARD' } = opts;   // ← paymentKey 기본값 null
    ...                                                            // ← Toss 결제 조회·대조 없음
    await conn.query(`UPDATE orders SET status = 'PAID', ... WHERE id = ?`, ...);
}
```

즉 `GET /checkout/complete?orderId=<주문번호>&test=1&coupon_discount=99999999` 한 번으로 **결제 없이 주문을 완료**시킬 수 있다. 재고가 차감되고, `user_coupons` 의 쿠폰이 소모되며, 적립금이 정산된다. 쿠폰 설계 이전에 **결제 우회 결함**이다.

> **유일한 방어선은 `hasCouponInOrder`(L640)** — 주문에 이미 쿠폰이 있으면 덮어쓰지 않는다.
> 쿠폰을 쓰지 않은 주문에는 아무 방어가 없다.
>
> `user_coupon_id` 도 소유자 검증 없이 UPDATE 되고(L645-647), 이후 `completeOrderWithStockAndPaid` 가
> **주문 행에서 그 값을 읽어 `used_at` 을 마킹한다**(L100-107). **남의 쿠폰을 소모시킬 수 있다.**
>
> 공격에 필요한 것은 PENDING 상태의 `order_number` 뿐이다. **자기 주문의 번호는 언제나 안다.**

**조치**: `isTest` 를 클라이언트 입력에서 분리하고(`NODE_ENV`/`system_settings` 게이트), 쿠폰·포인트는 쿼리스트링이 아니라 **PENDING 주문 행에서만** 읽는다. 운영에서 이 경로가 필요 없다면 라우트를 제거한다. **다른 모든 쿠폰 작업보다 먼저 처리한다.**

> **C7 의 함의.** 레퍼런스 §5 의 정책 상태(`ENDED`/`CANCELLED`)가 필요한 이유가 여기 있다.
> 쿠폰은 **삭제하는 것이 아니라 종료시키는 것**이다. 삭제 기능을 만들 게 아니라 상태를 만들어야 한다.

> **C8 은 쿠폰 결함이 아니다.** 배송비 자체가 없어서 생긴 문제이며,
> [`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md) 가 소유한다.
> 여기 적는 이유는 **무료배송 쿠폰의 선행 조건**이자, `total_amount` 계산식을 함께 건드리기 때문이다.

---

## 4. 설계 방침

### 4-1. 정책 엔진(5테이블)은 짓지 않는다 — 1·2차 유보

레퍼런스 §7 은 `coupon_policy` / `coupon_target` / `coupon_issue_condition` / `member_coupon` / `coupon_usage` 5개 테이블을 제시한다. **지금 이것을 짓는 것은 과설계다.**

```text
근거
  쿠폰 마스터        3건
  발급               19건 (전부 가입 자동지급)
  사용               0건
  코드베이스          ORM 없음, raw SQL. 규칙 엔진을 돌릴 추상 계층이 없다
  운영자             현재 폼 9필드도 다 쓰지 않는다 (code 3건 모두 NULL)
```

대신 **기존 `coupons` 테이블을 단계적으로 확장**한다. 레퍼런스가 말한 "정책형 구조"의 핵심 — *혜택 유형 · 적용 범위 · 발급 방식 · 조건을 조합한다* — 은 **컬럼 추가만으로도 상당 부분 달성된다.** 테이블을 쪼개는 것은 다음 둘 중 하나가 실제로 발생한 뒤다.

- 한 쿠폰에 **여러 대상 규칙**을 걸어야 한다 (→ `coupon_target` 필요)
- 한 쿠폰에 **여러 발급 조건**을 걸어야 한다 (→ `coupon_issue_condition` 필요)

단일 대상·단일 조건이면 JSON 컬럼 하나로 충분하다.

### 4-2. `coupon_type` 을 쪼갠다

현재 한 컬럼이 **목적**과 **발급 방식**을 겸하고 있다(§1-2). 다운로드를 추가하면 `coupon_type='DOWNLOAD'` 같은 값을 만들고 싶어지는데, 그러면 "이벤트 목적의 다운로드 쿠폰"을 표현할 수 없다. **축을 분리한다.**

```text
coupon_type      목적 분류      NEW_SIGNUP · EVENT · SEASON · SPECIAL   (기존 유지, 라벨화)
issue_method     발급 방식      AUTO_SIGNUP · ADMIN · CODE · DOWNLOAD   (신규)
benefit_type     혜택 유형      FIXED · PERCENT                          (신규, 2차)
                               + SHIPPING_FREE · SHIPPING_FIXED         (신규, 2차 — 배송비 문서 §2-3)
```

> **호환 주의.** `NEW_SIGNUP` 은 지금 자동발급 트리거로 **동작**하고 있다(`routes/auth.js:341`).
> `issue_method` 를 넣는 마이그레이션에서 기존 3건을 다음과 같이 백필한 뒤, `auth.js` 의 조회 조건을
> `coupon_type='NEW_SIGNUP'` → `issue_method='AUTO_SIGNUP'` 으로 **함께** 바꿔야 한다.
>
> ```sql
> UPDATE coupons SET issue_method = CASE
>   WHEN coupon_type='NEW_SIGNUP' THEN 'AUTO_SIGNUP'
>   WHEN coupon_type='SPECIAL'    THEN 'CODE'
>   ELSE 'ADMIN' END;
> ```
> 이 두 변경을 나눠서 배포하면 **회원가입 쿠폰 지급이 끊긴다**(개발 DB = 운영 DB).

### 4-3. 무료배송 쿠폰 — 배송비를 먼저 만든다 (개정 2026-07-10)

레퍼런스 §9 는 MVP 혜택으로 정액·정률·**무료배송**을 든다. 이 저장소에는 배송비 개념이 **아직** 없다.

```text
orders 컬럼        배송비 컬럼 없음 (total_amount / subtotal_amount / coupon_discount / point_used)
checkoutController 배송비 계산 코드 0건
cartController     배송비 계산 코드 0건
DB                 배송비 테이블 없음 (shipments 는 송장 추적 전용)
views/user/checkout/form.ejs:132   배송비가 "0원" 정적 문자열로 하드코딩
```

**그러나 이것은 "기능이 없다"가 아니라 "고지한 정책이 미구현이다"이다.** `views/user/guide.ejs:68-84` 는 고객에게 **"5만원 이상 무료, 미만 시 3,000원 / 제주 +3,000원 / 도서산간 +5,000원"** 을 이미 안내하고 있다.

**결정: 배송비는 선행 과제로 승격한다. 없으니 만든다.**
상세 설계는 **[`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md)** 가 소유한다. 쿠폰 문서는 그 결과에 올라탄다.

| 쿠폰 문서에서의 위치 | 내용 |
|---|---|
| **0.5차 (선행)** | `shipping_policy` · `orders.shipping_fee` — 배송비 문서 §8-1 이 소유 |
| 2차 편입 | `benefit_type` 에 `SHIPPING_FREE` · `SHIPPING_FIXED` |
| 2차 편입 | `orders.shipping_coupon_id` — **주문 쿠폰 1장 + 배송비 쿠폰 1장** (§6-1 개정) |

> **배송비도 서버가 계산한다.** 폼·쿼리스트링에서 받으면 **C3 와 같은 결함을 하나 더 만드는 것**이다.
> 그래서 **C3 수정이 배송비의 선행 조건**이다(배송비 문서 §1-1).

### 4-4. 몰 스코프

`coupons` 에 `mall_id` 가 없다. 현재 mall 1(건강식품)·mall 2(종합관)가 **같은 쿠폰을 공유**한다. 가입 자동지급은 그래도 무해하지만, **다운로드 쿠폰존은 몰마다 달라야 한다**(mall 2 는 라이브 중이다).

**결정: `coupons.mall_id INT NULL` 을 추가한다. `NULL` = 전 몰 공용.** 기존 3건은 `NULL` 로 백필해 현행 동작을 보존한다. 쿠폰존 조회는 `WHERE mall_id IS NULL OR mall_id = ?`.

---

## 5. 데이터 모델 (단계별)

### 5-1. 0차 — 결함 수정 (스키마 변경 없음)

C1~C6 은 코드 수정이다. C7 은 §5-2 의 상태 컬럼으로 해결한다.

### 5-2. 1차 — 다운로드 쿠폰존 + 몰 스코프 + 상태

```sql
ALTER TABLE coupons
  ADD COLUMN mall_id            INT NULL AFTER id,                    -- NULL = 전 몰 공용
  ADD COLUMN issue_method       ENUM('AUTO_SIGNUP','ADMIN','CODE','DOWNLOAD')
                                NOT NULL DEFAULT 'ADMIN' AFTER coupon_type,
  ADD COLUMN status             ENUM('DRAFT','ACTIVE','PAUSED','ENDED')
                                NOT NULL DEFAULT 'ACTIVE' AFTER is_active,
  ADD COLUMN download_start_at  DATETIME NULL,                        -- 수령 가능 기간
  ADD COLUMN download_end_at    DATETIME NULL,                        -- (사용 기간 valid_* 과 별개)
  ADD COLUMN issue_limit        INT NULL,                             -- NULL = 무제한 (선착순 수량)
  ADD COLUMN issued_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN valid_days         INT NULL,                             -- 발급일 기준 상대 유효기간
  ADD KEY idx_coupons_download (issue_method, status, download_end_at);

ALTER TABLE user_coupons
  MODIFY COLUMN issued_by ENUM('AUTO','ADMIN','CODE','DOWNLOAD','EVENT') NOT NULL,
  ADD COLUMN expires_at DATETIME NULL AFTER issued_at;                -- valid_days 계산 결과
```

**설계 근거 4가지.**

1. **`download_*` 기간과 `valid_*` 기간은 다르다.** "7월 한 달 받아서 8월까지 쓴다"가 성립해야 한다.
2. **`issue_limit`/`issued_count` 는 `max_total_uses` 와 다르다.** 전자는 **수령** 한도(선착순), 후자는 **사용** 한도다. 레퍼런스 §3-5 가 둘을 구분한다.
3. **`valid_days`** — 레퍼런스 §3-5 의 "발급 후 유효기간". `user_coupons.expires_at` 에 계산 결과를 박아 넣는다. 조회 시 `COALESCE(uc.expires_at, c.valid_to)`.
4. **`status`** 가 C7 을 해결한다. 쿠폰은 삭제하지 않고 `ENDED` 로 종료한다. `is_active` 는 하위호환용으로 남기되 `status` 에서 파생시킨다.

> **`is_active` 와 `status` 의 이중화를 피하려면** 1차에서 `is_active` 를 읽는 모든 코드
> (`auth.js:341`, `checkoutController.js:252,314`, `admin/couponController.js:217`)를 `status='ACTIVE'` 로
> 함께 바꾸고 `is_active` 를 제거하는 편이 낫다. 사용 이력이 0건인 지금이 그 비용이 가장 싸다.

### 5-3. 2차 — 정률 할인 + 적용 범위

```sql
ALTER TABLE coupons
  ADD COLUMN benefit_type        ENUM('FIXED','PERCENT') NOT NULL DEFAULT 'FIXED' AFTER issue_method,
  ADD COLUMN discount_rate       DECIMAL(5,2) NULL,        -- PERCENT 일 때
  ADD COLUMN max_discount_amount INT NULL,                 -- PERCENT 필수 (§4-2 레퍼런스 권고)
  ADD COLUMN scope_json          JSON NULL;                -- 포함/제외 규칙
```

`discount_amount` 는 `FIXED` 전용으로 남긴다. `scope_json` 은 레퍼런스 §3-3 의 형태를 그대로 쓴다.

```json
{ "include": { "categoryIds": [10, 20], "brandIds": [100] },
  "exclude": { "productIds": [10001], "badges": ["DEADLINE_SALE"] } }
```

> **정률 쿠폰에는 `max_discount_amount` 를 강제한다.** 관리자 폼에서 `benefit_type='PERCENT'` 이면
> 필수 입력으로 검증한다. 없으면 고액 주문에서 할인이 무한정 커진다.

> **C6 의 죽은 `percent` 분기**(`coupons.ejs:28`)는 이 단계에서 비로소 살아난다. 그 전까지는 제거해 둔다.

### 5-4. 3차 이후 — 유보

`coupon_target` · `coupon_issue_condition` · `coupon_usage` 분리, `combination_group`/`stackable`/`priority`, 상품 쿠폰(`PRODUCT` scope), 무료배송(`SHIPPING`). §4-1 · §4-3 의 조건이 충족된 뒤 착수한다.

---

## 6. 핵심 설계 결정

### 6-1. 쿠폰 적용 개수 — 1차 1장, 2차부터 ORDER 1 + SHIPPING 1 (개정 2026-07-10)

`orders.user_coupon_id` 가 단수라는 것은 현재 서비스의 정책이다. **1차에서는 유지한다.** 화면에도 "쿠폰은 1장만 사용할 수 있습니다"를 표기한다.

**그러나 2차에 배송비 쿠폰이 들어오면 이 제약은 유지될 수 없다.**

```text
5,000원 할인 쿠폰을 쓰면  →  무료배송 쿠폰을 쓸 수 없다
무료배송 쿠폰을 쓰면      →  5,000원 할인 쿠폰을 쓸 수 없다
```

어느 쇼핑몰도 이렇게 동작하지 않는다. 레퍼런스 §4 도 "배송비 쿠폰 + 상품 쿠폰 = 허용"으로 명시한다.

**결정: 조합 그룹(`combination_group`)의 최소 구현.**

| 그룹 | 저장 위치 | 시점 |
|---|---|---|
| `ORDER` | `orders.user_coupon_id` | 기존 |
| `SHIPPING` | `orders.shipping_coupon_id` | **2차** (배송비 문서 §3) |
| `PRODUCT` | `order_coupons` 조인 테이블 | 3차 — 부분취소 배분 선행 |

두 장을 초과하는 다중 적용(`stackable`·`max_stack_count`·`priority`)은 3차다. 그러나 **ORDER 1 + SHIPPING 1 은 2차에 반드시 포함한다.** 컬럼 하나로 해결되고, 없으면 무료배송 쿠폰이 무의미하다.

### 6-2. 쿠폰 상태 머신 (현실 버전)

레퍼런스 §5 의 7종을 다 만들지 않는다. **`RESERVED` 와 `RESTORED` 두 개만 추가**하면 C1·C2 가 함께 해결된다.

```text
발급 ──▶ AVAILABLE ──▶ RESERVED ──▶ USED
              ▲            │           │
              │            │ 주문 취소·결제 실패
              └────────────┴───────────┘
                        RESTORED (= AVAILABLE 로 복귀)

                    기간 경과 ──▶ EXPIRED
                    관리자 회수 ──▶ REVOKED   (3차)
```

**컬럼으로 표현한다** — 별도 status enum 을 만들지 않는다.

| 상태 | 판정 |
|---|---|
| AVAILABLE | `used_at IS NULL AND reserved_order_id IS NULL AND NOW() <= expires_at` |
| RESERVED | `used_at IS NULL AND reserved_order_id IS NOT NULL` |
| USED | `used_at IS NOT NULL` |
| EXPIRED | `used_at IS NULL AND NOW() > expires_at` |

```sql
ALTER TABLE user_coupons
  ADD COLUMN reserved_order_id INT NULL AFTER order_id,
  ADD COLUMN reserved_at       DATETIME NULL,
  ADD KEY idx_uc_reserved (reserved_order_id);
```

**점유(C2 해결)** — 주문 생성(PENDING) 시:

```sql
UPDATE user_coupons
   SET reserved_order_id = ?, reserved_at = NOW()
 WHERE id = ? AND user_id = ? AND used_at IS NULL AND reserved_order_id IS NULL;
-- affectedRows = 0  →  "이미 다른 주문에 사용 중인 쿠폰입니다"
```

**확정** — 결제 성공 트랜잭션에서 `used_at=NOW(), order_id=?, reserved_order_id=NULL`.

**복원(C1 해결)** — 주문 취소·결제 실패 시:

```sql
UPDATE user_coupons
   SET used_at = NULL, order_id = NULL, reserved_order_id = NULL, reserved_at = NULL
 WHERE (order_id = ? OR reserved_order_id = ?);
```

> **복원 정책.** 유효기간이 이미 지난 쿠폰은 복원해도 쓸 수 없다. 레퍼런스 §6 대로
> **복원은 하되 만료 여부는 별도 판정**한다(만료 쿠폰을 되살리지 않는다). 복원 여부를
> `system_settings` 의 `coupon_restore_on_cancel` 로 켜고 끌 수 있게 한다.

> **점유 해제 배치.** PENDING 상태로 방치된 주문의 `reserved_order_id` 는 영원히 남는다.
> 30분 이상 PENDING 인 주문의 점유를 푸는 배치가 필요하다(3차, 또는 조회 시 `reserved_at` 나이로 무시).

### 6-3. `UNIQUE(user_id, coupon_id)` 는 걸지 않는다 — gnb 문서 결정 수정

gnb `§7-2` 는 중복 수령 방지를 위해 `UNIQUE(user_id, coupon_id)` 를 제안했고, 기존 19건에 중복 쌍이 0건임도 확인했다. **그러나 이 제약은 현행 관리자 재발급 경로를 깨뜨린다.**

```text
admin/couponController.js:259-262
  → 중복 검사 조건이 `used_at IS NULL` 이다.
  → 즉 "이미 사용한 쿠폰은 같은 회원에게 다시 발급할 수 있다"가 현행 사양이다.
  → UNIQUE(user_id, coupon_id) 를 걸면 이 재발급이 DB 레벨에서 실패한다.
```

또한 "월간 쿠폰팩"처럼 **같은 쿠폰을 매달 다시 받는** 운영은 이 제약과 영구히 충돌한다.

**결정: 전역 UNIQUE 대신, 다운로드 수령 경로에만 조건부 제약을 건다.**

```sql
-- 1) 수령 슬롯 확보 (선착순) — event 모듈과 동일 패턴
UPDATE coupons
   SET issued_count = issued_count + 1
 WHERE id = ? AND issue_method = 'DOWNLOAD' AND status = 'ACTIVE'
   AND (issue_limit IS NULL OR issued_count < issue_limit)
   AND NOW() BETWEEN COALESCE(download_start_at, NOW()) AND COALESCE(download_end_at, NOW());
-- affectedRows = 0  →  마감 또는 기간 종료

-- 2) 중복 수령 차단 — 같은 쿠폰을 이미 보유(미사용)하면 실패시킨다
INSERT INTO user_coupons (user_id, coupon_id, issued_by, expires_at)
SELECT ?, ?, 'DOWNLOAD', ?
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM user_coupons WHERE user_id = ? AND coupon_id = ? AND used_at IS NULL
 );
-- affectedRows = 0  →  '이미 받은 쿠폰입니다'. 이 경우 1) 의 issued_count 를 롤백해야 한다.
```

> ⚠️ **위 `NOT EXISTS` 는 경쟁 조건에 진다.** 동시 요청 두 개가 모두 `NOT EXISTS` 를 통과할 수 있다.
> 반드시 **1)·2) 를 한 트랜잭션에 묶고**, `SELECT ... FOR UPDATE` 로 해당 `(user_id, coupon_id)` 를 잠그거나,
> 다운로드 전용 보조 테이블 `coupon_download(user_id, coupon_id)` 에 `UNIQUE` 를 걸어
> **DB 제약으로 막는다**(권장). 애플리케이션 체크만으로는 이벤트 모듈에서 이미 겪은 문제를 반복한다.
>
> ```sql
> CREATE TABLE coupon_download (
>   user_id   INT NOT NULL,
>   coupon_id INT NOT NULL,
>   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
>   PRIMARY KEY (user_id, coupon_id),
>   CONSTRAINT fk_cd_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
>   CONSTRAINT fk_cd_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
> );
> ```
> 이렇게 하면 **다운로드는 1인 1회**로 DB 가 보장하고, 관리자 재발급·이벤트 지급은 자유롭다.
> 축이 다른 두 정책을 한 제약에 묶지 않는 것이 요점이다.

> **타입 주의.** `users.id`·`coupons.id` 는 **`int`** 다. 참조 컬럼을 `bigint` 로 두면 FK 생성이 실패한다.

---

## 7. 사용자 화면 설계

### 7-1. 쿠폰존 `/coupon` — 받는 곳 (1차, 신규)

**역할 분리가 이 화면의 존재 이유다.**

```text
GNB 쿠폰         /coupon           = 받는 곳 (다운로드)
마이페이지 쿠폰함   /mypage/coupons   = 보는 곳 (보유)
```

```text
┌──────────────────────────────────────────────┐
│ 쿠폰                          [내 쿠폰함 →]   │
│ 받아서 바로 사용하세요                          │
├──────────────────────────────────────────────┤
│ [탭]  전체 | 신규회원 | 이벤트 | 시즌           │  ← coupon_type 분류
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ 5,000원 할인               [  받기  ]    │ │
│ │ 3만원 이상 구매 시                        │ │
│ │ 받은 날부터 7일 · 선착순 1,000명 (342 남음)│ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ 1,000원 할인               [  받음  ] 비활성│ │
│ │ ~2026.07.31                               │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [쿠폰 코드 입력]  ______________  [등록]      │  ← C5 해결
└──────────────────────────────────────────────┘
```

**버튼 상태 (5종)**

| 상태 | 조건 | 버튼 |
|---|---|---|
| 받기 | 수령 가능 | 활성 |
| 받음 | `coupon_download` 에 행 존재 | 비활성 "받음" |
| 마감 | `issued_count >= issue_limit` | 비활성 "선착순 마감" |
| 종료 | `NOW() > download_end_at` | 비활성 "종료" |
| 로그인 필요 | 비로그인 | 클릭 시 로그인 유도 |

**비로그인**은 목록 열람 가능, 수령 시 로그인 유도. `POST /coupon/:id/claim` 은 `ensureAuthenticated`.

**0건 폴백** — 다운로드 가능 쿠폰이 0건이면 `user/coming_soon` 렌더(gnb §4-2 의 배포 안전장치). **쿠폰 마스터가 3건뿐이고 그중 다운로드 쿠폰은 0건이므로, 관리자에서 먼저 등록해야 화면이 의미를 갖는다.**

**쿠폰 코드 입력(C5)** — 기존 데드 엔드포인트를 재활용하되, 체크아웃이 아니라 **쿠폰존으로 옮긴다**. 결제 도중에 코드를 입력하는 것보다 쿠폰함에 미리 담는 흐름이 자연스럽고, 체크아웃 트랜잭션도 단순해진다.

### 7-2. 마이페이지 쿠폰함 `/mypage/coupons` (개선)

현행 3구분(사용가능·사용완료·기간만료)에 **RESERVED** 를 더한다.

| 표시 | 조건 |
|---|---|
| 사용 가능 | AVAILABLE |
| **주문 진행 중** | RESERVED — "주문 #12345 에 사용 중" |
| 사용 완료 | USED — 주문번호 링크 |
| 기간 만료 | EXPIRED |

- 정렬: 사용가능(만료임박순) → 진행중 → 사용완료 → 만료
- 만료 임박(3일 이내) 강조
- `expires_at` 이 있으면 그것을, 없으면 `coupons.valid_to` 를 표시(§5-2 의 `COALESCE`)
- **C6 의 죽은 `percent` 분기 제거** (2차에서 `benefit_type='PERCENT'` 로 부활)

### 7-3. 체크아웃 (개선)

- 쿠폰 선택 모달에서 **적용 가능/불가 사유를 명시**한다: "3만원 이상 구매 시 사용 가능 (현재 24,000원)"
- **1장 제약을 화면에 표기**한다
- 쿠폰 선택 시 즉시 예상 할인액 표시
- 주문 생성 시 §6-2 의 점유 UPDATE. 실패하면 "이미 다른 주문에 사용 중"
- **`max_total_uses` 를 재검증한다**(C4)
- **`getComplete` 의 쿼리스트링 쿠폰 재적용 제거**(C3) — 서버가 PENDING 주문에서 직접 읽는다

### 7-4. 장바구니 (3차)

"쿠폰 적용 시 예상 금액" 미리보기 — **3차**(§13-1). 단 **배송비와 무료배송 임박 게이지는 0.5차에 포함**된다(배송비 문서 §5-2).

---

## 8. 관리자 화면 설계

### 8-1. 쿠폰 목록 (개선)

기존 컬럼(발행한도·지급수·잔여)에 더한다.

| 컬럼 | 비고 |
|---|---|
| 쿠폰명 / 코드 | |
| 몰 | `mall_id` — "전 몰 공용" 또는 몰 이름 |
| 혜택 | `5,000원` 또는 `10% (최대 2만원)` (2차) |
| 발급 방식 | 자동가입 · 관리자 · 코드 · **다운로드** |
| 상태 | DRAFT · ACTIVE · PAUSED · ENDED |
| 수령 | `issued_count / issue_limit` (다운로드) |
| 사용 | `used / issued` + **사용률 %** ← 현재 미표시 |
| 기간 | 수령기간 / 사용기간 2줄 |

**필터**: 쿠폰명·코드, 발급 방식, 상태, 몰, 기간. **삭제 대신 `ENDED` 로 종료**(C7).

### 8-2. 쿠폰 등록/수정 폼 (확장)

현행 9필드 → 섹션 구조로 재편한다.

```text
[기본 정보]     쿠폰명 · 목적(coupon_type) · 몰 · 상태 · 운영 메모
[혜택]          혜택유형(정액/정률) · 할인값 · 최대할인액 · 최소주문금액
                ※ 정률이면 최대할인액 필수 (§5-3)
[발급]          발급방식(자동가입/관리자/코드/다운로드)
                └ 코드    → 쿠폰 코드
                └ 다운로드 → 수령기간 · 선착순 수량
[사용 조건]     사용기간(절대) 또는 발급 후 N일(valid_days) · 전체 사용한도
[적용 대상]     (2차) 포함/제외 — 카테고리 · 브랜드 · 상품 · 뱃지
```

**발급 방식에 따라 필드를 동적으로 노출**한다. 지금처럼 `SPECIAL` 일 때만 `code` 를 보여주는 방식(`form.ejs:32`)을 `issue_method` 기준으로 확장한다.

### 8-3. 지급 화면 (유지 + 보강)

`postIssue` 는 이미 견고하다(§1-3). 두 가지만 더한다.

- **이벤트 연동** — `event_coupon` 테이블은 이미 있으나 지급 코드가 없다(gnb §8-1 E13). 이 지급 경로를 `eventService` 에서 재사용하고 `issued_by='EVENT'` 를 남긴다.
- **`expires_at` 계산** — `valid_days` 가 설정된 쿠폰은 지급 시점 기준으로 계산해 박는다.

### 8-4. 발급·사용 통계 (신규)

현재 `getList` 가 이미 `issued_count`·`used_count`·`unused_count` 를 집계하지만 **화면에 사용률을 띄우지 않는다.** 쿠폰 상세에 요약 카드를 붙인다.

```text
수령 342 / 1,000 (34.2%)      사용 87 / 342 (25.4%)      총 할인액 435,000원
```

총 할인액은 `orders.coupon_discount` 를 `user_coupon_id` 로 조인해 합산한다.

---

## 9. 중복 할인 정책

레퍼런스 §4 의 계산 순서를 단계별 도달 목표로 삼는다.

| 레퍼런스 단계 | 현행 | 시점 |
|---|---|---|
| 1. 상품 기본 할인 | ✅ `products.discount_rate` | — |
| 2. 상품 쿠폰 | ❌ scope 개념 부재 | **3차** — 부분취소 배분 선행 |
| 3. 장바구니·주문 쿠폰 | ✅ 1장 | — |
| 4. 배송비 쿠폰 | ❌ | **2차** — 0.5차 선행 |
| 5. 적립금·예치금 | ✅ `orders.point_used` | — |
| 6. 결제수단 할인 | ❌ | 보류 (§13) |

**2차 완료 시점의 계산식** (배송비 문서 §4 와 동일해야 한다):

```text
subtotal_amount              상품 할인 적용 후 상품 금액 합계
  − coupon_discount          주문 쿠폰 (ORDER)
  − point_used               적립금
  + shipping_fee             배송비 — subtotal_amount 기준 판정 (쿠폰 차감 전)
  − shipping_discount        배송비 쿠폰 (SHIPPING). shipping_fee 를 초과할 수 없다
  = total_amount
```

> **무료배송 판정은 쿠폰 차감 전 금액으로 한다.** 5만원어치를 담고 5천원 쿠폰을 썼더니
> 배송비 3,000원이 생기는 것은 쿠폰 사용을 벌하는 정책이다. 배송비 문서 §1-2 가 소유한다.

**현행 실제 순서** (`checkoutController.js:464`):

```text
totalAmount = MAX(0, subtotal − couponDiscount − pointUsed)
```

즉 쿠폰과 적립금이 같은 단계에서 단순 차감된다. 상품 쿠폰(`PRODUCT` scope)이 들어오는 순간 이 식은 **부분 취소 시 배분 계산**(레퍼런스 §6)을 요구한다.

```text
상품별 주문 쿠폰 배분액 = 주문 쿠폰 총 할인액 × 상품별 쿠폰 대상 금액 ÷ 전체 쿠폰 대상 금액
```

`order_items` 에 `coupon_discount_amount` 컬럼이 필요하다.

**부분 취소는 만들어야 한다** — 쇼핑몰에 없을 수 없는 기능이고, 현재 취소는 전체 취소뿐이다. 다만 **상품 쿠폰보다 먼저** 와야 한다. 순서가 뒤집히면 부분 취소 시 할인액을 되돌릴 근거가 없어진다. 그래서 상품 쿠폰이 3차인 것이지, 필요 없어서가 아니다(§13).

---

## 10. 개발 계획

### 10-1. 배포 순서 (푸시 = 즉시 운영 배포)

```text
1. 스키마 마이그레이션      (기존 동작 보존하는 백필 포함)
2. 관리자 화면 배포          (운영자가 다운로드 쿠폰을 등록할 수 있어야 한다)
3. 쿠폰 1건 실제 등록·발행
4. 고객 라우트 교체          (0건이면 comingSoon 폴백)
```

§4-2 의 `issue_method` 백필과 `auth.js` 수정은 **같은 배포에 묶는다.** 나누면 회원가입 쿠폰 지급이 끊긴다.

**배송비와의 순서** — 두 작업은 `total_amount` 계산식을 공유하므로 다음 순서를 지킨다.

```text
0차 C3 (총액을 서버가 권위 있게 계산)
 └─▶ 0.5차 배송비            (= 배송비 문서 1차)
 └─▶ 1차   다운로드 쿠폰존     ← 총액 계산 무관. 0.5차와 병행 가능
      └─▶ 2차 정률 · 적용범위 · 무료배송 쿠폰   (= 배송비 문서 2차와 같은 작업)
```

C3 는 0.5차·1차 **둘 모두의 선행**이다. 쿠폰 1차는 총액 계산을 건드리지 않으므로 배송비와 병행할 수 있다.

### 10-2. 체크리스트

#### 10-2-0. 0차 — 결함 수정 (신규 기능보다 먼저)

- [x] **C3** `getComplete` 의 결제 우회 차단 🔴🔴 — `isTest` 를 `req.query.test` 에서 분리, 쿠폰·포인트를 PENDING 주문 행에서만 읽기, 불필요하면 라우트 제거 (**최우선**)
- [x] **C1** 주문 취소 시 쿠폰 복원 (`mypageController` 고객 취소 · `admin/orderController` 관리자 취소) 🔴
- [x] **C4** `postForm` 할인 재검증에 `max_total_uses` 추가 🟠
- [x] **C6** `views/user/mypage/coupons.ejs:28` 의 죽은 `percent` 분기 제거 🟡
- [x] C1 검증 — 취소 후 쿠폰함에서 "사용 가능"으로 복귀, 만료된 쿠폰은 복원하되 사용 불가

> C2(RESERVED)·C5(코드 UI)·C7(삭제/상태)는 스키마가 필요하므로 1차에서 함께 처리한다.
> **C8(배송비 미청구)은 [`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md) §8-1 이 소유한다.**

#### 10-2-1. 1차 — 다운로드 쿠폰존 (GNB `/coupon`)

- [x] **D1** 마이그레이션 — `coupons` ALTER(`mall_id`·`issue_method`·`status`·`download_*`·`issue_limit`·`issued_count`·`valid_days`), `user_coupons` ALTER(`issued_by` enum 확장·`expires_at`·`reserved_order_id`·`reserved_at`), `coupon_download` 테이블 생성
- [x] **D2** 백필 + `auth.js` · `checkoutController` · `admin/couponController` 의 `coupon_type`/`is_active` 참조를 `issue_method`/`status` 로 **동시** 교체 (§4-2)
- [x] **D3** 관리자 폼 재편 — 발급 방식별 동적 필드, 다운로드 설정(수령기간·선착순 수량)
- [x] **D4** 관리자 목록 — 몰·발급방식·상태·수령/사용률 컬럼, 삭제 대신 `ENDED` 종료
- [x] **D5** 다운로드 쿠폰 1건 실제 등록·발행
- [x] **D6** 고객 쿠폰존 `/coupon` — `controllers/couponController.js`, `views/user/coupon/list.ejs`, 0건 폴백
- [x] **D7** 수령 액션 `POST /coupon/:id/claim` — 트랜잭션 · `coupon_download` PK 로 중복 차단 · `issued_count` 선착순 `affectedRows` 판정 (§6-3)
- [x] **D8** 쿠폰 코드 입력 UI 를 쿠폰존으로 이관 (C5) — 기존 `POST /checkout/apply-coupon-code` 재활용
- [x] **D9** RESERVED 점유 (C2) — 주문 생성 시 점유, 결제 확정 시 USED, 취소 시 해제
- [x] **D10** 마이페이지 쿠폰함에 "주문 진행 중" 상태 추가 · 만료임박 강조
- [x] **D11** `routes/feature.js` 의 `comingSoon('coupon')` 교체
- [x] **D12** 동시 요청 검증 — `issued_count` 가 `issue_limit` 을 넘지 않는지, 같은 회원 2회 수령 차단, 같은 쿠폰 2개 주문 동시 점유 차단
- [x] **D13** 받은 쿠폰이 `/mypage/coupons` 와 체크아웃에 노출되는지 확인

#### 10-2-2. 2차 — 정률 할인 + 적용 범위 + 무료배송 쿠폰

- [x] **P1** `coupons` ALTER — `benefit_type` · `discount_rate` · `max_discount_amount` · `scope_json`
- [x] **P2** 관리자 폼 — 정률 입력 + **최대 할인액 필수 검증**
- [x] **P3** 할인 계산기 분리 — `services/coupon/discountCalculator.js` (정액/정률 + 최대할인 상한 + 절사)
- [x] **P4** `scope_json` 적용 — 카테고리·브랜드·뱃지 포함/제외 판정
- [x] **P5** 쿠폰함·체크아웃·쿠폰존에 정률 표시 (C6 의 `percent` 분기 부활)
- [x] **P6** 검증 — 정률 쿠폰이 최대 할인액을 넘지 않는지, 제외 대상 상품만 담긴 장바구니에서 적용 불가 판정
- [x] **P7** `benefit_type` 에 `SHIPPING_FREE` · `SHIPPING_FIXED` 추가
- [x] **P8** `orders.shipping_coupon_id` — **주문 쿠폰 1장 + 배송비 쿠폰 1장** 동시 적용 (§6-1)
- [x] **P9** `shipping_discount ≤ shipping_fee` 상한 강제
- [x] **P10** 쿠폰존·쿠폰함·체크아웃에 배송비 쿠폰 표시
- [x] **P11** 검증 — 무료배송 쿠폰이 배송비를 초과 할인하지 않는지, 할인 쿠폰과 배송비 쿠폰 동시 적용

> **선행: 0.5차 배송비** ([`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md) §8-1).
> 배송비 쿠폰의 **체크박스는 이 문서(P7~P11)가 소유**한다. 배송비 문서 §8-3 은 참조일 뿐이다.

#### 10-2-3. 3차 — 연기 (해제 조건 명시)

각 항목의 **해제 조건**을 적는다. "필요 없어서"가 아니라 "선행이 있어서" 미룬 것들이다. 전체 판정은 §13.

- [ ] **부분 취소** — 쇼핑몰 필수 기능. 현재 전체 취소만 존재. `order_items.coupon_discount_amount` 배분 포함 → *해제 조건: 없음. 3차 최우선*
- [ ] **상품 쿠폰(`PRODUCT` scope)** → *해제 조건: 부분 취소 배분 완료*
- [ ] **다중 쿠폰 (3장 이상)** — `order_coupons` + `combination_group`·`stackable`·`priority` → *해제 조건: 상품 쿠폰 도입*
- [ ] **발급 조건 확장** (등급·누적구매·생일·휴면) → *해제 조건: `user_grade` 테이블* (gnb §8-5)
- [ ] **`coupon_target`·`coupon_issue_condition` 분리** → *해제 조건: 한 쿠폰에 다중 대상 규칙 또는 다중 발급 조건이 실제로 필요해질 때* (§4-1)
- [ ] **PENDING 점유 해제 배치** (30분 초과) → *해제 조건: 없음. 1차에서는 조회 시 `reserved_at` 나이로 무시해 대응*
- [ ] **관리자 쿠폰 회수(`REVOKED`) · 변경 이력** → *해제 조건: 없음*
- [ ] **반품 배송비 청구** → *해제 조건: 반품 모듈* (배송비 문서 §8-3)

---

## 11. 재사용 자산

| 필요 | 있는 것 | 위치 |
|---|---|---|
| 선착순 수량 경쟁조건 처리 | `event` 모듈의 조건부 `UPDATE ... affectedRows` 패턴 | `services/event/eventService.js:127-143` |
| 중복 참여 DB 제약 | `event_participant` 의 `UNIQUE(event_id,user_id)` + `ER_DUP_ENTRY` 처리 | `services/event/eventService.js:150-153` |
| 0건 준비중 폴백 | `user/coming_soon` + `COMING_SOON` 맵 | `routes/feature.js:125-138` |
| 관리자 지급 경로 | `postIssue` (검증·중복방지·한도 확인) | `controllers/admin/couponController.js:209-294` |
| 쿠폰 선택 모달 | `views/partials/coupon_modal.ejs` | 체크아웃 |
| 쿠폰함 3구분 표시 | `views/user/mypage/coupons.ejs` | RESERVED 추가만 하면 됨 |
| 이벤트 쿠폰 연결 | `event_coupon` 테이블 (지급 코드는 없음) | gnb §8-1 E13 |

---

## 12. 미결 사항

| # | 항목 | 선택지 | 비고 |
|---|---|---|---|
| 1 | `is_active` 제거 여부 | (A) `status` 로 일원화 **권장** / (B) 이중 유지 | 사용 이력 0건인 지금이 가장 싸다 |
| 2 | 다운로드 쿠폰 재수령 | (A) 1인 1회 영구 **권장** / (B) 기간별 재수령 | (B)면 `coupon_download` 에 회차 컬럼 필요 |
| 3 | 취소 시 복원 기본값 | (A) 복원 **권장** / (B) 미복원 | `system_settings.coupon_restore_on_cancel` |
| 4 | 만료 후 취소된 주문의 쿠폰 | (A) 복원하되 사용 불가 **권장** / (B) 유효기간 연장 재발급 | 레퍼런스 §6 |
| 5 | 절사 단위 | 1원 / 10원 / 100원 | 정률 도입(2차) 시 결정 |
| 6 | 쿠폰존 몰 스코프 | `mall_id IS NULL OR = ?` **권장** | §4-4 |
| 7 | 무료배송 시 지역 할증 | (A) 기본료만 면제 **권장** / (B) 전액 무료 | 배송비 문서 §7-1 이 소유 |

---

## 13. 범위 결정 (2026-07-10)

**판정 기준은 "지금 코드에 있는가"가 아니라 "쇼핑몰로서 필요한가"이다.** 없으면 만든다. 없다는 사실은 미루는 근거가 아니라 **만들어야 한다는 근거**다.

배송비가 그 대표 사례였다 — "배송비 개념이 없으므로 무료배송 쿠폰은 범위 밖"이라는 초안의 판정은 **틀렸다.** 배송비는 이미 고객에게 고지된 정책이고, 없는 것은 구현일 뿐이다.

> **단계 라벨 정의.** 이 문서의 **0.5차 = [`shipping_fee_design_and_development.md`](./shipping_fee_design_and_development.md) 의 1차**(§8-1)다.
> 두 문서를 오갈 때 이 대응만 기억하면 된다. 아래 표와 §13-3 은 이 문서 기준(0차 ~ 3차)으로 통일한다.

### 13-1. 만든다 — 시점만 다르다

| 항목 | 시점 | 선행 조건 | 근거 |
|---|---|---|---|
| **총액 서버 계산 (C3 수정)** | **0차** | 없음 | 결제 우회 결함. 배송비·쿠폰 모든 총액 작업의 토대 |
| **취소 시 쿠폰 복원 (C1)** | 0차 | 없음 | 취소하면 쿠폰이 소멸한다 |
| **배송비 (기본료·무료배송 기준)** | **0.5차** | C3 | **고지한 정책이 미구현.** 별도 문서 §8-1 |
| 다운로드 쿠폰존 `/coupon` | 1차 | 없음 | GNB 메뉴가 준비중 랜딩 |
| RESERVED 점유 (C2) | 1차 | 없음 | 같은 쿠폰이 두 주문에 걸린다 |
| 쿠폰 코드 입력 UI (C5) | 1차 | 없음 | 백엔드는 이미 있다 |
| 쿠폰 상태(`ENDED`) (C7) | 1차 | 없음 | 삭제 대신 종료 |
| **정률 할인** | 2차 | 없음 | 레퍼런스 MVP 필수 |
| **적용 범위 (`scope_json`)** | 2차 | 없음 | 카테고리·브랜드 쿠폰 |
| **지역 할증 (제주·도서산간)** | 2차 | 우편번호 대역 **데이터를 만든다** | 고지된 정책 |
| **무료배송 쿠폰** | 2차 | 0.5차 배송비 | 레퍼런스 MVP 필수 |
| **주문 쿠폰 1장 + 배송비 쿠폰 1장** | 2차 | 위 항목 | 없으면 무료배송 쿠폰이 무의미 (§6-1) |
| **부분 취소** | 3차 | 없음 | 쇼핑몰 필수. 3차 최우선 |
| 상품 쿠폰 (`PRODUCT`) | 3차 | 부분 취소 배분 | 배분 없이 넣으면 되돌릴 근거가 없다 |
| 다중 쿠폰 (3장+) | 3차 | 상품 쿠폰 | `order_coupons` + `combination_group` |
| 발급 조건 (등급·누적구매·생일) | 3차 | `user_grade` | gnb §8-5 |
| 반품 배송비 | 3차 | 반품 모듈 | 배송비 문서 §8-3 |
| 쿠폰 회수 · 변경 이력 | 3차 | 없음 | 운영 요구 발생 시 앞당김 |
| 장바구니 쿠폰 미리보기 | 3차 | 없음 | 배송비 게이지는 1차에 포함 |

### 13-2. 보류 — 되살릴 조건을 함께 적는다

**"제외"가 아니라 "지금은 다른 것이 담당한다"이다.** 조건이 성립하면 언제든 범위에 넣는다.

| 항목 | 지금 하지 않는 이유 | 되살릴 조건 |
|---|---|---|
| **적립금 지급 쿠폰** | 적립금 시스템이 이미 있다(`orders.point_used`, `users.points_balance`). "쿠폰으로 적립금을 준다"는 **그릇이 맞지 않는다** — 이벤트 참여 보상이나 구매 적립이 자연스럽다 | 쿠폰과 무관하게 적립 지급 트리거가 필요해지면, 이벤트 모듈(gnb §8-1 E13)에서 처리 |
| **사은품 쿠폰** | 사은품 재고·배송 모델이 없다. 사은품을 `products` 로 다룰지 별도 마스터로 둘지가 먼저다 | 사은품 마스터 + 주문 동봉 모델을 정의하면 착수 |
| **Buy X Get Y** | 장바구니 규칙 엔진이 필요하다. 현재 장바구니는 단순 합계만 계산한다 | 장바구니 프로모션 엔진 도입 시 |
| **수량 할인 (2개 구매 시 10%)** | **공동구매 모듈**(`group_buy`)이 유사 기능을 담당한다. 쿠폰으로 중복 구현하면 두 곳에서 가격이 갈린다 | 공동구매와 별개의 상시 수량 할인 요구가 생기면 |
| **결제수단 할인 (카드사 할인)** | PG·카드사 제휴 영역이다. Toss Payments 연동 범위 밖 | 카드사 제휴가 실제로 맺어지면 |
| **사용 채널 제한 (앱 전용)** | 앱이 없다 | 앱 출시 시 |
| **판매자 쿠폰** | 입점형(오픈마켓)이 아니다. `products` 에 판매자 개념이 없다 | 입점형으로 전환하면 |
| **정책 엔진 5테이블** | 쿠폰 3건·사용 0건. `coupons` 컬럼 확장으로 충분하다 (§4-1) | 한 쿠폰에 **다중** 대상 규칙 또는 **다중** 발급 조건이 필요해질 때 |

### 13-3. 이 결정의 형태

```text
0차   C3 결제 우회 차단 · C1 쿠폰 복원                    ← 결함. 신규 기능보다 먼저
0.5차 배송비 (기본료 · 무료배송 기준)                      ← 고지된 정책의 구현
1차   다운로드 쿠폰존 · RESERVED · 코드 UI · 상태          ← 총액 계산 무관, 병행 가능
2차   정률 · 적용범위 · 지역할증 · 무료배송 쿠폰 · 쿠폰 2장  ← 0.5차 선행
3차   부분취소 → 상품쿠폰 → 다중쿠폰 (이 순서를 지킨다)
보류  적립금·사은품·BuyXGetY·수량·결제수단·채널·판매자·정책엔진
```
