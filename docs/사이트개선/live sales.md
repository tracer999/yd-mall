# 쇼핑라이브(Live Shopping) — 설계 및 개발 계획서

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.

---

## 완료되어 이관된 항목

1차 MVP(S1~S4) 전량이 구현·이관됐다.

| 항목 | 이관된 문서 |
|---|---|
| `live_show` 계열 4테이블 | `docs/develop_guide/admin/lives.md` |
| 방송 상태 5종 수동 전환 | `docs/develop_guide/admin/lives.md` · `docs/manual/admin/lives.md` |
| 영상 URL 파싱 · 호스트 화이트리스트 | `docs/develop_guide/admin/lives.md` |
| 고객 `/live` 목록 · 상세 3탭 · 하단 고정 바로구매 바 | `docs/develop_guide/user/promotions.md` |
| 바로구매 + checkout 재계산 + `source_type='LIVE_SHOW'` | `docs/develop_guide/user/promotions.md` |
| 관리자 `/admin/lives` — 상품 · 쿠폰 · 공지 CRUD | `docs/develop_guide/admin/lives.md` · `docs/manual/admin/lives.md` |
| 주문 있는 라이브 삭제 차단 | `docs/develop_guide/admin/lives.md` |

---

## 잔여 과제

1. **홈 `live_carousel` SDUI 섹션** — 계획상 2차.
2. **장바구니 담기 · Q&A** — 2차.
3. **이벤트 로그 · 성과 대시보드** — 3차.

---

## 알려진 결함

1. ⚠️ **라이브 상품을 저장할 때마다 `per_user_limit_quantity` 가 null 로 덮어써진다.**
   `views/admin/lives/edit.ejs` 에 해당 입력 필드가 **없는데도**
   `controllers/admin/liveController.js`(:561, :573)는 이 컬럼을 UPDATE 문에 포함한다.
2. ⚠️ **1인 구매 제한이 검증되지 않는다.**
   `liveService.resolveLine()`(:468-515)이 회원 누적 구매량을 조회하지 않는다 — min/max 수량과 재고만 검사한다.
   (공동구매도 동일한 문제)
3. **라이브가에는 쇼핑특가가 겹쳐 적용되지 않는다**(`source_type='LIVE_SHOW'`).
   라이브가를 특가보다 비싸게 잡으면 고객이 손해를 본다 — 운영 주의사항으로 유지한다.
