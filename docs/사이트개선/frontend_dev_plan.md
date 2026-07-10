# 스토어프론트(Frontend) 개발 문서 — 섹션 기반 쇼핑몰 빌더

> 이 문서는 **사용자 화면(스토어프론트)** 만 다룬다. 관리자 화면은 [`admin_dev_plan.md`](./admin_dev_plan.md) 참조.
>
> **출처**: `flexible_shopping_mall_builder_design.md` · `flexible_shopping_mall_builder_dev_plan.md` · `shopping_mall_builder_menu_design_summary.md`
> → 본 문서로 통합·대체되어 **삭제됨**. 원문이 필요하면 git 이력에서 조회한다:
> `git show 4528e44:"docs/사이트개선/flexible_shopping_mall_builder_design.md"`
>
> 최종 갱신: 2026-07-09

---

## 0. 목표와 원칙

**SDUI(Server-Driven UI)**: 화면을 하드코딩하지 않고 **DB 명세(`page` / `page_section`)로 그린다.**
→ 운영자가 섹션을 추가/삭제/재정렬하면 **배포 없이** 화면이 재구성된다.

**스트랭글러 피그(Strangler Fig)**: 빅뱅 재작성 금지. 기존 화면을 살려둔 채 섹션 렌더링 경로를 신설하고 한 화면씩 대체한다.

### 렌더링 스택 (확정)
- **스토어프론트: 현행 EJS SSR 유지.** Passport OAuth · Toss 결제 · Shopify 동기화 · Redis 세션을 100% 재사용.
- **SDUI 데이터 모델은 프레임워크 무관**하게 우선 구축 → 훗날 `sectionRegistry` 매핑을 유지한 채 React로 1:1 포팅 가능.
- SDUI의 가치는 렌더러가 아니라 "화면을 DB 명세로 그린다"는 **데이터 아키텍처**에 있다. 프레임워크 교체는 **defer**.

---

## 1. 진행 현황 요약

| 트랙 | 내용 | 상태 |
|---|---|---|
| **P0** | 기반 정리(ProductCard 표준화, 섹션 partial 분해) | ✅ |
| **P1** | 전시 데이터 모델 & 렌더 엔진 (`page`/`page_section`/`product_group`) | ✅ 2026-07-08 |
| **P2** | 관리자 페이지 빌더 (발행/롤백) → *관리자 문서 참조* | ✅ 2026-07-08 |
| **P1.5** | 레이아웃 골격 + 헤더/GNB + 우측 유틸 레일 | ✅ 2026-07-09 |
| **M1~M3** | 통제된 동적 메뉴 아키텍처(DB·시드) + 표준 기능 라우트 + 찜한 브랜드 | ✅ 2026-07-09 |
| **M4** | `navigationService` (위치별 메뉴 조립) + `depthGuard`(카테고리 max 3) | ✅ 2026-07-09 |
| **M5** | 렌더 전환: `menuData.js` → navigationService. GNB·우측레일 데이터 기반화 | ✅ 2026-07-09 |
| **M7** | `storefront_menu` 제거 (백업 후 DROP) | ✅ 2026-07-09 |
| **CT** | 섹션 컴포넌트 트랙 (CT-0 ~ CT-9) | ✅ 2026-07-09 |
| **M8** | 고객센터 페이지 + FAQ 모듈 | ✅ 2026-07-09 |
| **P4** | 테마 시스템 (CSS 변수) | ✅ 2026-07-09 |
| **P5** | 멀티몰(도메인 기반) | ⬜ **구조만 정의**(§8.2). 거래 데이터는 `(B) 분리` 확정, 적용은 후속 과제 |
| **P6+** | SaaS 고도화 (멀티테넌시·미디어·AI) | 장기 |

> ## ✅ 스토어프론트 구현 완료 (2026-07-09)
> P0 · P1 · P1.5 · M1~M8 · CT-0~CT-9 · P4 전부 완료.
> 남은 것은 **P5(멀티몰)** 로, `§8.4 의사결정`(거래 데이터 몰 귀속)이 확정돼야 착수 가능하다.
>
> **다음 단계는 관리자**다. [`admin_dev_plan.md`](./admin_dev_plan.md) 의 작업 순서 원칙에 따라,
> 관리자 화면을 만들면서 위 프론트 항목이 전부 관리 가능한지 커버리지를 검사하고,
> 관리자에만 있고 프론트에 없는 기능은 프론트를 보완한다.
>
> **그 다음이 디자인 개선(§12)** 이다. 구조(데이터 모델)는 끝났고 표현만 남았다.

### 권장 진행 순서
```text
P1.5(완료) → M1~M3(완료) → M4 → M5 → M7 → CT-0 → CT 컴포넌트 → M8 → P4 → P5
```
> **구조 우선**: GNB·레일이 데이터 기반으로 완전히 전환(M5)된 뒤 컴포넌트(CT)를 얹는다.
> 순서를 뒤집으면 CT 컴포넌트가 곧 폐기될 `storefront_menu` 위에 쌓여 재작업이 발생한다.

---

## 2. 공통 개발 규약

- **DB 컬럼** snake_case / **URL** kebab-case / **JS 파일·변수** camelCase
- SQL은 **파라미터화 쿼리**만. 조건 자동형 상품그룹의 동적 필터는 **화이트리스트**만 허용 (SQL 인젝션 방지)
- 비동기: async/await + try-catch. 에러는 각 계층에서 처리
- 스키마 변경 **3중 반영**: 개발 DB → 상용 DB → `tables.sql`
- 섹션/테마 가변 옵션은 `config_json`(MySQL `JSON`)에 저장
- **파일 800줄 초과 금지.** 섹션 렌더러·서비스는 기능별 소파일로 분리
- 신규 테이블에 `mall_id BIGINT NOT NULL DEFAULT 1` 포함 (멀티몰 대비, 값은 1 고정)
- **`mall_id` 는 인덱스의 첫 컬럼**으로 둔다: `KEY (mall_id, ...)`. P5에서 필터를 걸 때 인덱스를 다시 만들지 않아도 된다 (§8.2)
- `mall_id = 1` 을 코드에 상수로 박지 않는다 — 한 곳에서 주입한다 (현재 하드코딩 위치는 §8.2-3)
- **스키마 확인은 실 DB(mysql CLI/노드 스크립트)를 소스 오브 트루스로.** `tables.sql` 은 노후화되어 있다.

---

## 3. 렌더 엔진 (P1 — 구현 완료)

### 3.1 데이터 모델
```text
page              화면 단위 (home / category / event / custom)
 ├─ layout_type   main_basic | main_right_utility_v1
 └─ status        draft / published

page_section      전시 블록 = 화면에 배치된 컴포넌트 1 인스턴스
 ├─ section_type       sectionRegistry 키
 ├─ position           main_top / main_content / ...
 ├─ sort_order         무배포 순서 변경
 ├─ data_source_type   product_group / banner_group / category / client
 ├─ data_source_id
 ├─ config_json        컬럼수·표시옵션 등
 ├─ visible_start_at / visible_end_at
 └─ visible_on_pc / visible_on_mobile

product_group        전시용 상품 묶음 (manual / condition)
product_group_item   수동 선택형 아이템
page_revision        발행 스냅샷 (롤백용)
```

### 3.2 조립 모델 — 넣기/빼기 · 순서 · 멀티 인스턴스
| 요구 | 실현 메커니즘 |
|---|---|
| **넣기** | 해당 `section_type` 행 INSERT |
| **빼기** | `is_active = 0` 또는 DELETE |
| **2개 이상(멀티 인스턴스)** | 같은 `section_type` 을 여러 행으로. `data_source_id`/`config_json` 만 다르게 |
| **순서** | `sort_order` |
| **배치(위치)** | `position` + `sort_order` |
| **PC/모바일 개별** | `visible_on_pc` / `visible_on_mobile` |
| **노출 기간** | `visible_start_at` / `visible_end_at` |
| **컴포넌트화** | `section_type` ↔ `sectionRegistry` ↔ 렌더러 1:1 |

### 3.3 서비스 계층
```text
services/display/
├─ sectionRegistry.js     section_type ↔ partial ↔ 설정폼 스키마 (단일 소스)
├─ displayService.js      getHomeSections / getDraftSections / resolveSections
├─ productGroupService.js manual / condition 해석
└─ pageBuilderService.js  섹션 CRUD·발행·롤백 (관리자용)
```

**렌더 흐름**
```text
홈 요청 → page(home) 조회 → 최신 발행 스냅샷(page_revision) 우선
        → 없으면 라이브 page_section 폴백
        → sort_order 정렬 → sectionRegistry[type].view 로 다형 렌더
```
- 스토어프론트 = **발행 스냅샷** 기준
- 관리자 미리보기 = **라이브 작업본** 기준

### 3.4 현재 홈 섹션 시드 (page id=1)
`hero` → `value_proposition` → `product_grid`(베스트) → `product_grid`(신상품) → `category_showcase` → `kakao_cta`

**정합 부채**: 레거시 `main_display_*` + `/admin/display` 는 이제 홈에 영향 없음(`page_section` 이 대체). 전환 검증 후 제거 예정.

---

## 4. 레이아웃 골격 & 헤더/GNB (P1.5 — 구현 완료)

### 4.1 레이아웃 타입
| 레이아웃 | 용도 |
|---|---|
| `main_basic` | 본문만 |
| `main_right_utility_v1` | 본문 + **우측 유틸 레일** (홈에 적용) |

`main_layout.ejs` 가 `layoutType` 으로 분기한다. 컨트롤러가 `page.layout_type` 을 주입.

### 4.2 골격 구조
```text
Header (partials/storefront/header.ejs)
 ├─ 상단바 (마켓 셀렉터 / 로그인 / 관리자모드)
 ├─ Row1: 로고 + 중앙 검색바 + 유저액션(로그인·마이쇼핑·장바구니·고객센터)
 └─ Row2: GNB = [☰ 카테고리 드롭다운(고정)] + [몰별 가변 메뉴]

Content  ← 섹션들이 full-bleed 로 세로 스택

Right Utility (partials/storefront/right_utility.ejs)  ← position: fixed
 ├─ 로그인 박스 / 장바구니(뱃지) / 찜 / 찜한 브랜드
 ├─ 최근 본 상품 (패널)
 ├─ 멤버십 · 앱 QR (설정 시에만)
 └─ TOP

Footer
```

### 4.3 ⚠️ 설계 편차 — 2컬럼이 아니라 fixed 레일
원 설계는 `Content(2컬럼: 본문 + Right Utility)` 였으나, **현행 섹션들이 전부 full-bleed**
(`<section>` + 자체 `max-w` 컨테이너 + 배경색)라 본문을 2컬럼 컨테이너로 감싸면
**모든 섹션 배경이 잘려 회귀**가 발생한다.

→ 우측 유틸을 **`position: fixed` 레일**로 구현했다. (CT-7 `utility_rail` 규약과 동일, 참조몰도 동일 방식)
- 노출: **`≥1600px`** 에서만 (본문 `max-w-1400px` 와 미충돌)
- 그 미만: 기존 플로팅 TOP 버튼 유지
- `≥1600px` 에서는 레거시 `#scrollTopBtn` 과 히어로 내부 `.hero-util-rail` 을 CSS로 숨겨 **TOP 중복 렌더 없음**

### 4.4 최근 본 상품
상품 상세(`views/user/products/detail.ejs`)에서 `localStorage['yd_recent_products']` 에 최대 10건 적재
→ 레일 패널이 렌더. **로그인 사용자 `recent_views` 테이블 연동은 CT-8.**

### 4.5 QR / 멤버십
데이터 소스가 없어 `site_settings` 에 `app_qr_image_url` / `app_download_url` / `membership_url` 이
설정된 경우에만 노출(미설정 시 슬롯 숨김). **외부 QR 생성 서비스는 사용하지 않는다.**

### 4.6 잔여 폴리시
- 카테고리 2단 컬럼(hover 확장) · 3뎁스 드롭다운 정교화
- 상단바 로그인 ↔ Row1 유저액션 중복 정리

---

## 5. 메뉴 아키텍처 (M 트랙)

### 5.1 확정 원칙 — 통제된 동적 메뉴
완전 동적 메뉴는 **과설계**다. (운영자 실수 · UX 일관성 저하 · QA 폭증 · SEO 불안정 · 개발비 증가)

```text
카테고리 메뉴 = 동적 관리 (최대 3뎁스)
일반 메뉴     = 사전 정의된 기능 메뉴를 ON/OFF 로 선택 (URL 고정)
커스텀 메뉴   = 슬롯 방식으로 제한 (GNB 최대 3개)
시스템 메뉴   = 고정 (노출 여부만)
```

**위치 고정 원칙**: 커스텀 메뉴를 제외한 모든 메뉴는 **`position` 이 코드에 고정**된다.
운영자는 ON/OFF · 표시명 · 순서만 조정한다.

| position | 메뉴 |
|---|---|
| `gnb` | 카테고리(고정) · 오늘특가 · 베스트 · 신상품 · 이벤트&혜택 … |
| `right_rail` | 장바구니 · 찜 · 찜한 브랜드 · 최근본상품 · TOP |
| `header_util` | 검색 · 로그인 · 마이쇼핑 · 장바구니 · 고객센터 |
| `footer` / `mobile_quick` | (예약) |

### 5.2 `module_ready` 게이트 ★
렌더 조건은 항상 **`is_enabled AND module_ready`**.
`feature_menu.module_ready = 0` 이면 관리자가 메뉴를 켜도 **스토어프론트에 노출되지 않는다.**
→ 죽은 `#` 링크가 **구조적으로 발생 불가**.

현재 `module_ready = 0`: `EXHIBITION` `RANKING` `OUTLET` `COUPON` `MEMBERSHIP` `GROUP_BUY` `LIVE`

### 5.3 M1~M3 구현 완료 (2026-07-09)
- **M1 DB**: `feature_menu` / `mall_feature_menu` / `custom_menu` / `navigation_config` / `brand_likes` 신설.
  `categories` += `mall_id, slug, depth, is_active, pc_visible, mobile_visible`
  적용: `node scripts/migrate_menu_architecture.js` (멱등)
- **M2 시드**: 카탈로그 23건(gnb 13 / right_rail 5 / header_util 5), 몰1 활성 15건
- **M3 표준 라우트** (`routes/feature.js`):

| URL | 처리 |
|---|---|
| `/best` | `productController.getList` + `{ sort: 'best' }` |
| `/new` | `+ { sort: 'new' }` |
| `/deal/today` | `+ { badge: 'DEADLINE_SALE' }` |
| `/event` | `/boards/notice` 302 별칭 (이벤트 모듈 구현 전까지 표준 URL 선점) |

  Express 5의 `req.query` 는 getter 이므로 변형하지 않고 **`req.featurePreset`** 으로 주입 → 컨트롤러가 병합.

- **찜한 브랜드**: `brand_likes` + `POST /likes/brand/toggle` + `GET /mypage/brand-likes` + `/brands` 하트 토글
- **GNB 정리**: 기존 6개 → **오늘특가·베스트·신상품·이벤트&혜택 4개**.
  `TV편성표` 폐기, `쇼핑라이브`·`공동구매` 는 `module_ready=0` 으로 비활성
- **버그 수정**: 우측 레일의 `찜` 링크가 `/likes`(GET 라우트 없음 → 404)였다 → `/mypage/likes` 로 교정

### 5.4 M4 — `navigationService` ✅ 구현 완료
```text
services/menu/navigationService.js
├─ getNavigation(mallId, { isMobile, isLoggedIn })
│   → { gnb: [...], rightRail: [...], headerUtil: [...], categoryTree: [...] }
├─ 조건: is_enabled AND module_ready
│         AND (pc_visible|mobile_visible)
│         AND 노출기간(visible_start_at ~ visible_end_at)
│         AND (login_required=0 OR isLoggedIn)
├─ custom_menu 병합 (location 별, max_custom_items 슬롯 제한)
└─ navigation_config 로 정책 주입

services/tree/depthGuard.js
├─ assertDepthAllowed({ parentId, maxDepth })    부모.depth+1 > max → 저장 거부
└─ recalcSubtreeDepth(nodeId)                    부모 이동 시 후손 depth 재계산
```
- 카테고리 `maxDepth = navigation_config.category_max_depth` (기본 **3**)
- 캐시: 요청당 1회 조회. 변경 빈도가 낮으므로 프로세스 메모리 캐시 + 관리자 저장 시 무효화 검토

### 5.5 M5 — 렌더 전환 ✅ 구현 완료
- `middleware/menuData.js` 를 `navigationService` 기반으로 교체
- `header.ejs` GNB → `gnbMenus` 배열 렌더 (PC는 `pcVisible`, 모바일 패널은 `mobileVisible` 필터)
- `header.ejs` 카테고리 버튼 → `categoryButton`(=`feature_menu.CATEGORY`). 끄면 버튼 자체가 사라진다
- `right_utility.ejs` → `rightRailMenus` 배열 렌더. **아이콘/동작만 코드 고정**(`featureCode` → 아이콘 맵),
  `RAIL_TOP` 은 최하단 고정, `RAIL_RECENT` 는 패널 토글, `RAIL_CART` 는 `cartCount` 뱃지
- 레일 항목이 0건이면 `<style>` 까지 렌더하지 않는다 (레거시 `#scrollTopBtn` 숨김 규칙이 함께 사라지도록)
- 커스텀 메뉴는 `custom_menu.new_window` 시 `target="_blank" rel="noopener noreferrer"`

### 5.5.1 M7 — `storefront_menu` 제거 ✅ 구현 완료
`node scripts/migrate_m7_drop_storefront_menu.js`
- **안전 가드**: 활성 GNB 기능메뉴가 1건 이상일 때만 DROP (메뉴 전체 소실 방지)
- **백업**: DROP 직전 전체 행을 `scripts/backup_storefront_menu.sql` 로 덤프(DDL + INSERT)
- 멱등: 테이블이 없으면 아무 것도 하지 않음
- `menuData.js` 의 레거시 폴백 제거, `tables.sql` DDL 제거

### 5.6 M8 — 고객센터 페이지 ✅ 구현 완료
참조 캡처: `capture/image copy.png`
```text
좌측 LNB                본문                          우측
├─ 1:1 문의하기         ├─ FAQ 검색                   └─ 유틸 레일 (전역)
├─ 1:1 문의내역         ├─ 자주묻는질문 BEST 10 (아코디언)
├─ 공지사항             └─ 공지사항 목록 (더보기)
├─ 자주묻는질문(분류)
├─ 비회원 주문조회
└─ 대표번호
```
- **DB**: `faq_category`(6분류) + `faq`(12건 시드). `scripts/migrate_faq.js` (멱등)
- **라우트**: `routes/cs.js` — `GET /cs`, `GET /cs/faq?categoryId=&q=`, `POST /cs/faq/:id/view`(조회수)
- **`HEADER_CS.default_path` 를 `/boards/notice` → `/cs` 로 승격.** 헤더의 고객센터 링크도
  하드코딩을 제거하고 `headerUtilMenus` 에서 가져온다 → **관리자에서 끄면 헤더에서 사라진다**(검증 완료)
- 기존 `/inquiries`(1:1 문의), `/boards/notice`(공지) 재사용. 공지는 `notices` 테이블이며
  `type`/`is_deleted`/`importance` 컬럼 유무를 런타임 탐지(배포 시점차 대응)
- **보안**: FAQ `answer` 는 HTML 이므로 렌더 직전 `htmlSanitizer` 로 새니타이즈.
  검색어는 LIKE 와일드카드를 **파라미터로 전달**(문자열 결합 금지), 길이 100자 제한.
  검증: `<script>`/`onerror` 주입 답변이 렌더에 노출되지 않음, `q=%' OR '1'='1` → 정상 200
- **관리자 FAQ 관리 화면은 미구현** → `admin_dev_plan.md` §3.8 "고객센터 관리"

---

## 6. 섹션 컴포넌트 카탈로그 & CT 트랙

`page_section` 한 행 = 화면에 배치된 컴포넌트 한 인스턴스.

| section_type | 컴포넌트 | data_source | 상태 |
|---|---|---|---|
| `hero_showcase` | 상품 쇼케이스 히어로(LNB+슬라이더+피처카드) | `hero_slide` | ✅ |
| `hero` / `hero_banner` | 전체폭 배너 스와이퍼 | `banner_group` | ✅ |
| `product_grid` | N열 상품 그리드 | `product_group` | ✅ |
| `category_showcase` | 카테고리별 상품 탭(AJAX) | `category` | ✅ |
| `value_proposition` / `kakao_cta` / `popup_banner` | 정적/설정형 | config | ✅ |
| `utility_rail` | 우측 유틸 레일(전역, 전 페이지) | `feature_menu[right_rail]` | ✅ CT-7 |
| `product_carousel` | 상품 캐러셀 | `product_group` | ✅ CT-1 |
| `brand_carousel` | 브랜드 로고 캐러셀 | `categories(type=BRAND)` | ✅ CT-2 |
| `ranking_tabs` | 랭킹(카테고리 탭 + 랭크 뱃지) | 카테고리 + 상품 | ✅ CT-3 |
| `benefit_bento` | 혜택 벤토 | `product_group` + 카피 | ✅ CT-4 |
| `promotion_banner` | 프로모션 배너 | `banners.group_key` | ✅ CT-5 |
| `quick_menu` | 퀵 메뉴 | config (리졸버 없음) | ✅ CT-6 |
| `recent_product` | 최근 본 상품 | `recent_views` / localStorage | ✅ CT-8 |
| `custom_html` | 제한적 커스텀 HTML | inline (sanitize) | ✅ CT-9 |
| `live_cards` | 라이브 카드 | P6 미디어 | P6 |

### 6.0 CT 트랙 완료 (2026-07-09)

현재 홈 섹션 구성 (15개, `page_section` 순서대로):
```text
hero → value_proposition → product_grid(베스트) → product_carousel(MD 추천)
→ product_grid(신상품) → product_carousel(오늘의 특가) → quick_menu → benefit_bento
→ promotion_banner → ranking_tabs → brand_carousel → category_showcase
→ recent_product → custom_html → kakao_cta
```
시드: `node scripts/seed_ct_sections.js` (멱등, `--reset` 지원). `config_json.seed_key` 로 중복 방지.

**구현 메모**
- **캐러셀 공용화**: `_carousel_base.ejs` 가 CSS + 동작을 제공(`window.__ydCarouselInit` 가드로 멀티 인스턴스에서 1회만 바인딩). 외부 라이브러리 없이 CSS `scroll-snap`.
- **CT-3 AJAX**: `GET /sections/ranking` (`routes/sections.js`). 정렬은 **화이트리스트**만, `limit` 상한 20, 파라미터화 쿼리. `sort=1;DROP TABLE` 시도 → 기본 정렬로 처리됨을 검증.
- **CT-5**: `banners.group_key` 컬럼 신설(`scripts/migrate_banner_group_key.js`). `bannerService.getByGroup` 로 배너 소스 일원화. 시드는 `banner_type='CATEGORY' + category_id=NULL` 로 심어 히어로(MAIN)/팝업(POPUP)/카테고리 배너 조회를 오염시키지 않음.
- **CT-8**: 로그인 → `recent_views` 테이블 SSR, 비로그인 → `localStorage('yd_recent_products')` 로 클라이언트 렌더(이력 없으면 섹션 숨김).
- **CT-9 보안**: `sanitize-html` 도입. `services/display/htmlSanitizer.js` 가 허용 태그/속성 화이트리스트 + `javascript:`/`data:` 스킴 차단 + `style` 값 정규식 검증 + 외부 링크 `noopener` 강제. **저장 시(`pageBuilderService.updateSection`)와 렌더 시(리졸버) 이중 새니타이즈.** 검증: `<script>`·`onerror`·`javascript:`·`data:`·`<iframe>`·`expression()` 8종 전부 제거, 정상 링크·텍스트는 보존.
- **CT-7**: 히어로 내부 유틸 레일 **완전 제거**. 전역 레일이 `position:fixed` 라 본문에 영향이 없으므로 `main_layout` 이 `rightRailMenus` 존재 시 **스토어프론트 전 페이지**에 렌더. (`≥1600px` 노출 게이트는 유지 — 본문 `max-w-1400px` 와 충돌 방지)

### 6.1 컴포넌트 추가 표준 절차 (5단계)
1. **레지스트리 등록** — `sectionRegistry.js` 에 `section_type: { view, label, fields }`
2. **partial 생성** — `views/partials/sections/<type>.ejs`
3. **데이터 해석** — CT-0 이후엔 `services/display/resolvers/<type>.js` 추가
4. **시드** — 데이터소스 + `page_section` INSERT
5. **검증** — `pm2 restart dev-mall` → 노출 확인, `sort_order` 변경 → 무배포 이동 확인

**config_json 공통 옵션**: `columns` / `columnsPerView` / `maxCount` / `showBadge` / `showPrice` / `showDiscountRate` / `moreLink`
**빈 데이터 처리**: 0건이면 섹션 **스킵**(리졸버가 `null` 반환)

### 6.2 CT-0 — 데이터 리졸버 일반화 (선행 권장)
`displayService.resolveSections` 의 `section_type` 별 if/else 체인을 **per-type 리졸버 맵**으로 분리.
```text
services/display/resolvers/
├─ index.js          section_type → resolver 맵
├─ product_grid.js   async resolve(section, shared) → locals | null
├─ hero.js
└─ ...
```
**DoD**: 홈 렌더 결과가 CT-0 전과 픽셀 동일. 이후 컴포넌트 추가 시 `displayService.js` 를 수정하지 않고 **리졸버 파일 + 레지스트리 등록만으로** 동작.

### 6.3 CT-7 — utility_rail ✅ 완료
- [x] 히어로(`hero_showcase.ejs`)에서 내부 유틸 레일 완전 제거
- [x] 홈 외 전 페이지 노출 (`main_layout` 이 `rightRailMenus` 존재 시 렌더)
- [ ] **잔여**: 찜 개수 뱃지용 미들웨어(장바구니만 `cartCount` 뱃지 있음)
- [ ] **잔여**: `<1600px` 에서는 레일 미노출(본문 폭 충돌). 좁은 화면용 대안은 기존 플로팅 TOP 버튼

### 6.4 CT 트랙 DoD
- 모든 "예정" 컴포넌트가 `page_section` INSERT 만으로 배치 가능
- 각 컴포넌트가 **멀티 인스턴스** + **무배포 순서변경** 만족
- 데이터소스가 3계열로 수렴: 상품형 `productGroupService` / 배너형 `bannerService` / 브랜드형 카테고리 리졸버

---

## 7. Phase 4 — 테마 시스템 ✅ 구현 완료

`node scripts/migrate_theme.js` (멱등) → `theme(mall_id, name, config_json, is_active)`

**경계 분리** (중복 최소화):
| 대상 | 저장소 |
|---|---|
| 브랜드 색상(`--gh-primary` 등) · 로고 · 파비콘 | `site_settings` (기존 유지) |
| 버튼/카드/입력 반경, 폰트, 카드 스타일, 섹션 간격 | **`theme.config_json`** |

**스타일 토큰 → CSS 변수** (`services/theme/themeService.js`)
```text
fontFamily       → --yd-font-family
buttonRadius     → --yd-radius-button      (.gh-btn-primary)
cardRadius       → --yd-radius-card        (.product-card-surface)
pillRadius       → --yd-radius-pill        (.brand-pill--ghost, .brand-cta)
inputRadius      → --yd-radius-input       (.brand-focus)
sectionSpacing   → --yd-section-spacing
containerWidth   → --yd-container-width
productCardStyle → body.yd-card-{shadow|border|flat}
```
- `middleware/themeData.js` 가 `res.locals.theme` 주입(60초 메모리 캐시, `invalidate()` 제공)
- `main_layout.ejs` `<head>` 가 `:root` 에 인라인 주입. 테마가 없거나 DB 오류여도 **기본값으로 폴백**하여 화면이 깨지지 않는다
- 상품 카드에 `.product-card-surface` 훅 추가 → 테마로 반경/테두리/그림자 제어

**🔒 CSS 인젝션 방어 (중요)**
테마 값은 스타일시트에 **직접 삽입**되므로, `}` 를 섞어 `:root` 를 탈출하는 CSS 인젝션이 가능하다.
`themeService` 가 토큰별 **화이트리스트 + 정규식**으로 검증하고, 실패하면 기본값으로 대체한다.
- 길이값: `/^(0|\d{1,5}(\.\d{1,3})?(px|rem|em|%|vw))$/`
- `productCardStyle`: `shadow|border|flat` 열거형만
- `fontFamily`: 영숫자·공백·따옴표·하이픈만(200자 이내)

검증: `buttonRadius: "0.5rem; } body { display:none } .x{"`, `fontFamily: "x</style><script>"`,
`productCardStyle: "evil"`, `sectionSpacing: "expression(alert(1))"` 를 DB에 저장해도
탈출 문자열 0건, 전부 기본값 폴백, 홈 200.

**⬜ 잔여**: 관리자 테마 설정 화면(색상 피커/폰트/반경/카드 스타일) → `admin_dev_plan.md` §3.2

---

## 8. Phase 5 — 멀티몰 (도메인 기반)

> 하나의 앱 인스턴스가 접속 **도메인(Host 헤더)** 에 따라 서로 다른 쇼핑몰을 렌더한다.
> **단일 프로세스 내 논리 분리**이며, DB 레벨 강제 격리(P6)는 아니다.

### 8.1 ✅ 확정 결정 (2026-07-09)

**거래 데이터는 몰별 `(B) 분리` 로 간다. 단, 현 시점에는 구조만 정의하고 실제 적용은 후속 과제로 미룬다.**

| | 결정 |
|---|---|
| 상품 / 회원 / 주문 | **몰별 분리** (공유 아님) |
| 지금 할 일 | **구조 정의만** (아래 §8.2 규약) |
| 실제 컬럼 추가·쿼리 필터·세션 격리 | **별도 과제로 분리** — 착수 전 재검토 |

> **왜 지금 적용하지 않는가**: 분리는 `products`/`users`/`orders`/`carts`/`likes`/`coupons` 등
> 거래 테이블 전부에 `mall_id` 를 추가하고 **모든 쿼리에 필터를 거는 작업**이다.
> 한 곳이라도 빠지면 A몰 화면에 B몰 데이터가 새어 나간다(데이터 유출).
> 인증·세션·장바구니도 몰 단위로 격리해야 한다. 지금 착수하면 프론트/관리자 진행을 막는다.

### 8.2 지금 확정하는 구조 규약

1. **신규 테이블은 예외 없이 `mall_id BIGINT NOT NULL DEFAULT 1` 을 포함한다.** (값은 1 고정)
2. **`mall_id` 는 항상 첫 번째 인덱스 컬럼**으로 둔다 — `KEY (mall_id, ...)`. 나중에 필터를 걸 때 인덱스를 다시 만들 필요가 없다.
3. `mall_id = 1` 을 **코드에 상수로 박지 말고 한 곳에서 주입**한다. 현재 하드코딩 위치(P5 착수 시 치환 대상):
   - `middleware/menuData.js` `MALL_ID`
   - `middleware/themeData.js` `MALL_ID`
   - `services/menu/navigationService.js` `getNavigation(mallId = 1)`
   - `services/tree/depthGuard.js` `getCategoryMaxDepth(mallId = 1)`
   - `services/theme/themeService.js` `getActiveTheme(mallId = 1)`
   - `services/display/displayService.js` / `pageBuilderService.js` — SQL 내 `mall_id = 1` 리터럴
   - `controllers/mainController.js` — `hero_slide.mall_id = 1`
4. **거래 테이블 분리는 "전 쿼리 필터"가 아니라 리포지토리 계층에서 강제**한다. P5 착수 시
   `req.mall.id` 를 강제로 주입하는 조회 헬퍼를 두고, raw `pool.query` 직접 호출을 금지한다.
   (사람이 필터를 기억하는 방식은 반드시 새어 나간다)

### 8.3 현재 `mall_id` 보유 현황 (2026-07-09 실측)

| | 테이블 |
|---|---|
| **보유 (10)** | `page` · `product_group` · `categories` · `mall_feature_menu` · `custom_menu` · `navigation_config` · `theme` · `faq` · `faq_category` · `hero_slide` |
| **미보유** | `products` · `users` · `orders` · `carts` · `likes` · `brand_likes` · `banners` · `coupons` · `notices` · `admins` · `site_settings` · `system_settings` · `recent_views` · `product_group_item` · `page_revision` |

즉 **전시·설정 계열은 준비 완료, 거래·공용 계열은 미착수**. 이 경계가 곧 (B) 분리의 작업 범위다.

> `product_group_item` / `page_revision` 은 부모(`product_group` / `page`)가 `mall_id` 를 갖고
> FK 로 묶여 있으므로 별도 컬럼 없이 조인으로 해결 가능하다.

### 8.4 P5 착수 시 작업

```sql
CREATE TABLE IF NOT EXISTS `mall` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `domain` VARCHAR(255) NULL,
  `logo_url` VARCHAR(500) NULL,
  `theme_id` BIGINT NULL,
  `status` VARCHAR(30) DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mall_domain` (`domain`)
) ENGINE=InnoDB;
```
- `middleware/mallResolver.js`: Host 헤더 → `mall` 조회 → `req.mall` 주입(캐시)
- 위 §8.2-3 의 하드코딩을 `req.mall.id` 로 치환
- 관리자에 몰 목록/생성/도메인 매핑 화면
- **거래 데이터 분리(B)** 는 이 다음, 별도 스펙으로

---

## 9. Phase 6+ — SaaS 고도화 (장기 트랙)

> **P5 와의 결정적 차이**
> - **P5(멀티몰)** = *우리가* 운영하는 몰이 여러 개. 격리는 **애플리케이션 쿼리 필터**에 의존.
> - **P6(멀티테넌시)** = *남(입점 브랜드)* 이 자기 몰을 운영. 격리를 **DB/인프라가 강제**.
>
> 즉 P6은 "기능 추가"가 아니라 **사업 모델 전환**(자사몰 → SaaS 플랫폼)이다.
> 실수로 데이터가 새면 P5는 사내 사고지만, P6은 **타사 매출·고객정보 유출**이다. 그래서 방어선이 다르다.

### 9.1 다섯 갈래

| # | 항목 | 무엇을 | 왜 | 스택 변화 |
|---|---|---|---|---|
| 1 | **멀티테넌시 격리** | 전 테이블 `tenant_id` + Global Query Filter + **RLS**(Row Level Security) | 사람이 `WHERE tenant_id` 를 기억하는 방식은 반드시 새어 나간다. **DB가 강제**해야 한다 | ORM/미들웨어 도입 검토 |
| 2 | **에지 라우팅** | 도메인 → 테넌트 해소를 에지 캐시(KV/Redis)로 | 테넌트가 늘면 매 요청 DB 조회가 병목. 라우팅은 0ms 여야 한다 | 게이트웨이/에지 |
| 3 | **SDUI 전면화** | GraphQL Union/Interface 위젯 규약, 무배포 반영 | 현재 EJS 렌더러의 한계(클라이언트 상호작용·앱 대응). **데이터 모델(`page_section`)은 이미 프레임워크 무관**하게 만들어 뒀다 | **기존 `spf-mall`(Next.js)을 SDUI 렌더러로 승격** — 신규 프로젝트 생성이 아니라 재활용 |
| 4 | **비디오 커머스** | HLS 트랜스코딩 · 숏폼 · 라이브 방송 | `live_cards` 섹션과 `LIVE`/`GROUP_BUY` 기능 메뉴가 여기서 열린다 (현재 `module_ready=0`) | AWS MediaLive/S3/CloudFront |
| 5 | **AI 에이전트** | 실시간 상담·추천 | — | Bedrock 서버리스 |

*(O2O — QR·UTM·딥링크 기반 오프라인 연계 전시 — 도 원설계에 포함되어 있으나 위 5개 이후 순위)*

### 9.2 지금까지의 작업이 P6에 남긴 자산

P6은 먼 얘기지만, 지금 구조가 그때 결정적으로 유리하게 작용한다.

- **`page` / `page_section` / `sectionRegistry`** — SDUI 데이터 모델이 **렌더러와 완전히 분리**돼 있다.
  EJS partial 을 React 컴포넌트로 1:1 교체하면 그대로 동작한다. (§3.1 "SDUI의 가치는 렌더러가 아니라 데이터 아키텍처")
- **`services/display/resolvers/`** (CT-0) — 데이터 해석이 뷰와 분리됐다. GraphQL resolver 로 그대로 이식 가능.
- **`feature_menu.module_ready`** — 미구현 모듈을 구조적으로 감춘다. `LIVE`/`GROUP_BUY` 는 P6에서 켜기만 하면 된다.
- **모든 신규 테이블의 `mall_id`** — `tenant_id` 로 승격하거나 그 위에 얹으면 된다.

### 9.3 진입 조건

```text
1. P0~P5 안정화
2. 입점 브랜드(테넌트) 실수요 확정   ← 사업 결정. 없으면 착수 금물
3. 프론트엔드 Next.js 분리 결정
```
2번이 핵심이다. 테넌트 수요 없이 멀티테넌시를 먼저 만들면, **쓰지 않는 격리 비용**만 전 코드에 남는다.

### 9.4 착수 전 반드시 짚을 것

- **RLS 를 쓸 것인가** — MySQL 은 PostgreSQL 같은 네이티브 RLS 가 없다. PostgreSQL 이관 또는 애플리케이션 레벨 강제(리포지토리 계층) 중 택일해야 한다. **이 결정이 P6 전체 난이도를 좌우한다.**
- **EJS ↔ Next.js 병행 유지보수 부담** — 전환 기간 동안 두 렌더러를 동시에 관리해야 한다. 화면 단위 스트랭글러로 끊어야 한다.
- P5(B) 의 거래 데이터 분리를 **P6의 `tenant_id` 와 같은 축으로 설계**할 것. 두 번 나누면 두 번 마이그레이션한다.

---

## 10. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| 조건 자동형 상품그룹의 동적 SQL | SQL 인젝션 | 필터 필드·연산자 **화이트리스트**, 파라미터화 |
| 메인 화면 회귀 | 운영 사고 | 리팩터링 시 **렌더 HTML 바이트 비교**로 검증 (P1.5 헤더 분해에서 적용) |
| 발행 실수로 메인 붕괴 | 매출 직결 | `page_revision` 롤백 필수, 미리보기 강제 |
| 메뉴 죽은 링크 | UX·SEO | `module_ready` 게이트 (구현됨) |
| `mall_id` 사후 확산 비용 | 대규모 수정 | 신규 테이블에 처음부터 `mall_id` 포함 |
| 거래 데이터 몰 귀속 미결정 | P5 지연 | P5 착수 전 기획 확정 |
| `tables.sql` 노후화 | 잘못된 스키마 가정 | **실 DB를 소스 오브 트루스**로 |

---

## 11. 정리 대상 (기술 부채)

> 성격이 다른 항목을 한 표에 섞으면 "언제 무엇을 해야 하는가"가 사라진다. **A/B/C 로 분리한다.**

### A. 진짜 제거 대상 — 관리자 작업에 태워서 해소

#### A-1. `main_display_sections` / `main_display_products` + `/admin/display`

> ⚠️ **주의: 아직 살아 있다.** "`page_section` 이 대체해서 홈에 영향 없음" 은 **사실이 아니다.**
> `mainController.getCategoryProducts`(카테고리 탭 AJAX)가 여전히 읽고 있다:
> ```js
> const [[catCfg]] = await pool.query(
>     "SELECT max_count FROM main_display_sections WHERE section_key = 'category'");
> ```
> 실측(2026-07-09): `main_display_sections` 3행, `main_display_products` 4행,
> `admin_menus` 의 '전시관리' `is_active=1`. **지금 DROP 하면 카테고리 탭이 깨진다.**

제거 순서 (M7 `storefront_menu` 패턴 재사용: *의존성 제거 → 관찰 → 백업 → DROP*):

1. **의존성 끊기** — `getCategoryProducts` 가 `main_display_sections.max_count` 대신
   `category_showcase` 섹션의 `config_json.maxCount` 를 읽도록 변경.
   AJAX 요청은 자기가 어느 섹션인지 모르므로 `page_section` 에서 `section_type='category_showcase'`
   를 조회하거나 클라이언트가 `sectionId` 를 넘겨야 한다.
2. **관리자 `/admin/display` 를 페이지 빌더로 흡수** — `admin_menus` 에서 **비활성화만**(`is_active=0`).
   라우트는 살려둔다(운영자 화면을 즉시 없애면 되돌릴 수 없다).
3. **관찰 기간 후 코드 제거** — `displayController.js`, `routes/admin/display.js`, `views/admin/display/`
4. **백업 후 DROP** — 안전 가드(`page_section` 에 `category_showcase` 생존 확인) + DDL·INSERT 백업 파일 생성

> **왜 지금이 아닌가**: 1단계는 페이지 빌더와 카테고리 섹션 설정 UI 에 얽힌다.
> **관리자 작업 중 자연히 해소**되므로 지금 따로 하면 같은 코드를 두 번 만진다.

#### A-2. 비활성 관리자 메뉴 5개
쿠폰 · 포인트 · 판매 · 배송 · 문의 — 라우트/뷰는 있는데 `admin_menus.is_active=0`.
"완성 후 켠다" 인지 "폐기" 인지 결정되지 않은 채 방치. → `admin_dev_plan.md` A3

---

### B. 미도입 컬럼 — ✅ 2026-07-09 처리 완료

> **판단 근거**: `custom_menu` 가 **0행**이었다. 지금 스키마를 바꾸면 데이터 마이그레이션 비용이 0이다.
> 관리자 M6(메뉴 관리 UI)를 먼저 만들고 운영자가 메뉴를 넣기 시작한 뒤에 컬럼을 추가하면
> UI·서비스·시드를 모두 다시 손대야 한다.

`node scripts/migrate_menu_columns.js` (멱등)

| 항목 | 조치 |
|---|---|
| `mall_feature_menu.badge_type` | ✅ 추가 (NEW/HOT/SALE) |
| `custom_menu.badge_type` | ✅ 추가 |
| `custom_menu.link_target` | ✅ 추가 (내부 리소스 id) |
| `custom_menu.link_type` | ✅ `varchar(20)` → `varchar(30)`, 값 체계를 대문자 코드로 통일<br>`INTERNAL_PAGE / EXTERNAL_URL / CATEGORY / BRAND / EXHIBITION / PRODUCT_GROUP` |
| `custom_menu.link_url` | ✅ `NOT NULL` → `NULL` (CATEGORY/BRAND 는 URL 을 파생하므로) |
| `categories.seo_config` | ⬜ **도입하지 않음 (YAGNI)** — 카테고리 SEO 요구 없음, `seoDefaults` 미들웨어로 충분 |
| `custom_menu.tracking_code` | ⬜ **도입하지 않음 (YAGNI)** — 캠페인 분석 소비처 없음 |

**링크 유형 해석기** (`navigationService.LINK_RESOLVERS`)
`module_ready` 와 **같은 원칙**을 적용한다 — 실제 라우트가 있는 유형만 등록하고,
미등록 유형(`EXHIBITION`, `PRODUCT_GROUP`)이나 `link_target` 이 비어 href 를 만들 수 없는 행은
**렌더에서 제외**한다. 관리자가 저장해도 죽은 링크가 노출되지 않는다.
외부 링크(`EXTERNAL_URL`)는 관리자 설정과 무관하게 **항상 새 창 + `rel="noopener noreferrer"`** 강제.

배지 값은 `BADGE_TYPES` 화이트리스트(`NEW/HOT/SALE`)로 정규화한다 — 임의 문자열이 뷰로 새어나가지 않는다.

> 🐛 **이 작업 중 발견해 고친 버그**: `header.ejs` 가 `<%= %>`(이스케이프 출력)로 속성 문자열을
> 내보내 `target="_blank"` 가 `target=&#34;_blank&#34;` 로 깨져 있었다. **외부 링크가 새 창으로
> 열리지 않고 `rel="noopener"` 보안 속성도 무효**였다. 이스케이프 없는 출력으로 수정.
>
> 🐛 EJS 주석/스크립틀릿 안에 리터럴 `%>` 를 쓰면 태그가 조기 종료되어 전 페이지 500 이 난다.
> (`custom_html.ejs`, `header.ejs` 에서 각각 한 번씩 발생) — 주석에 EJS 태그 문법을 쓰지 말 것.

---

### C. 이미 해소 (기록 보존용)

| 항목 | 결과 |
|---|---|
| ~~`storefront_menu`~~ | ✅ M7에서 제거. 백업: `scripts/backup_storefront_menu.sql` |
| ~~`hero_showcase.ejs` 내부 유틸 레일~~ | ✅ CT-7에서 완전 제거(잔존 0) |

> **부채가 아닌 것**: `hero_banner` / `hero_showcase` / `popup_banner` 가 `sectionRegistry` 에 없는 것은 정상이다.
> 앞의 둘은 `hero` 디스패처가 `variant` 로 분기해 include 하는 하위 partial 이고,
> `popup_banner` 는 섹션이 아니라 `index.ejs` 가 직접 넣는 오버레이다.

---

### D. 남은 부채 (문서에 없던 것)

| 항목 | 내용 |
|---|---|
| **CT-7 잔여** | 찜 개수 뱃지 미들웨어 없음(장바구니만 `cartCount`). `<1600px` 에서 레일 미노출 |
| **EJS 정적 검증 불가** | `modal_overlay.ejs` · `user_search_modal.ejs` · `checkout/fail.ejs` · `mypage/order_detail.ejs` 4개가 단독 컴파일 실패(최초 커밋부터). 런타임은 정상이나 **CI lint 를 막는다** |
| **`tables.sql` 노후화** | 테이블 수는 51=51 로 맞지만 컬럼 단위 일치는 미검증. 실제로 `banners.banner_type` 에 `BRAND` 가 빠져 있던 것을 CT-5 에서 발견해 보정했다. **스키마 판단은 항상 실 DB 기준** |

---

## 12. 디자인 개선 (벤치마킹 정합) — ✅ 1차 완료 (2026-07-10)

> **사용자 확정(2026-07-09)**: GNB · 히어로 슬라이드쇼 · 우측 유틸 레일의 디자인 구조가
> 벤치마킹 대상(신세계TV쇼핑 · GS SHOP)과 차이가 컸다. 관리자 트랙을 끝낸 뒤 착수했다.

### 12.1 결과

| 영역 | 처리 | 비고 |
|---|---|---|
| **히어로** | ✅ `site_settings.hero_variant` → `product_showcase` | **코드 변경 없음.** `hero_showcase.ejs` 가 이미 벤치마킹 구조(좌 LNB + 슬라이더 + 우 피처카드 + 하단 썸네일)로 구현돼 있었다 |
| **GNB 카테고리** | ✅ 4열 평면 그리드 → 세로 리스트 + 조건부 메가메뉴 | `views/partials/storefront/category_panel.ejs` 신설 |
| **우측 유틸 레일** | ✅ '바로접속 ON/OFF' 헤더 + 최근본 썸네일 2×2 | 토글은 실제로 레일을 접고 `localStorage` 에 상태 저장 |
| **고객센터** | — **이미 정합** | M8 에서 구현한 `LNB + FAQ 검색 + BEST 아코디언 + 공지` 구조가 `capture/image copy.png` 와 일치. 손대지 않았다 |

### 12.2 GNB — 데이터 제약과 그 대응

벤치마킹은 좌측 1뎁스 리스트 + hover 시 우측 2뎁스 컬럼의 **2단 메가메뉴**다.
그런데 우리 카테고리 37개는 **전부 `depth = 1`** 이라, 메가메뉴를 만들면 우측 컬럼이 항상 빈다.

그래서 **자식이 있는 노드에만** 서브패널을 띄우도록 했다.

- 2뎁스 데이터가 없는 지금 → 깔끔한 세로 리스트 하나로 보인다.
- 2뎁스를 입력하면 → 그 노드부터 **자동으로 메가메뉴가 된다.** 마크업 변경 불필요.
  (임시 자식 3건을 넣어 hover 서브패널이 실제로 펼쳐지는 것을 확인하고 삭제했다.)

`feature_menu.module_ready` 와 같은 원칙 — **내용 없는 껍데기를 노출하지 않는다.**

> 따라서 완전한 2단 메가메뉴는 **콘텐츠 작업(하위 카테고리 입력)** 이 선행 조건이지 코드 작업이 아니다.
> 입력 후 `navigation_config.category_display_type='mega'` 를 쓰려면 Header 설정(B5)의
> `mega` 잠금과 관리자 문서(§3.2.1)를 함께 풀어야 한다.

### 12.3 함께 고친 것

- **히어로 썸네일 라벨**: `provider` → 슬라이드 `label`. 단일 공급사 몰에서는 `provider` 가 전부 같은 글자라
  썸네일 5개가 모두 '백세식품' 으로 나왔다.
- **드롭다운 백드롭**: 패널이 좁아 뒤 콘텐츠(히어로 LNB)와 겹쳐 보였다. 백드롭은 반드시 `<header>` **바깥**에 둔다 —
  헤더가 `z-50` 으로 stacking context 를 만들어, 안에 두면 `fixed` 백드롭이 헤더까지 덮는다.
- **레일 최근본 라벨 중복**: 아이콘 라벨과 썸네일 제목이 둘 다 '최근본상품' 이었다. 제목을 없앴다.

### 12.4 남은 것

- 레일 노출 브레이크포인트(`≥1600px`)는 본문 `max-w-1400px` 와의 충돌 때문이다(§4.3, CT-7 잔여).
  참조몰처럼 더 좁은 화면에서도 띄우려면 **본문 컨테이너 폭 정책**을 함께 정해야 한다.
- 하위 카테고리 데이터 입력 → 2단 메가메뉴 완성.
- 모바일 하단 탭(`mobile_quick`): `feature_menu` 에 행이 없고 `menuData`·뷰가 렌더하지 않는다. 기능 신설이 필요하다.

### 12.5 검증 방식

디자인 변경은 HTML 이 바뀌는 게 정상이므로 **렌더 바이트 비교가 아니라 스크린샷 비교**로 확인했다.
Playwright(headless chromium, 1680×1000 / 390×844)로 before·after 를 남겼다.

---

<!-- 원문 보존: 착수 전 검토 대상 -->

### 부록 — 착수 시 검토했던 항목

### 지금까지의 우선순위였던 것 (그래서 디자인이 밀린 이유)
지금까지는 **"골격=코드, 항목=데이터"** 구조를 세우는 데 집중했다(P1.5 · M 트랙 · CT 트랙).
즉 **무엇을 데이터로 그릴 수 있는가**가 목표였고, **어떻게 보이는가**는 최소한으로만 맞췄다.
구조가 잡혔으므로 이제 표현을 참조몰 수준으로 끌어올릴 수 있다.

### 착수 시 검토 대상
| 영역 | 현재 | 참조 |
|---|---|---|
| GNB | 텍스트 링크 + 카테고리 드롭다운 패널(평면 1뎁스) | 2단 컬럼 메가메뉴, hover 확장, 3뎁스 |
| 히어로 | `hero_showcase`(좌 LNB + 슬라이더 + 피처카드) / `hero_banner`(전체폭 스와이퍼) | `capture/image.png`, `image2.png` |
| 우측 유틸 레일 | `≥1600px` 고정 레일, 아이콘+라벨 | `capture/image7.png` (바로접속 ON, 최근본 썸네일 포함) |
| 고객센터 | LNB + FAQ 아코디언 | `capture/image copy.png` |

### 착수 전 확인할 것
- **구조는 이미 데이터화되어 있다.** GNB 항목·레일 항목은 `feature_menu` 로, 섹션은 `page_section` 으로 관리된다.
  따라서 디자인 작업은 **partial/CSS 교체**로 끝나며 데이터 모델은 건드리지 않는다.
- 레일 노출 브레이크포인트(`≥1600px`)는 본문 `max-w-1400px` 와의 충돌 때문이다. 참조몰처럼
  더 좁은 화면에서도 띄우려면 **본문 컨테이너 폭 정책**을 함께 정해야 한다(§4.3, CT-7 잔여).
- 회귀 검증은 **렌더 HTML 바이트 비교**가 아니라 **스크린샷 비교**여야 한다(디자인 변경은 HTML 이 바뀌는 게 정상).
