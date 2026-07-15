# 카탈로그 랜딩 — 베스트/랭킹 · 신상품 · 아울렛 · 브랜드

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15 / 통합: 2026-07-15 / 완료항목 제거: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료·이관된 항목 표와 원문 정정 기록은 목적지 문서로 이관 확인 후 삭제했습니다. 원문은 git 이력에서 확인하세요.
>
> **이 문서는 베스트/랭킹 · 신상품 · 아울렛 · 브랜드 허브 4개 계획서를 하나로 합친 것입니다.**
> (구 `best_ranking_design_and_development.md` · `new_arrivals_dev_plan.md` · `outlet_design_and_development.md` · `brand_hub_dev_plan.md`)
> 넷 다 카탈로그에서 파생되는 GNB 목록형 랜딩이며, THEME 축 폐기·브랜드 찜 몰 스코프 등 결함을 공유합니다.

---

## 베스트 / 랭킹

### 잔여 과제 (원문 §10 "2차")

| # | 과제 | 현재 상태 |
|---|---|---|
| 1 | **성별·나이 세그먼트 산출** | 구조는 완비(`best_ranking.gender`·`age_band`, `users.gender`). 배치가 `('ALL','ALL')` 한 조합만 채워 **데이터 0건** → 고객 화면 셀렉트가 자동 `disabled`. `gender <> 'ALL'` 행이 하나라도 생기면 `bestController.segmentsAvailable` 이 **저절로 켠다** — 배치만 확장하면 화면·스키마는 그대로다 |
| 2 | **CUSTOM 그룹 산출** | `best_group.type='CUSTOM'` 은 정의돼 있으나 `groupFilter()` 가 **산출에서 제외**한다. `condition_json` 스키마(뱃지·가격대 등) 확정이 선행 |
| 3 | **급상승 랭킹 화면** | `prev_rank_no` 는 배치가 이미 저장 중. **화면만 만들면 된다** |

**선행 조건 (원문에서 보존)**

- 세그먼트 산출을 켜려면 **성별 수집 경로**가 먼저 필요하다. 카카오/구글 OAuth 동의항목을 추가해야 성별을 준다. 생년월일도 회원 30명 중 19명뿐이다.
- ⚠️ **전조합(그룹 × 기간 × 성별 × 나이)을 미리 채우지 마라.** 빈 셀만 폭증한다. 실제 데이터가 있는 조합만 산출한다.
- ⚠️ `CUSTOM` 은 **빈 조건을 '전체'로 해석하지 않는다.** 운영자가 실수로 만든 빈 그룹이 전체 랭킹이 되는 걸 막기 위한 의도적 설계다.

### 폐기된 계획 (되살리지 말 것)

| 폐기 항목 | 이유 |
|---|---|
| **`/ranking` 별도 메뉴** | `/best` 로 **301 통합**됐다. `mall_feature_menu` 에서 OFF. 같은 엔진을 두 화면으로 태우지 않는다 |
| **`product_view_daily` 기간별 조회수 집계** | `best_ranking` 스냅샷 배치가 대신한다. 조회 가중치(`weight_view`)를 0 보다 올리면 일간·실시간 랭킹에도 **누적 조회수**(`products.view_count`)가 섞인다는 점만 유의 |

### 알려진 결함

| # | 결함 | 영향 |
|---|---|---|
| 1 | **`weight_view` > 0 시 기간 오염** | `products.view_count` 는 누적값이라 기간 창을 적용할 수 없다. 조회 가중치를 올리면 실시간·일간 랭킹에 누적 조회수가 섞인다. 기본값 0 을 유지할 것 |
| 2 | **실데이터 희박** | PAID 주문·좋아요가 적어 대부분의 상품이 0점이다. 조회수 tie-break 가 없으면 id 순 나열이 된다 — tie-break 를 제거하지 말 것 |

---

## 신상품

### 잔여 과제

- 없음. (구 "관리자 브랜드 탭 입점일 최신순 정렬 미구현" 은 **완료 확인**됨 — `controllers/admin/brandController.js:44-46` `sort='new'` → `ORDER BY c.onboarded_at DESC`, `views/admin/brands/list.ejs:63` `입점 최신순` 옵션 노출. 2026-07-15 검증)

### 알려진 결함

- **THEME 카테고리 id=5 · 6 이 DB 에서 여전히 `is_active=1`** — 계획의 비활성화 처리가 미이행이다. 코드가 `/best` · `/new` 로 리다이렉트하므로 고객 노출 경로는 막혀 있으나 데이터는 남아 있다.
- **브랜드 찜이 `mall_id` 를 검증하지 않는다** (`controllers/likeController.js`) — 상세는 이 문서 [브랜드](#브랜드) 절 참고.

### 현재 데이터 상태 (원문 premise 정정)

원문은 "몰2는 `sale_start_date` 를 NULL 로 유지 → 몰2 신상품 0건" 이라고 적었으나,
**실제 DB 는 전 몰 전 상품에 `sale_start_date` 가 채워져 있다.**
현재 신상품 집계(100일 + NEW 뱃지 기준): **몰1 127건 / 몰2 50건 / 몰12 8건.**
(현재 몰은 id 1·2·12 뿐이며 최신 신규 몰은 **12**(언니네 미용관·기본몰)다. 이전 원문의 "몰6" 은 stale — 2026-07-15 검증)

---

## 아울렛

### 잔여 과제

계획 범위는 사실상 전량 완료됐다. 남은 것은 아래 결함 처리뿐이다.

### 알려진 결함

- **몰 프리셋 재적용 시 아울렛 메뉴가 꺼진다.**
  `services/mall/presets.js` 의 `featureMenus` 목록에 OUTLET · GROUP_BUY · LIVE 가 빠져 있다.
  그 결과 신규 몰(mall 6)은 이 3개 메뉴가 전부 `is_enabled=0` 이다.
  (원문 §7-4 의 경고가 여전히 유효하다. `mall_builder_plan.md` 의 결함 1과 동일 뿌리)

### 폐기된 결정 (되살리지 말 것)

원문 §1-4 의 **"결정 2 — OUTLET 을 `module_ready=0` 으로 내린다"** 는 **실행되지 않았다.**
대신 **콘텐츠 게이트**(콘텐츠가 없으면 메뉴를 자동으로 숨김)가 채택됐고, `module_ready` 는 `1` 이다.

---

## 브랜드

### 잔여 과제

1. **브랜드 상세관 베스트탭용 `best_group` 자동 생성 배치 미구현.**
   현재는 수동 시드 10건뿐이고, 해당 브랜드의 `best_group` 이 없으면 판매순 폴백으로 내려간다.
2. **마이페이지 관심 브랜드 강화 미구현** — 계획했던 3블록(최근 신상품 / 사용 가능 쿠폰 / 진행 중 행사)이 없다.
3. **`/admin/brands/merge` 중복 브랜드 병합** — 계획상 2차.
4. **급상승 브랜드** — `brand_stat_daily` 테이블이 없어 미구현. 계획상 2차.
5. **`/admin/categories` 브랜드 탭 → `/admin/brands` 링크 없음.** 운영자가 브랜드 관리 화면으로 이동할 동선이 없다.
6. **`services/display/resolvers/brand_carousel.js` 가 아직 `brand_stat` 미전환** — 여전히 `categories LEFT JOIN products` COUNT 로 직접 집계한다.

### 알려진 결함

- **브랜드 찜이 `mall_id` 를 검증하지 않는다** — `controllers/likeController.js:53`. 타 몰 브랜드도 찜할 수 있다. (위 [신상품](#신상품) 결함에서도 참조하는 동일 항목)
- **브랜드 집계에 cron 이 없다** — `/admin/brands` 의 "집계 재계산" 버튼이나 `scripts/recalc_brand_stat.js` 수동 실행에만 의존한다. 상품이 늘거나 빠져도 자동 반영되지 않는다.
- **`system_settings.new_brand_days` 설정값이 `/brands` 홈에 적용되지 않는다** — 신규 브랜드 판정이 180 으로 하드코딩돼 있어 설정이 무시된다.
