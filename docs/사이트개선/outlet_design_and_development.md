# 아울렛(Outlet) 설계 — 선택형 모듈 · 몰 안의 몰

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| `outlet_product` · `outlet_setting` 테이블 | `docs/develop_guide/admin/outlet.md` |
| `categories.type='OUTLET'` | `docs/develop_guide/admin/outlet.md` |
| 할인 사유 7종 · 상품 등급 · 하자 고지 검증 | `docs/develop_guide/admin/outlet.md` · `docs/manual/admin/outlet.md` |
| 관리자 `/admin/outlet` + 아울렛 카테고리 + 상품 검색 모달 | `docs/develop_guide/admin/outlet.md` · `docs/manual/admin/outlet.md` |
| 고객 `/outlet` — 3축 필터 · 정렬 5종 | `docs/develop_guide/user/promotions.md` |
| 상품 상세 하자 고지 블록 | `docs/develop_guide/user/promotions.md` |
| `show_in_normal_list` 일반 목록 분리 | `docs/develop_guide/admin/outlet.md` |
| 콘텐츠 게이트 (+ GROUP_BUY · LIVE 확장) | `docs/develop_guide/admin/outlet.md` |

---

## 잔여 과제

계획 범위는 사실상 전량 완료됐다. 남은 것은 아래 결함 처리뿐이다.

---

## 알려진 결함

- **몰 프리셋 재적용 시 아울렛 메뉴가 꺼진다.**
  `services/mall/presets.js` 의 `featureMenus` 목록에 OUTLET · GROUP_BUY · LIVE 가 빠져 있다.
  그 결과 신규 몰(mall 6)은 이 3개 메뉴가 전부 `is_enabled=0` 이다.
  (원문 §7-4 의 경고가 여전히 유효하다.)

---

## 폐기된 결정

원문 §1-4 의 **"결정 2 — OUTLET 을 `module_ready=0` 으로 내린다"** 는 **실행되지 않았다.**
대신 **콘텐츠 게이트**(콘텐츠가 없으면 메뉴를 자동으로 숨김)가 채택됐고, `module_ready` 는 `1` 이다.
