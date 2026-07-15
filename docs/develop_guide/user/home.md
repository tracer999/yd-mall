# 홈 (메인)

## 1. 개요

- **URL:** `GET /`
- **컨트롤러:** `controllers/mainController.js` → `getHome`
- **뷰:** `views/user/index.ejs` + `views/partials/sections/*`
- **엔진:** `services/display/` (SDUI — 페이지 빌더)

홈은 더 이상 컨트롤러가 화면을 고정하지 않습니다. **DB(`page` / `page_section`)에 정의된 섹션을 `sort_order` 순으로 조립해 렌더**하며, 관리자 페이지 빌더에서 섹션 추가·순서 변경·설정이 가능합니다. 컨트롤러는 섹션이 공유하는 컨텍스트(히어로 데이터·팝업 배너·SEO)만 만듭니다.

---

## 2. 전달 데이터

| 변수 | 타입 | 설명 |
|------|------|------|
| title | string | '홈' |
| sections | Array | `[{ type, view, locals }]` — 조립된 섹션 목록. `views/user/index.ejs` 가 순서대로 include |
| layoutType | string | `page.layout_type` (`main_basic` \| `main_right_utility_v1`). 기본 `main_basic` |
| popupBanner | Object\|null | 팝업 배너 1건 (없으면 null) |
| seo | Object | title/description/url/image/type/siteName/robots + WebSite JSON-LD(SearchAction 포함) |

섹션이 쓰는 공유 컨텍스트(`shared`)는 리졸버에만 전달됩니다:
`{ hasUser, mallId, userId, kakaoUrl, heroData: { variant, heroMainSlides, heroFeature, heroBanners, mobileHeroBanners } }`

---

## 3. 데이터 소스

### 3.1 컨트롤러가 직접 조회하는 것 (`buildHomeContext`)

1. **히어로 배너:** `banners` — `is_active = 1 AND banner_type = 'MAIN'`, `display_order ASC, id ASC`, 최대 6건. `mobile_image_url` 이 있는 것만 따로 모아 모바일 슬라이드로 사용.
2. **히어로 변형(`heroVariant`):** `req.query.hero` → `siteSettings.hero_variant` → `'full_banner'` 순으로 결정.
   - `full_banner` — 위 배너를 전체폭 Swiper 로 (`partials/sections/hero_banner.ejs`)
   - `product_showcase` — `hero_slide` 테이블(`is_active = 1`, 몰 스코프)을 상품과 LEFT JOIN. `slot = 'MAIN'` 은 메인 슬라이드, `slot = 'FEATURE'` 는 우측 피처 1건 (`hero_showcase.ejs`)
3. **팝업 배너:** `banners` — `banner_type = 'POPUP'`, 활성 + 노출기간(`start_date`/`end_date`) 조건, `LIMIT 1`. 뷰에서 오버레이로 렌더하며 "오늘 하루 보지 않기"는 `localStorage` 에 기록.
4. **카카오 상담 URL:** `siteSettings.kakao_channel_enabled` + `kakao_channel_url` 정규화(`pf.kakao.com` 보정).

### 3.2 섹션 엔진이 조회하는 것 (`services/display/displayService.js`)

- `getHomePage(mallId)` — `page` 에서 `page_type = 'home' AND mall_id = ? AND status = 'published'` 1건.
- **발행 스냅샷 우선:** `page_revision` 의 최신 `revision_no` 스냅샷(JSON)을 읽어 노출 조건(`is_active`, `visible_start_at`/`visible_end_at`)으로 필터. **스냅샷이 없으면** 라이브 `page_section` 으로 폴백(최초 발행 전 호환).
- 각 행의 `section_type` → `sectionRegistry.js` 로 뷰를 찾고, `resolvers/<type>.js` 가 `config_json` + `data_source_id` 를 근거로 데이터를 채웁니다.
- 홈 페이지가 없으면(`page` 미시드) `getHomeSections` 는 `null` → 섹션 없는 빈 홈이 렌더됩니다.

---

## 4. 섹션 타입 (sectionRegistry.js — 18종)

| section_type | 뷰 (`views/partials/sections/`) | dataSource | 리졸버 |
|---|---|---|---|
| `hero` | `hero.ejs` → `hero_banner` \| `hero_showcase` | — | O (shared.heroData 전달) |
| `value_proposition` | `value_proposition.ejs` | — | O |
| `product_grid` | `product_grid_section.ejs` | product_group | O |
| `best_ranking` | `product_grid_section.ejs` (재사용) | — (**`best_group`** 고정 소스) | O — 랭킹 스냅샷(`best_ranking`) |
| `category_showcase` | `category_showcase.ejs` | — | O (최상위 카테고리 서브트리별 베스트) |
| `kakao_cta` | `kakao_cta.ejs` | — | O (shared.kakaoUrl) |
| `product_carousel` | `product_carousel.ejs` | product_group | O |
| `deal_carousel` | `deal_carousel.ejs` | — (**활성 특가**(deal) 고정 소스) | O — 특가가 없으면 섹션 스킵 |
| `brand_carousel` | `brand_carousel.ejs` | — (categories type=BRAND 고정) | O |
| `ranking_tabs` | `ranking_tabs.ejs` | — (**`best_group`** 고정 소스) | O — 탭 전환은 `/sections` AJAX |
| `promotion_banner` | `promotion_banner.ejs` | banner_group | O |
| `benefit_bento` | `benefit_bento.ejs` | product_group | O |
| `quick_menu` | `quick_menu.ejs` | — | **없음** (config_json 만으로 렌더되는 정적 섹션) |
| `recent_product` | `recent_product.ejs` | — | O (로그인=`recent_views` / 비로그인=localStorage) |
| `custom_html` | `custom_html.ejs` | — | O (저장·렌더 시 `htmlSanitizer` 로 새니타이즈) |
| `new_by_category` | `new_by_category.ejs` | — (신상품 술어) | O — 신상품 랜딩(`/new`)용 |
| `new_by_brand` | `new_by_brand.ejs` | — (신상품 술어) | O — 신상품 랜딩(`/new`)용 |
| `new_brand_list` | `new_brand_list.ejs` | — (신규 입점 브랜드 술어) | O — 신상품 랜딩(`/new`)용 |

리졸버는 **17종**입니다 — `quick_menu` 만 없습니다.

- **상품 노출 규칙(`resolvers/_shared.js`):** `status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')` + 비로그인은 `visibility = 'PUBLIC'`, 로그인은 `PUBLIC`/`MEMBER_ONLY`.
- 새 컴포넌트를 추가할 때 `displayService.js` 는 수정하지 않습니다: 뷰 생성 → `sectionRegistry` 등록 → (필요 시) `resolvers/` 에 리졸버 추가.

### 4.1 랭킹 계열 (`best_ranking` · `ranking_tabs`)

- 두 섹션은 **같은 스냅샷**(`best_ranking` 테이블)을 읽습니다. 랭킹은 한 곳(`services/best/`)에서만 정의됩니다 → [best.md](./best.md).
- 홈의 "베스트 상품"은 예전엔 상품그룹(수동 큐레이션)이었지만 지금은 **`best_ranking` 리졸버**(랭킹 스냅샷)로 전환됐습니다. `dataSource` 가 `null` 인 이유가 이것입니다 — 상품그룹이 아니라 `best_group` 을 보므로 페이지 빌더의 상품그룹 셀렉터를 쓸 수 없습니다.
- `config_json.groupId` 가 없거나 0 이면 **그 몰의 ALL(전체) 그룹을 자동 선택**합니다. 결과가 0건이면 섹션 자체가 스킵됩니다.
- `ranking_tabs` 의 옛 `sort` 필드는 폐기됐습니다(죽은 옵션). 순위 기준은 `best_score_config` 에 단일 정의됩니다.

### 4.2 특가 캐러셀 (`deal_carousel`)

- 상품그룹이 아니라 **현재 활성인 특가**(`deal` / `deal_item`)를 봅니다. 기간·시간창·요일·선착순 조건이 맞는 상품만 나오고, **특가 기간이 끝나면 섹션이 저절로 사라집니다**(스케줄러 없음 — 조회 시점 판정). → [promotions.md](./promotions.md) §쇼핑특가

### 4.3 퀵메뉴 (`quick_menu`)

- 항목은 URL 직접 입력이 아니라 **페이지 선택(`picker: 'linkTargets'`)** 방식입니다. 운영자가 "이동할 페이지"를 고르면 `url`·`icon`·`label` 이 자동으로 채워집니다(`services/menu/linkTargets.js` 가 **그 몰에서 실제로 열리는 페이지**만 후보로 줍니다). '직접 입력(URL)' 을 골랐을 때만 `icon` 을 손으로 넣습니다(`manualOnly`).

### 4.4 주의

- **`brand_carousel` 리졸버는 아직 `brand_stat` 로 전환되지 않았습니다.** `categories`(type=BRAND) LEFT JOIN `products` 의 COUNT 로 상품 수를 셉니다.
- 레거시 `main_display_*` 는 **코드·DB 양쪽에서 제거 완료**입니다. 홈 전시는 `page`/`page_section` 이 유일한 출처입니다.

> 참고 — 현재 기본몰(mall 1) 홈에 시드된 섹션 순서(15개, `page_section.sort_order`):
> 히어로 → 특장점 → **베스트 상품(`best_ranking`)** → MD 추천 상품(`product_carousel`) → 신상품(`product_grid`) → **쇼핑특가(`deal_carousel`)** → 바로가기(`quick_menu`) → 최고의 혜택(`benefit_bento`) → 진행 중인 프로모션(`promotion_banner`) → 인기 랭킹(`ranking_tabs`) → 브랜드관(`brand_carousel`) → 카테고리별 상품(`category_showcase`) → 최근 본 상품 → 커스텀 HTML → 카카오 상담.
> **데이터이므로 관리자에서 언제든 바뀝니다.** 문서를 믿지 말고 DB 로 확인하세요:
> `SELECT s.sort_order, s.section_type, s.title FROM page_section s JOIN page p ON p.id = s.page_id WHERE p.mall_id = 1 AND p.page_type = 'home' ORDER BY s.sort_order;`

---

### 4.5 신규 몰 프로비저닝 (`services/mall/mallProvisioner.js`)

새 몰을 만들면 프로비저너가 홈 섹션(`page` + `page_section`)만 만드는 게 아니라 **그 섹션이 먹을 데이터 소스까지 함께** 만듭니다.

| 만드는 것 | 이유 |
|---|---|
| `product_group`(프리셋 섹션이 참조할 조건형 그룹, 이름으로 멱등) | 없으면 `data_source_id` 가 비어 상품 섹션이 통째로 빈 화면 |
| `best_group`(그 몰의 `group_type='ALL'`) | 없으면 `best_ranking` 리졸버가 즉시 `null` → 베스트 섹션 스킵 |
| `best_ranking` 초기 집계 | `best_group` 만 만들면 스냅샷이 비어 있어 첫 배치 전까지 랭킹이 안 나옴 |

⚠️ 홈 섹션을 갈아끼운 뒤 **발행하지 않으면** `page_revision` 스냅샷이 옛것이라 고객 화면에 반영되지 않습니다(라이브 `page_section` 폴백은 스냅샷이 아예 없을 때만).

---

## 5. 미리보기 (관리자)

- `mainController.getHomePreview` — **라이브 `page_section`(작업본)** 기준으로 렌더해 발행 전 확인용으로 씁니다(`displayService.getDraftSections`).
- `pageBuilderService.getHomePage` 는 `status` 무필터라 아직 발행하지 않은 draft 홈도 잡습니다.
- `req.mallId` 를 `req.adminMallId` 로 맞춰 히어로·상품 리졸버가 편집 중인 몰로 스코프되게 합니다.

---

## 6. 에러 처리

- **리졸버 단위 격리:** 한 섹션의 데이터 조회가 실패하면 그 섹션만 스킵하고 로그를 남깁니다(홈 전체가 죽지 않음).
- **빈 데이터 규약:** 리졸버가 `null` 을 반환하면 그 섹션은 렌더되지 않습니다(예: 상품 0건인 그리드).
- **뷰 단위 격리:** `views/user/index.ejs` 가 각 `include` 를 try/catch 로 감싸 실패 섹션을 건너뜁니다.
- 그 외 예외 시 `res.status(500).send('Server Error')` (미리보기는 `'미리보기 렌더 오류'`).

---

*Last Updated: 2026-07-15*
