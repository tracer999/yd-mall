# 관리자(Admin) 개발 문서 — 쇼핑몰 빌더 운영 콘솔

> **이 문서는 잔여 과제만 남긴 축약본입니다.** (정리: 2026-07-15)
> 완료된 기능의 설계·동작·운영 방법은 계획서가 아니라 아래 문서가 정본입니다.
> - 개발자: `docs/develop_guide/admin/`, `docs/develop_guide/user/`
> - 운영자: `docs/manual/admin/`, `docs/manual/user/`
>
> 스토어프론트(사용자 화면) 잔여 과제는 [`frontend_dev_plan.md`](./frontend_dev_plan.md) 참조.
> 이 문서의 이전 판(설계 산문·DDL·매트릭스 전문)은 git 이력에서 조회할 수 있습니다.

---

## 완료되어 이관된 항목

| 항목 | 이관된 문서 |
|---|---|
| A1 `admin_menus` 8그룹 재편 + 2뎁스 사이드바 | `develop_guide/admin/menus.md` |
| A2 `/admin/menus` → "관리자 메뉴 관리" 개명 | `develop_guide/admin/menus.md` |
| A3 필수 메뉴 활성화 + Shopify UI 숨김 | `develop_guide/admin/menus.md`, `settings.md` |
| B1 카테고리 트리 (3뎁스 · `depthGuard`) | `develop_guide/admin/categories.md`, `manual/admin/categories.md` |
| B2·B3·B4·B7 일반/커스텀/시스템 메뉴 + 메뉴 미리보기 | `develop_guide/admin/storefront_menus.md`, `manual/admin/menus.md` |
| B5 Header 설정 (스킨 2종 · `nav_mode`) | `develop_guide/admin/settings.md`, `manual/admin/settings.md` |
| B6 상품 그룹 관리 | `develop_guide/admin/page_builder.md` |
| 디자인 스타일 | `develop_guide/admin/settings.md` |
| 페이지 빌더 (섹션 18종 · 발행/롤백 · 섹션 카탈로그 · 랜딩 페이지 편집) | `develop_guide/admin/page_builder.md`, `manual/admin/page_builder.md` |
| 쿠폰 | `develop_guide/admin/coupons.md`, `manual/admin/coupons.md` |
| 멤버십 등급 관리 (1차 MVP — 등급·혜택·평가·결제연동·배치·스토어프론트) | `develop_guide/admin/membership.md`, `manual/admin/membership.md` (설계: `사이트개선/membership_grade_admin_design.md`) |
| 기획전 · 전문관 | `develop_guide/admin/exhibitions.md`, `manual/admin/exhibitions.md` |
| 이벤트 (APPLY형) | `develop_guide/admin/events.md` |
| 공동구매 | `develop_guide/admin/group_buys.md`, `manual/admin/group_buys.md` |
| 클레임 (취소·반품·환불) | `develop_guide/admin/claims.md`, `manual/admin/claims.md` |
| 배송비 정책 | `develop_guide/admin/shipping.md`, `manual/admin/shipping.md` |
| 고객센터 FAQ | `develop_guide/admin/inquiries.md` |
| 브랜드 관리 | `develop_guide/admin/brands.md`, `manual/admin/brands.md` |
| 쇼핑특가 + 특가 카테고리 | `develop_guide/admin/deals.md`, `manual/admin/deals.md` |
| 베스트 · 랭킹 | `develop_guide/admin/best_groups.md`, `manual/admin/best_groups.md` |
| 아울렛 + 아울렛 카테고리 | `develop_guide/admin/outlet.md`, `manual/admin/outlet.md` |
| 상품 추천관리 | `develop_guide/admin/recommend.md`, `manual/admin/recommend.md` |
| 쇼핑라이브 | `develop_guide/admin/lives.md`, `manual/admin/lives.md` |
| 몰 관리 | `develop_guide/admin/malls.md`, `manual/admin/malls.md` |
| 레거시 제거: `main_display_*` + `/admin/display`, `storefront_menu` 테이블 | 완료 — 재확인 불필요 |

---

## 잔여 과제

### 몰 · 통계

- **몰 구성 탭 허브** (`/admin/malls/:id` 6탭) — 몰 하나를 구성하려면 아직 6개 화면을 떠돌아야 한다. 몰 단위 진입점에서 설정·메뉴·페이지·테마 등을 탭으로 묶는다.
- **대시보드·매출 통계 몰 스코프 미적용** — `orders`·`carts` 에 `mall_id` 가 없어 몰별 분리 집계가 불가능하다. 프론트 P5-B(거래 데이터 몰 분리)의 해제 조건과 동일하다.
- **접속 통계 메뉴가 `admin_menus` 에 없다** — 라우트는 `/admin/visitors/stats` 만 존재하고 `/admin/visitors` 는 404. 메뉴 등록 필요.

### 페이지 / 전시

- **페이지 예약 발행 스케줄러** — 섹션 단위 예약 노출(`visible_start_at`/`visible_end_at`)은 이미 동작한다. 페이지(발행 스냅샷) 단위 예약이 없다.
- **섹션 드래그앤드롭 정렬** — 현재 위/아래 버튼만.
- **카테고리 페이지 관리** / **카테고리 SEO · 대표 이미지** — `categories.seo_config` 미도입, `logo_image_path` 는 BRAND 용도로만 사용 중.

### 메뉴

- **모바일 메뉴 전용 설정 화면** — `feature_menu.mobile_quick` 이 0행이고 하단바가 하드코딩이다. 프론트 잔여 과제와 짝을 이룬다.
- **메가메뉴** (`use_mega_menu` · `category_display_type='mega'`) — 서버가 저장을 거부 중(UI 잠금 + 화이트리스트 거부). **해제 조건**: 하위 카테고리(2뎁스) 데이터 입력이 선행이다. 데이터가 없으면 메가메뉴 우측 컬럼이 항상 비므로, "내용 없는 껍데기를 노출하지 않는다"는 `module_ready` 원칙에 따라 잠가 둔 것이다. 현재 GNB 카테고리 패널은 **자식이 있는 노드에만** 서브패널을 띄우므로, 2뎁스를 입력하면 마크업 변경 없이 자동으로 메가메뉴가 된다.
- **Footer 커스텀 관리 화면** — 현재 SNS 4종만 `site_settings` 에 있다.

### 상품

- **옵션/SKU 관리** — 단일 variant 전제.
- **재고 이력 · 알림** — `products.stock` 단일 필드뿐.
- **상품 CSV 일괄 업로드**.

### 회원 / 프로모션

- **회원 등급 · 멤버십 혜택 — 2차** — 1차 MVP + 2차 대부분(쿠폰팩 3종=진입·생일·정기, 혜택별 사용여부 토글, 대시보드 비용 분석) 완료·이관됨(위 표 · [`membership_grade_admin_design.md`](./membership_grade_admin_design.md) 부록 B.5). 남은 2차: 상품/브랜드별 등급 혜택·고객 세그먼트. (강등 사전 알림·설정형 할인 우선순위 완료)
- **리뷰 관리** — `reviews` 테이블은 있으나 관리자 화면이 없다.
- **이벤트 유형 확장** — 현재 APPLY(응모)형만 참여 가능. `COUPON_PACK` · `ATTENDANCE` · `PURCHASE` 미착수.

### 운영 / 시스템

- **권한 그룹 관리 화면** — 현재는 `admin_menus.visible_roles` CSV 를 직접 편집한다. `requireMenuAccess` 가 `path` 로 권한을 판정하므로 **경로를 바꾸면 매칭이 깨진다**는 점을 화면 설계 시 유의.
- **알림 설정 / 로그 관리 / 백업·복구** — 미착수. 로그는 `logs/access.log` 파일뿐.
- **업로드 관리 화면** — `/admin/uploads` 는 TinyMCE 업로드 엔드포인트 하나뿐이며 관리 화면이 아니다.

---

## 알려진 결함

| 결함 | 내용 |
|---|---|
| 대시보드 메뉴 누락 | `admin_menus` id=1(대시보드)이 `is_active=0` 이라 사이드바에 나오지 않는다. 라우트(`/admin`)는 살아 있다. |
| `tables.sql` 스키마 드리프트 | `tables.sql` 은 42테이블, 실제 DB 는 84테이블. 신규 테이블 대부분이 미반영이다. **스키마 판단은 항상 실 DB 를 소스 오브 트루스로.** |
| 계획서 원문 오기 | 이전 판의 "업로드 관리 ✅" 는 **오기**였다. 실제로는 관리 화면이 없다(위 잔여 과제 참조). |
