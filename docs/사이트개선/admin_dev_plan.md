# 관리자(Admin) 개발 문서 — 쇼핑몰 빌더 운영 콘솔

> 이 문서는 **관리자 화면**만 다룬다. 스토어프론트(사용자 화면)는 [`frontend_dev_plan.md`](./frontend_dev_plan.md) 참조.
>
> **출처**: `관리자 개선.md` · `shopping_mall_builder_menu_design_summary.md` · `flexible_shopping_mall_builder_dev_plan.md`
> → 본 문서로 통합·대체되어 **삭제됨**. 원문이 필요하면 git 이력에서 조회한다:
> `git show 4528e44:"docs/사이트개선/관리자 개선.md"`
>
> 최종 갱신: 2026-07-11

---

## 모듈 설계 문서 색인

> 아래 기능 모듈은 각자 **독립 설계 문서**를 갖는다. 이 표는 **링크와 큰 진행 상태만** 관리하고,
> 세부 체크리스트는 각 문서가 소유한다 — 한 곳에서만 관리해야 교차참조 드리프트가 없다.
> 각 문서는 관리자·사용자 화면을 모두 다루므로 [`frontend_dev_plan.md`](./frontend_dev_plan.md) 에도 같은 색인이 있다(관리자/사용자 관점만 다름).
>
> **정본 규칙**: 관리자 기능별 세부 상태는 아래 **§3 매트릭스**가 소유한다. 이 색인과 매트릭스가 어긋나면 **매트릭스가 정본**이다.

| 모듈 | 설계 문서 | 상태 | 관리자 화면 |
|---|---|---|---|
| 쿠폰 | [coupon_design_and_development.md](./coupon_design_and_development.md) | ✅ 0~2차 | `/admin/coupons` 재구축 — 발급방식·정률·무료배송·적용범위(scope)·상태(ENDED)·통계 |
| 배송비 | [shipping_fee_design_and_development.md](./shipping_fee_design_and_development.md) | ✅ 1·2차 | `/admin/shipping-policy` 몰별 정책 + 우편번호 할증 대역 |
| 주문·클레임 | [order_claim_design_and_development.md](./order_claim_design_and_development.md) | ✅ 클레임 0~2차 | `/admin/claims` 취소·반품·환불 승인. 주문 상세 상태 4축·변경 이력 |
| 기획전 | [exhibition_design_and_development.md](./exhibition_design_and_development.md) | 🟡 1차 | `/admin/exhibitions` CRUD·섹션·상품 연결. 2·3차(카테고리·통계·쿠폰) 미착수 |
| 공동구매 | [group_buy_design_and_development.md](./group_buy_design_and_development.md) | 🟡 1차 | `/admin/group-buys` CRUD. ⚠️ 문서는 원안(REST/React) — 구현은 SSR, **문서 갱신 필요** |
| GNB 메뉴 | [gnb_menu_design.md](./gnb_menu_design.md) | 🟡 부분 | 선행버그(B1~B4)·이벤트(E1~E12) 완료. 목록형·브랜드·멤버십·라이브 관리 미착수 |
| 쇼핑라이브 | [live sales.md](<./live sales.md>) | ⬜ 설계만 | 테이블·라우트·컨트롤러 미착수. `/live` 는 준비중 랜딩 |

> 입력 일반론 문서(`쿠폰관리.md`·`주문배송관리.md`)는 위 설계 문서에 흡수·접지되어 **삭제**했다.
> 원문은 git 이력: `git show b97e257:"docs/사이트개선/쿠폰관리.md"` · `git show b97e257:"docs/사이트개선/주문배송관리.md"`

---

## 0-0. 작업 순서 원칙 (사용자 확정, 2026-07-09)

```text
1) 프론트(스토어프론트)를 먼저 전부 구현한다.
2) 그 다음 관리자를 구현하되, 각 프론트 항목이 관리자에서 관리 가능한지 커버리지를 검사한다.
3) 관리자에는 있는데 프론트에 대응 기능이 없는 부분은 프론트를 보완한다.
```
→ 즉 **프론트가 스펙의 원본**이고, 관리자는 그것을 조작하는 콘솔이다.
관리자 화면을 만들 때마다 아래 §3 매트릭스에 **"프론트 대응 기능 존재 여부"** 를 함께 갱신한다.

---

## 0. 설계 원칙 (확정)

관리자는 **"완전 자유형 빌더 관리자"가 아니라 "운영자가 필요한 설정만 안전하게 조정하는 관리자"** 로 간다.

```text
카테고리 관리   = 상품 탐색 구조 관리 (동적)
일반 메뉴 관리   = 사전 정의 기능 메뉴 ON/OFF (URL·위치 고정)
커스텀 메뉴 관리 = 제한된 자유 메뉴 (슬롯 제한)
시스템 메뉴 설정 = 로그인/장바구니/마이페이지 등 고정 기능 (노출 여부만)
페이지/전시 관리 = 메뉴 클릭 후 보여줄 화면 구성
```

### 두 가지 핵심 분리
1. **메뉴 관리 ↔ 페이지/전시 관리 분리**
   - 메뉴 = "상단 GNB에 무엇을 보여줄 것인가"
   - 페이지/전시 = "그 메뉴에 들어갔을 때 어떤 화면을 보여줄 것인가"
   - 섞으면 관리자 구조가 급격히 복잡해진다.

2. **위치(position) 고정 원칙** *(사용자 확정, 2026-07-09)*
   - 커스텀 메뉴를 **제외한** 모든 메뉴는 위치가 **코드에 고정**된다.
   - 운영자는 **ON/OFF · 표시명 · 순서**만 조정한다.
   - 예: 일반 메뉴 → `gnb` / 장바구니·찜·최근본 → `right_rail` / 로그인·검색 → `header_util`

### `module_ready` 게이트 (구현됨)
`feature_menu.module_ready = 0` 이면 운영자가 메뉴를 **켜도 스토어프론트에 노출되지 않는다.**
렌더 조건은 항상 `is_enabled AND module_ready`. → **죽은 링크가 구조적으로 발생 불가.**

---

## 1. ⚠️ 명칭 충돌 — ✅ **A2 완료 (2026-07-10)**

`/admin/menus` 는 **관리자 사이드바 메뉴(`admin_menus` 테이블)** 를 관리하는 화면인데,
본 설계의 "메뉴 관리"(스토어프론트 GNB)와 이름이 겹쳤다.

| 대상 | 경로 | 명칭/위치 |
|---|---|---|
| 관리자 사이드바 메뉴 | `/admin/menus` | ✅ 운영/시스템 관리 > **관리자 메뉴 관리** |
| 스토어프론트 GNB 기능 메뉴 | `/admin/feature-menus` | ✅ 메뉴/카테고리 관리 > 일반 메뉴 관리 (B2) |
| 스토어프론트 고정 유틸 메뉴 | `/admin/system-menus` | ✅ 메뉴/카테고리 관리 > 시스템 메뉴 설정 (B4) |

`node scripts/migrate_admin_menu_a2_b4_b5.js` (멱등) 로 `admin_menus.name` 을 개명했다.
**경로는 바꾸지 않았다** — `requireMenuAccess` 가 `path` 로 권한을 판정하므로 경로를 건드리면
`admin_menus.visible_roles` 매칭이 깨진다. 그룹 배치는 A1 에서 이미 끝났다.
화면 본문에도 H1("관리자 메뉴 관리")과 스토어프론트 메뉴 관리로의 안내 링크를 넣어 혼동을 없앴다.

---

## 2. 관리자 메뉴 구조 (8 그룹)

현재 `admin_menus` 는 **19건이 전부 최상위(그룹 없음)** 이다. `parent_id` 컬럼은 존재하나 미사용.
아래 8개 그룹으로 재편한다.

```text
관리자
├─ 1. 대시보드
├─ 2. 쇼핑몰 설정
│   ├─ 기본 정보 / 로고·브랜드 / 테마 / Header / Footer / 검색 / 정책
├─ 3. 메뉴/카테고리 관리          ★ 신설 (M6)
│   ├─ 카테고리 관리 / 일반 메뉴 / 커스텀 메뉴 / 시스템 메뉴 / 모바일 메뉴 / 메뉴 미리보기
├─ 4. 페이지/전시 관리
│   ├─ 메인 페이지(페이지 빌더) / 카테고리 페이지 / 기획전 / 상품 그룹 / 배너 / 발행·예약
├─ 5. 상품 관리
│   ├─ 상품 목록·등록 / 옵션·SKU / 재고 / 브랜드 / 진열 상태 / 일괄 업로드
├─ 6. 프로모션 관리
│   ├─ 쿠폰 / 할인 / 오늘특가 / 베스트 / 이벤트 / 공동구매 / 포인트 / 멤버십
├─ 7. 주문/회원 관리
│   ├─ 주문 / 취소·반품·교환 / 배송 / 회원 / 회원 등급 / 리뷰·문의
└─ 8. 운영/시스템 관리
    ├─ 관리자 계정 / 권한 그룹 / 관리자 메뉴 관리 / 공지사항 / 고객센터
    ├─ 외부 연동 설정 / 업로드 관리 / 로그·통계 / 알림 / 백업·복구
```

### 2.1 `admin_menus` 그룹화 마이그레이션 — ✅ **A1 완료 (2026-07-09)**

`node scripts/migrate_admin_menu_groups.js` (멱등, `--reset` 로 평면 복구 가능)

> ⚠️ **문서 정정**: "스키마 변경 불필요" 는 **틀렸다.** 실측 결과 `admin_menus.path` 가 `NOT NULL` 이라
> 그룹 행(`path IS NULL`)을 만들 수 없었다. → 마이그레이션이 `path` 를 **NULL 허용**으로 변경한다.
> 그룹은 링크가 없으므로 `path` 가 없는 게 맞다.

**결과**: 그룹 7건 신설 + 기존 19건에 `parent_id` 지정 (총 26행). 대시보드는 그룹 없이 최상위 유지.

**함께 수정한 것** (A1이 관리 화면을 깨뜨리지 않도록):
- `middleware/adminMenu.js` — 평면 목록 → **2뎁스 트리**(`res.locals.adminMenuTree`).
  권한(`visible_roles`)은 **잎 메뉴에만** 적용하고, 보이는 자식이 없는 그룹은 통째로 숨긴다.
  `res.locals.adminMenus`(접근 가능한 잎 평면 목록)는 하위호환으로 유지.
- `views/layouts/admin_layout.ejs` — 접기/펼치기 그룹 렌더. 활성 자식이 있는 그룹은 서버가 펼친 상태로 보낸다.
- `controllers/admin/menuController.js` — **2건의 버그를 함께 고침**:
  1. `getMenus` 가 `WHERE parent_id IS NULL` 이라 그룹화 후 **자식 19건이 관리 화면에서 사라짐** → 전체를 트리 순서로 조회
  2. `saveMenus` 가 ① `path` 없는 행을 건너뛰어 그룹 편집 불가 ② `display_order` 를 전역 `i+1` 로 매겨 그룹 간 순서가 뒤섞임
     ③ **자식 있는 그룹을 지우면 자식이 고아가 되어 사이드바에서 통째로 사라짐**
     → `parent_id` 왕복 보존, 빈 path 는 `NULL`(그룹)로 저장, 순서는 그룹 단위로 부여, **고아 발생 삭제는 400 차단**
- `views/admin/menus/list.ejs` — `parent_id[]` 히든 입력 왕복, 그룹/소속 표시, 그룹은 path 비움 허용

**검증**: 역할별 트리(super_admin 14잎 / content_admin 8잎 / customer_admin 2잎, 빈 그룹 자동 숨김),
레이아웃 실제 렌더(그룹 7·링크 14·활성 그룹 자동 펼침), 삭제 가드(자식 5건 보호, 그룹+자식 동시 삭제는 허용),
`--reset` → 재적용 왕복, `requireMenuAccess` 무영향(`path` 조회이므로 그룹 행에 안 걸림).

| 기존 메뉴 | id | 이동할 그룹 |
|---|---|---|
| 대시보드 | 1 | (그룹 없음, 최상위 유지) |
| 사이트 설정 | 15 | 2. 쇼핑몰 설정 |
| 시스템 설정 | 16 | 8. 운영/시스템 (외부 연동 설정) |
| 약관/정책 관리 | 10 | 2. 쇼핑몰 설정 (정책 설정) |
| 카테고리 | 2 | 3. 메뉴/카테고리 관리 |
| 페이지 빌더 | 21 | 4. 페이지/전시 관리 (메인 페이지 관리) |
| 전시관리(레거시) | 19 | 4. 페이지/전시 관리 → **폐기 예정** |
| 배너 관리 | 4 | 4. 페이지/전시 관리 |
| 상품 관리 | 3 | 5. 상품 관리 |
| 쿠폰 관리 | 13 | 6. 프로모션 관리 |
| 포인트 관리 | 14 | 6. 프로모션 관리 |
| 판매 관리 | 5 | 7. 주문/회원 관리 |
| 배송 관리 | 6 | 7. 주문/회원 관리 |
| Shopify 주문 | 20 | 7. 주문/회원 관리 |
| 회원 관리 | 7 | 7. 주문/회원 관리 |
| 문의 관리 | 8 | 7. 주문/회원 관리 (리뷰·문의) |
| 운영자 관리 | 11 | 8. 운영/시스템 |
| 메뉴관리(admin_menus) | 12 | 8. 운영/시스템 → ✅ **"관리자 메뉴 관리"로 개명 완료 (A2)** |
| 공지사항 관리 | 17 | 8. 운영/시스템 |
| 접속 통계(visitors) | – | 8. 운영/시스템 (로그·통계) |

> ✅ 위 매핑대로 `scripts/migrate_admin_menu_groups.js` 에 반영되어 적용 완료.

---

## 3. 구현 현황 매트릭스

범례: ✅ 구현 · 🟡 부분 구현 · ⬜ 미구현

### 3.1 대시보드
| 기능 | 상태 | 근거 |
|---|---|---|
| 대시보드 | ✅ | `/admin`, `dashboardController.js` |

### 3.2 쇼핑몰 설정
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 기본 정보(상호·연락처·주소·사업자) | ✅ | `/admin/site-settings`, `site_settings` |
| 로고/브랜드 컬러/파비콘/OG | ✅ | `site_settings.logo_url`, `brand_*_color`, `favicon_url`, `kakao_share_image_url` |
| 정책 설정(약관/개인정보) | ✅ | `/admin/policies` |
| **테마 설정** | ✅ | **완료 (2026-07-10).** `/admin/theme-settings` — `theme.config_json` 스타일 토큰. 저장 시 `themeService` 가 export 하는 검증 규칙(`TOKENS[].test` / `CARD_STYLES`)을 **그대로 재사용**해 CSS 인젝션을 막고, `themeData.invalidate()` 로 캐시를 비운다. `themeService` 는 렌더 시 이상값을 조용히 폴백하지만 관리자는 **거부하고 사유를 표시**한다. |
| **Header 설정** | ✅ | **B5 완료.** `/admin/header-settings` — `navigation_config` 편집(§3.2.1) |
| **Footer 설정** | 🟡 | SNS·회사정보만 `site_settings` 에 있음. Footer 커스텀 메뉴 없음 |
| **검색 설정** | 🟡 | 검색창 노출은 시스템 메뉴 `HEADER_SEARCH`(필수)로 제어. `navigation_config.use_search_bar` 는 Header 설정에서 저장되나 **렌더가 아직 소비하지 않는다** |

#### 3.2.1 Header 설정 — ✅ B5 구현 완료 (2026-07-10)

`/admin/header-settings` (쇼핑몰 설정 그룹). `navigation_config` 단일 행(mall_id=1)을 편집한다.

| 필드 | 렌더 반영 | 서버 검증 |
|---|---|---|
| `max_gnb_items` | ✅ `navigationService` 가 GNB 총량으로 자름 | 1~20 클램프 |
| `max_custom_items` | ✅ 커스텀 슬롯 상한 | 0~10 클램프, **`max_gnb_items` 초과 시 총량으로 맞춤** |
| `category_max_depth` | ✅ `depthGuard` 상한 + 카테고리 트리 필터 | 1~3 클램프, **현재 데이터의 최대 depth 미만으로 하향 거부** |
| `header_layout_type` | ⬜ 미소비 | 화이트리스트(현재 1종), 이외 값은 기존값 유지 |
| `category_display_type` | ⬜ `mega` 미지원 | `dropdown` 만 허용(`mega` 는 UI 잠금 + 서버 거부) |
| `use_mega_menu` | ⬜ 미소비 | **항상 0 으로 고정 저장** |
| `use_search_bar` | ⬜ 미소비 | 저장만 |

> **뎁스 하향 거부가 핵심이다.** `navigationService.getCategoryTree` 가 `depth <= maxDepth` 로 거르므로,
> 3뎁스 카테고리가 있는 상태에서 상한을 1로 낮추면 하위 카테고리가 **조용히 GNB 에서 사라진다.**
> 저장 시 `MAX(categories.depth)` 를 조회해 그보다 낮은 값이면 거부하고 사유를 화면에 표시한다.
>
> 렌더가 소비하지 않는 필드는 UI 에서 잠그고 "미지원/모듈 미구현"으로 표기했다.
> `feature_menu.module_ready` 와 같은 원칙 — **켜도 안 바뀌는 스위치를 운영자에게 내주지 않는다.**

### 3.3 메뉴/카테고리 관리 ★ 최우선
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 카테고리 관리 | 🟡 | `/admin/categories` 존재하나 **평면**. `parent_id` 미사용, 트리 UI 없음. **M1에서 `depth·is_active·pc_visible·mobile_visible·slug·mall_id` 컬럼은 추가 완료** |
| 일반 메뉴 관리 (ON/OFF) | ✅ | **B2 완료.** `/admin/feature-menus` — GNB 13종 |
| 커스텀 메뉴 관리 | ⬜ | `custom_menu` 테이블 완료, UI 없음 → **B3 (후순위)** |
| 시스템 메뉴 설정 | ✅ | **B4 완료.** `/admin/system-menus` — 헤더 유틸 5 + 우측 레일 5 |
| 모바일 메뉴 설정 | ⬜ | `pc_visible`/`mobile_visible` 컬럼만 존재 |
| 메뉴 미리보기 | ✅ | **B7 완료.** `/admin/menu-preview` — `navigationService.getNavigation` 재사용(§3.3.1) |
| SEO 제목/설명(카테고리) | ⬜ | `categories.seo_config` 미도입 |
| 카테고리 대표 이미지(메가메뉴) | ⬜ | `logo_image_path` 는 BRAND 용도로만 사용 중 |

#### 3.3.1 메뉴 미리보기 — ✅ B7 구현 완료 (2026-07-10)

`/admin/menu-preview?device=pc|mobile&login=0|1`

조립 로직을 다시 짜지 않고 **스토어프론트와 같은 함수** `navigationService.getNavigation(1, {isLoggedIn})`
을 호출한다. 미리보기와 실제가 어긋나면 미리보기의 존재 이유가 사라진다.

미리보기의 값은 "무엇이 보이는가"보다 **"무엇이 왜 안 보이는가"** 에 있다. 그래서 제외 항목을 사유와 함께 표시한다.

| 사유 | 판정 |
|---|---|
| 모듈 미구현 | `feature_menu.module_ready = 0` (켜도 렌더 제외) |
| 사용 안 함 | `mall_feature_menu.is_enabled = 0` |
| 로그인 필요 | `login_required = 1` 이고 비로그인 미리보기 |
| 노출 기간 전/종료 | `visible_start_at` / `visible_end_at` |
| GNB 잘림 | `max_gnb_items` 초과분 (몇 개가 잘렸는지 표시) |

잘린 개수는 `navigationService` 가 새로 돌려주는 **`gnbCandidateCount`**(자르기 전 후보 수)로 계산한다.
커스텀 메뉴의 `link_type` 해석(모듈 없는 유형 제외)까지 반영된 값이다. 스토어프론트는 이 필드를 읽지 않는다.

PC/모바일은 서버가 기기 필터를 하지 않는다(같은 HTML 에 함께 렌더되고 뷰가 고른다).
미리보기도 같은 방식으로 `pcVisible`/`mobileVisible` 을 뷰에서 거른다.

### 3.4 페이지/전시 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 메인 페이지 관리(섹션 CRUD·순서·복제) | ✅ | `/admin/page-builder`, `pageBuilderService.js` |
| 미리보기(PC/모바일) | ✅ | `getHomePreview`, iframe. **몰 불일치 버그 수정(§3.4.2)** — 편집 몰(`adminMallId`)의 작업본을 렌더 |
| 발행 / 롤백 | ✅ | `page_revision` 스냅샷 |
| **예약 발행** | ⬜ | 스케줄러 없음 |
| 드래그앤드롭 정렬 | 🟡 | 위/아래 버튼만. 완전 DnD 미구현 |
| 배너 관리 | ✅ | `/admin/banners` |
| 상품 그룹 관리 | ✅ | **B6 완료.** `/admin/product-groups` — 삭제·비활성 참조 가드 + seed_key 보존(§3.4.1) |
| 카테고리 페이지 관리 | ⬜ | — |
| 기획전 페이지 관리 | 🟡 | **1차 완료.** `/admin/exhibitions` CRUD·섹션·상품 연결 → [exhibition 설계](./exhibition_design_and_development.md). 2·3차(카테고리·통계·쿠폰) 미착수 |
| 섹션 템플릿 관리 | ⬜ | `sectionRegistry.js` 코드 고정 (의도된 설계) |
| **섹션 팔레트 (CT 컴포넌트)** | ✅ | CT-0~9 완료. `sectionRegistry` 에 14종 등록돼 **페이지 빌더 "섹션 추가" 팔레트에 자동 노출**됨: `product_carousel` `brand_carousel` `ranking_tabs` `benefit_bento` `promotion_banner` `quick_menu` `recent_product` `custom_html` |
| **custom_html 저장 새니타이즈** | ✅ | `pageBuilderService.updateSection` 이 저장 시 새니타이즈(렌더 시와 이중 방어). **깨진 img 제거 보강(§3.4.2)** |
| **전시관리(레거시)** | 🟡 | `/admin/display` + `main_display_*`. **`page_section` 으로 대체됨 → 폐기 대상** |

#### 3.4.1 상품 그룹 관리 — ✅ B6 구현 완료 (2026-07-10)

`/admin/product-groups` (페이지/전시 관리 그룹). `product_grid` · `product_carousel` · `benefit_bento`
섹션의 데이터 소스인 `product_group` 을 직접 만들고 편집한다.

**UI 범위는 `productGroupService.resolve()` 가 실제로 읽는 것에 정확히 맞췄다.**

| group_type | 유효한 것 | 무시되는 것(UI 에서 감춤) |
|---|---|---|
| `manual` | `product_group_item` (product_id, sort_order) | `sort_type`, `filter_condition_json` |
| `condition` | 필터 4키(`badge`/`category_id`/`min_discount`/`in_stock`) + `sort_type` 6종 | `product_group_item` |

`product_group_item.is_fixed` 는 `resolve` 가 읽지 않는 **죽은 컬럼**이라 노출하지 않는다.
B5 와 같은 원칙 — 켜도 안 바뀌는 스위치를 운영자에게 내주지 않는다.

##### 반드시 지켜야 할 2가지

| 위험 | 막지 않으면 | 처리 |
|---|---|---|
| 참조 중인 그룹 **삭제** | `page_section.data_source_id` 에 **FK 가 없다** → 섹션이 고아 참조를 든 채 빈 상태로 노출 | 참조 섹션이 있으면 삭제 차단 |
| 참조 중인 그룹 **비활성화** | `getById` 가 `WHERE is_active = 1` 이라 **끄기만 해도** 참조 섹션이 조용히 빔 | 활성 참조 섹션이 있으면 `is_active→0` 차단 |

> 삭제만 막으면 절반이다. 비활성화가 같은 결과를 낳는다는 점이 핵심이다.
> 참조 섹션 목록은 목록·편집 화면에 함께 띄운다.

##### `seed_key` 보존

`filter_condition_json` 안의 `seed_key` 는 `scripts/seed_ct_sections.js` 가 그룹을 식별하는 키다(3·4번 그룹).
저장 시 JSON 을 통째로 덮으면 시드 재실행이 **그룹을 중복 생성**한다.
그래서 UI 가 관리하는 4키만 갱신하는 read-modify-write 로 저장한다.

##### 함께 고친 버그

`condition` → `manual` 전환 시 500. mysql2 가 JSON 컬럼을 **객체로** 돌려주는데 그 값을 그대로
UPDATE 파라미터로 재바인딩해 `[object Object]` → `Invalid JSON text` 가 났다.
`manual` 일 때는 `filter_condition_json` 컬럼을 **아예 건드리지 않는다** —
나중에 `condition` 으로 되돌릴 때 조건과 `seed_key` 가 살아 있어야 한다.

#### 3.4.2 페이지 빌더 버그 수정 — ✅ (2026-07-11)

멀티몰(건강식품관 mall 1 / 종합관 mall 2) 도입 후 페이지 빌더에서 나타난 3건을 수정했다.

##### ① 미리보기가 편집 몰과 매칭되지 않음 (핵심)

**증상**: 빌더에서 추가/선택한 섹션과 미리보기 화면이 다르게 보임. 종합관을 편집해도 미리보기엔 건강식품관이 뜸.

**원인**: `mainController.getHomePreview` 가 `displayService.getHomePage()` 를 **인자 없이** 호출 →
`mallId` 기본값 1 + `status='published'` 로 **항상 mall 1(건강식품관) 발행본**을 렌더. 반면 에디터는
`req.adminMallId`(세션 기반, 몰 전환 가능) + status 무필터로 대상 페이지를 고름 → 편집 몰과 미리보기가 어긋남.

**수정**: 미리보기가 편집 몰의 작업본을 렌더하도록 —
```js
req.mallId = req.adminMallId || req.mallId || 1;          // 히어로·상품 리졸버까지 같은 몰로 스코프
const page = await pageBuilderService.getHomePage(req.mallId); // status 무필터 → draft 홈도 잡음
```
검증: adminMall=1→page1(14섹션), adminMall=2→page4(4섹션)로 편집 몰과 일치.

> 참고(설계상 정상): 미리보기=라이브 작업본(page_section), 실제 홈=발행 스냅샷(page_revision). **발행 전 편집은 스토어프론트에 반영되지 않는 것이 정상**이다.
> 잔여(별개 UX): `addSection` 이 `data_source_id` 를 NULL 로 넣어, 데이터소스 미지정 `product_grid`/`product_carousel` 은 리졸버가 null→미리보기에서 스킵된다(에디터 카드엔 남음). 에디터 섹션 카드에 "데이터 미지정/비활성/기간밖" 배지를 붙이는 것이 후속 과제.

##### ② 건강식품관만 화면 깨짐 (오염 데이터 + 렌더 방어)

**증상**: 종합관은 정상인데 건강식품관 홈만 화면이 깨짐(HTTP 200 — 서버 500 아님, 시각적 깨짐).

**원인**: 건강식품관 홈의 `custom_html` 섹션(`page_section` id=23, `seed_key: ct9_custom_html` 시드 테스트 데이터)에
XSS 페이로드(`<script>`, `<img src=x onerror>`, `javascript:`)가 있고, sanitize 후 `<img src="x">`(깨진 이미지 아이콘)로 남아 노출. 종합관엔 custom_html 섹션 자체가 없어 무관.

**수정(코드)**: `htmlSanitizer` 에 `exclusiveFilter` 추가 → src 가 비었거나 실제 경로가 아닌 `<img>`(예: `src="x"`) 제거.
정상 경로(`/uploads/…`, `https://…`, `//cdn`)는 유지. 검증: 건강식품관 홈에서 `src="x"` 0개.

**수정(방어)**: `views/user/index.ejs` 의 섹션 `include` 를 섹션별 `try/catch` 로 격리 →
한 섹션 파셜이 throw 해도 홈 전체가 500 나지 않고 해당 섹션만 스킵+로깅(리졸버 계층은 이미 격리돼 있었음).

**잔여(데이터 정리)**: id=23 섹션은 문구 잔재(`위험한 링크` 등)가 남아 있어 관리자 빌더에서 삭제/교체 권장.
다른 몰·페이지의 `seed_key LIKE 'ct%'` 시드 테스트 섹션도 함께 점검.

##### ③ 정적 정보 페이지(특장점 등) 관리 — 구조 한계 (미착수)

특장점(`value_proposition`)은 `sectionRegistry` 에 `fields: []` 로 등록 + `views/partials/sections/value_proposition.ejs` **하드코딩**이라 관리자가 문구를 편집할 수 없다. 이용안내(`/guide`)도 동일. (회사소개/약관은 `siteSettings` 로 편집 가능)

선택지: **(A)** `value_proposition` 에 config 필드+리졸버 추가(구조 고정 섹션에 적합, 작업량 소) · **(B)** custom_html 대체(자유도↑, 홈 섹션 한정) · **(C)** `page_type='custom'` slug 기반 정적 페이지 CMS 신설(중장기 권장 — `page` 테이블에 스키마는 이미 존재, `home` 만 사용 중).

### 3.5 상품 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 상품 목록/등록/수정 | ✅ | `/admin/products` |
| 상품 진열 상태 | ✅ | `products.status`(ON/SOLD_OUT/COMING_SOON/RESTOCK/OFF), `visibility` |
| 브랜드 관리 | 🟡 | `categories.type='BRAND'` 로 관리. 전용 화면 아님 |
| 재고 관리 | 🟡 | `products.stock` 단일 필드. 재고 이력·알림 없음 |
| 옵션/SKU 관리 | ⬜ | 단일 variant 전제 (Shopify 동기화도 Default Title 1개) |
| 상품 일괄 업로드 | ⬜ | Shopify 동기화 스크립트만 존재 |
| Shopify 동기화 | ⏸ | `syncService.js` + `shopify_sync_enabled=0` (미사용). 동기화 버튼도 숨김(A3) |

### 3.6 프로모션 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 쿠폰 관리 | ✅ | `/admin/coupons` **재구축 완료(2026-07-11)** — 발급방식·정률·무료배송·적용범위·상태·통계 → [coupon 설계](./coupon_design_and_development.md) |
| 포인트 관리 | ✅ | `/admin/points`. **A3에서 활성화**. `point_transactions` 기반 |
| 할인 관리 | ⬜ | `products.discount_rate` 필드만 |
| 오늘특가 관리 | ⬜ | `product_badge='DEADLINE_SALE'` 수동 지정 |
| 베스트 관리 | ⬜ | `product_badge='BEST'` 수동 지정 |
| 이벤트 관리 | ✅ | **E1~E12 완료.** `/admin/events` CRUD + 고객 `/event` 응모(APPLY)형 → [gnb 설계 §8](./gnb_menu_design.md). E13~E15(쿠폰팩·출석·구매인증) 미착수 |
| 공동구매 관리 | 🟡 | **1차 완료.** `/admin/group-buys` CRUD → [group_buy 설계](./group_buy_design_and_development.md). 2·3차(목표달성·쿠폰) 미착수 |
| 멤버십 혜택 관리 | ⬜ | `MEMBERSHIP` 모듈 없음 |

### 3.7 주문/회원 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 회원 관리 | ✅ | `/admin/users` |
| Shopify 주문 | ⏸ | **A3에서 메뉴 숨김**(현재 Shopify 미사용). 라우트·서비스·웹훅은 유지. `system_settings.shopify_sync_enabled=0` |
| 판매(주문) 관리 | ✅ | `/admin/sales`. **A3에서 활성화**. `orders`/`order_items`/`shipments` 기반 |
| 배송 관리 | ✅ | `/admin/shipping` 송장(`shipments`) + 배송완료 처리. **`/admin/shipping-policy` 배송비 정책 신설** → [shipping 설계](./shipping_fee_design_and_development.md) |
| 문의 관리 | ✅ | `/admin/inquiries`. **A3에서 활성화**. `inquiryController` 기반 |
| 취소/반품/교환 | ✅ | **클레임 모듈 완료(2026-07-11).** `/admin/claims` 취소·반품·환불 승인 → [order_claim 설계](./order_claim_design_and_development.md). 교환·부분클레임 3차 |
| 회원 등급 관리 | ⬜ | — |
| 리뷰 관리 | ⬜ | 리뷰 테이블은 있으나 관리 화면 없음 |
| 장바구니/관심상품 통계 | ⬜ | — |

### 3.8 운영/시스템 관리
| 기능 | 상태 | 근거 / 비고 |
|---|---|---|
| 관리자 계정 관리 | ✅ | `/admin/operators` |
| 관리자 메뉴 관리 | ✅ | `/admin/menus` (개명 필요) |
| 공지사항 관리 | ✅ | `/admin/notices` |
| 외부 연동 설정 | ✅ | `/admin/sys-settings` (`system_settings`: Shopify/OpenAI/OAuth/SMTP/Toss/TinyMCE) |
| 업로드 관리 | ✅ | `/admin/uploads` (문서 원안에 누락된 항목) |
| 접속 통계 | ✅ | `/admin/visitors/stats` (라우트에 인덱스 없음 — `/admin/visitors` 는 404) |
| 권한 그룹 관리 | 🟡 | `admin_menus.visible_roles` + `adminRoleGuard.js`. 별도 권한 그룹 화면 없음 |
| **고객센터 관리** | ✅ | **완료 (2026-07-10).** `/admin/faqs` — FAQ CRUD. `answer` 는 저장 시 `htmlSanitizer.sanitize()` 를 걸어 렌더 시 방어와 **이중**으로 막는다. |
| 알림 설정 | ⬜ | — |
| 로그 관리 | 🟡 | `logs/access.log` 파일. 관리 화면 없음 |
| 데이터 백업/복구 | ⬜ | — |

---

## 4. 메뉴/카테고리 관리 상세 설계 (M6)

가장 우선순위가 높은 신규 관리 화면. DB는 **이미 준비되어 있다**(M1/M2 완료).

### 4.1 카테고리 관리
경로: `관리자 > 메뉴/카테고리 관리 > 카테고리 관리`

| 항목 | 컬럼 | 상태 |
|---|---|---|
| 카테고리명 | `categories.name` | ✅ |
| 상위 카테고리 | `categories.parent_id` | ✅ B1 |
| depth (**최대 3**) | `categories.depth` | ✅ B1 (앱 레이어 강제) |
| URL slug | `categories.slug` | 컬럼 O(M1), 라우팅 ⬜ |
| 노출 순서 | `categories.display_order` | ✅ |
| 사용 여부 | `categories.is_active` | ✅ B1 |
| PC/Mobile 노출 | `pc_visible` / `mobile_visible` | ✅ B1 |
| 대표 이미지 | ⬜ | 메가메뉴용 |
| SEO 제목/설명 | ⬜ | `seo_config` 미도입 |

**구현 완료**: `services/tree/depthGuard.js`
- `assertDepthAllowed({ parentId })` → `부모.depth + 1 > maxDepth` 면 저장 거부
- `wouldCreateCycle({ nodeId, candidateParentId })` → 자기 자신/후손을 상위로 지정하면 거부
- `recalcSubtreeDepth(nodeId)` → 부모 이동 시 자신+후손 depth 일괄 갱신 (트랜잭션 내)
- `navigation_config.category_max_depth` (기본 3) 를 상한값 소스로 사용

> **주의**: `type`(NORMAL/THEME/BRAND)은 뎁스가 아니다. 병렬 분류축이며 뎁스 제한은 각 type 트리 내부에서 독립 적용. 부모도 같은 type 안에서만 선택할 수 있다.

#### 4.1.1 계층 무결성에서 반드시 막아야 하는 3가지 (B1, 2026-07-09)

| 경로 | 막지 않으면 | 처리 |
|---|---|---|
| 뎁스 초과 | 4단계 이상 생성 | `assertDepthAllowed` — MySQL CHECK 로는 `부모.depth + 1` 동적 검증 불가 |
| 순환 참조 | `recalcSubtreeDepth` BFS 가 DB 를 오염시킨 뒤 예외 | `wouldCreateCycle` 을 **UPDATE 전에** 호출 |
| 부모 삭제 | `parent_id` 가 `ON DELETE SET NULL` → 자식이 조용히 최상위로 승격 + `depth` 불일치 | 자식 있으면 삭제 차단 |

관련 프론트 수정: `navigationService.buildTree` 는 부모가 필터(비활성/뎁스초과)에서 빠진 노드를
최상위로 승격시키지 않고 함께 숨긴다.

### 4.2 일반 메뉴 관리 (ON/OFF)
경로: `관리자 > 메뉴/카테고리 관리 > 일반 메뉴 관리`

**운영자가 URL을 직접 입력하지 못하게 한다.** (잘못된 URL 방지 · 모듈 연결 보장 · SEO 구조 유지 · QA 범위 축소)
허용: **사용 여부 · 메뉴명 · 노출 순서 · PC/Mobile 노출 · 로그인 필요 · 노출 기간 · 배지**

현재 카탈로그(`feature_menu`, `position='gnb'`) — **23건 중 GNB 13건**:

| 코드 | 기본명 | 표준 URL | `module_ready` | 몰1 기본 |
|---|---|---|---|---|
| `CATEGORY` | 카테고리 | (드롭다운) | 1 | ON (고정) |
| `TODAY_DEAL` | 오늘특가 | `/deal/today` | 1 | ON |
| `BEST` | 베스트 | `/best` | 1 | ON |
| `NEW_PRODUCT` | 신상품 | `/new` | 1 | ON |
| `EVENT` | 이벤트&혜택 | `/event` | 1 | ON |
| `BRAND` | 브랜드 | `/brands` | 1 | OFF |
| `EXHIBITION` | 기획전 | `/exhibition` | **0** | OFF |
| `RANKING` | 랭킹 | `/ranking` | **0** | OFF |
| `OUTLET` | 아울렛 | `/outlet` | **0** | OFF |
| `COUPON` | 쿠폰 | `/coupon` | **0** | OFF |
| `MEMBERSHIP` | 멤버십 | `/membership` | **0** | OFF |
| `GROUP_BUY` | 공동구매 | `/group-buy` | **0** | OFF |
| `LIVE` | 쇼핑라이브 | `/live` | **0** | OFF |

> UI에서 `module_ready = 0` 항목은 **"모듈 미구현"** 배지와 함께 **비활성(토글 잠금)** 으로 표시한다.

### 4.2.1 일반 메뉴 관리 화면 — ✅ B2 구현 완료 (2026-07-09)

`/admin/feature-menus` (메뉴/카테고리 관리 그룹) — **B4 에서 `position='gnb'` 전용으로 좁혔다.**
헤더 유틸·우측 레일은 [시스템 메뉴 설정](#44-시스템-메뉴-설정--b4-구현-완료-2026-07-10)이 담당한다.

| 편집 가능 | 편집 불가 (코드 고정) |
|---|---|
| 사용 여부(ON/OFF) · **표시 명칭** · 순서 · PC/모바일 노출 · 로그인 필요 · 배지 | **기본 명칭** · 표준 URL · 위치(position) |

> **기본 명칭 / 표시 명칭 2단 구조** *(사용자 확정)*
> - **기본 명칭**(`feature_menu.default_name`)은 읽기 전용으로 노출한다 → 운영자가 그 메뉴의 **성격**을 안다.
> - **표시 명칭**(`mall_feature_menu.display_name`)만 변경 가능하다. 비우면 기본 명칭을 쓴다.
>   (`COALESCE(NULLIF(display_name,''), default_name)`)

**서버측 강제 규칙** (폼 값을 신뢰하지 않고 `feature_menu` 를 다시 조회해 판정)
- `is_required = 1` → 끌 수 없다. 강제로 `is_enabled = 1` 저장 (로그인·마이쇼핑·장바구니·검색·TOP)
- `module_ready = 0` → 켤 수 없다. 강제로 `is_enabled = 0` 저장 (켜도 렌더에서 제외되므로 상태를 정직하게 유지)
- 배지는 `NEW/HOT/SALE` 화이트리스트만 저장 (그 외/스크립트 주입은 `NULL`)

**검증**: `RANKING`(모듈없음) 켜기 시도 → 0 유지 / `HEADER_LOGIN`(필수) 끄기 시도 → 1 유지 /
`BEST` 정상 OFF / 배지에 `<script>` 주입 → `NULL` / 표시명 변경이 스토어프론트 GNB 에 즉시 반영.

### 4.2.2 기본 GNB 구성 (사용자 확정, 2026-07-09)

`node scripts/seed_gnb_menus.js` (멱등) — **초기값만** 세팅하고, 이후는 위 화면에서 조정한다.

```text
카테고리(고정) · 오늘특가 · 베스트 · 기획전 · 이벤트&혜택 · 브랜드 · 신상품 · 공동구매 · 쇼핑라이브
```

- `기획전` `공동구매` `쇼핑라이브` 는 전용 모듈이 없어 **'준비 중' 랜딩 페이지**로 연결한다
  (`routes/feature.js` + `views/user/coming_soon.ejs`). `#` 죽은 링크가 아니라 실제 **200 페이지**(noindex)이므로
  `module_ready = 1` 로 올려 GNB 에 노출한다. 모듈 구현 시 핸들러만 교체하면 URL·설정은 그대로다.
- `navigation_config.max_gnb_items` 를 8 → **11** 로 상향했다. `navigationService` 가 GNB 총량으로 자르므로
  기능 8종이 슬롯을 다 채우면 커스텀 메뉴 3슬롯이 잘린다.
- 여전히 `module_ready = 0`(잠금): `RANKING` `OUTLET` `COUPON` `MEMBERSHIP`

✅ **`mall_feature_menu.badge_type`(NEW/HOT/SALE) 컬럼 추가 완료** (2026-07-09, `scripts/migrate_menu_columns.js`).
GNB 렌더도 배지를 표시하며, `navigationService` 가 `NEW/HOT/SALE` 화이트리스트로 정규화한다.
→ 관리자 UI 는 이 세 값 중 선택하는 드롭다운이면 된다(자유 입력 금지).

### 4.3 커스텀 메뉴 관리
경로: `관리자 > 메뉴/카테고리 관리 > 커스텀 메뉴 관리`

| 위치 | 허용 개수 | 제어 |
|---|---|---|
| Header GNB | **최대 3** | `navigation_config.max_custom_items` (기본 3) |
| 메가메뉴 프로모션 | 최대 5 | ⬜ |
| Footer | 최대 20 | ⬜ |
| 모바일 퀵 메뉴 | 최대 5 | ⬜ |

✅ **스키마 확정 완료** (2026-07-09, `scripts/migrate_menu_columns.js`). `custom_menu` 가 0행일 때 처리해 마이그레이션 비용 0.

| 컬럼 | 값 |
|---|---|
| `link_type` | `INTERNAL_PAGE` / `EXTERNAL_URL` / `CATEGORY` / `BRAND` / `EXHIBITION` / `PRODUCT_GROUP` |
| `link_target` | 내부 리소스 id (CATEGORY/BRAND = `categories.id`) |
| `link_url` | `INTERNAL_PAGE`/`EXTERNAL_URL` 일 때만 사용 (**NULL 허용**) |
| `badge_type` | `NEW` / `HOT` / `SALE` |

**관리자 UI 가 지켜야 할 규칙** (`navigationService` 가 이미 렌더 측에서 강제하고 있음):
- `EXHIBITION` / `PRODUCT_GROUP` 은 **모듈 미구현** → 저장은 되지만 스토어프론트에 노출되지 않는다.
  UI 에서 "모듈 미구현" 배지와 함께 비활성 표시할 것 (`feature_menu.module_ready` 와 같은 원칙).
- `CATEGORY`/`BRAND` 는 `link_target` 이 없으면 렌더에서 제외된다 → **저장 시 필수 검증**.
- `EXTERNAL_URL` 은 관리자 설정과 무관하게 **항상 새 창 + `rel="noopener noreferrer"`** 로 강제된다.
- `badge_type` 은 자유 입력 금지, 3값 드롭다운.

**서버 측 강제 규칙(관리자에서 추가 구현 필요)**: 슬롯 초과 저장 거부 / 메뉴명 10자 제한 / 기간 종료 시 자동 숨김.

**도입하지 않음(YAGNI)**: `tracking_code`(캠페인 분석 소비처 없음)

### 4.4 시스템 메뉴 설정 — ✅ B4 구현 완료 (2026-07-10)

`/admin/system-menus` (메뉴/카테고리 관리 그룹). **삭제·추가 불가**, 노출 여부/표시명/순서만.
`is_required = 1` 은 **끌 수도 없다**(검색·로그인·마이쇼핑·장바구니·TOP).

> ⚠️ **필터는 `position` 이지 `is_system` 이 아니다.** 실측 결과 두 플래그가 어긋난다 —
> `CATEGORY`(gnb)가 `is_system=1` 이고 `RAIL_BRAND_WISHLIST`·`RAIL_RECENT` 는 `is_system=0` 이다.
> `is_system` 으로 가르면 GNB 카테고리 버튼이 이 화면에 끌려오고 우측 레일 2종이 빠진다.

아래는 **2026-07-10 DB 실측값**이다(문서 원안의 `RAIL_CART.is_required=1` 은 오류였다).

| 코드 | position | URL | `is_system` | `is_required` |
|---|---|---|---|---|
| `HEADER_SEARCH` | header_util | `/search` | 1 | 1 |
| `HEADER_LOGIN` | header_util | `/auth/login` | 1 | 1 |
| `HEADER_MYPAGE` | header_util | `/mypage` | 1 | 1 |
| `HEADER_CART` | header_util | `/cart` | 1 | 1 |
| `HEADER_CS` | header_util | `/boards/notice` → **`/cs` 로 승격 예정(M8)** | 1 | 0 |
| `RAIL_CART` | right_rail | `/cart` | 1 | **0** |
| `RAIL_WISHLIST` | right_rail | `/mypage/likes` | 1 | 0 |
| `RAIL_BRAND_WISHLIST` | right_rail | `/mypage/brand-likes` | **0** | 0 |
| `RAIL_RECENT` | right_rail | (client) | **0** | 0 |
| `RAIL_TOP` | right_rail | (client) | 1 | 1 |

**구현 메모**: 일반 메뉴 관리(B2)와 `featureMenuController` · 편집기 뷰(`views/partials/admin/menu_editor.ejs`)를
공유하고 담당 `position` 만 다르다. 저장 시 서버가 `feature_menu.position` 을 다시 조회해
**그 화면 소관이 아닌 코드는 건너뛴다** — 일반 메뉴 화면에서 시스템 메뉴를 조작하는 요청 위조를 막는다.

**검증(2026-07-10)**: 시스템 화면에서 `BEST`(gnb) 끄기 시도 → 무시 / `HEADER_LOGIN` 끄기 시도 → 1 유지 /
`RANKING`(모듈 없음) 켜기 시도 → 0 유지 / 배지에 `<script>` 주입 → `NULL` / 화면별 노출 13건·10건.

### 4.5 모바일 메뉴 설정
모바일 하단 탭은 **고정 추천**: `홈 / 카테고리 / 검색 / 장바구니 / 마이`
그 외는 `mobile_visible` 플래그로 제어. 모바일 전용 커스텀 메뉴 최대 5개.

---

## 5. 권한 그룹 설계

현재: `admin_menus.visible_roles` + `middleware/adminRoleGuard.js` (메뉴 단위 노출 제어)
목표: 권한 **그룹** 단위 관리 화면.

| 권한 그룹 | 접근 가능 그룹 |
|---|---|
| 최고관리자 | 전체 |
| 몰 관리자 | 2·3·4·5·7 |
| 상품 관리자 | 5, 3(조회) |
| 전시 관리자 | 3, 4 |
| 프로모션 관리자 | 6 |
| 주문 관리자 | 7 |
| CS 관리자 | 7(회원·문의), 8(고객센터) |
| 읽기 전용 | 전체 조회만 |

---

## 6. DB 참조

### 6.1 관리자 메뉴 (시스템 고정값)
```text
admin_menus
├─ id, parent_id            ← parent_id 는 존재하나 현재 미사용 (그룹화 시 활용)
├─ name, path, icon_class
├─ display_order
├─ is_active
└─ visible_roles            ← 권한 제어
```
> 원안의 `menu_code`, `required_permission`, `is_system` 은 **현재 스키마에 없다.** 그룹화(A1)에는 불필요하나, 권한 그룹 고도화 시 도입 검토.

### 6.2 스토어프론트 메뉴 (M1 구현 완료)
```text
categories          (동적)   + mall_id, slug, depth(≤3), is_active, pc_visible, mobile_visible
feature_menu        (고정)   feature_code, default_name, default_path, position,
                             required_module, module_ready, is_system, is_required
mall_feature_menu   (몰별)   display_name, sort_order, is_enabled, pc/mobile_visible,
                             login_required, visible_start_at, visible_end_at
custom_menu         (몰별)   display_name, link_type, link_url, location, ...
navigation_config   (몰별)   header_layout_type, category_display_type,
                             max_gnb_items, max_custom_items, category_max_depth,
                             use_mega_menu, use_search_bar
brand_likes         (사용자) user_id, category_id  ← 우측 레일 '찜한 브랜드'
```
적용 스크립트: `scripts/migrate_menu_architecture.js` (멱등). `tables.sql` 반영 완료.

---

## 7. 우선 구현 순서

### A. 선행 정리
- [x] **A1** `admin_menus` 8그룹 재편 + 2뎁스 사이드바 렌더 ✅ 2026-07-09 (§2.1)
- [ ] **A2** `/admin/menus` → "관리자 메뉴 관리"로 개명 (그룹 이동은 A1에서 이미 완료)
- [x] **A3** 필수 메뉴 활성화 + Shopify UI 숨김 ✅ 2026-07-09 (아래)

### A3 — 필수 메뉴 활성화 & Shopify 미사용 처리 (2026-07-09)

> **사용자 확정**: 쿠폰·포인트·판매·배송·문의는 "비활성"이 아니라 **필수 기능**이다 → 활성화.
> Shopify 는 현재 사용하지 않는다 → **기능(라우트·서비스·웹훅)은 그대로 두고 UI 만 숨긴다.**

`node scripts/migrate_admin_menu_activate.js` (멱등)

**사전 검증**: 활성화 전에 5개 화면의 목록 핸들러를 모의 req/res 로 호출해 **SQL 오류 없이 `render` 까지 도달**함을 확인했다(깨진 화면을 켜면 운영자가 500을 본다). 참조 테이블(`coupons`, `user_coupons`, `point_transactions`, `orders`, `shipments`, `inquiries`)도 모두 실재한다.

| 메뉴 | 조치 | visible_roles |
|---|---|---|
| 쿠폰 관리 | 활성화 | `super_admin,admin` |
| 포인트 관리 | 활성화 | `super_admin,admin` |
| 판매 관리 | 활성화 | `super_admin,admin,customer_admin` |
| 배송 관리 | 활성화 | `super_admin,customer_admin` |
| 문의 관리 | 활성화 | `super_admin,admin,customer_admin` |
| **Shopify 주문** | **비활성(메뉴 숨김)** | `super_admin,admin` (공백이던 것 보정) |

> **A1에서 발견한 데이터 이슈 해소**: `Shopify 주문` 의 `visible_roles` 가 비어 있어 **역할 없는 사용자에게도
> 노출**되고 있었다. 역할을 명시했고, 이제 역할 없는 사용자에게 보이는 메뉴는 0건이다.

**결과**: 활성 잎 메뉴 18건 / 비활성 1건. 역할별 — `super_admin` 18잎, `admin` 16잎, `customer_admin` 4잎(주문/회원 관리 그룹만), 역할없음 0잎.

#### Shopify UI 숨김 방식
`middleware/shopifyFlag.js` 가 `res.locals.shopifyEnabled` 를 주입한다.
단일 소스는 **`system_settings.shopify_sync_enabled`**(현재 `0`) → `process.env.SHOPIFY_SYNC_ENABLED`.
관리자 시스템설정에서 토글을 켜면 즉시 되살아난다.

| 위치 | 숨기는 것 |
|---|---|
| `partials/storefront/header.ejs` | 마켓(국가) 선택기 |
| `user/cart.ejs` | 국가 선택기 + "해외 구매하기(Global)" 버튼 |
| `user/products/detail.ejs` | 글로벌 체크아웃 버튼 + 현지가격 섹션 |
| `admin/products/list.ejs` | "Shopify 동기화" 버튼 + 상태 표시줄 |
| `admin_menus` | "Shopify 주문" 메뉴 |

- **라우트·서비스·웹훅(`/shopify/webhooks`)은 그대로 살아 있다.** 노출만 막는다.
- **이중 방어**: 서버측 `POST /admin/products/shopify-sync` 는 `isShopifySyncEnabled()` 가드가 409로 거부하고, `syncService` 의 상품 생성/수정/삭제 동기화도 no-op 이 된다.
- ⚠️ 버튼을 숨길 때 **스크립트의 `getElementById(...).addEventListener` null 가드**를 반드시 함께 넣어야 한다. 없으면 그 페이지의 스크립트 블록 전체가 죽는다(상품목록에서 실제로 발생할 뻔했다).

#### 함께 고친 버그
`app.js` 전역 에러 핸들러가 **클라이언트 오류(400)를 500으로 보고**하고 있었다.
잘못된 JSON 본문(`entity.parse.failed`, `err.status=400`)이 "Internal Server Error"로 나가 원인 추적을 방해하고 모니터링에 서버 장애로 잡힌다. `err.status/statusCode` 가 4xx 면 그대로 전달하도록 수정.

### B. 1차 구현 (핵심)
- [x] **B1** 카테고리 관리 트리 UI ✅ 2026-07-09 — `depthGuard`(max 3, 순환 차단) + `is_active`/`pc·mobile_visible` (아래 §4.1)
- [x] **B2** 일반 메뉴 관리 ✅ 2026-07-09 — `/admin/feature-menus` (아래 §4.2.1)
- [ ] **B3** 커스텀 메뉴 관리 (GNB 슬롯 3 제한, 서버 측 강제) — ⏸ **후순위** (사용자 확정 2026-07-09): 커스텀 이외 정형화된 화면·관리가 모두 끝나고 기능 테스트를 마친 뒤 착수
- [x] **A2** 관리자 메뉴 개명 ✅ 2026-07-10 — `/admin/menus` → "관리자 메뉴 관리" (위 §1)
- [x] **B4** 시스템 메뉴 설정 ✅ 2026-07-10 — `/admin/system-menus` (아래 §4.4). B2 가 한 화면에 합쳐 지었던 것을 계획서대로 분리
- [x] **B5** Header 설정 ✅ 2026-07-10 — `/admin/header-settings` (위 §3.2.1)
- [x] **B6** 상품 그룹 관리 전용 화면 ✅ 2026-07-10 — `/admin/product-groups` (위 §3.4.1)
- [x] **B7** 메뉴 미리보기 ✅ 2026-07-10 — `/admin/menu-preview` (위 §3.3.1)

> B1~B4 는 프론트 **M4(navigationService) · M5(렌더 전환)** 와 짝을 이룬다.
> **M5 렌더 전환이 끝나야** 관리자 변경이 실제 GNB에 반영된다.

### C. 2차 구현
- [ ] 모바일 메뉴 설정 / 카테고리 페이지 관리 / 기획전 관리
- [ ] 쿠폰·할인 관리 활성화 / 오늘특가·베스트 관리
- [x] **고객센터 관리 + FAQ 모듈** ✅ 2026-07-10 — `/admin/faqs` (CRUD, 저장 시 `htmlSanitizer.sanitize()`)
- [x] 테마 설정 (P4) ✅ 2026-07-10 — `/admin/theme-settings` (저장 시 `themeService` 검증 규칙 재사용)

### D. 3차 구현
- [ ] 예약 발행 스케줄러 / 버전 관리 고도화
- [ ] 권한 그룹 관리 화면
- [ ] 로그 관리 / 백업·복구 / A/B 테스트 / 고급 통계

---

## 8. 정리 대상 (기술 부채)

| 항목 | 조치 |
|---|---|
| `main_display_sections` / `main_display_products` + `/admin/display` | `page_section` 이 대체. 전환 검증 후 **제거** |
| `storefront_menu` | `feature_menu` 계열이 대체. 프론트 M5 검증 후 **M7에서 제거** |
| `tables.sql` 노후화 | 실제 DB에만 있는 테이블 다수(`recent_views`, `product_seo`, `shopify_*` 등). 스키마 확인은 **실 DB를 소스 오브 트루스**로 |
| `/admin/menus` 명칭 | "관리자 메뉴 관리"로 개명 (A2) |

---

## 9. 공통 개발 규약

- **DB 컬럼** snake_case / **URL** kebab-case / **JS** camelCase
- 컨트롤러 액션명: `getList`, `getDetail`, `postForm`, `postUpdate`, `postDelete`
- SQL은 **파라미터화 쿼리**만 (문자열 결합 금지)
- 스키마 변경 **3중 반영**: 개발 DB → 상용 DB → `tables.sql`
- 파일 800줄 초과 금지, 함수 50줄 이내
- 신규 테이블은 `mall_id BIGINT NOT NULL DEFAULT 1` 포함 (멀티몰 대비)
- 마이그레이션 스크립트는 **멱등(idempotent)** 하게 작성
