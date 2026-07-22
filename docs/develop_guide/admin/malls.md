# 멀티몰 (Malls)

## 1. 개요

- **Base URL:** `/admin/malls`
- **관련 테이블:** `mall` (정의), `navigation_config` · `mall_feature_menu` · `custom_menu` · `theme` · `site_settings` · `page` (몰 소유 설정), 그 밖에 `mall_id` 를 가진 데이터 테이블(§5)
- **컨트롤러:** `controllers/admin/mallController.js`
- **서비스:** `services/mall/presets.js`(프리셋 정의), `services/mall/mallProvisioner.js`(프로비저닝)
- **라우트:** `routes/admin/malls.js`
- **미들웨어:** `middleware/mallContext.js`(스토어프론트), `middleware/adminMallContext.js`(관리자)
- **뷰:** `views/admin/malls/list.ejs`, `form.ejs`, 편집 몰 선택기 `views/layouts/admin_layout.ejs`, 스토어프론트 몰 선택기 `views/partials/storefront/header.ejs` · `mobile_bottom_nav.ejs`

하나의 앱 인스턴스가 여러 몰을 서비스한다. 현재 데이터: `mall` 3행.

| id | code | name | preset_key | 비고 |
|----|------|------|-----------|------|
| 1 | health | 와이디몰 건강식품관 | (NULL) | **기본몰** |
| 2 | general | 와이디몰 종합관 | (NULL) | |
| 6 | test_small | 소형쇼핑몰 | `drawer_gnb` | 프로비저너로 생성 |

> 몰 1·2 는 프로비저너 도입 **이전에** 만들어져 `preset_key` 가 NULL 이다. 실제 스킨은 `navigation_config`(둘 다 `main_right_utility_v1` / `split`)가 정한다 — `preset_key` 는 "마지막으로 적용한 프리셋"의 기록일 뿐, 소스 오브 트루스가 아니다.
>
> **`mall.mall_type` 컬럼은 존재하지 않는다.** 설계 중 폐기됐다. 몰의 성격은 `preset_key`(기록)와 `navigation_config`(실제)로만 표현된다.

**몰 컨텍스트는 두 개다. 서로 독립이다.**

| | 스토어프론트 | 관리자 |
|---|---|---|
| 미들웨어 | `middleware/mallContext.js` | `middleware/adminMallContext.js` |
| 세션 키 | `req.session.mallId` | `req.session.adminMallId` |
| 쿼리 파라미터 | `?mall=<id\|code>` | `?adminMall=<id\|code>` |
| 노출 값 | `req.mallId`, `res.locals.mallId` / `mall` / `malls` | `req.adminMallId`, `res.locals.adminMallId` / `adminMall` / `adminMalls` |
| 의미 | 손님이 **보는** 몰 | 관리자가 **편집 중인** 몰 |

→ 관리자가 스토어프론트를 `?mall=2` 로 미리보기해도 편집 대상 몰은 바뀌지 않는다(그 반대도). `middleware/adminMallContext.js` 상단 주석.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/malls` | `getList` | 몰 목록 + 몰별 카테고리·상품 건수 + 실제 스킨 배지 |
| GET | `/admin/malls/new` | `getNew` | 몰 등록 폼 (프리셋 라디오) |
| POST | `/admin/malls` | `postAdd` | 몰 생성 **+ 프리셋 프로비저닝** |
| GET | `/admin/malls/:id` | `getEdit` | 몰 수정 폼 (+ `inspect()` 현황) |
| POST | `/admin/malls/:id` | `postEdit` | 몰 수정 (프리셋은 건드리지 않음) |
| POST | `/admin/malls/:id/provision` | `postProvision` | **프리셋 재적용** |
| POST | `/admin/malls/:id/delete` | `postDelete` | 몰 삭제 |

- **권한 2중**: `requireMenuAccess('/admin/malls')`(`admin_menus.visible_roles` = `super_admin,admin`) + 라우터 자체의 `requireSuperAdmin`(세션 role 이 `super_admin` 또는 `admin` 이 아니면 403).
- Express 5 라 `/new` 를 `/:id` 보다 먼저 선언하고, 숫자 검증은 `requireNumericId` 가 한다.
- 목록의 스킨 배지는 `mall.preset_key` 가 아니라 **`navigation_config.header_layout_type` 을 조인해** 읽는다(이후 Header 설정에서 스킨을 바꿨을 수 있으므로).

### 2.1 폼 필드 (`views/admin/malls/form.ejs`)

| name | 타입 | 검증 |
|------|------|------|
| code | text | `/^[a-z0-9_-]{2,50}$/` (소문자화 후 검사), 전역 유니크 |
| name | text | 필수, 100자 절단 |
| preset_key | radio | `split_gnb` / `drawer_gnb` 화이트리스트. 벗어나면 기본값(`split_gnb`) |
| domain | text | 선택. **향후 도메인 기반 라우팅용 — 현재 코드는 읽지 않는다** |
| is_active | checkbox | |
| is_default | checkbox | 지정 시 `is_active` 강제 1 |
| include_home | checkbox | **재적용 전용.** 홈 섹션 교체(파괴적) — 체크해야만 실행 |

---

## 2.5 프리셋 프로비저닝 (`services/mall/`)

몰 생성은 **`mall` INSERT + 프리셋 프로비저닝** 두 단계다. 예전에는 `navigation_config` 한 행만 만들어서 **GNB 도 메인 화면도 텅 빈 몰**이 태어났다.

### 2.5.1 프리셋 2종 (`presets.js`)

⚠️ 프리셋은 **몰의 규모 분류가 아니라 헤더·GNB 스킨 선택**이다. 상품 1만 개인 몰이 드로어형을 써도 된다.

| key | 이름 | header_layout_type / nav_mode | featureMenus (GNB ON) |
|-----|------|-------------------------------|------------------------|
| **`split_gnb`** (기본) | 기본형 — 카테고리 버튼 + 평면 GNB (3단 헤더) | `main_right_utility_v1` / `split` | CATEGORY, SHOPPING_DEAL, BEST, NEW_PRODUCT, EVENT, EXHIBITION, BRAND, SPECIALTY |
| `drawer_gnb` | 드로어형 — 햄버거 전체메뉴 + 아코디언 카테고리 | `compact_drawer_v1` / `unified` | CATEGORY, BEST, NEW_PRODUCT |

각 프리셋은 `navigation`(내비 정책) · `featureMenus` · `theme`(토큰) · `homeSections` 를 함께 정의한다. 세부 조정은 프로비저닝 뒤 각 화면(`/admin/header-settings`, `/admin/feature-menus`, `/admin/theme-settings`, `/admin/page-builder`)에서 한다.

### 2.5.2 `provisionMall(mallId, presetKey, { mode, includeHome, actor })`

| mode | 동작 |
|------|------|
| **`create`** | 신규 몰. 없는 것만 만든다(멱등). 홈은 항상 만든다. |
| **`reapply`** | 기존 몰에 재적용. `navigation_config` · `theme` · GNB 메뉴 세트를 프리셋으로 **되돌린다**. 홈 섹션 교체는 `includeHome` 일 때만. |

프로비저너가 만드는 것:

| 대상 | 동작 |
|------|------|
| `navigation_config` | `create` → `INSERT IGNORE` / `reapply` → `INSERT ... ON DUPLICATE KEY UPDATE` (스킨·nav_mode·슬롯) |
| `mall_feature_menu` | 행 생성은 **`featureMenuSync.ensureMallFeatureMenus()` 재사용**(중복 구현 금지). 프로비저너는 `position='gnb'` 만 켜고 끈다. `is_required = 1` 은 프리셋 목록에 없어도 항상 ON |
| `theme` | 없으면 생성, `reapply` 면 `config_json` 덮어씀 |
| `site_settings` | **`INSERT IGNORE` — `reapply` 여도 덮지 않는다.** 로고·상호·연락처는 운영자 자산이다 |
| `product_group` | `추천 상품`(condition) · `신상품`(condition, `isNew`) 시드. 이름으로 멱등. **manual 이 아니라 condition** 이라 상품이 들어오면 자동으로 채워진다 |
| `best_group` | 몰의 `ALL`(전체) 그룹 + **초기 랭킹 집계**(`bestRankingService.calculateAllPeriods`) — 트랜잭션 밖, 실패해도 몰은 산다 |
| `page`(home) + `page_section` | 프리셋 `homeSections` 대로 시딩. `group` 힌트가 있는 섹션은 위 `product_group.id` 를 `data_source_id` 로 물린다 |
| **멤버십 등급** | `membershipSeeder.seedMallMembership()` — 기본 등급 4종(베이직·실버·골드·VIP) + 등급별 혜택 + ACTIVE 평가정책 + 진입/유지 기준. 정의는 `services/membership/membershipDefaults.js` 한 곳. **등급이 하나라도 있으면 통째로 건너뛴다**(운영자가 지운 등급을 재적용이 되살리지 않게) |
| **발행** | 홈을 만들거나 교체했으면 **`pageBuilderService.publish()` 로 리비전까지 발행**한다 |

> 🔴 **page_revision 함정.** `displayService` 는 발행 스냅샷(`page_revision`)이 있으면 그걸 렌더하고 없을 때만 라이브 `page_section` 으로 폴백한다. 홈을 갈아끼우고 발행하지 않으면 "저장했는데 화면이 안 바뀐다".
>
> **섹션이 먹고 살 데이터 소스를 함께 만드는 이유:** `product_grid`·`best_ranking` 리졸버는 데이터가 없으면 `null` 을 돌려 **조용히 스킵**된다. 그래서 예전 새 몰은 홈 절반이 증발한 채 태어났다.
>
> **멤버십 등급을 기본 리소스로 심는 이유(2026-07):** 등급이 0건이면 `evaluationService.getPublicTiers()` 가 정적 폴백(`membershipInfo.TIERS`)을 렌더한다. 즉 관리자 등급관리는 텅 빈 채로 **고객 화면 `/membership`·`/event` 에는 등록한 적도, 적용되지도 않는 혜택이 광고**됐다. 폴백 표도 이제 같은 `membershipDefaults` 에서 만들어 시드 값과 갈라질 수 없다.

### 2.5.3 캐시 무효화 (3종)

프로비저닝 끝에 반드시 함께 돈다. 안 하면 최대 60초 동안 옛 설정이 나간다.

```
mallContext.invalidate()                    // 몰 목록 캐시(60초 TTL)
themeData.invalidate(mallId)                // 테마 토큰
navigationService.invalidateContentGate(mallId)  // GNB 콘텐츠 게이트(30초 TTL)
```

### 2.5.4 생성 흐름 (`postAdd`)

1. `code` 정규화·검증(`/^[a-z0-9_-]{2,50}$/`) + 중복 검사
2. 트랜잭션: `mall` INSERT (`preset_key` 포함) → 기본몰 지정 시 `setDefault()`
3. commit → `mallContext.invalidate()`
4. **트랜잭션 밖**에서 `provisionMall(id, presetKey, { mode: 'create' })`
   - 프로비저닝이 실패해도 **몰은 남긴다.** 몰 생성을 통째로 롤백하면 운영자가 원인을 알 수 없다. 대신 "몰 수정 화면에서 '프리셋 적용'을 다시 실행하세요" 안내로 리다이렉트.

### 2.5.5 재적용 (`POST /admin/malls/:id/provision`)

- 몰 수정 화면이 `mallProvisioner.inspect()` 로 현황(`hasNavigation` · `hasTheme` · `hasSettings` · `homePageId` · **`sectionCount`**)을 먼저 보여준다 — **홈 교체 시 삭제될 섹션 개수를 경고**하기 위함이다.
- `include_home` 을 체크하지 않으면 홈 섹션은 그대로 두고 내비·메뉴·테마만 되돌린다.

---

## 3. 불변식 (mallController.js)

| 규칙 | 이유 | 구현 |
|---|---|---|
| **기본몰(`is_default=1`)은 정확히 하나** | 해석기 폴백 대상 | `setDefault(conn, id)` — 트랜잭션으로 나머지 `is_default=0` 후 대상만 1(+`is_active=1`) |
| **기본몰은 비활성화 불가** | `mallContext.loadMalls()` 가 `is_active=1` 만 캐시 → 기본몰이 빠지면 폴백이 깨진다 | `postEdit` 에서 차단(다른 몰을 먼저 기본몰로 지정하라는 에러) |
| **기본몰은 삭제 불가** | 위와 동일 | `postDelete` 에서 차단 |
| **데이터(카테고리·상품)가 있는 몰은 삭제 불가** | `mall_id` 참조에 **FK 가 없다** → 몰 행만 지우면 고아 데이터가 남는다 | `mallDataCounts(id)` 로 `categories`·`products` 건수 확인 후 차단 |
| **변경 후 캐시 무효화** | 몰 목록은 프로세스 메모리에 60초 TTL 캐시 | 생성·수정·삭제 뒤 `mallContext.invalidate()` |

- **몰 생성 시 프리셋 프로비저닝**이 내비·메뉴·테마·사이트설정·상품그룹·베스트그룹·홈까지 채운다(§2.5). 새 몰이 빈 스토어가 되는 것을 막는다.
- **몰 삭제 시 정리 대상**(FK 가 없으므로 코드가 순서대로 지운다):

  ```
  page  (→ page_section · page_revision 은 FK CASCADE 로 함께 삭제)
  site_settings · navigation_config · mall_feature_menu · custom_menu · theme
  mall
  ```

  데이터 테이블(`categories`·`products`)은 위 가드로 0건임이 보장된다. **그 외 몰 소유 데이터(`coupons`·`exhibition`·`product_group`·`best_group`·`event`·`group_buy` …)는 지우지도, 검사하지도 않는다** → §6

---

## 4. 몰 컨텍스트 해석

### 4.1 스토어프론트 (`middleware/mallContext.js`)

`app.js:202` — 전역 변수 미들웨어 다음, `siteSettings`·`themeData`·`menuData` 등 **모든 스토어프론트 미들웨어보다 먼저** 마운트된다.

해석 순서:
1. `?mall=<id|code>` 가 오면 유효성 검사 후 **세션에 고정**(`req.session.mallId`)
2. 세션 값
3. 기본 몰(`mall.is_default=1`)

- 비활성/삭제된 몰이 세션에 남아 있으면 기본 몰로 되돌린다.
- 해석 실패(DB 오류 등)해도 화면은 떠야 하므로 **mall 1 폴백** + 경고 로그.
- 캐시: `loadMalls()` 가 `SELECT id, code, name, is_active, is_default FROM mall WHERE is_active = 1` 을 60초 TTL 로 프로세스 메모리에 담는다. `mall` 테이블이 비어 있으면 `{id:1, code:'default'}` 폴백.
- `res.locals.malls` — 헤더 Top Bar 몰 선택 셀렉트용(활성 몰만, 기본몰 먼저). 스토어프론트 선택기는 `views/partials/storefront/header.ejs`(PC)와 `mobile_bottom_nav.ejs`(모바일)에 `<select name="mall">` 로 있다.
- **export 부가**: `mallContext.invalidate()`(캐시 비우기), `mallContext.getMalls()`(관리자 해석기가 같은 캐시를 재사용).

### 4.2 관리자 (`middleware/adminMallContext.js`)

`routes/admin.js:16` — `adminAuth` **뒤**에 마운트(인증된 관리자 요청에만 적용). 즉 `/admin/login` 은 영향받지 않는다.

- 해석: `?adminMall=<id|code>` → 세션(`req.session.adminMallId`) 저장 → 이후 유지. 없으면 기본 몰.
- 실패 시 mall 1 폴백.
- `res.locals.adminMalls` — 레이아웃 상단 편집 몰 선택기(`admin_layout.ejs`). **몰이 2개 이상일 때만 노출**되며, `GET` 폼이 현재 URL 에 `?adminMall=<id>` 를 붙여 재요청한다.

### 4.3 관리자 컨트롤러의 사용 규약

몰 스코프가 필요한 컨트롤러는 하드코딩 `MALL_ID = 1` 대신 **`req.adminMallId || 1`** 을 쓴다. 현재 사용 중인 컨트롤러:

`categoryController`, `claimController`, `eventController`, `exhibitionController`, `faqController`, `featureMenuController`, `groupBuyController`, `headerSettingsController`, `heroSlideController`, `menuPreviewController`, `pageBuilderController`, `productController`, `productGroupController`, `settingsController`, `shippingPolicyController`, `themeSettingsController` (+ 스토어프론트 `mainController` 의 미리보기)

**스코프하지 않는 것**: `admin_menus`(사이드바), `banners`, `orders`, `users` 등 몰 무관 데이터(`middleware/adminMallContext.js` 상단 주석).

### 4.4 페이지 빌더 미리보기와의 관계

`controllers/mainController.js:131` `getHomePreview` 는 `req.mallId = req.adminMallId || req.mallId || 1` 로 스토어프론트 몰을 **편집 몰로 덮어쓴 뒤** 홈 컨텍스트를 만든다. 히어로·상품 리졸버가 편집 대상과 다른 몰로 스코프되던 문제(커밋 `60aa7b6`)를 이렇게 막는다. → [`page_builder.md`](./page_builder.md)

---

## 5. DB 테이블

### `mall` — 몰 정의

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | |
| code | varchar(50) NOT NULL | **UNIQUE** (`uk_mall_code`). 고정 식별자 (`health` / `general` / `test_small`). `?mall=코드` 로 쓰인다 |
| name | varchar(100) NOT NULL | |
| **preset_key** | varchar(50) NULL | 마지막으로 적용한 프리셋(`split_gnb` / `drawer_gnb`). **표시·재적용 기본값 용도** — 실제 스킨의 소스 오브 트루스는 `navigation_config` 다 |
| domain | varchar(255) NULL | 향후 도메인 기반 라우팅용. **현재 미사용** |
| is_active | tinyint(1) NOT NULL DEFAULT 1 | 0 이면 해석기 캐시에서 빠진다 |
| is_default | tinyint(1) NOT NULL DEFAULT 0 | 해석기 폴백 대상 — **1개만 1** |
| created_at / updated_at | datetime | |

> **`mall_type` 컬럼은 없다.** 설계 중 폐기됐으므로 코드·문서 어디에서도 참조하지 말 것.

### `mall_id` 를 가진 테이블 (32 · 실측)

`best_group`, `best_pin`, `best_ranking`, `best_ranking_run`, `best_score_config`, `brand_category_stat`, `brand_profile`, `brand_stat`, `categories`, `coupons`, `custom_menu`, `deal`, `deal_category`, `event`, `exhibition`, `faq`, `faq_category`, `group_buy`, `header_topbar_item`, `hero_slide`, `live_show`, `mall_feature_menu`, `navigation_config`, `outlet_product`, `outlet_setting`, `page`, `product_group`, `products`, `recommend_group`, `shipping_policy`, `site_settings`, `theme`

멤버십 계열도 몰 스코프다: `membership_grade`, `membership_config`, `membership_evaluation_policy`, `membership_evaluation_run`, `membership_grade_history`, `membership_birthday_issue_log`, `membership_periodic_issue_log`, `membership_demotion_notice_log`, `customer_membership`, `customer_performance_ledger`, `order_membership_benefit_snapshot`. 프로비저너가 등급을 심게 된 뒤 **`order_membership_benefit_snapshot` 을 뺀 전부가 `mallEraser` 삭제 대상**이다(스냅샷은 살아 있는 주문에 딸린 기록이라 제외 — `orders` 를 안 지우는 것과 같은 이유).

> **어느 테이블에도 `mall_id` FK 가 없다.** 참조 무결성은 애플리케이션(컨트롤러 가드)이 지킨다.

**`mall_id` 가 없는 주요 테이블**: `banners`, `page_section`(→ `page` 를 통해 간접 스코프), `product_group_item`(→ `product_group` 을 통해), **`orders`**, **`carts`**, `users`, `admin_menus`, `admins`.

---

## 6. 주의사항

### 프리셋 관련

- 🔴 **프리셋 재적용은 OUTLET · GROUP_BUY · LIVE 를 끈다.** 두 프리셋의 `featureMenus` 목록에 이 셋이 없고, `applyFeatureMenus()` 는 목록에 없는 `position='gnb'` 메뉴를 **전부 `is_enabled = 0`** 으로 만든다(`is_required` 만 예외). 재적용 후에는 `/admin/feature-menus` 에서 다시 켜야 한다.
- **홈 교체(`include_home`)는 파괴적이다.** 기존 `page_section` 을 전부 `DELETE` 하고 프리셋 섹션으로 다시 깐다. 확인 화면이 `inspect()` 로 삭제될 섹션 개수를 경고하니 반드시 읽을 것.
- **`site_settings` 는 재적용해도 덮이지 않는다**(`INSERT IGNORE`). 로고·상호를 프리셋으로 되돌릴 방법은 없다(의도된 설계).
- 프리셋은 **스킨 선택이지 규모 분류가 아니다.** 스킨만 바꾸려면 몰을 다시 만들 필요 없이 `/admin/header-settings` 에서 바꾼다.

### 몰 스코프의 구멍

- **`orders` · `carts` 에 `mall_id` 가 없다.** 주문·장바구니는 몰 구분 없이 한 벌이다. 따라서 **대시보드·매출 통계·클레임 집계에는 몰 스코프가 적용되지 않는다** — 편집 몰을 바꿔도 같은 숫자가 나온다.
- **`banners` 는 몰 스코프가 아니다.** 배너는 모든 몰이 공유한다(`mainController.buildHomeContext` 의 MAIN/POPUP 배너 조회에 `mall_id` 조건이 없다). `promotion_banner` 섹션도 `group_key` 로만 조회한다.
- **`sitemap` 은 기본 몰만 수록한다.** 다른 몰의 상품·카테고리는 색인 대상에서 빠진다.
- **모바일 하단바(`views/partials/storefront/mobile_bottom_nav.ejs`)의 탭은 하드코딩이다**(홈 · 카테고리 · 장바구니 · 마이). `mall_feature_menu` / `mobile_visible` 설정을 따르지 않으므로 몰별로 달라지지 않는다(하단바가 여는 카테고리 레이어만 `categoryTree` 를 쓴다).
- `ranking_tabs` 섹션 리졸버는 몰 스코프 없이 카테고리를 뽑는다(mall 1 고정). → [`page_builder.md`](./page_builder.md) §8

### 삭제·캐시

- **몰 삭제 가드는 여전히 `categories`·`products` 만 센다.** 쿠폰·기획전·상품그룹·베스트그룹만 있는 몰은 검사를 통과해 삭제되고, 그 행들은 **고아로 남는다**(§3 의 정리 목록에 없다). 삭제 전 데이터 정리는 운영자 책임이다.
- **몰 캐시는 60초 TTL 이고 프로세스 메모리에 있다.** 관리자 화면 밖(스크립트·DB 직접 수정)에서 `mall` 을 바꾸면 최대 60초 지연이 생기고, PM2 를 여러 프로세스로 늘리면 프로세스마다 캐시가 따로 논다(현재 PM2 는 fork·`instances: 1`).
- **`mall.code` 를 바꾸면 기존 `?mall=<code>` 링크가 깨진다.** id 는 계속 유효하다.
- **몰 전환은 세션에 고정된다.** 한 번 `?mall=general` 로 들어오면 이후 요청은 계속 종합관을 본다. 되돌리려면 `?mall=health`(또는 기본몰 코드).

### 미구현

- **몰 구성 탭 허브(`/admin/malls/:id` 6탭)** — 설계만 있고 없다. 현재 `/admin/malls/:id` 는 수정 폼 + 프리셋 재적용뿐이다.
- **도메인 기반 몰 라우팅** — `mall.domain` 은 컬럼만 있고 아무 코드도 읽지 않는다.

관련 문서: [`storefront_menus.md`](./storefront_menus.md), [`page_builder.md`](./page_builder.md), [`menus.md`](./menus.md), [`settings.md`](./settings.md), [`categories.md`](./categories.md)

---

*Last Updated: 2026-07-15*
