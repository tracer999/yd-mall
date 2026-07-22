# 베스트 / 랭킹

## 1. 개요

- **URL:** `GET /best` · `GET /best/all` · `GET /best/tab`(AJAX)
- **라우트:** `routes/feature.js`
- **컨트롤러:** `controllers/bestController.js`
- **서비스:** `services/best/bestRankingService.js`(BEST 10) · `services/catalog/landingSections.js`(카테고리별·브랜드별)
- **뷰:** `views/user/best/index.ejs` · `all.ejs` · `_best_block.ejs` · `_ranking_list.ejs` · `views/partials/storefront/landing_rows.ejs`
- **구 URL:** `/ranking` → **301 `/best`**. 기능 메뉴 카탈로그의 `RANKING` 행은 **삭제됐습니다**(`scripts/migrations/20260722_drop_ranking_feature_menu.sql`) — 되살리지 마세요.

**화면 구성 (2026-07-22 개편)**

```
[쇼케이스]          middleware/menuShowcase 주입 → main_layout 렌더
[BEST 10]           전체 랭킹 상위 10 + 순위 번호 + 기간 탭  → [전체 랭킹 더보기] /best/all
[카테고리별 BEST]   카테고리마다 한 줄, 줄당 최대 10개 → [더보기] /products/category/:id?sort=best
[브랜드별 BEST]     브랜드마다 한 줄,   줄당 최대 10개 → [더보기] /products/brand/:id?sort=best
```

> **그룹 탭과 세그먼트 셀렉트는 화면에서 걷어냈습니다.** 그룹 탭은 곧 `best_group` 이라 운영자가
> 그룹을 만들어 두지 않은 몰(= 갓 찍어낸 몰)에는 '전체' 하나뿐이었고, 세그먼트는 배치가
> `('ALL','ALL')` 만 채워 늘 `disabled` 였습니다. **스키마·배치·관리자 화면은 그대로 살아 있습니다** —
> 세그먼트를 켤 때 UI 만 다시 붙이면 됩니다.

**예전 '베스트'는 상품그룹(수동 큐레이션)이었지만, 지금은 랭킹 엔진입니다.** 그래서 `productController.getList` 를 재사용하지 않고 **전용 컨트롤러**를 씁니다 — 목록형 화면과 계약이 다릅니다.

| 목록(`getList`) | 베스트(`bestController`) |
|---|---|
| 페이지네이션 | **없음**(`rank_limit` 까지 한 화면) |
| 정렬 탭 | **그룹 탭 × 기간 탭 × 세그먼트 필터**가 상태를 이룸 |
| — | **순위 번호(1..N)** 와 **"N시 기준"** 산출 시각이 화면의 본질 |

`getList` 에 이걸 다 밀어넣으면 두 화면이 서로를 망가뜨립니다.

> **랭킹은 한 곳에서만 정의됩니다.** 홈의 `best_ranking` 섹션과 `ranking_tabs` 섹션도 **같은 스냅샷**을 읽습니다 → [home.md](./home.md) §4.1.

---

## 2. 두 갈래 — 섞지 말 것

```
calculate*()   배치가 부른다. 점수를 산출해 best_ranking(스냅샷)에 쓴다.  느리다.
getRanking()   화면이 부른다. 스냅샷을 읽고 그 위에 핀(MD 픽)을 얹는다.  빠르다.
```

- **왜 점수를 저장하는가(매번 파생하지 않는가):** 화면이 "07/13 13시 기준"을 말하려면 그 시점의 값이 **고정**돼 있어야 합니다. 매 요청 재계산하면 기준 시각이 거짓말이 되고, 상품 9천여 건인 몰에서는 느립니다.
- **왜 핀을 스냅샷에 굽지 않는가:** MD 가 상품을 밀면 **즉시** 보여야 합니다. 스냅샷에 구우면 다음 배치까지 안 보입니다. 그래서 핀은 **조회 시점에 병합**합니다(`mergePins`).

---

## 3. 점수

```
점수 = 판매수량 × weight_sales + 좋아요수 × weight_like + 조회수 × weight_view
```

`best_score_config`(몰별 1행). 행이 없으면 기본값:

| 항목 | 기본값 |
|---|---|
| `weight_sales` (판매) | **5** |
| `weight_like` (좋아요) | **3** |
| `weight_view` (조회) | **0** |
| `rank_limit` | 100 |

- **매출로 인정하는 주문 상태:** `PAID`, `PREPARING`, `SHIPPED`, `DELIVERED` (`PENDING`·`CANCELLED`·`REFUNDED` 제외).
- 판매·좋아요는 **기간 창** 안의 것만 셉니다.
- ⚠️ **동점은 `products.view_count`(누적 조회수)로 가릅니다.** 조회 가중치가 0 이어도 tie-break 에는 씁니다 — 안 그러면 상품 id 순으로 줄 세운 무의미한 랭킹이 나옵니다(현재 데이터는 거의 전부 0점).
- ⚠️ **조회수는 누적값이라 기간 창이 적용되지 않습니다.** `weight_view` 를 0 보다 크게 올리면 **일간 랭킹에 누적 조회수가 섞입니다.**

---

## 4. 그룹 × 기간 × 섹션

**그룹**(`best_group`, 몰별) — 관리자 `/admin/best-groups` 에서 만듭니다.

- `group_type` 이 `CATEGORY` 면 `include_descendants=1` 일 때 하위 트리까지 포함합니다(최대 3뎁스라 재귀 CTE 없이 2단 IN 으로 충분 — `depthGuard` 가 4뎁스를 막습니다).
- **고객 화면(BEST 10 · /best/all)은 `ALL` 그룹만 씁니다**(`pickAllGroup` — 없으면 첫 그룹). 그룹이 0개면 BEST 10 이 비고, 카테고리별·브랜드별 줄만 렌더합니다.
- 나머지 그룹은 배치 산출 대상이자 **홈 섹션(`best_ranking`·`ranking_tabs`)의 탭**으로 계속 쓰입니다 — 지우지 마세요.

**카테고리별 · 브랜드별 줄** — `services/catalog/landingSections.js`

- ⚠️ **스냅샷을 읽지 않고 조회 시점에 계산합니다.** 스냅샷은 `best_group` 단위로만 있어서, 운영자가 카테고리마다 그룹을 만들어야만 화면이 채워지는 구조가 됩니다 — 몰 빌더에 맞지 않습니다.
- 점수 가중치는 **랭킹 엔진과 같은 `best_score_config`** 를 읽습니다. BEST 10 과 카테고리별 BEST 가 서로 다른 기준으로 줄 서는 일이 없어야 합니다.
- 카테고리는 **최상위(depth 1) NORMAL** 마다 한 줄이고 **서브트리 전체**에서 상품을 뽑습니다(상품 대부분이 2·3뎁스에 붙어 있어 최상위만 보면 전 줄이 빕니다).
- `hasMore` 는 `COUNT(*)` 로 세지 않습니다 — `limit + 1` 건을 읽어 넘치면 더 있는 것으로 봅니다. **더보기는 실제로 더 있을 때만** 노출합니다.
- 상품 9,680건 몰(`?mall=general`) 기준 `/best` 0.46초 · `/new` 0.52초 (2026-07-22 측정).

**기간**(`?period=`) — `PERIODS`:

| 값 | 라벨 | 창 |
|---|---|---|
| `REALTIME` | 실시간 | 1시간 |
| `DAILY` (**기본**) | 일간 | 24시간 |
| `WEEKLY` | 주간 | 7일 |
| `MONTHLY` | 월간 | 30일 |

화이트리스트 밖의 값은 `DAILY` 로 정규화됩니다.

**세그먼트(성별·연령)** — `?gender=M|F`, `?age=10|20|30|40|50|60`

- ⚠️ **화면에서 내려왔습니다(2026-07-22).** `users` 에 성별 컬럼이 없어 배치가 `('ALL','ALL')` 행만 채우고, 그래서 셀렉트가 늘 `disabled` 인 채로 자리만 차지했습니다.
- **스키마(`best_ranking.gender`·`age_band`)와 `getRanking()` 의 파라미터는 그대로입니다.** 배치가 세그먼트 행을 채우기 시작하면 UI 만 다시 붙이면 됩니다(구 판정 함수 `segmentsAvailable` 은 git 이력 참고).

---

## 5. MD 픽 (`best_pin`)

- 조회 시점에 자동 랭킹 위에 **병합**됩니다(`mergePins`) — 즉시 반영.
- 조건: `is_active=1` + 노출기간(`start_at`/`end_at`) + 전시 가능 상태 + visibility.
- **핀은 기간과 무관하게 그룹 단위로 적용**됩니다. MD 픽은 "이 탭에서 밀 상품"이지 "이 기간에만 밀 상품"이 아닙니다. 기간별로 나누려면 `best_pin` 에 `period` 컬럼을 추가해야 합니다.
- 정렬: `pin_rank` / `sort_order`.

---

## 6. 화면

- **`GET /best`** — BEST 10(기간 탭 + 순위 리스트 + `calculatedAt` "N시 기준") + 카테고리별 BEST + 브랜드별 BEST. 상단 '추천 베스트' 캐러셀은 `middleware/menuShowcase` 가 주입하고 `main_layout` 이 렌더합니다.
- **`GET /best/all`** — BEST 10 의 [전체 랭킹 더보기] 착지점. 같은 스냅샷을 **100위까지** 펼칩니다. 카테고리별·브랜드별 줄은 없습니다.
- **`GET /best/tab?period=&scope=top|all`** — 기간 탭 전환용 **부분 렌더**(`layout: false` → `user/best/_ranking_list`). 카테고리별·브랜드별 줄은 기간과 무관하므로 다시 그리지 않습니다.
- **빈 상태:** 랭킹·카테고리·브랜드가 모두 비면 "아직 집계된 랭킹이 없습니다" 안내 + [전체 상품 보기]. 갓 찍어낸 몰에서 빈 화면을 남기지 않습니다.
- **전시 규칙:** `status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')` + 비로그인 `visibility='PUBLIC'` / 로그인 `PUBLIC`·`MEMBER_ONLY` (리졸버와 같은 규칙).
- **가격:** 랭킹 스냅샷은 정가를 담고 있으므로, **표시 직전에 `dealSvc.applyDeals()` 로 활성 특가를 덮습니다** → [promotions.md](./promotions.md) §7.

---

## 7. 배치 · 크론

- **스크립트:** `scripts/calc_best_ranking.js` → `best_ranking` 스냅샷 생성. 이력은 `best_ranking_run`(`status`, `group_count`, `row_count`, `message`).
- **크론에는 한 줄만 등록합니다. 그리고 다시는 바뀌지 않습니다:**

```cron
*/5 * * * * /data/yd-mall/scripts/best_ranking_cron.sh
```

- **무엇을 언제 돌릴지는 크론이 아니라 관리자 화면이 정합니다** — `/admin/best-groups` → 집계 스케줄 → **`best_ranking_schedule`** 테이블. 스크립트는 5분마다 깨어나 `--scheduled` 로 "지금 주기가 된 기간"만 계산합니다. 주기를 바꾸려고 서버에 SSH 로 들어갈 일이 없습니다.
- 래퍼 스크립트가 흡수하는 것:
  1. **`ENCRYPTION_KEY`** — cron 은 `/etc/environment` 를 자동 로드하지 않습니다. 없으면 `config/env.js` 가 `process.exit(1)`.
  2. **node 경로** — nvm 은 비대화 셸의 PATH 에 없습니다.
  3. **중복 실행 방지** — 긴 집계가 다음 tick 이나 관리자의 "지금 집계"와 부딪힐 수 있습니다.
  4. **종료 코드** — 실패해도 `exit 0`. 안 그러면 cron 이 5분마다 실패 메일을 쏩니다. 실패는 로그와 `best_ranking_run.status` 에 남습니다.

---

## 8. DB

| 테이블 | 용도 |
|---|---|
| `best_group` | 몰별 랭킹 그룹(= 탭). `group_type`, `ref_id`, `sort_order`, `is_active` |
| `best_score_config` | 몰별 가중치·`rank_limit` |
| `best_ranking` | **스냅샷**. `(mall_id, group_id, period, gender, age_band)` 축 + `rank_no`, `prev_rank_no`, `score`, `sales_count`, `like_count`, `calculated_at` |
| `best_pin` | MD 픽. `group_id`, `product_id`, `pin_rank`, `sort_order`, 노출기간, `is_active` |
| `best_ranking_schedule` | 기간별 집계 주기(관리자가 설정) |
| `best_ranking_run` | 집계 실행 이력 |

---

## 9. 주의사항

- 랭킹 산출 로직을 다른 곳에 복제하지 마세요. **`services/best/` 가 유일한 출처**입니다(홈 섹션·GNB 베스트가 같은 스냅샷을 봅니다).
- `weight_view` 를 올리면 **기간 창이 없는 누적 조회수**가 랭킹에 섞입니다.
- 세그먼트 필터는 데이터가 생기면 자동으로 켜집니다. 코드에 플래그를 박지 마세요.
- `ranking_tabs` 섹션의 옛 `sort` 필드는 폐기됐습니다(죽은 옵션이었습니다).

---

*Last Updated: 2026-07-15*
