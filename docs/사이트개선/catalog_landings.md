# 카탈로그 랜딩 — 베스트/랭킹 · 신상품 · 아울렛 · 브랜드

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15 / 통합: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 원문의 점수 산식·스키마·배포 순서·체크리스트는 이관 후 삭제했습니다. 원문은 git 이력에서 확인하세요.
>
> **이 문서는 베스트/랭킹 · 신상품 · 아울렛 · 브랜드 허브 4개 계획서를 하나로 합친 것입니다.**
> (구 `best_ranking_design_and_development.md` · `new_arrivals_dev_plan.md` · `outlet_design_and_development.md` · `brand_hub_dev_plan.md`)
> 넷 다 카탈로그에서 파생되는 GNB 목록형 랜딩이며, THEME 축 폐기·브랜드 찜 몰 스코프 등 결함을 공유합니다.

---

## 베스트 / 랭킹

### 완료되어 이관된 항목

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

#### 원문 정정 (원문이 틀렸다)

| 원문 | 실제 |
|---|---|
| §9 "미실행: `migrate_best_home_section.sql` (배포 후)" | **실행 완료.** 홈에 `best_ranking` 섹션이 실재한다 (mall 1 · 2 · 6) |
| §7 "cron 4줄 등록 (기간별로 주기가 다르다)" | **크론 1줄 + DB 스케줄 테이블(`best_ranking_schedule`)** 방식으로 대체됐다. 기간별 주기는 **관리자 화면에서 편집**한다. crontab 을 4줄로 늘리지 말 것 |

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

### 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| `products.sale_start_date` · `categories.onboarded_at` 컬럼 | `docs/develop_guide/admin/products.md` |
| `new_product_days` · `new_brand_days` 설정 | `docs/develop_guide/admin/products.md` · `docs/manual/admin/products.md` |
| 신상품 판정 모듈 `services/catalog/newArrival.js` | `docs/develop_guide/user/products.md` |
| 소비처 전부(productController · sitemap RSS · productGroupService · product_card) | `docs/develop_guide/user/products.md` |
| 관리자 상품 폼 · 목록 · 일괄 지정 | `docs/develop_guide/admin/products.md` · `docs/manual/admin/products.md` |
| `/new` SDUI 랜딩 6섹션 + 리졸버 3종 | `docs/develop_guide/user/products.md` · `docs/manual/user/products.md` |
| THEME 축 폐기(코드 레벨) | `docs/develop_guide/user/products.md` |

### 잔여 과제

1. **관리자 브랜드 탭의 "입점일 최신순" 정렬 옵션 미구현.**
   대신 `/admin/brands` 목록이 정렬을 제공하므로 우선순위는 낮다.

### 알려진 결함

- **THEME 카테고리 id=5 · 6 이 DB 에서 여전히 `is_active=1`** — 계획의 비활성화 처리가 미이행이다. 코드가 `/best` · `/new` 로 리다이렉트하므로 고객 노출 경로는 막혀 있으나 데이터는 남아 있다.
- **브랜드 찜이 `mall_id` 를 검증하지 않는다** (`controllers/likeController.js`) — 상세는 이 문서 [브랜드](#브랜드) 절 참고.

### 정정하여 기록

원문은 "몰2는 `sale_start_date` 를 NULL 로 유지 → 몰2 신상품 0건" 이라고 적었으나,
**실제 DB 는 전 몰 전 상품에 `sale_start_date` 가 채워져 있다.**
현재 신상품 집계: **몰1 127건 / 몰2 50건 / 몰6 2건.**

---

## 아울렛

### 완료되어 이관된 항목

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

### 잔여 과제

계획 범위는 사실상 전량 완료됐다. 남은 것은 아래 결함 처리뿐이다.

### 알려진 결함

- **몰 프리셋 재적용 시 아울렛 메뉴가 꺼진다.**
  `services/mall/presets.js` 의 `featureMenus` 목록에 OUTLET · GROUP_BUY · LIVE 가 빠져 있다.
  그 결과 신규 몰(mall 6)은 이 3개 메뉴가 전부 `is_enabled=0` 이다.
  (원문 §7-4 의 경고가 여전히 유효하다. `mall_builder_plan.md` 의 결함 1과 동일 뿌리)

### 폐기된 결정

원문 §1-4 의 **"결정 2 — OUTLET 을 `module_ready=0` 으로 내린다"** 는 **실행되지 않았다.**
대신 **콘텐츠 게이트**(콘텐츠가 없으면 메뉴를 자동으로 숨김)가 채택됐고, `module_ready` 는 `1` 이다.

---

## 브랜드

### 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| `brand_profile` · `brand_stat` · `brand_category_stat` 테이블 | `docs/develop_guide/admin/brands.md` |
| 백필(초성 인덱스 · 영문명) | `docs/develop_guide/admin/brands.md` |
| 브랜드 타일 degrade(로고 없는 브랜드 처리) | `docs/develop_guide/user/products.md` |
| 브랜드 홈 `/brands` — 검색 · 이번주 혜택 슬라이더 · 인기 폴백 사다리 · 신규 브랜드 · 카테고리별 · 초성 색인 | `docs/develop_guide/user/products.md` · `docs/manual/user/brands.md` |
| 브랜드 상세관 5탭 | `docs/develop_guide/user/products.md` · `docs/manual/user/brands.md` |
| 관심 브랜드 찜 | `docs/develop_guide/user/products.md` · `docs/manual/user/brands.md` |
| 관리자 `/admin/brands` + 집계 재계산 | `docs/develop_guide/admin/brands.md` · `docs/manual/admin/brands.md` |
| `new_brand_list` SDUI 리졸버 | `docs/develop_guide/admin/brands.md` |
| sitemap 몰 필터 | `docs/develop_guide/admin/brands.md` |

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
