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
| **M8** | 고객센터 페이지 + FAQ 모듈 | ⬜ **다음 작업** |
| **P4** | 테마 시스템 (CSS 변수) | ⬜ |
| **P5** | 멀티몰(도메인 기반) | ⬜ |
| **P6+** | SaaS 고도화 (멀티테넌시·미디어·AI) | 장기 |

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

### 5.6 M8 — 고객센터 페이지
참조 캡처: `capture/image copy.png`
```text
좌측 LNB                본문                          우측
├─ 1:1 문의하기         ├─ FAQ 검색                   └─ 유틸 레일
├─ 1:1 문의내역         ├─ 자주묻는질문 BEST 10 (아코디언)
├─ 공지사항             └─ 공지사항 목록 (더보기)
├─ 자주묻는질문(카테고리)
├─ 비회원 주문조회
└─ 대표번호 / 운영시간
```
**신설 필요**: `faq`, `faq_category` 테이블 + `/cs` 라우트
`HEADER_CS.default_path` 를 `/boards/notice` → `/cs` 로 승격.
기존 `/inquiries`(1:1 문의), `/boards/notice`(공지) 재사용.

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

## 7. Phase 4 — 테마 시스템

```sql
CREATE TABLE IF NOT EXISTS `theme` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NULL,
  `config_json` JSON NULL,   -- primaryColor / fontFamily / buttonRadius / productCardStyle
  `is_active` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
```
- 기존 `site_settings`(브랜드 색상/로고)와 **경계 분리**: 색상·로고는 `site_settings` 유지, `theme.config_json` 은 레이아웃/카드/버튼 스타일 등 빌더 전용 항목만
- `main_layout.ejs` `<head>` 에 CSS 변수 인라인 주입 (`:root { --gh-primary: ... }`) — 이미 동일 패턴 사용 중
- **DoD**: 테마 변경 시 주요 색상·버튼·카드가 CSS 변수로 일괄 변경. 하드코딩 색상값이 변수로 치환됨

---

## 8. Phase 5 — 멀티몰 (도메인 기반)

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
- 지금까지 `mall_id = 1` 상수로 둔 모든 조회(`page` / `product_group` / `feature_menu` 계열 / `categories` / `theme`)를 `req.mall.id` 로 치환

### ⚠️ 의사결정 필요
상품/회원/주문을 **몰 간 공유**할지 **몰별 분리**할지. 분리 시 `products` 등 핵심 테이블에 `mall_id` 추가 + 전 쿼리 필터 필요 → **범위가 크므로 별도 스펙 확정 후 진행**.

---

## 9. Phase 6+ — SaaS 고도화 (장기)

| 항목 | 스택 변화 |
|---|---|
| 멀티테넌시 격리 (`tenant_id` + RLS) | ORM/미들웨어 도입 검토 |
| 에지 라우팅 (도메인→테넌트 0ms) | 게이트웨이/에지 |
| SDUI 전면화 (GraphQL Union 위젯) | **기존 `spf-mall`(Next.js)을 SDUI 렌더러로 승격** (신규 프로젝트 생성 대신 재활용) |
| 비디오 커머스 (HLS·숏폼·라이브) | AWS MediaLive/S3/CloudFront |
| AI 에이전트 | Bedrock 서버리스 |

**진입 조건**: P0~P5 안정화 + 입점 브랜드 수요 확정 + 프론트엔드 Next.js 분리 결정

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

| 항목 | 조치 |
|---|---|
| `main_display_sections` / `main_display_products` | `page_section` 이 대체. 검증 후 제거 (관리자 `/admin/display` 와 함께) |
| ~~`storefront_menu`~~ | ✅ **M7에서 제거 완료**. 백업: `scripts/backup_storefront_menu.sql` |
| `hero_showcase.ejs` 내부 유틸 레일 | 전역 레일로 승격 완료 → CT-7 에서 제거 |
| `categories.seo_config` | 미도입. 카테고리 SEO 필요 시 추가 |
| `mall_feature_menu.badge_type` | NEW/HOT/SALE 배지용 컬럼 미도입 |
| `custom_menu.link_type` | `EXHIBITION`/`PRODUCT_GROUP`/`BRAND`/`CATEGORY` 확장 + `link_target` 필요 |
