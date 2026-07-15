# 추천 · 전문관 — 신규 GNB 메뉴 2종 설계 및 개발 계획서

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| 추천 랜딩 4섹션(개인화 · 그룹 · MD · 많이보는) | `docs/develop_guide/user/promotions.md` |
| 추천 근거 문구 · 비로그인 CTA · noindex | `docs/develop_guide/user/promotions.md` |
| 관리자 `/admin/recommend-groups` | `docs/develop_guide/admin/recommend.md` · `docs/manual/admin/recommend.md` |
| 전문관 = `exhibition_type='SPECIALTY'` 재사용(DDL 0) | `docs/develop_guide/admin/recommend.md` |
| `/specialty` 목록 · 상세 · 301 리다이렉트 | `docs/develop_guide/user/promotions.md` |
| GNB 메뉴 활성화 | `docs/develop_guide/admin/recommend.md` |

---

## 잔여 과제

1. **추천 랜딩 최상단 배너 슬롯 미구현** — 계획 §4-3 의 `group_key='menu:RECOMMEND'` 배너가 코드에 없다.
2. **규칙형 추천(`rule_json`)** — 계획상 3차.
3. **전문관 전용 상세 템플릿(CATEGORY_SHOP / BRAND_SHOP)** — 현재 전부 TAB_SHOP 으로 폴백된다.
4. **개인화 고도화(주문 · 좋아요 기반) · 매거진형** — 데이터 부족으로 보류.
5. **`recommend_group` 현재 0행** — 운영자 큐레이션이 아직 하나도 없다.

---

## 알려진 결함

- 원문 §5-5 는 "씨드 데이터를 코드로 넣지 않는다"고 못박았으나,
  `scripts/seed_recommend_specialty_demo.sql` 로 **전문관 7건이 DB 에 들어가 고객에게 그대로 노출 중**이다.
  운영 데이터로 승격할지, 정리할지 결정이 필요하다.

---

## 정정

GNB 슬롯 부족 해소는 계획서의 (A) · (B) 안이 아니라 **제3안**으로 처리됐다 —
쿠폰 메뉴를 유지하고 **RANKING · MEMBERSHIP 을 `is_enabled=0` 으로 내렸다.**
`max_gnb_items` 는 12 그대로다.
