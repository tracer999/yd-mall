# 베스트/랭킹 설계 및 개발

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 원문의 점수 산식·스키마·배포 순서·체크리스트는 이관 후 삭제했습니다.

---

## 완료되어 이관된 항목

**1차 전부 완료.** 아래가 전부 이관됐다.

| 항목 | 이관된 문서 |
|---|---|
| 점수 산식(판매 ×5 + 좋아요 ×3 + 조회 ×0, 조회수 tie-break) · 가중치 `best_score_config` | `develop_guide/admin/best_groups.md` |
| 기간 4종 (실시간 / 일간 / 주간 / 월간, 롤링 윈도우) | `develop_guide/admin/best_groups.md`, `develop_guide/user/best.md` |
| 그룹 3종 (`ALL` / `CATEGORY` / `BRAND`) | `develop_guide/admin/best_groups.md` |
| MD 픽(`best_pin`) — **조회 시점 병합**(스냅샷에 굽지 않음) | `develop_guide/admin/best_groups.md` |
| 슬롯 통째 교체 + `prev_rank_no` 보존 | `develop_guide/admin/best_groups.md` |
| 배치 CLI (`scripts/calc_best_ranking.js`) | `develop_guide/admin/best_groups.md` |
| 관리자 화면 `/admin/best-groups` (집계상태·가중치·탭·MD 픽) | `develop_guide/admin/best_groups.md`, `manual/admin/best.md` |
| 고객 화면 `/best` + 홈 `best_ranking` 섹션 전환 | `develop_guide/user/best.md` |

---

## 원문 정정 (원문이 틀렸다)

| 원문 | 실제 |
|---|---|
| §9 "미실행: `migrate_best_home_section.sql` (배포 후)" | **실행 완료.** 홈에 `best_ranking` 섹션이 실재한다 (mall 1 · 2 · 6) |
| §7 "cron 4줄 등록 (기간별로 주기가 다르다)" | **크론 1줄 + DB 스케줄 테이블(`best_ranking_schedule`)** 방식으로 대체됐다. 기간별 주기는 **관리자 화면에서 편집**한다. crontab 을 4줄로 늘리지 말 것 |

---

## 잔여 과제 (원문 §10 "2차")

| # | 과제 | 현재 상태 |
|---|---|---|
| 1 | **성별·나이 세그먼트 산출** | 구조는 완비(`best_ranking.gender`·`age_band`, `users.gender`). 배치가 `('ALL','ALL')` 한 조합만 채워 **데이터 0건** → 고객 화면 셀렉트가 자동 `disabled`. `gender <> 'ALL'` 행이 하나라도 생기면 `bestController.segmentsAvailable` 이 **저절로 켠다** — 배치만 확장하면 화면·스키마는 그대로다 |
| 2 | **CUSTOM 그룹 산출** | `best_group.type='CUSTOM'` 은 정의돼 있으나 `groupFilter()` 가 **산출에서 제외**한다. `condition_json` 스키마(뱃지·가격대 등) 확정이 선행 |
| 3 | **급상승 랭킹 화면** | `prev_rank_no` 는 배치가 이미 저장 중. **화면만 만들면 된다** |

**선행 조건 (원문에서 보존)**

- 세그먼트 산출을 켜려면 **성별 수집 경로**가 먼저 필요하다. 카카오/구글 OAuth 동의항목을 추가해야 성별을 준다. 생년월일도 회원 30명 중 19명뿐이다.
- ⚠️ **전조합(그룹 × 기간 × 성별 × 나이)을 미리 채우지 마라.** 빈 셀만 폭증한다. 실제 데이터가 있는 조합만 산출한다.
- ⚠️ `CUSTOM` 은 **빈 조건을 '전체'로 해석하지 않는다.** 운영자가 실수로 만든 빈 그룹이 전체 랭킹이 되는 걸 막기 위한 의도적 설계다.

---

## 폐기된 계획 (되살리지 말 것)

| 폐기 항목 | 이유 |
|---|---|
| **`/ranking` 별도 메뉴** | `/best` 로 **301 통합**됐다. `mall_feature_menu` 에서 OFF. 같은 엔진을 두 화면으로 태우지 않는다 |
| **`product_view_daily` 기간별 조회수 집계** | `best_ranking` 스냅샷 배치가 대신한다. 조회 가중치(`weight_view`)를 0 보다 올리면 일간·실시간 랭킹에도 **누적 조회수**(`products.view_count`)가 섞인다는 점만 유의 |

---

## 알려진 결함

| # | 결함 | 영향 |
|---|---|---|
| 1 | **`weight_view` > 0 시 기간 오염** | `products.view_count` 는 누적값이라 기간 창을 적용할 수 없다. 조회 가중치를 올리면 실시간·일간 랭킹에 누적 조회수가 섞인다. 기본값 0 을 유지할 것 |
| 2 | **실데이터 희박** | PAID 주문·좋아요가 적어 대부분의 상품이 0점이다. 조회수 tie-break 가 없으면 id 순 나열이 된다 — tie-break 를 제거하지 말 것 |
