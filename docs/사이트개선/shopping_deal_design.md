# 쇼핑특가 (Shopping Deal) 설계서

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료 항목의 설계 산문·DDL·구현 순서는 삭제했습니다. 원문은 git 이력에서 확인하세요.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| 스키마 3종 (`deal_category` · `deal` · `deal_item`) | `develop_guide/admin/deals.md` |
| read-time 활성 판정 (`dealService.ACTIVE_WHERE` — 기간·시간창·요일·선착순) · 스케줄러 없음 | `develop_guide/admin/deals.md` |
| 동일 상품 중복 특가 우선순위 (`priority DESC, deal_price ASC, id ASC`) | `develop_guide/admin/deals.md` |
| 유효가 리졸버 3형태 — `applyDeals` · `dealJoinSql` · `resolveForProducts` | `develop_guide/admin/deals.md` |
| 결제 반영 (`source_type='DEAL'`) + 선착순 수량 소진 · 취소 시 복원 | `develop_guide/user/checkout.md` |
| `/deals` · `/deals/:code` 페이지 + `/deal/today` 301 리다이렉트 + GNB `SHOPPING_DEAL` 전환 | `develop_guide/user/promotions.md` |
| 홈 `deal_carousel` 섹션 (활성 특가 0건이면 섹션 자동 소멸) | `develop_guide/user/promotions.md` |
| 관리자 2화면 (`/admin/deal-categories` · `/admin/deals`) + 검증 4종 | `develop_guide/admin/deals.md` · `manual/admin/deals.md` |
| 표시 경로 retrofit 14곳 (`applyDeals` 삽입) | `develop_guide/admin/deals.md` |

---

## 잔여 과제

원문 §8 이 **인지하고 넘긴 한계**다. 전부 금전 사고가 아니라 노출·UX 거칠기다.

| # | 한계 | 내용 / 해제 조건 |
|---|---|---|
| 1 | **가격순 정렬에 특가 미반영** | `/products?sort=price_asc` 는 여전히 `products.price` 로 SQL 정렬한 뒤 페이지 안에서만 특가가로 덮는다. 특가 상품이 가격순 상단으로 올라오지 않는다. `dealJoinSql()` 을 기존 6개 정렬 지점에 **retrofit 하지 않았다** → *해제 조건: 없음. 필요해지면 점진 적용* |
| 2 | **선착순 예약(reserve) 없음** | `deal_item.sold_qty` 는 **결제 확정 시점**에만 깎인다. 잔여 1개인데 여러 명이 동시에 주문서를 열면 먼저 결제한 사람만 성공하고 나머지는 결제 직후 취소(환불)된다. 재고와 동일한 동작이지만 "선착순"치고는 거칠다 → *해제 조건: 별도 예약 모듈* |
| 3 | **`cartController.checkoutAll` 우회** | 두 번째 주문 생성 경로. 재고를 차감하지 않는 기존 결함이 있어 선착순 특가에서 오버셀 구멍이 된다. 현재는 **특가 상품이 장바구니에 있으면 정규 `/checkout?cart=1` 로 유도**하는 것으로 대응 중. 이 경로의 폐기는 별도 이슈 |

### 참고 — 유지되는 설계 제약

- 자정을 넘는 시간창(22:00 ~ 익일 02:00)은 **범위 밖**이며 `daily_end_time > daily_start_time` 검증으로 강제한다.
- 특가 × 쿠폰은 기본 **중복 적용**(특가가 기준, 쿠폰이 추가). 차단이 필요하면 쿠폰의 `scope_json.exclude.badges` 로 코드 변경 없이 운영 대응한다.
- 공동구매 라인은 특가 리졸버가 건드리지 않는다. **공동구매가가 특가를 이긴다.**
