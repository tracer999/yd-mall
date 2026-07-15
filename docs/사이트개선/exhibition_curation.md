# 기획전 · 전문관 · 추천 — 큐레이션 전시 모듈

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15 / 통합: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 완료 항목의 설계 산문·DDL·화면 명세는 삭제했습니다. 원문은 git 이력에서 확인하세요.
>
> **이 문서는 기획전 · (추천/전문관) 2개 계획서를 하나로 합친 것입니다.**
> (구 `exhibition_design_and_development.md` · `recommend_specialty_design_and_development.md`)
> **전문관은 `exhibition_type='SPECIALTY'` 로 기획전 테이블을 재사용**하므로 두 계획서가 같은 구현을 공유합니다.
> 전문관 데모 시드 노출 결함은 두 계획서에 중복돼 있었으므로 [알려진 결함](#알려진-결함--공통)에 한 번만 정리했습니다.

---

## 기획전

### 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| DB 3종 (`exhibition` · `exhibition_section` · `exhibition_product`) | `develop_guide/admin/exhibitions.md` |
| 고객 목록 `/exhibition` · 상세 `/exhibition/:id` (내부 탭 · 종료 정책 · 공유) | `develop_guide/user/promotions.md` |
| 관리자 CRUD · 섹션 편집 · 상품 매핑 | `develop_guide/admin/exhibitions.md` · `manual/admin/exhibitions.md` |
| 기획전 0건일 때 준비중 폴백 | `develop_guide/user/promotions.md` |
| 본문 HTML 새니타이즈 | `develop_guide/admin/exhibitions.md` |
| 커스텀 메뉴 `EXHIBITION` 리졸버 (URL 직접입력 대신 내부 리소스 연결) | `develop_guide/admin/exhibitions.md` |

#### 계획 초과 달성 (원문에 없던 것)

| 항목 | 내용 |
|---|---|
| **전문관** | `exhibition_type = 'SPECIALTY'` 로 구현. **신규 테이블 0개** — 기존 3종을 그대로 재사용했다 |
| **브랜드 귀속** | `exhibition.brand_category_id` 로 기획전을 브랜드에 묶는다 |
| **쇼핑특가 연동** | 기획전 상품 카드에도 특가(`dealService.applyDeals`)가 적용된다 |

### 잔여 과제

| # | 항목 | 비고 / 해제 조건 |
|---|---|---|
| 1 | **상세 템플릿 `STORY` · `CATEGORY_SHOP` · `BRAND_SHOP`** | 현재 **전부 `TAB_SHOP` 으로 폴백**된다. 원문 §5-2 ~ §5-4 |
| 2 | **CSV 업로드 · 조건 자동 상품연결** | `product_group` 의 `filter_condition_json` 화이트리스트(`badge`/`category_id`/`min_discount`/`in_stock`) 재사용 |
| 3 | **관리자 목록 필터** (카테고리 · 기간 · 노출 · 메뉴연결) | 원문 §4-1 |
| 4 | **기획전별 매출 귀속** | `order_items.source_type = 'EXHIBITION'` 이 **기록되지 않는다.** 컬럼은 이미 있고(특가·공동구매가 사용 중) 체크아웃 배선만 없다 |
| 5 | **`exhibition_category` 테이블** (2차) | 목록 카테고리 필터가 필요해질 때 |
| 6 | **`exhibition_coupon` 테이블** (3차) | 기획전 전용 쿠폰 다운로드 UX 요구가 생길 때 |
| 7 | 예약 발행 · 버전 관리 (`page_revision` 패턴) · A/B 테스트 | 운영 요구 발생 시 |

---

## 추천 · 전문관

### 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| 추천 랜딩 4섹션(개인화 · 그룹 · MD · 많이보는) | `docs/develop_guide/user/promotions.md` |
| 추천 근거 문구 · 비로그인 CTA · noindex | `docs/develop_guide/user/promotions.md` |
| 관리자 `/admin/recommend-groups` | `docs/develop_guide/admin/recommend.md` · `docs/manual/admin/recommend.md` |
| 전문관 = `exhibition_type='SPECIALTY'` 재사용(DDL 0) | `docs/develop_guide/admin/recommend.md` |
| `/specialty` 목록 · 상세 · 301 리다이렉트 | `docs/develop_guide/user/promotions.md` |
| GNB 메뉴 활성화 | `docs/develop_guide/admin/recommend.md` |

### 잔여 과제

1. **추천 랜딩 최상단 배너 슬롯 미구현** — 계획 §4-3 의 `group_key='menu:RECOMMEND'` 배너가 코드에 없다.
2. **규칙형 추천(`rule_json`)** — 계획상 3차.
3. **전문관 전용 상세 템플릿(CATEGORY_SHOP / BRAND_SHOP)** — 현재 전부 TAB_SHOP 으로 폴백된다. (위 [기획전](#기획전) 잔여 1번과 동일 뿌리)
4. **개인화 고도화(주문 · 좋아요 기반) · 매거진형** — 데이터 부족으로 보류.
5. **`recommend_group` 현재 0행** — 운영자 큐레이션이 아직 하나도 없다.

### 정정

GNB 슬롯 부족 해소는 계획서의 (A) · (B) 안이 아니라 **제3안**으로 처리됐다 —
쿠폰 메뉴를 유지하고 **RANKING · MEMBERSHIP 을 `is_enabled=0` 으로 내렸다.**
`max_gnb_items` 는 12 그대로다.

---

## 알려진 결함 — 공통

### 전문관 7건이 데모 시드인 채 고객에게 노출 중

현재 노출 중인 전문관(`exhibition_type='SPECIALTY'`) **7건은 `scripts/seed_recommend_specialty_demo.sql` 의 데모 시드**다.

- 원문(기획전 §5-5 / 추천·전문관 §5-5)은 **"씨드를 코드로 넣지 않는다"** 고 못 박았으나, 이 데이터가 그 원칙에서 **이탈**했다.
- 그런데 고객 화면에 그대로 노출되고 있다.
- **결정 필요**: (A) 운영 데이터로 승격(내용 재작성 후 시드 스크립트 폐기) / (B) 정리(`is_active=0` 또는 삭제) 후 실제 전문관을 관리자에서 등록.
