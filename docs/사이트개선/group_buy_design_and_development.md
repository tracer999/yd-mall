# 공동구매 관리 및 사용자 화면 설계/개발 설계

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.

---

## 완료되어 이관된 항목

1차 범위인 **단순 공동구매형** 전량이 구현·이관됐다.

| 항목 | 이관된 문서 |
|---|---|
| 고객 `/group-buy` 목록 · 상세 · 바로구매 | `docs/develop_guide/user/promotions.md` · `docs/manual/admin/group_buys.md` |
| 상태 2층 구조(운영 `status` + 파생 `phase`) | `docs/develop_guide/admin/group_buys.md` |
| 카드 12항목 표기 | `docs/develop_guide/user/promotions.md` |
| 정렬 5종 | `docs/develop_guide/user/promotions.md` |
| 관리자 CRUD · 상품 · 참여자 관리 | `docs/develop_guide/admin/group_buys.md` · `docs/manual/admin/group_buys.md` |
| `group_buy_participation` 결제 트랜잭션 내 기록 | `docs/develop_guide/admin/group_buys.md` |
| 참여 이력 있는 공동구매 삭제 차단 | `docs/develop_guide/admin/group_buys.md` |

---

## 잔여 과제

1. **장바구니 담기** — 현재 바로구매만 지원. `carts` 테이블에 가격 · 옵션 컬럼이 없어 공동구매가를 실을 자리가 없다.
2. **옵션/SKU 선택** — 몰에 옵션 테이블 자체가 없다.
3. **목표 달성형 / 단계별 가격형** — 2 · 3차 범위.
4. **`minimum_success_quantity` · `fail_policy` 컬럼 미도입** — 목표 미달 처리 · 자동 취소 로직이 없다.
5. **혜택 영역(전용 쿠폰 · 사은품 · 카드 혜택)** — `group_buy_coupon` 테이블 미생성.
6. **유의사항 전용 테이블(`group_buy_notice`) 미생성** — `group_buy.notice` TEXT 컬럼 1개로 대체 중.
7. **상단 배너 / 카테고리 필터 / 관리자 목록 필터 확장** — 관리자 목록 필터는 현재 상태 + 상품명뿐.
8. **이벤트 로그 · 성과 통계** 미구현.

---

## 알려진 결함

- ⚠️ **`per_user_limit_quantity`(1인 구매 제한)가 작동하지 않는다.**
  관리자 폼(`views/admin/group-buys/edit.ejs:311`)에서 값을 저장할 수는 있지만,
  `services/groupBuy/groupBuyService.js` 의 `resolveLine()`(:330-378)이 이 값을 **읽지 않는다** — min/max 수량과 재고만 검사한다.
  운영자가 "제한이 걸려 있다"고 오인할 수 있으므로 우선 처리 대상이다. (쇼핑라이브도 동일 문제)
