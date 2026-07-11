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

## 4. 섹션 타입 (sectionRegistry.js — 13종)

| section_type | 뷰 (`views/partials/sections/`) | dataSource | 리졸버 |
|---|---|---|---|
| `hero` | `hero.ejs` → `hero_banner` \| `hero_showcase` | — | O (shared.heroData 전달) |
| `value_proposition` | `value_proposition.ejs` | — | O |
| `product_grid` | `product_grid_section.ejs` | product_group | O |
| `product_carousel` | `product_carousel.ejs` | product_group | O |
| `brand_carousel` | `brand_carousel.ejs` | (categories type=BRAND 고정) | O |
| `ranking_tabs` | `ranking_tabs.ejs` | (카테고리 탭 고정) | O — 탭 전환은 `/sections` AJAX |
| `promotion_banner` | `promotion_banner.ejs` | banner_group | O |
| `benefit_bento` | `benefit_bento.ejs` | product_group | O |
| `category_showcase` | `category_showcase.ejs` | — | O (최상위 카테고리 서브트리별 베스트) |
| `quick_menu` | `quick_menu.ejs` | — | **없음** (config_json 만으로 렌더되는 정적 섹션) |
| `recent_product` | `recent_product.ejs` | — | O (로그인=`recent_views` / 비로그인=localStorage) |
| `custom_html` | `custom_html.ejs` | — | O (저장·렌더 시 `htmlSanitizer` 로 새니타이즈) |
| `kakao_cta` | `kakao_cta.ejs` | — | O (shared.kakaoUrl) |

- **상품 노출 규칙(`resolvers/_shared.js`):** `status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')` + 비로그인은 `visibility = 'PUBLIC'`, 로그인은 `PUBLIC`/`MEMBER_ONLY`.
- 새 컴포넌트를 추가할 때 `displayService.js` 는 수정하지 않습니다: 뷰 생성 → `sectionRegistry` 등록 → (필요 시) `resolvers/` 에 리졸버 추가.

> 참고 — 현재 기본몰(mall 1) 홈에 시드된 섹션 순서: 히어로 → 특장점 → 베스트 상품 → MD 추천 상품 → 신상품 → 오늘의 특가 → 바로가기 → 최고의 혜택 → 진행 중인 프로모션 → 카테고리 랭킹 → 브랜드관 → 카테고리별 상품 → 최근 본 상품 → 커스텀 HTML → 카카오 상담. (데이터이므로 관리자에서 언제든 바뀝니다.)

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

*Last Updated: 2026-07-11*
