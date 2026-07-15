# 베스트/랭킹 관리 (Best Groups)

## 1. 개요

베스트/랭킹은 **배치가 점수를 산출해 스냅샷(`best_ranking`)에 굽고, 화면은 그 스냅샷을 읽고 그 위에 MD 픽(`best_pin`)을 얹는** 2단 구조입니다.

```
calculate*()  배치가 부른다. 점수를 산출해 best_ranking 에 쓴다. 느리다.
getRanking()  화면이 부른다. 스냅샷을 읽고 그 위에 핀을 얹는다. 빠르다.
```

- **왜 핀을 스냅샷에 굽지 않는가:** MD 가 상품을 밀면 **즉시** 보여야 합니다. 스냅샷에 구우면 다음 배치까지 안 보입니다. 그래서 핀은 **조회 시점에 병합**합니다(`mergePins`).
- **왜 점수를 저장하는가(매번 파생하지 않는가):** 화면이 "07/13 13시 기준"을 말하려면 그 시점의 값이 고정돼 있어야 합니다. 매 요청 재계산하면 기준 시각이 거짓말이 되고, 몰2(상품 9,677건)에서 느립니다.

> ⚠️ **자동 랭킹은 관리자가 편집하지 않습니다.** 배치가 만든 결과입니다. 순위를 바꾸고 싶으면 **핀**을 쓰세요. 스냅샷을 직접 고치면 다음 배치에 날아갑니다.

- **Base URL:** `/admin/best-groups` (`requireMenuAccess('/admin/best-groups')`)
- **관련 테이블:** `best_group`, `best_score_config`, `best_ranking`, `best_pin`, `best_ranking_run`, `best_ranking_schedule`
- **컨트롤러:** `controllers/admin/bestGroupController.js`
- **서비스:** `services/best/bestRankingService.js` (배치·화면 공용)
- **뷰:** `views/admin/best_groups/list.ejs`, `detail.ejs`
- **배치:** `scripts/calc_best_ranking.js`, `scripts/best_ranking_cron.sh`
- **고객 화면:** `/best`, `/best/tab` (`routes/feature.js:40-41`, `controllers/bestController.js`)
- **권한:** `admin_menus` id=50, parent_id=32(상품 관리), `visible_roles = super_admin,admin,content_admin`

> **몰 스코프 주의:** 관리자는 `req.adminMallId`, 스토어프론트는 `req.mallId` — **다른 세션 키입니다. 혼용 금지**(`bestGroupController.js:15`).

---

## 2. 라우트 (`routes/admin/best-groups.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/best-groups` | getList | 그룹(탭) 목록 + 가중치 + 스케줄 + 집계 이력 |
| POST | `/admin/best-groups` | postCreate | 그룹 추가 |
| POST | `/admin/best-groups/config` | postConfig | 점수 가중치 저장 |
| POST | `/admin/best-groups/schedule` | postSchedule | 집계 스케줄 저장 |
| POST | `/admin/best-groups/calculate` | postCalculate | **지금 집계** (동기, 전 기간) |
| GET | `/admin/best-groups/:id` | getDetail | 그룹 상세 — MD 픽 관리 + 랭킹 미리보기 |
| POST | `/admin/best-groups/:id` | postUpdate | 그룹 수정 |
| POST | `/admin/best-groups/:id/delete` | postDelete | 그룹 삭제 (랭킹·핀 CASCADE) |
| GET | `/admin/best-groups/:id/product-search` | getProductSearch | 핀 추가용 상품 검색 (JSON) |
| POST | `/admin/best-groups/:id/pins` | postAddPin | 핀 추가 |
| POST | `/admin/best-groups/:id/pins/:pinId` | postUpdatePin | 핀 수정 |
| POST | `/admin/best-groups/:id/pins/:pinId/delete` | postDeletePin | 핀 해제 |

고정 경로(`/config`, `/schedule`, `/calculate`)를 `/:id` 보다 **먼저** 선언합니다. Express 5 는 `:id(\d+)` 를 지원하지 않아, 뒤에 두면 `'config'` 가 `:id` 로 잡힙니다.

---

## 3. 그룹(탭)

고객 `/best` 화면의 **탭**이 곧 `best_group` 입니다.

| group_type | ref_id | 산출 대상 |
|------------|--------|-----------|
| ALL | NULL | 몰 전체 상품 |
| CATEGORY | `categories.id` | `p.category_id = ref_id`. **`include_descendants=1` 이면 하위 트리 포함**(최대 3뎁스라 재귀 CTE 없이 2단 IN) |
| BRAND | `categories.id`(type='BRAND') | `p.brand_category_id = ref_id` |
| **CUSTOM** | — | **산출에서 제외됩니다** (`groupFilter` 가 `null` 반환, `bestRankingService.js:85-90`). `condition_json` 스키마가 확정되기 전에는 빈 조건을 '전체'로 해석하면 운영자가 실수로 만든 그룹이 전체 랭킹이 되기 때문입니다. **관리자 폼의 선택지에도 없습니다**(`GROUP_TYPES` = ALL/CATEGORY/BRAND). |

- 탭 추가 폼의 카테고리·브랜드 선택지는 **이미 그룹이 있는 것을 제외**합니다(중복 탭 방지).
- 그룹을 추가해도 랭킹은 비어 있습니다 — **집계를 실행해야 채워집니다.**
- `best_group.ref_id` FK 는 `categories` 를 `ON DELETE CASCADE` 로 참조합니다. **카테고리·브랜드를 지우면 그 탭도 사라집니다.**

---

## 4. 점수 산출 (배치)

### 4.1 점수식 (`calculateGroupPeriod`, `bestRankingService.js:129`)

```
score = 판매수량 × weight_sales
      + 좋아요   × weight_like
      + 조회수   × weight_view
```

기본 가중치(`best_score_config`, **몰별**): `weight_sales=5`, `weight_like=3`, `weight_view=0`, `rank_limit=100`(상한 200).

- **동점 tie-break: 누적 조회수 → 상품 id DESC.** 조회 가중치가 0 이어도 **정렬 tie-break 에는 씁니다** — 안 그러면 상품 id 순으로 줄 세운 무의미한 랭킹이 나옵니다(현재 데이터는 거의 전부 0점).
- ⚠️ **조회수는 누적값(`products.view_count`)이라 기간 창이 적용되지 않습니다.** `weight_view` 를 0 보다 크게 올리면 **일간 랭킹에 누적 조회수가 섞입니다.**
- **매출 인정 주문 상태:** `PAID`, `PREPARING`, `SHIPPED`, `DELIVERED` (`SALES_STATUSES`). PENDING·CANCELLED·REFUNDED 제외. 기간 앵커는 `COALESCE(o.paid_at, o.created_at)`.
- **대상 상품 상태:** `p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')`

### 4.2 기간 (롤링 윈도우)

| period | 창 |
|--------|-----|
| REALTIME | 1시간 |
| DAILY (기본) | 24시간 |
| WEEKLY | 7일 |
| MONTHLY | 30일 |

"지금으로부터 거슬러 올라가는 시간"이지 달력 경계가 아닙니다.

### 4.3 슬롯 교체 (`calculateMall`)

(그룹 × 기간) 슬롯을 **통째 DELETE 후 INSERT** 합니다. 부분 갱신이 아니라 통째 교체여야 그룹에서 빠진 상품의 옛 순위가 남지 않습니다.

**직전 순위(`prev_rank_no`)는 DELETE 하기 전에 먼저 읽어둡니다**(`bestRankingService.js:192-198`) — 지우고 나면 못 읽습니다. 급상승 표시용입니다.

실행 이력은 `best_ranking_run` 에 남습니다(RUNNING → SUCCESS/FAILED, `group_count`, `row_count`, `message`).

---

## 5. MD 픽 (`best_pin`) — 조회 시점 병합

`mergePins(autoRows, pinRows)` (`bestRankingService.js:294-315`) 규칙:

1. **핀 상품이 자동 랭킹에도 있으면 자동 쪽을 제거**한다 (중복 노출 방지)
2. `pin_rank` 가 있으면 **그 자리에 꽂는다** (1 = 1위). 같은 자리를 두 핀이 노리면 `sort_order` 가 앞서는 쪽
3. `pin_rank` 가 없는 핀은 **맨 앞에** `sort_order` 순으로 붙인다
4. 결과를 **1..N 으로 다시 번호 매긴다** — 화면의 순위 번호는 항상 연속이어야 한다

> ⚠️ **순위 변동(▲▼)은 `auto_rank_no` 로 계산해야 합니다.** 병합 후 `rank_no` 로 재면 핀 하나가 끼어드는 순간 아래 상품이 전부 한 칸씩 밀려 **거짓 '하락'** 으로 표시됩니다 — 실제 자동 순위는 그대로인데도. 그래서 `mergePins` 가 자동 순위를 `auto_rank_no` 로 따로 보존합니다.

- **핀은 기간과 무관하게 그룹 단위로 적용됩니다.** MD 픽은 "이 탭에서 밀 상품"이지 "이 기간에만 밀 상품"이 아닙니다. 기간별로 나누려면 `best_pin` 에 `period` 컬럼을 추가해야 합니다.
- 핀에는 노출 기간(`start_at` / `end_at`, NULL = 무제한)과 운영 메모(`memo`)가 있습니다.
- 다른 몰 상품은 꽂을 수 없습니다(`postAddPin` 이 `mall_id` 재확인).
- **핀은 고객 화면에 즉시 반영됩니다** (배치를 기다리지 않음).

---

## 6. 배치 · 스케줄

### 6.1 크론은 한 줄, 주기는 DB

```cron
*/5 * * * * /data/yd-mall/scripts/best_ranking_cron.sh
```

**이 한 줄뿐이고 다시는 바뀌지 않습니다.** 무엇을 언제 돌릴지는 크론이 아니라 **관리자 화면**(`/admin/best-groups` → 집계 스케줄 → `best_ranking_schedule` 테이블)이 정합니다. 5분마다 깨어나 `--scheduled` 모드로 "지금 주기가 된 기간"만 계산합니다. **주기를 바꾸려고 서버에 SSH 로 들어갈 일이 없습니다.**

`duePeriods()` 판정은 `best_ranking_schedule.interval_minutes` 와 `best_ranking_run` 의 마지막 SUCCESS 시각을 대조합니다. 한 번도 안 돌았으면 무조건 due. **판정을 node 에 둔 이유:** 쉘이 DB 를 직접 보게 하면 크론 스크립트에 DB 비밀번호를 박아야 합니다.

**현재 스케줄 값** (`best_ranking_schedule`, **몰 공통** — 이 테이블에는 `mall_id` 가 없습니다):

| period | enabled | interval_minutes |
|--------|:-------:|-----------------:|
| REALTIME | 1 | 10 |
| DAILY | 1 | 60 |
| WEEKLY | 1 | 1440 |
| MONTHLY | 1 | 1440 |

관리자 폼은 5~1440분으로 클램프합니다(크론이 5분마다 깨어나므로 5분 미만은 무의미).

### 6.2 `best_ranking_cron.sh` 가 흡수하는 것

크론 라인을 단순하게 유지하려고 쉘이 4가지를 처리합니다.

1. **`ENCRYPTION_KEY`** — cron 은 `/etc/environment` 를 자동 로드하지 않습니다. 없으면 `config/env.js` 가 `process.exit(1)` 합니다.
2. **node 경로** — nvm 은 비대화 셸의 PATH 에 없습니다(`yd-mall.sh` 와 같은 방식으로 로드).
3. **중복 실행 방지** — `flock`. 긴 집계가 다음 tick 이나 관리자의 "지금 집계"와 부딪힐 수 있습니다.
4. **종료 코드** — 실패해도 `exit 0`. 안 그러면 cron 이 5분마다 실패 메일을 씁니다. 실패는 `logs/best_ranking.log` 와 `best_ranking_run.status` 에 남습니다.

`calc_best_ranking.js` 는 **`scripts/_bootstrap.js` 를 먼저 부릅니다** — 안 하면 `isShopifySyncEnabled()` 가 fail-open 으로 실제 Shopify API 를 호출합니다.

```bash
set -a; . /etc/environment; set +a
node scripts/calc_best_ranking.js                 # 전 몰 · 전 기간 (강제)
node scripts/calc_best_ranking.js --mall 2
node scripts/calc_best_ranking.js --period DAILY
node scripts/calc_best_ranking.js --scheduled     # 주기가 된 기간만 (cron 용)
```

### 6.3 "지금 집계" 버튼 (`POST /admin/best-groups/calculate`)

몰 전체 × **전 기간**을 다시 산출합니다. 몰2(9,677건 × 15그룹 × 4기간)에서 약 4초. **요청을 붙잡고 동기로 기다립니다** — 운영자가 결과를 바로 봐야 하고, 백그라운드로 돌리면 "끝났는지" 물어볼 화면이 또 필요합니다.

---

## 7. 고객 화면

- **`/best`** (`bestController.getIndex`) — 그룹 탭 × 기간 탭. `rank_limit`(100)까지 한 화면, **페이지네이션 없음.**
- **`/best/tab`** — 탭 전환용 부분 렌더(AJAX). 전체 페이지를 다시 그리지 않습니다.
- **`/ranking` → 301 `/best`** (`routes/feature.js:265`). 베스트가 랭킹 엔진을 흡수했습니다.
- **그룹이 0건이면** `/products?sort=best` 로 리다이렉트합니다(탭이 없으면 보여줄 게 없으므로).
- `calculatedAt` 이 `null` 이면 **배치가 한 번도 안 돈 것**입니다.
- 홈 SDUI 섹션: `best_ranking`, `ranking_tabs`.
- `productController.getList` 를 재사용하지 **않습니다** — 순위 번호와 "N시 기준" 산출 시각이 화면의 본질이고, 페이지네이션이 없어 계약이 다릅니다.

### 7.1 성별·나이 세그먼트 (구조만 선행)

`best_ranking` 에 `gender`/`age_band` 컬럼이 있지만 **배치는 `('ALL','ALL')` 만 채웁니다**(`users` 에 성별이 없음). 그래서 `bestController.segmentsAvailable()`(:25-32)이 `gender <> 'ALL' OR age_band <> 'ALL'` 행 수를 세고, **0건이면 고객 화면의 셀렉트를 자동으로 disabled** 합니다. 배치가 세그먼트 행을 채우기 시작하면 저절로 켜집니다 — 플래그를 코드에 박지 않은 이유입니다.

### 7.2 특가 반영

`getRanking()` 은 스냅샷(정가)을 읽은 뒤 **표시 직전에** `dealSvc.applyDeals(products)` 로 활성 특가를 덮습니다(`bestRankingService.js:366`).

---

## 8. DB

### 8.1 `best_group` — 탭 정의

`id`, `mall_id`, `name`(탭 이름), `group_type`(ALL/CATEGORY/BRAND/**CUSTOM — 산출 제외**), `ref_id`(FK → `categories`, **ON DELETE CASCADE**), `condition_json`(CUSTOM 2차), `include_descendants`, `sort_order`, `is_active`

### 8.2 `best_score_config` (PK = `mall_id`)

`weight_sales`(5), `weight_like`(3), `weight_view`(0), `rank_limit`(100)
**브랜드 인기 점수(`brand_stat.popularity_score`)도 이 설정을 공유합니다.**

### 8.3 `best_ranking` — 산출 스냅샷

`id`, `mall_id`, `group_id`(FK CASCADE), `period`, `gender`(기본 ALL), `age_band`(기본 ALL), `product_id`(FK CASCADE, **int**), `rank_no`(1부터), `prev_rank_no`(직전 산출 순위. 신규 진입 NULL), `score`(decimal), `sales_count`, `like_count`, `view_count`(**누적 — 기간 창 미적용**), `calculated_at`(= 화면의 "N시 기준")
유니크: `uk_br_slot (group_id, period, gender, age_band, product_id)`

### 8.4 `best_pin` — MD 픽

`id`, `mall_id`, `group_id`(FK CASCADE), `product_id`(FK CASCADE), `pin_rank`(고정 순위. NULL = 상단에 `sort_order` 순), `sort_order`, `start_at`, `end_at`, `is_active`, `memo`(왜 밀었는지)
유니크: `uk_bp_slot (group_id, product_id)` — `postAddPin` 이 `ON DUPLICATE KEY UPDATE` 로 재활성화합니다.

### 8.5 `best_ranking_run` — 실행 이력

`mall_id`, `period`, `status`(RUNNING/SUCCESS/FAILED), `group_count`, `row_count`, `message`, `started_at`, `finished_at`

### 8.6 `best_ranking_schedule` (PK = `period`) — **`mall_id` 없음(몰 공통)**

`period`, `enabled`, `interval_minutes`

---

## 9. 주의사항

- **스냅샷을 직접 고치지 마세요.** `best_ranking` 을 UPDATE 해도 다음 배치가 통째 DELETE + INSERT 로 날립니다. 순위를 바꾸려면 `best_pin` 을 쓰세요.
- **`weight_view` 를 올리면 기간 랭킹이 오염됩니다.** 조회수는 `products.view_count` 누적값이라 기간 창이 없습니다. `product_view_daily` 같은 일별 집계 테이블이 없어 기간별 조회수를 못 냅니다(미구현).
- **집계 스케줄은 몰 공통입니다.** `best_ranking_schedule` 에 `mall_id` 가 없습니다(배치가 전 몰을 함께 돌기 때문). 몰별로 주기를 다르게 하려면 컬럼을 추가해야 합니다.
- **가중치·탭을 바꿔도 즉시 반영되지 않습니다.** 다음 배치(또는 "지금 집계" 버튼)까지 옛 순위가 보입니다. 관리자 화면이 저장 메시지에 그렇게 안내합니다. **핀만 예외**(조회 시점 병합이라 즉시).
- **카테고리·브랜드를 지우면 탭이 사라집니다.** `best_group.ref_id` 가 `ON DELETE CASCADE` 이고, 그러면 `best_ranking`·`best_pin` 도 연쇄 삭제됩니다.
- **CUSTOM 그룹은 산출되지 않습니다.** DB enum 에는 있지만 `groupFilter` 가 `null` 을 돌려 조용히 건너뜁니다. 관리자 폼에서 만들 수도 없습니다.
- **미구현:** 세그먼트(성별·나이) 산출, `product_view_daily`(기간별 조회수), CUSTOM 그룹 조건, **급상승 랭킹 화면**(`prev_rank_no` 는 이미 저장되고 있으므로 화면만 만들면 됩니다).

---

*Last Updated: 2026-07-15*
