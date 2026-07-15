# 페이지 빌더 · SDUI 섹션 엔진 (Page Builder)

## 1. 개요

- **Base URL:** `/admin/page-builder` (에디터), `/admin/product-groups` (섹션 데이터 소스)
- **관련 테이블:** `page`, `page_section`, `page_revision`, `product_group`, `product_group_item`
- **컨트롤러:** `controllers/admin/pageBuilderController.js`, `controllers/admin/productGroupController.js`, `controllers/mainController.js`(미리보기·홈 렌더), `controllers/sectionController.js`(섹션 AJAX)
- **라우트:** `routes/admin/page-builder.js`, `routes/admin/product-groups.js`, `routes/sections.js`
- **서비스:** `services/display/` — `sectionRegistry.js`, `displayService.js`, `pageBuilderService.js`, `productGroupService.js`, `bannerService.js`, `htmlSanitizer.js`, `resolvers/`(17종 + `_shared.js`)
- **뷰:** `views/admin/page-builder/editor.ejs`, `views/admin/product-groups/list.ejs` · `edit.ejs`, 섹션 렌더러 `views/partials/sections/*.ejs`
- **클라이언트 스크립트:** `public/js/admin/page-builder.js` (섹션 목록·설정폼·미리보기 iframe 제어)

SDUI(Server-Driven UI) 구조다. 홈 화면의 구성은 코드가 아니라 `page_section` 행(섹션 타입 + `config_json` + 데이터 소스)에 있고, 렌더 시 `services/display/` 가 이를 조립한다.

- **작업본(draft)** = `page_section` 테이블 (에디터가 직접 수정)
- **발행본(published)** = `page_revision.snapshot_json` (스토어프론트가 렌더)
- 발행 전 편집은 미리보기에만 보인다. (`services/display/displayService.js` 상단 주석)

> **레거시 전시관리 제거됨.** `displayController` / `/admin/display` 와 `main_display_*` 테이블은 **코드·DB 양쪽에서 완전히 사라졌다**(DB 확인: `SHOW TABLES LIKE 'main_display%'` → 0건). 전시 편집은 페이지 빌더 하나뿐이다.

### 1.1 홈만 편집하는 게 아니다 — 랜딩 페이지도 편집한다

페이지 빌더는 `page` 테이블의 **모든 SDUI 페이지**를 편집·발행한다. 에디터 상단에 **페이지 선택기**가 있고, `?page=<id>` 로 대상을 고른다(`pageBuilderController.resolvePage`, 몰 스코프로 검증하므로 남의 몰 페이지 id 를 넣어도 열리지 않는다).

| page_type | 예 | 스토어프론트 |
|---|---|---|
| `home` | 홈(mall 1·2·6) | `GET /` |
| `feature` | **신상품 랜딩** (`slug='new'`, mall 1·2) | `GET /new` |

예전에는 홈만 편집할 수 있었다. 그래서 랜딩(`/new`)은 발행할 방법이 없었고, 스냅샷이 없는 페이지는 라이브 `page_section` 으로 폴백해 **빌더에서 고치는 순간 스토어프론트에 반영됐다.** 지금은 모든 페이지가 발행 스냅샷을 갖는다.

---

## 2. 라우트 및 동작

### 2.1 페이지 빌더 (`routes/admin/page-builder.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/page-builder` | `pageBuilder.getEditor` | 에디터 화면 (좌: 섹션 목록 / 중: 미리보기 iframe / 우: 설정폼) |
| GET | `/admin/page-builder/preview` | `mainController.getHomePreview` | 작업본(draft) 미리보기 — iframe `src` |
| GET | `/admin/page-builder/section-preview?type=` | `getSectionPreview` | **섹션 카탈로그 미리보기** — 추가하기 전에 실데이터로 렌더 (iframe `src`) |
| POST | `/admin/page-builder/sections` | `postSectionAdd` | 섹션 추가 (JSON). body: `section_type` |
| POST | `/admin/page-builder/sections/reorder` | `postSectionReorder` | 순서 변경 (JSON). body: `order: number[]` |
| POST | `/admin/page-builder/sections/:id/update` | `postSectionUpdate` | 섹션 설정 저장 (JSON) |
| POST | `/admin/page-builder/sections/:id/delete` | `postSectionDelete` | 섹션 삭제 (JSON) |
| POST | `/admin/page-builder/sections/:id/duplicate` | `postSectionDuplicate` | 섹션 복제 (JSON) |
| POST | `/admin/page-builder/publish` | `postPublish` | 발행 — `page_revision` 스냅샷 생성 |
| POST | `/admin/page-builder/revisions/:revisionId/rollback` | `postRollback` | 롤백 — 스냅샷으로 작업본 교체 |

- 접근 제어: `routes/admin.js:42` — `requireMenuAccess('/admin/page-builder')`. `admin_menus` 의 `visible_roles` = `super_admin,admin,content_admin`.
- 모든 CRUD 는 JSON 응답(`{ success, ... }`)이고, 편집 UI 가 `fetch` 후 목록·미리보기를 갱신한다.

### 2.2 상품 그룹 (`routes/admin/product-groups.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/product-groups` | `getList` | 그룹 목록 (참조 중인 섹션 함께 표시) |
| GET | `/admin/product-groups/new` | `getNew` | 그룹 등록 폼 |
| POST | `/admin/product-groups` | `postCreate` | 그룹 생성 |
| GET | `/admin/product-groups/:id` | `getEdit` | 그룹 수정 폼 + 결과 미리보기 |
| POST | `/admin/product-groups/:id` | `postUpdate` | 그룹 수정 |
| POST | `/admin/product-groups/:id/delete` | `postDelete` | 그룹 삭제 |
| GET | `/admin/product-groups/:id/product-search` | `getProductSearch` | 수동 선택 팝업 상품 조회 (JSON) |
| POST | `/admin/product-groups/:id/items` | `postAddItem` | 상품 1건 추가 |
| POST | `/admin/product-groups/:id/items/bulk` | `postAddItems` | 상품 다건 추가 (JSON) |
| POST | `/admin/product-groups/:id/items/reorder` | `postReorderItems` | 아이템 순서 변경 (JSON) |
| POST | `/admin/product-groups/:id/items/:itemId/delete` | `postRemoveItem` | 아이템 제거 |

- Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다. 그래서 `/new` 를 `/:id` **앞에** 선언하고, 숫자 검증은 `requireNumericId` 미들웨어가 한다.

### 2.3 스토어프론트 섹션 AJAX (`routes/sections.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/sections/ranking?groupId=&period=&limit=` | `sectionController.getRanking` | `ranking_tabs` 탭 전환용 상품 목록 (JSON) |

- 순위를 여기서 계산하지 않는다. 배치가 만든 **랭킹 스냅샷**(`bestRankingService`)을 읽는다 — SSR 첫 탭(`resolvers/ranking_tabs`)과 **같은 함수**를 부르므로 둘이 어긋날 수 없다.
- `groupId` 는 요청에서 받지만 **몰 스코프로 검증**한다(남의 몰 랭킹 탭 조회 불가). 없는 그룹이면 404. `limit` 상한 20.
- 옛 `sort` 파라미터(views/sales/newest/discount)는 폐기됐다 — `sales` 가 조회수와 같은 SQL 로 매핑된 죽은 옵션이었다. 지금은 `period`(REALTIME/DAILY/WEEKLY/MONTHLY)만 받는다.

---

## 3. 렌더 파이프라인

```
page (page_type='home', mall_id)
  └ page_section (작업본)  ──발행(publish)──▶ page_revision.snapshot_json (발행본)
                                                   │
스토어프론트 GET /  ─ mainController.getHome ─ displayService.getHomeSections(shared)
                                                   │  최신 revision 우선, 없으면 page_section 폴백
                                                   ▼
                             resolveSections() : section_type 별
                               registry[type].view  (렌더러 EJS)
                               resolvers[type].resolve() (데이터 주입) → locals
                                                   ▼
                              views/user/index.ejs 가 sections 를 순서대로 include
```

### 3.1 스토어프론트 (`services/display/displayService.js`)

- `getHomePage(mallId)` — `SELECT * FROM page WHERE page_type='home' AND mall_id=? AND status='published' ORDER BY id DESC LIMIT 1`
- `getLatestRevision(pageId)` — `page_revision` 의 최신 `revision_no`
- 스냅샷이 있으면 `filterSnapshotRows()` 로 노출 조건 필터(`is_active`, `visible_start_at/end_at`) 후 정렬. **스냅샷이 없으면 라이브 `page_section` 폴백**(최초 발행 전 호환).
- `resolveSections(rows, shared)`:
  - 레지스트리에 없는 `section_type` 은 **스킵**
  - 리졸버가 `null` 을 반환하면 그 섹션 **스킵**(빈 데이터 규약)
  - 리졸버가 없으면 `config_json` 만으로 렌더(정적 섹션 — 현재 `quick_menu`)
  - 리졸버 예외는 `try/catch` 로 격리 → 한 섹션 실패가 홈 전체를 죽이지 않는다

`shared` 컨텍스트는 `controllers/mainController.js` `buildHomeContext()` 가 만든다: `{ hasUser, mallId, userId, kakaoUrl, heroData: { variant, heroMainSlides, heroFeature, heroBanners, mobileHeroBanners } }`.

### 3.2 미리보기 (`getHomePreview`)

- `services/display/displayService.js` `getDraftSections(pageId, shared)` 로 **라이브 `page_section`(작업본)** 을 렌더한다. `is_active`/노출기간 필터는 그대로 적용된다.
- 미리보기는 **편집 중인 몰**의 작업본을 봐야 하므로 `req.mallId = req.adminMallId || req.mallId || 1` 로 덮어쓴 뒤 컨텍스트를 만든다(`controllers/mainController.js:131`). 이 한 줄이 빠지면 히어로·상품 리졸버가 손님 세션의 몰로 스코프되어 편집 대상과 다른 몰이 보인다(최근 수정 사항).
- `builder.getHomePage()` 는 `status` 무필터라 아직 발행하지 않은 draft 홈도 잡는다.
- 뷰는 스토어프론트와 동일한 `user/index` 를 쓰고 `isPreview: true` 만 추가한다.

### 3.3 에디터 화면 (`getEditor` → `views/admin/page-builder/editor.ejs`)

- `builder.getHomePage(req.adminMallId || 1)` 로 홈 페이지를 찾는다. 없으면 404 + "시드 데이터를 먼저 생성하세요" 안내만 렌더.
- 섹션 행에 레지스트리 메타를 덧입힌다(`decorateSection`): `label`, `fields`, `dataSource`, `config`(파싱), `dataSourceName`, `isUnknownType`.
- 팔레트(`buildPalette`)는 `sectionRegistry` 를 그대로 나열한다 → **레지스트리에 등록하면 즉시 추가 가능한 섹션이 된다.**
- 초기 데이터는 `<script id="pb-data" type="application/json">` 에 JSON 으로 실려 `public/js/admin/page-builder.js` 가 읽는다. `</`, `<!--`, U+2028/2029 를 이스케이프한다(스크립트 조기 종료 방지).
- 설정폼은 `fields` 스키마로 동적 생성한다(`page-builder.js` `renderConfigInput`): `number` / `select` / `textarea` / `json` / `repeater` / (기본) `text`. `json` 타입은 textarea 에 pretty-print 하고 `data-json="1"` 로 표시해 저장 시 파싱한다.
- `repeater` 는 객체 배열을 **행 단위 UI**(추가·삭제·순서 이동)로 편집한다. 레지스트리에 `itemFields`(행 안의 입력 스키마)를 주면 되고, `addLabel`·`hint`(필드 아래 도움말 HTML)는 선택이다. 저장 형태는 `json` 과 같은 배열이라 기존 `config_json` 을 그대로 읽고 쓴다. 형태가 정해진 배열이면 `json` 대신 이쪽을 쓸 것.
- `picker: 'linkTargets'` 를 준 repeater 는 `type: 'linkTarget'` 필드가 **이 몰에서 실제로 열리는 페이지 셀렉트**가 된다. 고르는 즉시 `url`·`icon`·`label` 이 채워지고(운영자는 표시 이름만 수정), 목록에 없는 곳은 `직접 입력(URL)` 을 골라야 `manualOnly` 필드(URL·아이콘)가 열린다. `type: 'icon'` 필드는 아이콘 미리보기를 붙이고 저장 시 `bi-` 접두어를 벗겨 정규화한다. 현재 `quick_menu.items` 가 사용한다.
- 선택지 목록은 `services/menu/linkTargets.js` 의 `getLinkTargets(mallId)` 가 만든다 — `navigationService` 의 `getFeatureMenus`(몰에서 켜짐 + `module_ready` + 콘텐츠 게이트 통과) + `getCustomMenus`(대상이 유효한 것) + 고정 페이지(홈)를 URL 기준으로 중복 제거한다. **즉 GNB 에 나올 수 있는 페이지만 바로가기 후보가 된다.** 아이콘은 `feature_menu` 에 컬럼이 없으므로 같은 파일의 `FEATURE_ICONS`(feature_code → Bootstrap Icons 이름) 가 관장한다 — 기능 메뉴를 추가하면 여기에 한 줄 넣는다.
- 공통 필드(제목·PC/모바일 노출·활성·노출기간)는 에디터가 일괄 처리하므로 레지스트리 `fields` 에는 **config 전용 키만** 둔다.

---

## 4. 섹션 타입 (sectionRegistry.js)

`services/display/sectionRegistry.js` 가 `section_type ↔ 렌더러 뷰 ↔ 관리자 설정폼` 을 1:1 로 관장한다. 총 **18종**, 이 중 리졸버가 있는 것은 **17종**(`quick_menu` 만 정적).

| section_type | 라벨 | view (`views/…`) | dataSource | 리졸버 (`services/display/resolvers/`) | config 필드 |
|---|---|---|---|---|---|
| `hero` | 히어로 | `partials/sections/hero` | – | `hero.js` — `shared.heroData` 주입 | 없음 |
| `value_proposition` | 특장점 | `partials/sections/value_proposition` | – | `value_proposition.js` — `kakaoUrl`(없으면 `#`) | 없음 (`fields: []` — **문구 편집 불가**) |
| `product_grid` | 상품 그리드 | `partials/sections/product_grid_section` | `product_group` | `product_grid.js` — 그룹 해석, 0건이면 스킵 | `maxCount`(8), `columns`(4), `moreLink` |
| `best_ranking` | **베스트/랭킹** | `partials/sections/product_grid_section` | – (고정 소스 `best_group`) | `best_ranking.js` — GNB `/best` 와 같은 랭킹 스냅샷 | `groupId`(0=전체), `period`(REALTIME\|DAILY\|WEEKLY\|MONTHLY), `maxCount`, `columns`, `moreLink` |
| `category_showcase` | 카테고리별 상품 | `partials/sections/category_showcase` | – | `category_showcase.js` — `loadHomeCategoryBests()` | 없음(코드상 `productLimit`·`categoryLimit` 을 config 에서 읽음) |
| `kakao_cta` | 카카오 상담 CTA | `partials/sections/kakao_cta` | – | `kakao_cta.js` — 카카오 채널 미설정이면 섹션 스킵 | 없음 |
| `product_carousel` | 상품 캐러셀 | `partials/sections/product_carousel` | `product_group` | `product_carousel.js` — `product_grid` 와 같은 소스, 기본 12건 | `maxCount`(12), `columnsPerView`(4), `moreLink` |
| `deal_carousel` | **쇼핑특가 캐러셀** | `partials/sections/deal_carousel` | – (고정 소스: 활성 특가) | `deal_carousel.js` — 기간·시간창·요일·선착순이 맞는 특가만. 특가가 없으면 **섹션 자체가 스킵** | `dealCategoryCode`(비우면 전체), `maxCount`(12), `columnsPerView`, `moreLink`(`/deals`) |
| `brand_carousel` | 브랜드 캐러셀 | `partials/sections/brand_carousel` | – (고정 소스 `categories.type='BRAND'`) | `brand_carousel.js` — 몰 스코프, 상품 있는 브랜드만(기본) | `maxCount`(20), `columns`(6), `shape`(`rect`\|`circle`), `moreLink` |
| `ranking_tabs` | 랭킹 탭 | `partials/sections/ranking_tabs` | – (고정 소스 `best_group`) | `ranking_tabs.js` — `best_ranking` 과 **같은 스냅샷**. 탭 = `/admin/best-groups` 의 랭킹 그룹 | `maxTabs`(6), `rankLimit`(8), `period`(REALTIME\|DAILY\|WEEKLY\|MONTHLY) |
| `promotion_banner` | 프로모션 배너 | `partials/sections/promotion_banner` | `banner_group` | `promotion_banner.js` — `bannerService.getByGroup(config.groupKey)` | `groupKey`, `maxCount`(4), `layout`(`rect`\|`vertical`), `columns`(2) |
| `benefit_bento` | 혜택 벤토 | `partials/sections/benefit_bento` | `product_group` | `benefit_bento.js` — 대형 딜 + 썸네일 + 프로모 블록 | `dealProductId`, `maxCount`(8), `promoBlocks`(JSON `[{copy,color,url}]`) |
| `quick_menu` | 퀵 메뉴 | `partials/sections/quick_menu` | – | **없음(정적)** — `config_json` 만으로 렌더 | `items`(repeater + **페이지 선택 picker**, 아래 참고), `columns`(4) |
| `recent_product` | 최근 본 상품 | `partials/sections/recent_product` | – | `recent_product.js` — 로그인=`recent_views`, 비로그인=클라이언트 localStorage | `maxCount`(8) |
| `custom_html` | 커스텀 HTML | `partials/sections/custom_html` | – | `custom_html.js` — 렌더 직전 새니타이즈, 비면 스킵 | `html`(textarea) |
| `new_by_category` | **카테고리별 신상품** | `partials/sections/new_by_category` | – | `new_by_category.js` — `services/catalog/newArrival` 술어 | `maxCount`(탭별 8), `maxCategory`(6) |
| `new_by_brand` | **브랜드별 신상품** | `partials/sections/new_by_brand` | – | `new_by_brand.js` | `maxCount`(브랜드별 6), `maxBrand`(5) |
| `new_brand_list` | **신규 입점 브랜드** | `partials/sections/new_brand_list` | – | `new_brand_list.js` — `categories.onboarded_at` 기준 | `maxCount`(8), `productCount`(브랜드별 3) |

- 뒤 3종(`new_*`)은 **신상품 랜딩(`/new`, `page_type='feature'`)용**이다. 상품을 `product_group` 이 아니라 신상품 술어(`services/catalog/newArrival`)로 직접 조회한다 — 카테고리·브랜드별로 묶는 구조라 단일 그룹으로 표현할 수 없기 때문. 판정 규칙은 [`products.md`](./products.md) §1.2 참고.
- **랭킹은 한 곳에서만 정의된다.** `best_ranking` 과 `ranking_tabs` 는 같은 랭킹 스냅샷(`best_score_config`: 판매 5 · 좋아요 3 · 조회 0)을 읽는다. 옛 `ranking_tabs.sort` 필드는 폐기됐다(`sales` 가 `views` 와 같은 SQL 로 매핑된 죽은 옵션이었다).
- `dataSource` 는 `page_section.data_source_id` 가 무엇을 가리키는지 뜻한다. 값이 `product_group` 인 3종(`product_grid`, `product_carousel`, `benefit_bento`)만 에디터에 상품 그룹 셀렉트가 뜬다(`page-builder.js:105`). `best_ranking`·`ranking_tabs`·`deal_carousel` 은 `dataSource: null` 이고 고정 소스를 본다.
- **`quick_menu` 는 URL 을 직접 입력하지 않는다.** `picker: 'linkTargets'` 로 **"이 몰에서 실제로 열리는 페이지" 셀렉트**가 뜨고, 고르는 즉시 `url`·`icon`·`label` 이 자동으로 채워진다(운영자는 표시 이름만 고친다). 목록에 없는 곳으로 보내려면 `직접 입력(URL)` 을 골라야 URL·아이콘 입력이 열린다. 후보 목록은 `services/menu/linkTargets.js` 가 만든다(§3.3).

### 4.1 섹션 카탈로그 모달 (추가하기 전에 보고 고른다)

팔레트가 라벨만 보여주던 시절엔 '혜택 벤토'·'랭킹 탭'이 무엇인지 추가해 봐야 알 수 있었다. 지금은 **각 섹션 타입을 현재 몰의 실데이터로 iframe 라이브 렌더**해 카드에 띄운다(`GET /admin/page-builder/section-preview?type=`). 스크린샷을 떠 두지 않는 이유: 테마·상품이 바뀌면 스크린샷은 그 즉시 거짓말이 된다.

- config 는 레지스트리 `fields` 의 `default` 로 만든다 = **추가 직후의 실제 초기 상태**를 보여준다.
- 운영자가 아직 아무것도 안 넣은 타입(`quick_menu`·`custom_html`·`benefit_bento` 의 프로모 블록)만 `SAMPLE_CONFIG` 예시 값으로 채우고, 뷰가 "예시 데이터" 배너를 띄운다.
- 데이터가 0건이라 섹션이 스킵되면 `EMPTY_REASON` 이 **무엇을 채워야 하는지**를 알려준다(예: "배너 관리에 노출 중인 MAIN 배너가 없습니다").
- 같은 진단(`displayService.diagnoseSections`)을 섹션 목록에도 붙여, 스토어프론트에 실제로 안 나오는 섹션에 `skipReason` 배지를 단다. 저장 직후에도 다시 판정해 돌려준다.
- `promotion_banner` 의 `dataSource` 는 `'banner_group'` 이지만 실제 리졸버는 `data_source_id` 가 아니라 **`config.groupKey`(문자열)** 로 `banners.group_key` 를 조회한다.
- `resolvers/_shared.js` 는 리졸버가 아니라 공용 헬퍼다: `P_STATUS`(전시 가능 상태 = `ON,SOLD_OUT,COMING_SOON,RESTOCK`), `visibilityClause(hasUser)`(비로그인=`PUBLIC` 만), `loadHomeCategories`, `loadHomeCategoryBests`.

### 4.2 새 섹션 타입 추가 절차

`services/display/resolvers/index.js` 주석에 명시된 절차 — `displayService.js` 는 건드리지 않는다.

1. `views/partials/sections/<type>.ejs` 렌더러 생성
2. `services/display/sectionRegistry.js` 에 `{ view, label, dataSource, fields }` 등록
3. 데이터가 필요하면 `services/display/resolvers/<type>.js` 추가 후 `resolvers/index.js` 맵에 등록 (필요 없으면 정적 섹션)

---

## 5. 발행 · 롤백 (`services/display/pageBuilderService.js`)

- **발행 `publish(pageId, createdBy)`**
  - 현재 `page_section` 전체를 `SNAPSHOT_COLS` 로 추려 `page_revision.snapshot_json` 에 저장(`revision_no` = 기존 최대 + 1, `status='published'`, `created_by` = 관리자 username).
  - 같은 트랜잭션에서 `page.status='published'`, `page.published_at=NOW()`.
  - 스냅샷 컬럼: `id, section_type, position, title, sort_order, data_source_type, data_source_id, config_json, visible_start_at, visible_end_at, visible_on_pc, visible_on_mobile, is_active`
- **롤백 `rollback(pageId, revisionId)`**
  - 선택 리비전의 스냅샷으로 `page_section` **작업본을 통째로 교체**(해당 page 의 기존 행 DELETE 후 재삽입, 트랜잭션).
  - 롤백은 작업본만 바꾼다. **스토어프론트에 반영하려면 다시 발행해야 한다.**
- **목록 `listRevisions(pageId, limit=20)`** — 에디터 상단 리비전 셀렉트.
- **추가 `addSection`** — 레지스트리에 없는 타입이면 `Error('알 수 없는 섹션 타입입니다.')`. `title` 은 레지스트리 `label`, `data_source_type` 은 레지스트리 `dataSource` 로 초기화, `sort_order` 는 `MAX+1`.
- **복제 `duplicateSection`** — 같은 page 맨 끝, 제목에 `(복사)` 부기.
- **재정렬 `reorderSections(pageId, orderedIds)`** — 배열 순으로 `sort_order = 1..N`, `page_id` 로 소속 검증, 트랜잭션.
- **저장 `updateSection`** — `custom_html` 은 저장 시점에도 `htmlSanitizer.sanitize()` 를 태운다(렌더 시 리졸버 새니타이즈와 **이중 방어**).

---

## 6. 상품 그룹 (`/admin/product-groups`)

페이지 빌더 섹션(`product_grid` · `product_carousel` · `benefit_bento`)의 데이터 소스다.

### 6.1 그룹 타입

| group_type | 무엇을 읽나 | UI 에서 보이는 것 |
|---|---|---|
| `manual` | `product_group_item` (`product_id`, `sort_order`) 만 | 상품 목록 + 수동 선택 팝업. **`sort_type`/`filter_condition_json` 은 숨김** |
| `condition` | `filter_condition_json` 4키 + `sort_type` | 필터·정렬 폼 + 결과 미리보기. **아이템 목록은 숨김** |

UI 범위는 `services/display/productGroupService.js` `resolve()` 가 실제로 읽는 것에 정확히 맞춘다(`controllers/admin/productGroupController.js` 상단 주석).

- **필터 화이트리스트(4키)**: `badge`(products.product_badge 는 SET → `FIND_IN_SET`), `category_id`, `min_discount`(`discount_rate >=`), `in_stock`(`stock > 0`)
- **정렬 화이트리스트(`ORDER_MAP`)**: `manual`(= created_at DESC), `newest`, `discount`, `price_asc`, `price_desc`, `views`
- **배지 값**: `BEST`, `NEW`, `RECOMMEND`, `DEADLINE_SALE`, `GREENHUB_SPECIAL`
- 조건/정렬 모두 화이트리스트만 허용해 SQL 인젝션을 차단한다.
- `resolve()` 는 항상 `group.mall_id` 로 상품을 스코프하고, 전시 상태(`P_STATUS`)·노출등급(비로그인 `PUBLIC` 만)을 강제하며 `limit` 상한은 60.

### 6.2 수동 선택 팝업 (`GET /admin/product-groups/:id/product-search`)

- 쿼리: `q`(상품명·`product_code` LIKE), `category_id`, `brand_id`(→ `products.brand_category_id`, `categories.type='BRAND'`), `in_stock`(`y`|`n`), `visibility`(`PUBLIC`|`HIDDEN`|`MEMBER_ONLY`)
- **검색어는 선택**이다. 필터만으로도 조회 가능(가드 없음). 필터는 전부 AND.
- 항상 `p.mall_id = 편집 몰` + 이미 담긴 상품 제외. `LIMIT 100`, 응답 `{ products, limited }`.
- 다건 담기 `POST /:id/items/bulk` — 타 몰 상품·중복은 **조용히 건너뛰고** `{ success, added, skipped }` 반환.

### 6.3 참조 무결성 가드

`page_section.data_source_id` 에는 **FK 가 없다.** 게다가 `productGroupService.getById()` 가 `WHERE is_active = 1` 이라 **삭제뿐 아니라 비활성화만으로도** 그 그룹을 쓰는 섹션이 조용히 빈 목록이 된다. 그래서 컨트롤러가 양쪽을 막는다.

- `findReferencingSections()` — `section_type IN (dataSource='product_group' 인 타입들)` AND `data_source_id = 그룹id`
- **삭제**: 참조 섹션이 1개라도 있으면 차단(`postDelete`)
- **비활성화**: 활성 참조 섹션이 있으면 차단(`postUpdate`)
- 목록·수정 화면에 참조 섹션(`refs`)을 함께 노출한다.

### 6.4 `filter_condition_json` 부분 갱신

`buildFilterJson()` 은 기존 JSON 을 읽어 **UI 4키만** 교체한다. `seed_key` 같은 UI 밖 키를 통째로 덮어쓰면 `scripts/seed_ct_sections.js` 가 그룹을 못 찾아 중복 생성한다.
`manual` 로 전환할 때는 `filter_condition_json` 컬럼을 **아예 건드리지 않는다** — mysql2 가 JSON 컬럼을 객체로 돌려주므로 그 값을 그대로 재바인딩하면 `'[object Object]'` 가 되어 Invalid JSON 오류가 난다.

---

## 7. DB 테이블

### `page` — 페이지(화면 단위)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| mall_id | bigint NOT NULL DEFAULT 1 | 몰 스코프 |
| page_type | varchar(50) NOT NULL | `'home'`(홈) / `'feature'`(랜딩 — 예: `slug='new'` 신상품) |
| slug | varchar(255) | |
| title | varchar(200) | |
| layout_type | varchar(100) DEFAULT 'main_basic' | `user/index` 렌더 시 `layoutType` |
| status | varchar(30) DEFAULT 'published' | 스토어프론트는 `published` 만 조회 |
| published_at / created_at / updated_at | datetime | |

인덱스 `idx_page_mall_type (mall_id, page_type, status)`. 현재 데이터(5행): mall 1 → home(1) · feature/new(5), mall 2 → home(4) · feature/new(6), mall 6 → home(9).

### `page_section` — 섹션(전시 블록 인스턴스, 작업본)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| page_id | bigint NOT NULL | FK → `page.id` **ON DELETE CASCADE** |
| section_type | varchar(100) NOT NULL | 레지스트리 키 |
| position | varchar(100) DEFAULT 'main_content' | 현재 렌더 로직은 사용하지 않음 |
| title | varchar(200) | |
| sort_order | int DEFAULT 0 | |
| data_source_type | varchar(100) | 레지스트리 `dataSource` 복사본 |
| data_source_id | bigint | `product_group.id` — **FK 없음** |
| config_json | json | 섹션별 설정 |
| visible_start_at / visible_end_at | datetime | 노출 기간 — **섹션 단위 예약 노출로 실제 동작한다** |
| visible_on_pc / visible_on_mobile | tinyint(1) DEFAULT 1 | 디바이스별 노출. **렌더에 반영된다** (§8 참고) |
| is_active | tinyint(1) DEFAULT 1 | |
| created_at / updated_at | datetime | |

인덱스 `idx_section_page (page_id, sort_order)`.

### `page_revision` — 발행 스냅샷

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| page_id | bigint NOT NULL | **FK 없음** |
| revision_no | int NOT NULL | page 별 1부터 증가 |
| snapshot_json | json NOT NULL | `page_section` 배열 스냅샷 |
| status | varchar(30) DEFAULT 'published' | |
| created_by | varchar(100) | 관리자 username |
| created_at / published_at | datetime | |

인덱스 `idx_rev_page (page_id, revision_no)`.

### `product_group` — 전시용 상품 그룹

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| mall_id | bigint NOT NULL DEFAULT 1 | |
| name | varchar(200) NOT NULL | |
| group_type | varchar(50) DEFAULT 'manual' | `manual` \| `condition` |
| sort_type | varchar(50) DEFAULT 'manual' | `ORDER_MAP` 6종 |
| filter_condition_json | json | `condition` 전용 (+ `seed_key` 등 UI 외 키) |
| is_active | tinyint(1) DEFAULT 1 | 0 이면 `getById` 가 못 찾아 섹션이 빈다 |
| created_at / updated_at | datetime | |

### `product_group_item` — 수동 선택 아이템

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| product_group_id | bigint NOT NULL | FK → `product_group.id` **ON DELETE CASCADE** |
| product_id | int NOT NULL | **FK 없음** |
| sort_order | int DEFAULT 0 | |
| is_fixed | tinyint(1) DEFAULT 0 | **죽은 컬럼** — `resolve()` 가 읽지 않는다. UI 미노출 |

인덱스 `idx_pgi_group (product_group_id, sort_order)`.

---

## 8. 주의사항

- **발행하지 않으면 스토어프론트에 안 나온다.** 에디터의 저장은 작업본(`page_section`)만 바꾼다. 롤백도 마찬가지 — 롤백 후 재발행이 필요하다.
- **최초 발행 전에는 라이브 폴백이 동작한다.** `page_revision` 이 하나도 없으면 `getHomeSections()` 가 `page_section` 을 그대로 렌더한다(P1 호환). 첫 발행 이후에는 스냅샷만 본다.
- **레지스트리에서 타입을 지우면 그 섹션은 조용히 사라진다.** `resolveSections()` 가 미등록 타입을 스킵한다. 에디터는 `isUnknownType` 으로 표시만 한다.
- **`product_group` 을 비활성/삭제하면 참조 섹션이 빈다.** FK 가 없으므로 DB 가 막아주지 않는다 — 컨트롤러 가드가 유일한 방어선이다. 스크립트로 직접 UPDATE/DELETE 하면 가드를 우회한다.
- **`custom_html` 은 관리자 입력이라도 신뢰하지 않는다.** 저장(`pageBuilderService.updateSection`)·렌더(`resolvers/custom_html.js`) 양쪽에서 새니타이즈한다. 허용 태그/속성/스킴은 `services/display/htmlSanitizer.js` 화이트리스트 참고(`script`·`iframe`·`on*`·`javascript:` 차단).
- **`visible_on_pc` / `visible_on_mobile` 는 이제 렌더에 반영된다.** `displayService.deviceGate()` 가 두 값을 읽어 `'all' | 'pc_only' | 'mobile_only' | 'none'` 을 판정한다(`displayService.js:62-77`). 둘 다 끄면 섹션이 아예 스킵되고, 한쪽만 켜면 **CSS 래퍼 클래스**(`yd-only-pc` / `yd-only-mobile`, `public/css/input.css`)로 감춘다. SSR 이라 UA 로 갈라 굽지 않는다(캐시·프록시가 섞인다).
- **미리보기 몰**은 `req.adminMallId` 기준이다. 관리자가 스토어프론트를 `?mall=2` 로 보고 있어도 미리보기는 편집 중인 몰을 렌더한다. → [`malls.md`](./malls.md)
- `ranking_tabs` 리졸버의 `loadHomeCategories(shared.hasUser)` 는 **`mallId` 를 넘기지 않아** `_shared.js` 기본값 1(건강식품관)로 카테고리를 뽑는다(`services/display/resolvers/ranking_tabs.js`). 다른 몰에서도 mall 1 카테고리 탭이 나온다.
- `promotion_banner` 는 `banners.group_key` 로만 조회한다. 배너 관리에서 `group_key` 를 비워두면 섹션이 스킵된다. → [`banners.md`](./banners.md)
- **미리보기와 실제 화면은 보는 데이터가 다르다.** 미리보기는 **편집 중인 몰(`req.adminMallId`)의 작업본(`page_section`)** 을 렌더하고, 스토어프론트 홈은 **발행 스냅샷(`page_revision`)** 을 렌더한다. 발행 전 편집이 스토어프론트에 안 보이는 것은 **정상**이다.
- 관련 문서: [`malls.md`](./malls.md), [`products.md`](./products.md), [`banners.md`](./banners.md), [`categories.md`](./categories.md)

### 8.1 미구현 (알고 있어야 할 것)

| 항목 | 현재 상태 |
|------|-----------|
| 페이지 **예약 발행** | **없음.** 발행 스케줄러가 없어 발행은 항상 즉시다. 다만 **섹션 단위 예약 노출**은 동작한다(`page_section.visible_start_at` / `visible_end_at`) — 미리 만들어 두고 시각이 되면 나타나게 할 수 있다 |
| 섹션 **드래그앤드롭** 정렬 | **없음.** 위/아래 버튼만 (`public/js/admin/page-builder.js:439-462` — `reorder(id, dir)`) |
| 카테고리 페이지 관리 | 없음. `page.page_type` 은 `home` / `feature` 만 쓴다 |
| 정적 정보 페이지 문구 편집 | 없음. `value_proposition` 은 `fields: []` 라 고정 문구다 — 바꾸려면 EJS 를 고쳐야 한다 |

---

*Last Updated: 2026-07-15*
