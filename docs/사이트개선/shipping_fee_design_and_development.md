# 배송비 설계/개발 설계

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료 항목의 설계 산문·DDL·체크리스트는 삭제했습니다. 원문은 git 이력에서 확인하세요.

---

## 완료되어 이관된 항목

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

---

## 핵심 규칙 (요약만 유지 — 상세는 이관 문서로)

- **무료배송 판정은 쿠폰·적립금 차감 *전* 상품 금액(`subtotal_amount`) 기준.**
- **무료배송이어도 제주·도서산간 할증은 청구한다.** (기본료만 면제)
- 정책 행이 없으면 기본값 — 기본료 `3000` / 무료배송 기준 `50000` / 제주 `+3000` / 도서산간 `+5000`.
- `shipping_policy.is_active = 0` 이면 배송비 **전액 0**.

---

## 잔여 과제

원문 §8-4 의 **3차** 항목입니다.

- [ ] **부분 취소 시 배송비 안분** — 부분 취소로 무료배송 기준을 이탈하면 배송비 재판정 → *해제 조건: 부분 취소 모듈* (쿠폰 문서 3차 1번)
- [ ] **반품 배송비 소급 청구** → *해제 조건: 반품 모듈* ([`order_claim_design_and_development.md`](./order_claim_design_and_development.md))
- [ ] **묶음배송 (주문 합배송) · 상품별 개별 배송비 · 판매자별 배송** → *해제 조건: 입점형(오픈마켓) 전환*
- [ ] 배송비 조건부 무료 (특정 브랜드·카테고리) → *해제 조건: 없음. 운영 요구 시*

---

## 알려진 결함

### 스키마 드리프트 — `tables.sql` 누락

`tables.sql` 에 아래 정의가 **없다.** 마이그레이션 스크립트(`scripts/migrate_*.js`)에만 존재한다.

- `shipping_policy` 테이블
- `shipping_zipcode_zone` 테이블
- `orders.shipping_fee` 컬럼

→ `npm run init:db` 로 DB 를 새로 만들면 배송비 기능이 동작하지 않는다. `tables.sql` 동기화 필요.
