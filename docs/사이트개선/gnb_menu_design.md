# GNB 메뉴별 화면 설계

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료 기능의 정본은 `docs/develop_guide/` (개발자) 와 `docs/manual/` (운영자) 입니다.
> 원문의 설계 산문·와이어프레임·DDL·체크리스트는 이관 후 삭제했습니다.

---

## 완료되어 이관된 항목

| 항목 | 결과 | 이관된 문서 |
|---|---|---|
| 이벤트&혜택 `/event` (E1~E12: 스키마·관리자 CRUD·고객 목록/상세·선착순 동시성) | 신규 모듈 완성. `/boards/notice` 302 별칭 제거 | `develop_guide/admin/events.md`, `develop_guide/user/promotions.md` |
| 신상품 `/new` | SDUI 랜딩 + 폴백으로 완성 | `develop_guide/user/products.md` |
| 베스트 `/best` | 계획의 "manual 상품그룹 + 조회수 폴백"은 **폐기**. **랭킹 엔진으로 전면 재설계** | `develop_guide/admin/best_groups.md`, `develop_guide/user/best.md` |
| 아울렛 `/outlet` | 계획의 "폐기·준비중 랜딩 유지"가 뒤집힘. **전용 모듈로 완성** | `develop_guide/admin/outlet.md` |
| 오늘특가 `/deal/today` | **쇼핑특가 `/deals` 모듈로 전면 대체** (301 리다이렉트) | `develop_guide/admin/deals.md` |
| 랭킹 `/ranking` | **베스트에 흡수**. 301 → `/best`, `mall_feature_menu` 에서 OFF | `develop_guide/user/best.md` |
| 브랜드 `/brands` (초성 인덱스 + 페이징) | 완성 | `develop_guide/user/brands.md` |
| 멤버십 | 정적 소개 페이지. GNB 에서 내려가 `/event` 하위 섹션으로 편입 | `develop_guide/user/promotions.md` |
| 쿠폰 `/coupon` (다운로드 수령) | 완성 | `develop_guide/admin/coupons.md` |
| 쇼핑라이브 `/live` | 완성 | `develop_guide/admin/live.md` |
| 콘텐츠 게이트 + 준비중 랜딩(`COMING_SOON`) | 완성 | `develop_guide/admin/storefront_menus.md`, `develop_guide/user/layout.md` |
| 선행 버그 B1~B4 (브랜드 몰 스코프 · 마이페이지 쿠폰함 · `badge_expire_date` · `HEADER_CS` → `/cs`) | 4건 모두 수정 완료 | — |

**계획서에 없던 신규 GNB** — 추천 `/recommend`, 전문관 `/specialty`, 쇼핑특가 `/deals`. 각 `develop_guide` 문서 참고.

---

## 잔여 과제

| # | 과제 | 현재 상태 |
|---|---|---|
| 1 | **이벤트 유형 확장** — `COUPON_PACK`(쿠폰팩) · `ATTENDANCE`(출석) · `PURCHASE`(구매인증) | 현재 `PARTICIPABLE_TYPES = ['APPLY']` 화이트리스트가 나머지를 차단. `event.event_type` enum 에는 값이 이미 있다 |
| 2 | **멤버십 등급 시스템** | **설계·배경 전체를 [`membership_grade_admin_design.md`](./membership_grade_admin_design.md) 로 이관.** (요약: `membership_grade`/`user_grade` 없음, 등급·혜택은 `membershipInfo.js` 정적 상수, 구매액 집계 배치 필요) |
| 3 | **이벤트 매출 귀속** | `order_items.source_type`/`source_id` 컬럼은 존재하나 `GROUP_BUY`·`LIVE_SHOW`·`DEAL` 만 기록. **EVENT·EXHIBITION 은 미기록** |
| 4 | **급상승 랭킹 화면** | `best_ranking.prev_rank_no` 는 배치가 저장 중. 화면만 없다 |

**과제별 함정 (원문에서 보존)**

- **이벤트 유형 확장 시 동시성** — 선착순은 애플리케이션 COUNT 후 INSERT 하면 초과 발급된다. 기존 APPLY 가 쓰는 조건부 UPDATE 패턴(`UPDATE event SET issued_count = issued_count + 1 WHERE id = ? AND (issue_limit IS NULL OR issued_count < issue_limit)` → `affectedRows = 0` 이면 마감)을 그대로 따를 것. 중복 참여는 `UNIQUE(event_id, user_id)` 로 DB 가 막는다.
- **출석(ATTENDANCE)은 서버 시각 기준** — 클라이언트 날짜를 신뢰하지 말 것.
- **쿠폰팩(COUPON_PACK) 지급** — `couponController` 의 `issued_by='ADMIN'` 경로를 재사용한다.
- **멤버십 등급** — 미룬 배경·연동 지점은 [`membership_grade_admin_design.md`](./membership_grade_admin_design.md) 부록 A 로 이관.

---

## 폐기된 계획 (되살리지 말 것)

| 폐기 항목 | 이유 |
|---|---|
| **공용 목록 스캐폴드 (`views/partials/list_scaffold/`) 추출** | 의도적으로 하지 않았다. 목록형 메뉴는 `views/user/products/list.ejs` **단일 공유 뷰 + 조건부 include** 로 간다. 다섯 메뉴가 "디스플레이 형태만 비슷할 뿐 기능이 갈린다"는 원문의 유보 판단이 실제로 맞았다 |
| **`product_view_daily` 기반 기간별 집계** | `best_ranking` 스냅샷 배치가 대신한다. 별도 조회 로그 테이블을 만들지 않는다 |
| **오늘특가 = `DEADLINE_SALE` 뱃지 자동 필터 + 카운트다운** | `/deals` 모듈로 대체됨 |
| **아울렛 = `discount_rate` 구간 필터 목록** | 아울렛 전용 상품 + 자체 카테고리를 갖는 모듈로 대체됨 |
| **`/ranking` 별도 메뉴** | `/best` 로 301 통합 |

---

## 알려진 결함

| # | 결함 | 영향 |
|---|---|---|
| 1 | **만료된 `DEADLINE_SALE` 뱃지가 정리되지 않는다** | 만료돼도 `product_badge` 에서 제거되지 않아 카테고리 목록·상품 상세의 카드에 "마감임박" 배지가 계속 붙는다. 뱃지 정리 배치가 필요 |
| 2 | **몰 스코프 누락 테이블** | `banners`·`notices`·`users`·`orders` 에 `mall_id` 가 없다. 이 위에 세운 기능은 두 몰이 같은 데이터를 공유한다 |
