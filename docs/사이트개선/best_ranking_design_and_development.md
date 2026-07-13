# 베스트/랭킹 설계 및 개발

> **작성**: 2026-07-13 (세션 F)
> **상태**: 1차 구현 완료 (스키마 · 집계 엔진 · 배치 · 고객 화면 · 관리자 화면)
> **참고 화면**: `docs/사이트개선/capture/best2.png`

---

## 0. 이 문서가 뒤집는 것

세션 E 는 베스트를 **관리자 수동 큐레이션**(상품그룹 manual)으로 확정했다. **그 결정이 뒤집혔다.**

| | 세션 E (폐기) | 세션 F (현행) |
|---|---|---|
| 베스트 | 관리자가 상품그룹에서 직접 고름 | **판매·좋아요 합산 자동 랭킹** |
| 랭킹 | 베스트와 별개 메뉴(미착수) | **베스트가 곧 랭킹**. 이름을 `베스트/랭킹` 으로 통합 |
| 홈 베스트 | 수동 상품그룹(`product_group` 1·9) | **같은 랭킹 스냅샷** |
| MD 픽 | (개념 없음) | `best_pin` — 자동 랭킹 위에 수동 고정 |

> 사용자 지시: "베스트는 랭킹과 같은 기능이다. 랭킹은 추후 다른 메뉴로 구성한다."
> 즉 지금의 `/best` 가 랭킹 엔진이고, 나중에 생길 `/ranking` 은 **같은 엔진을 다른 화면으로** 태운다.

---

## 1. 점수 산식

```text
점수 = 판매수량 × 5  +  좋아요 × 3  +  조회수 × 0
```

가중치는 `best_score_config`(몰별)에서 조정한다. 관리자 `/admin/best-groups` 에서 편집.

**동점은 누적 조회수로 가른다.** 조회 가중치가 0 이어도 정렬 tie-break 에는 쓴다.
안 그러면 상품 id 순으로 줄 세운 무의미한 랭킹이 나온다 — 현재 실데이터가 거의 전부 0점이기 때문이다
(PAID 주문 11건 · 주문된 상품 1종 · 좋아요 11건). 실적이 쌓이면 자연히 판매·좋아요가 상위로 올라온다.

> ⚠️ **조회수는 누적값이다**(`products.view_count`). 기간별 조회 로그가 없어 기간 창을 적용할 수 없다.
> `weight_view` 를 0 보다 크게 올리면 **일간·실시간 랭킹에도 누적 조회수가 섞인다.**
> 기간별 조회를 쓰려면 `product_view_daily` 집계 테이블이 선행돼야 한다.

**매출로 인정하는 주문 상태**: `PAID` · `PREPARING` · `SHIPPED` · `DELIVERED`.
`PENDING`(미결제) · `CANCELLED` · `REFUNDED` 는 제외한다.

---

## 2. 기간

| 기간 | 창 |
|---|---|
| 실시간 | 최근 1시간 |
| 일간 | 최근 24시간 |
| 주간 | 최근 7일 |
| 월간 | 최근 30일 |

기간은 **산출 시점 기준 롤링 윈도우**다(달력 경계가 아니다). `calculated_at` 이 화면의 "07/13 13시 기준"이 된다.

---

## 3. 그룹(탭)

`best_group` 이 고객 화면의 탭이 된다. **타입이 곧 집계 대상 선정 방식**이다.

| type | 대상 |
|---|---|
| `ALL` | 몰 전체 상품 |
| `CATEGORY` | `ref_id` 카테고리 (`include_descendants=1` 이면 하위 트리 포함) |
| `BRAND` | `ref_id` 브랜드 (`categories.type='BRAND'`) |
| `CUSTOM` | `condition_json` 조건 — **2차. 현재 산출하지 않는다** |

> ⚠️ **카테고리·브랜드를 전부 그룹으로 만들지 않는다.** mall2 에 카테고리 365 + 브랜드 1,354 가 있다.
> 전부 탭으로 만들면 빈 랭킹 탭이 수천 개 생긴다. 운영자가 **노출할 탭만** 고른다.
> 시드는 `ALL` + 1뎁스 NORMAL 카테고리만 넣었다(mall1 12개 · mall2 15개).

`CUSTOM` 은 빈 조건을 '전체'로 해석하지 **않는다**. 운영자가 실수로 만든 빈 그룹이 전체 랭킹이 되는 걸 막는다.

---

## 4. MD 픽 (`best_pin`) — 자동 위에 얹는 수동

베스트는 기본이 자동이지만, MD 가 미는 상품을 임의로 올릴 수 있어야 한다.

### 🔴 핀은 스냅샷에 굽지 않는다. **조회 시점에 얹는다.**

스냅샷(`best_ranking`)에 구워 넣으면 MD 가 상품을 밀어도 **다음 배치가 돌 때까지 안 보인다.**
핀은 즉시 반영돼야 하는 운영 행위다. 그래서 `bestRankingService.mergePins()` 가 조회할 때마다 병합한다.

병합 규칙:

1. 핀 상품이 자동 랭킹에도 있으면 **자동 쪽을 제거**한다(중복 노출 방지).
2. `pin_rank` 가 있으면 그 자리에 꽂는다(1 = 1위).
3. `pin_rank` 가 없는 핀은 맨 앞에 `sort_order` 순으로 붙인다.
4. 결과를 **1..N 으로 재번호**한다 — 화면의 순위 번호는 항상 연속이어야 한다.
   (스냅샷의 `rank_no` 는 자동 순위일 뿐 최종 노출 순위가 아니다)

핀은 **기간과 무관하게 그룹 단위로** 적용한다. MD 픽은 "이 탭에서 밀 상품"이지 "이 기간에만 밀 상품"이
아니다. 기간별로 나누고 싶으면 `best_pin` 에 `period` 컬럼을 추가한다.

`start_at`·`end_at` 을 벗어난 핀은 무시한다 — 끄는 걸 잊어도 알아서 빠진다.

---

## 5. 성별 · 나이대 — **구조만 선행**

`best_ranking` 에 `gender`·`age_band` 컬럼이 있지만 **현재 배치는 `('ALL','ALL')` 한 조합만 채운다.**

이유: **`users` 에 성별 컬럼이 없었다.** 이번에 `users.gender`(기본 `UNKNOWN`)를 추가했으나
**수집 경로가 없다** — 카카오/구글 OAuth 는 동의항목을 추가해야 성별을 준다. 생년월일도 30명 중 19명뿐.

그래서:

- 고객 화면의 성별·연령 셀렉트는 **비활성(disabled)** 으로 렌더한다.
- 활성 여부는 코드에 박지 않는다. `best_ranking` 에 `gender <> 'ALL'` 행이 **하나라도 생기면 저절로 켜진다**
  (`bestController.segmentsAvailable`). 배치만 확장하면 화면·스키마는 그대로다.

> ⚠️ **전조합(그룹 × 기간 × 성별 × 나이)을 미리 채우지 마라.** 빈 셀만 폭증한다.
> 세그먼트는 실제로 데이터가 있는 조합만 산출한다.

---

## 6. 구성 요소

```text
scripts/migrate_best_ranking.sql        스키마 5종 + 시드 + users.gender
scripts/migrate_best_home_section.sql   홈 섹션 전환 (🔴 배포 후 실행)
scripts/calc_best_ranking.js            배치 (cron)

services/best/bestRankingService.js     엔진 — calculate*() 는 배치용, getRanking() 은 화면용
services/display/resolvers/best_ranking.js   홈 섹션 리졸버

controllers/bestController.js           고객  /best · /best/tab
controllers/admin/bestGroupController.js 관리자 /admin/best-groups

views/user/best/index.ejs               고객 — 배너·그룹탭·기간탭·세그먼트
views/user/best/_ranking_list.ejs       고객 — 순위 그리드 (AJAX 로 갈아끼우는 조각)
views/admin/best_groups/list.ejs        관리자 — 집계상태·가중치·탭 목록
views/admin/best_groups/detail.ejs      관리자 — MD 픽 + 미리보기
```

### 테이블

| 테이블 | 역할 |
|---|---|
| `best_group` | 탭 정의 (ALL/CATEGORY/BRAND/CUSTOM) |
| `best_score_config` | 몰별 가중치 (판매 5 / 좋아요 3 / 조회 0) |
| `best_ranking` | **산출 스냅샷.** 배치가 쓰고 화면이 읽는다 |
| `best_pin` | MD 픽. 조회 시점에 병합 |
| `best_ranking_run` | 집계 이력 (관리자 "마지막 집계 N분 전") |

---

## 7. 배치

```bash
set -a; . /etc/environment; set +a
node scripts/calc_best_ranking.js                 # 전 몰 · 전 기간
node scripts/calc_best_ranking.js --mall 2
node scripts/calc_best_ranking.js --period DAILY
```

cron 권장 — **기간별로 주기가 다르다.** 월간을 10분마다 돌릴 이유가 없다.

```cron
*/10 * * * *  node scripts/calc_best_ranking.js --period REALTIME
5 * * * *     node scripts/calc_best_ranking.js --period DAILY
20 3 * * *    node scripts/calc_best_ranking.js --period WEEKLY
40 3 * * *    node scripts/calc_best_ranking.js --period MONTHLY
```

실측: 몰당 기간 1회에 0.7~1.1초 (mall2 = 9,677 상품 × 15 그룹).

산출은 **(그룹, 기간) 슬롯 통째 교체**다(부분 갱신 아님). 그래야 그룹에서 빠진 상품의 옛 순위가 안 남는다.
직전 순위(`prev_rank_no`)는 지우기 전에 읽어 둔다 — 화면의 순위 변동(▲▼) 표시가 여기서 나온다.

---

## 8. 🔴 배포 순서 (dev DB = prod DB)

```text
1) git push                                   ← 코드 배포
2) node scripts/calc_best_ranking.js          ← 스냅샷 채우기
3) UPDATE admin_menus SET is_active=1 WHERE path='/admin/best-groups';
4) mysql < scripts/migrate_best_home_section.sql   ← 홈 베스트를 랭킹으로 전환
5) cron 등록
```

**순서를 지켜야 하는 이유**

- `admin_menus` 를 먼저 켜면 운영 관리자에게 **404 링크**가 뜬다(라우트 미배포).
- `migrate_best_home_section.sql` 을 먼저 실행하면 **운영 홈이 깨진다.**
  `page` 1·4 에는 발행 스냅샷(`page_revision`)이 없어 `displayService` 가 **라이브 `page_section` 으로
  폴백**한다 → UPDATE 가 운영에 즉시 반영되는데, 구 코드에는 `best_ranking` 섹션 타입이 없다.
- 배치를 안 돌리고 홈 섹션만 바꾸면 스냅샷이 비어 **섹션이 통째로 스킵**된다(빈 그리드 미노출 규약).

---

## 9. 이미 반영된 DB 변경 (2026-07-13 실행 완료)

```text
✅ best_* 테이블 5종 생성 + 시드 (그룹 27 · 가중치 2행)
✅ users.gender 컬럼 추가 (기본 UNKNOWN)
✅ admin_menus '베스트/랭킹 관리' 삽입 — is_active = 0 (배포 후 켤 것)
✅ feature_menu / mall_feature_menu 표시명 → '베스트/랭킹'
✅ 초회 집계 실행 (7,692 행)
```

미실행: `migrate_best_home_section.sql` (배포 후).

---

## 10. 다음 (2차)

```text
[ ] 성별·나이대 세그먼트 — OAuth 동의항목으로 users.gender 수집 → 배치 확장
[ ] 기간별 조회수 (product_view_daily) — 조회 가중치를 실제로 쓰려면 선행
[ ] CUSTOM 그룹 — condition_json 스키마 확정 (뱃지·가격대 등 "특정 조건 베스트 그룹")
[ ] /ranking 별도 메뉴 — 같은 엔진, 세로 순위 리스트 화면
[ ] 급상승 랭킹 — prev_rank_no 델타가 이미 저장돼 있다. 화면만 만들면 된다
```

---

## 11. 배운 것

### 11-1. 자동/수동은 이분법이 아니다

세션 E 는 "문서는 자동이라는데 사용자는 수동을 원한다"로 뒤집혔고, 세션 F 는 다시 자동으로 뒤집혔다.
정답은 **자동을 기본으로 하되 수동으로 개입할 구멍(MD 픽)을 두는 것**이었다.
"자동인가 수동인가"를 물을 때 **"둘 다면 어느 쪽이 기본인가"** 까지 물었어야 했다.

### 11-2. 즉시성이 저장 위치를 정한다

핀을 스냅샷에 구울지 조회 시점에 병합할지는 성능 문제로 보이지만 **운영 문제**다.
MD 가 상품을 밀고 나서 "왜 안 보이죠?"라고 묻게 만들면 그 기능은 실패다.
**얼마나 빨리 보여야 하는가**가 어디에 쓸지를 결정한다.

### 11-3. 데이터가 없으면 정렬이 무의미해진다

"판매 5점 + 좋아요 3점"은 옳은 산식이지만, 실데이터가 거의 0이라 **그대로 쓰면 id 순 나열**이 된다.
가중치 0인 항목(조회수)을 **tie-break 에만** 쓰는 것으로 화면을 살렸다.
산식을 어기지 않으면서 빈 화면을 피하는 지점이 있었다.
