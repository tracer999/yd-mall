# 쿠폰 관리 및 사용자 화면 설계/개발 설계

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료 항목의 설계 산문·DDL·체크리스트는 삭제했습니다. 원문은 git 이력에서 확인하세요.

---

## 완료되어 이관된 항목

| 차수 | 항목 | 이관된 문서 |
|---|---|---|
| 0차 | 결제 우회 차단(총액 서버 계산) · 취소 시 쿠폰 복원 · `max_total_uses` 재검증 | `develop_guide/user/checkout.md` |
| 1차 (D1~D13) | 다운로드 쿠폰존 `/coupon` · 쿠폰 수령 · 쿠폰 코드 등록 UI · RESERVED 30분 점유 · 쿠폰함 4상태(사용가능·사용완료·기간만료·취소) | `develop_guide/user/promotions.md` · `develop_guide/user/mypage.md` · `develop_guide/admin/coupons.md` |
| 2차 (P1~P11) | 정률 할인 · 최대 할인액 상한 · `scope_json` 적용범위(카테고리·브랜드) · 무료배송/배송비 쿠폰 · 주문쿠폰 1장 + 배송비쿠폰 1장 · 할인 계산기 분리(`services/coupon/discountCalculator.js`) | `develop_guide/admin/coupons.md` · `develop_guide/user/checkout.md` |
| 운영 | 쿠폰 등록·지급·통계 화면 사용법 | `manual/admin/coupons.md` |

### 원문 정정

원문 §7-1 의 *"다운로드 쿠폰이 0건이라 `/coupon` 은 준비중 랜딩"* 서술은 **낡았습니다.**
현재 `issued_by='DOWNLOAD'` 쿠폰 **5건이 ACTIVE** 이며 쿠폰존은 정상 렌더됩니다.

---

## 잔여 과제

원문 §13-1 의 **3차** 항목입니다. 순서(**부분취소 → 상품쿠폰 → 다중쿠폰**)를 지킵니다.

| # | 항목 | 선행 / 해제 조건 |
|---|---|---|
| 1 | **부분 취소 시 쿠폰 안분** — `order_items.coupon_discount_amount` 배분 | 없음. **3차 최우선.** 배분이 없으면 부분 취소·부분 클레임을 되돌릴 근거가 없다 |
| 2 | **상품 단위 쿠폰 (`PRODUCT` scope)** | 1번(부분 취소 배분) 선행 — 배분 없이 넣으면 되돌릴 근거가 없다 |
| 3 | **다중 쿠폰 (3장 이상)** — `order_coupons` 테이블 + `combination_group` | 2번(상품 쿠폰) 선행 |
| 4 | **발급 조건 확장** (등급·누적구매·생일) | `user_grade` 도입 |
| 5 | **`coupon_target` · `coupon_issue_condition` 테이블 분리** | 한 쿠폰에 **다중** 대상 규칙 또는 **다중** 발급 조건이 필요해질 때. 그전까지는 `coupons` 컬럼 확장 + `scope_json` 으로 충분 |
| 6 | **쿠폰 회수(REVOKED) · 변경 이력** | 없음. 운영 요구 발생 시 앞당김 |
| 7 | **반품 배송비 (쿠폰 연계)** | 반품 모듈 — [`order_claim_design_and_development.md`](./order_claim_design_and_development.md) |
| 8 | **장바구니 쿠폰 미리보기** | 없음. (장바구니 배송비 게이지는 완료) |

### 보류 — 되살릴 조건

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

---

## 알려진 결함

### `coupons.issued_count` 드리프트

회원 삭제 시 FK CASCADE 가 `user_coupons` 행만 지우고 **`coupons.issued_count` 카운터를 되돌리지 않는다.**

- 실측 — 쿠폰 `id=1`: `issued_count = 21` vs 실제 `user_coupons` **19행**.
- 현재 이 쿠폰은 `issue_limit = NULL` 이라 **무해**하다.
- 그러나 **선착순 쿠폰(`issue_limit` 설정)** 에서 회원 삭제가 반복되면 발급 한도가 **조기 소진**된다.
- 처리 방향: 회원 삭제 트랜잭션에서 `issued_count` 를 감산하거나, `issue_limit` 판정을 카운터가 아닌 `COUNT(user_coupons)` 실측으로 전환한다.
