# 섹션 기반 쇼핑몰 빌더 — 단계별 개발 작업 문서

> 이 문서는 [`flexible_shopping_mall_builder_design.md`](./flexible_shopping_mall_builder_design.md)(설계안)를 **dev-mall 실제 소스(Express 5 / EJS / MySQL raw SQL)** 기준으로 착수 가능한 개발 작업으로 분해한 실행 문서다.
>
> - 설계 문서 = *무엇을 만들 것인가*(개념·아키텍처·최종 목표)
> - 이 문서 = *어떤 순서로, 어떤 파일·테이블·API를 어떻게 만들 것인가*(단계·태스크·완료 기준)
>
> **원칙**: 빅뱅 재작성 금지. 기존 dev-mall을 살려두고 **섹션 렌더링 경로를 신설 → 기존 하드코딩 화면을 한 화면씩 대체**하는 스트랭글러 피그(Strangler Fig) 방식으로 진행한다(설계 26장).

---

## 0. 대상 시스템 현황 진단 (dev-mall)

| 항목 | 현재 상태 | 빌더 전환 시 함의 |
|---|---|---|
| 렌더링 | EJS 서버사이드, 메인 화면(`views/user/index.ejs`)이 **하드코딩** | 섹션 단위로 분해 → DB 명세 기반 렌더링으로 전환 대상 |
| 상품 | `products` (category_id, theme_category_id, `product_badge` BEST/NEW/RECOMMEND, price/original_price/discount_rate) | 상품 그룹(`product_group`)으로 전시 계층을 한 겹 분리 |
| 카테고리 | `categories` (parent_id 존재하나 관리 UI 미사용 → 현재 평면 1뎁스, `type` = NORMAL/THEME/BRAND) | 재사용 + 계층 관리 활성화(**최대 4뎁스**). 전시용 **메뉴는 별도 테이블로 분리**(**최대 3뎁스**) |
| 배너 | `banners` (메인/카테고리/팝업) | 재사용. 섹션의 `banner_group` 데이터 소스로 연결 |
| 상단 GNB | `middleware/menuData.js`가 카테고리 기반으로 주입 | 몰별 자유 구성 위해 `storefront_menu` 신설 |
| 관리자 | `controllers/admin/*`, `routes/admin/*`, `views/admin/*`, `admin_menus`(사이드바), `adminRoleGuard` | 동일 패턴으로 "페이지 빌더" 메뉴 추가 |
| DB 접근 | raw SQL + connection pool(`config/db.js`), **mysql CLI로 스키마 변경** | 신규 테이블도 동일 규약. `tables.sql` 반영 필수 |
| 멀티몰/테넌시 | **없음(단일 몰)** | 초기 단계는 `mall_id = 1` 상수로 두고, 후기 단계에서 컬럼 활성화 |

> 결론: 설계안의 Part I(빌더 코어)은 **현재 스택 그대로 구현 가능**하다. Part II(멀티테넌시·Next.js SDUI·미디어·AI)는 별도 트랙으로 후순위(Phase 6+)에 둔다.

---

## 1. 전체 로드맵 개요

| Phase | 이름 | 핵심 산출물 | 설계문서 매핑 | 선행 |
|---|---|---|---|---|
| **P0** | 기반 정리(리팩터링) | ProductCard·Banner·Grid 컴포넌트 표준화, 메인 화면 섹션 분해 | 25.1 | — |
| **P1** | 전시 데이터 모델 & 렌더 엔진 | `page`/`page_section`/`product_group` 테이블 + Display 서비스 + 홈 화면 DB 기반 렌더링 | 6.2, 10, 17, 25.2 | P0 |
| **P1.5** ⭐ | 레이아웃 골격 & 헤더/GNB (구조 우선) | `main_right_utility_v1` 골격 + `storefront_menu`(P3에서 앞당김) + GNB 렌더(고정 카테고리 버튼 + **몰별 가변 메뉴**) + 우측 유틸 레일 | 7.2, 8 | P1 |
| **P2** | 관리자 페이지 빌더 | 섹션 CRUD·순서변경·데이터소스 연결·미리보기·발행/롤백 | 14, 19, 25.3 | P1 |
| **P3** | 메뉴/카테고리 빌더(관리 UI) | (스키마는 P1.5로 이동) **카테고리 4뎁스 관리 + 메뉴 빌더 관리 UI** + `depthGuard` | 8, 25.4 | P1.5, P2 |
| **P4** | 테마 시스템 | `theme` 설정 + CSS 변수 기반 스타일 주입 | 13, 25.5 | P2 |
| **P5** | 멀티몰(도메인 기반) | `mall` 테이블 + 도메인→몰 식별 + 몰별 설정 격리 | 15, 25.5 | P3, P4 |
| **P6+** | SaaS 고도화(장기 트랙) | 멀티테넌시(tenant_id/RLS), Next.js SDUI 전면화, 미디어 파이프라인, AI 에이전트 | Part II 전체 | P5 |

**권장 진행 순서(구조 우선으로 재정렬, 2026-07-08)**: P0 → P1 → **P1.5(레이아웃 골격 + 헤더/GNB)** → CT 컴포넌트(부록 A) → P2 빌더로 배치·발행 → P3(카테고리 뎁스/메뉴 관리 UI) → P4. 

> **재정렬 이유**: 목표는 GS SHOP·신세계TV쇼핑형 **쇼핑몰 구조**를 먼저 세우고 그 위에 컴포넌트를 배치하는 것. 기존 순서(P2 빌더 먼저)는 "편집 도구"를 "편집 대상 구조"보다 먼저 만든 셈이라, 헤더/GNB 골격(P1.5)을 P2 앞으로 당긴다. **P2(빌더)는 이미 구현됐고 폐기되지 않음** — P1.5·CT로 만든 구조/컴포넌트를 관리·배치하는 도구가 된다.

> **컴포넌트 트랙(CT)**: 부록 A의 캡처 컴포넌트(`product_carousel`·`brand_carousel`·`ranking_tabs` 등) 구현은 **P2와 병렬 가능한 별도 트랙**으로 분해되어 있다(부록 A.0~A.9). Phase가 "빌더 코어의 세로 축"이라면, CT는 "렌더 가능한 컴포넌트를 늘리는 가로 축"이다.

---

## 1.5 확정 결정 및 기존 인프라 정합 ⭐

### (1) 렌더링 스택 = 하이브리드 (확정)
- **스토어프론트: 현행 EJS SSR 유지**(P0~P4). dev-mall의 Passport OAuth·Toss 결제·Shopify 동기화·관리자·Redis 세션을 **100% 재사용**하고, 스트랭글러 방식으로 화면 단위 개선.
- **관리자 빌더 에디터(P2): React 아일랜드/SPA**로 구현(드래그앤드롭·실시간 미리보기 UX 확보). 관리자 API는 프레임워크 무관 JSON으로 제공.
- **SDUI 데이터 모델(`page`/`page_section`/`product_group`)은 프레임워크 무관하게 우선 구축** → 렌더러(EJS)는 훗날 `sectionRegistry` 매핑을 그대로 유지한 채 React로 1:1 포팅 가능.
- **장기(P6): 신규 Next.js 프로젝트를 새로 만들지 않고, 기존 `spf-mall`(Next.js 16)을 SDUI 렌더러로 승격/확장**하며 스토어프론트를 점진 이관.
- 근거: SDUI의 가치는 렌더러가 아니라 "화면을 DB 명세로 그린다"는 데이터 아키텍처에 있음. 따라서 프레임워크 전면 교체는 **defer**하고 데이터 모델을 먼저 확보한다.

### (2) 기존 진열 인프라와 P1 정합 (중요)
현행 dev-mall은 이미 **원시 진열 시스템**을 운영 중이다. P1은 이를 **일반화(generalize)** 하는 것이지 **병렬 신설이 아니다.**

| 기존(운영 중) | 역할 | P1에서의 처리 |
|---|---|---|
| `main_display_sections`(section_key=best/new/category, `display_mode` auto/manual, `max_count`) | 고정 3섹션의 진열 방식·개수 | `page_section`으로 **일반화**(임의 섹션·순서·타입). 기존 3섹션을 시드로 이관 |
| `main_display_products`(section_key, product_id, display_order) | 수동 선택 상품 | `product_group_item`으로 **이관**(수동 선택형 그룹) |
| `banners`(MAIN/POPUP) | 배너 | `hero_banner`/`promotion_banner` 섹션의 `banner_group` 소스로 재사용 |
| `controllers/admin/displayController.js` | 진열 관리자 | 페이지 빌더로 흡수(P2). 이관 완료 전까지 **병행 운영** |

- **마이그레이션 원칙**: 신규 테이블 생성 후, 기존 `main_display_*` 데이터를 시드 스크립트로 `page`/`page_section`/`product_group(_item)`에 이관 → 홈 렌더링을 신 경로로 전환 → 구 테이블/컨트롤러는 **전환 검증 후 제거**(빅뱅 금지).
- 즉 P1의 "홈 화면 DB 기반 렌더링"은 **부분적으로 이미 존재**(best/new/category가 DB 구동). P1은 이를 임의 섹션·순서·데이터소스로 확장하는 작업.

### (3) `tables.sql`는 실제 DB보다 노후화됨 (주의)
- 실제 `dev_mall` DB에는 `tables.sql`에 없는 테이블이 다수 존재: `main_display_sections`, `main_display_products`, `product_recommendations`, `product_seo`, `recent_views`, `shopify_product_mappings`, `shopify_image_mappings`, `shopify_orders`, `kakao_inquiry_logs` 등. `products.visibility`(PUBLIC/MEMBER_ONLY), `status`의 `RESTOCK` 값도 스키마 파일 미반영.
- **작업 규칙**: 스키마 확인·변경 시 **실제 DB(mysql CLI)를 소스 오브 트루스**로 삼는다. 신규 테이블은 개발 DB + 상용 DB + `tables.sql` 3중 반영하되, 기존 테이블 판단은 파일이 아닌 실 DB 기준.

---

## 2. 공통 개발 규약 (전 Phase 적용)

기존 dev-mall 컨벤션(`CLAUDE.md`)과 정합을 유지한다.

- **DB 컬럼**: snake_case / **URL**: kebab-case / **JS 파일·변수**: camelCase
- **컨트롤러 액션명**: `getList`, `getDetail`, `postForm`, `postUpdate`, `postDelete`
- **SQL**: 파라미터화 쿼리(`pool.query('... WHERE id = ?', [id])`) — 문자열 결합 금지
- **비동기**: async/await + try-catch, 에러는 상위로 전파하지 않고 각 계층에서 처리
- **스키마 변경 3중 반영**(alter-table 규칙): ① 개발 DB(mysql CLI) ② 상용 DB ③ `dev-mall/tables.sql` — 세 곳 동시 적용
- **설정값 JSON**: 섹션/테마의 가변 옵션은 `config_json`(MySQL `JSON` 타입)에 저장하고, 서버에서 파싱해 뷰에 전달
- **파일 크기**: 800줄 초과 금지. 섹션 렌더러·서비스는 기능별 소파일로 분리
- **초기 단계 `mall_id`**: 모든 신규 테이블에 `mall_id BIGINT NOT NULL DEFAULT 1` 포함(멀티몰 대비 미리 확보, 값은 1 고정)

### 2.1 섹션 타입 레지스트리(단일 소스)

섹션 타입 문자열 ↔ 렌더러 ↔ 관리자 설정폼을 한 곳에서 매핑한다. 신규 파일:

```
dev-mall/services/display/sectionRegistry.js
```

```js
// 개념 예시 — 섹션 타입의 단일 정의 소스
module.exports = {
  hero_banner:       { label: '메인 배너',    dataSource: 'banner_group',  view: 'partials/sections/hero_banner' },
  product_grid:      { label: '상품 그리드',  dataSource: 'product_group', view: 'partials/sections/product_grid' },
  product_carousel:  { label: '상품 캐러셀',  dataSource: 'product_group', view: 'partials/sections/product_carousel' },
  category_shortcut: { label: '카테고리 바로가기', dataSource: 'category',  view: 'partials/sections/category_shortcut' },
  best_ranking:      { label: '베스트/랭킹',  dataSource: 'product_group', view: 'partials/sections/best_ranking' },
  new_arrival:       { label: '신상품',       dataSource: 'product_group', view: 'partials/sections/new_arrival' },
  promotion_banner:  { label: '프로모션 배너', dataSource: 'banner_group',  view: 'partials/sections/promotion_banner' },
  recent_product:    { label: '최근 본 상품',  dataSource: 'client',        view: 'partials/sections/recent_product' },
};
```

이 레지스트리가 설계 17장의 `sectionRendererMap`(서버 드리븐 UI의 클라이언트 해석 계층)에 해당한다. EJS에서는 `include(registry[type].view)`로 다형 렌더링한다.

---

## 3. Phase 0 — 기반 정리(리팩터링)

> 목표: **DB 변경 없이** 화면을 섹션 조립 가능한 형태로 준비한다. (설계 25.1)

### 작업 태스크
- [ ] `views/user/index.ejs`(메인)를 논리 블록별로 partial 분해:
  - Header/GNB/Footer는 이미 `views/layouts/main_layout.ejs`·partials에 있으므로 **메인 콘텐츠 영역**만 대상
  - 배너 영역 → `views/partials/sections/hero_banner.ejs`
  - 각 상품 전시 영역 → `product_grid.ejs` / `product_carousel.ejs`
- [ ] **ProductCard 표준화**: 현재 `views/partials/product_card.ejs`를 표준 옵션(`showBrand/showPrice/showDiscountRate/showBadge/showCartButton/imageRatio`) 기반으로 정리(설계 11장). 모든 전시 섹션이 이 카드 하나만 사용
- [ ] Banner partial 표준화(자동 슬라이드/링크/대체텍스트 옵션 파라미터화)
- [ ] 상품 조회 로직을 컨트롤러에서 **서비스 계층으로 추출**: `services/display/productQueryService.js`(카테고리별/뱃지별/신상품/할인순 조회 함수)

### 완료 기준 (DoD)
- 메인 화면이 여러 partial 섹션의 조립으로 렌더되며, 화면 결과물은 리팩터링 전과 **픽셀 동일**(회귀 없음)
- ProductCard가 옵션 객체를 받아 렌더되고, 최소 2개 섹션에서 재사용됨
- DB·URL 변경 없음(순수 내부 리팩터링)

---

## 4. Phase 1 — 전시 데이터 모델 & 렌더링 엔진

> 목표: 메인 화면의 **섹션 구성·상품 그룹을 DB 설정으로 제어**. 프론트는 하드코딩이 아닌 명세 기반 렌더링. (설계 6.2, 10, 17, 25.2)

> **✅ 구현 완료(2026-07-08)** — 홈이 `page_section` 반복 렌더로 전환됨.
> - 테이블 `page`/`page_section`/`product_group`/`product_group_item` 생성 + 홈 시드(hero·특장점·베스트·신상품·카테고리·카카오 6섹션).
> - `services/display/`: `sectionRegistry.js`(타입↔partial), `productGroupService.js`(manual/condition 해석), `displayService.js`(getHomeSections).
> - `mainController.getHome` → 엔진 기반, `views/user/index.ejs` → 섹션 반복 렌더. 섹션 partial: `hero`/`value_proposition`/`product_grid_section`/`category_showcase`/`kakao_cta`.
> - 검증: sort_order 스왑 시 순서 무배포 변경 확인, `product_grid` 멀티 인스턴스(베스트/신상품) 동작.
> - **정합 부채**: 기존 `main_display_*`(admin `displayController`)는 이제 홈에 영향 없음(page_section이 대체). 관리자 진열 도구를 page_section에 쓰도록 브리지하는 작업은 **P2(관리자 빌더)**에서 처리. 그때까지 `main_display_*`는 잔존(제거 금지).

### 4.1 DB 마이그레이션 (신규 테이블)

> ⚠️ 개발 DB + 상용 DB + `tables.sql` 3중 반영. `mall_id`는 기본 1.

```sql
-- 페이지(화면 단위: home, category, event ...)
CREATE TABLE IF NOT EXISTS `page` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `page_type` VARCHAR(50) NOT NULL,          -- home / category / event / custom
  `slug` VARCHAR(255) NULL,
  `title` VARCHAR(200) NULL,
  `layout_type` VARCHAR(100) DEFAULT 'main_basic',
  `status` VARCHAR(30) DEFAULT 'draft',      -- draft / published
  `published_at` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_page_mall_type` (`mall_id`, `page_type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 페이지 섹션(전시 블록)
CREATE TABLE IF NOT EXISTS `page_section` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `page_id` BIGINT NOT NULL,
  `section_type` VARCHAR(100) NOT NULL,      -- sectionRegistry 키
  `position` VARCHAR(100) DEFAULT 'main_content',
  `title` VARCHAR(200) NULL,
  `sort_order` INT DEFAULT 0,
  `data_source_type` VARCHAR(100) NULL,      -- product_group / banner_group / category / client
  `data_source_id` BIGINT NULL,
  `config_json` JSON NULL,                   -- 컬럼수/표시옵션 등
  `visible_start_at` DATETIME NULL,
  `visible_end_at` DATETIME NULL,
  `visible_on_pc` TINYINT(1) DEFAULT 1,
  `visible_on_mobile` TINYINT(1) DEFAULT 1,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_section_page` (`page_id`, `sort_order`),
  CONSTRAINT `fk_section_page` FOREIGN KEY (`page_id`) REFERENCES `page` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 상품 그룹(전시용 상품 묶음)
CREATE TABLE IF NOT EXISTS `product_group` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `name` VARCHAR(200) NOT NULL,
  `group_type` VARCHAR(50) DEFAULT 'manual', -- manual / condition
  `sort_type` VARCHAR(50) DEFAULT 'manual',  -- manual / newest / discount / sales
  `filter_condition_json` JSON NULL,         -- 조건 자동형: 카테고리/할인율/재고 등
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 상품 그룹 아이템(수동 선택형)
CREATE TABLE IF NOT EXISTS `product_group_item` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `product_group_id` BIGINT NOT NULL,
  `product_id` INT NOT NULL,
  `sort_order` INT DEFAULT 0,
  `is_fixed` TINYINT(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pgi_group` (`product_group_id`, `sort_order`),
  CONSTRAINT `fk_pgi_group` FOREIGN KEY (`product_group_id`) REFERENCES `product_group` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

> `banner_group`은 기존 `banners`의 `position`/그룹 키를 재사용하거나, 필요 시 `banners`에 `group_key VARCHAR(50)` 컬럼을 추가해 매핑한다(신규 테이블 최소화).

### 4.2 백엔드 (서비스 + 라우트)

- [ ] `services/display/displayService.js`
  - `getPage(mallId, pageType)` → page + 정렬된 활성 section 목록(노출기간·PC/모바일 필터 적용)
  - `resolveSectionData(section)` → data_source_type별 분기:
    - `product_group` → `productGroupService.resolve(id)` (manual=아이템 조인, condition=filter_json으로 동적 쿼리)
    - `banner_group` → `bannerService.getByGroup(...)`
    - `category` → 카테고리 바로가기 목록
- [ ] `services/display/productGroupService.js` — 수동/조건 자동형 해석. 조건형은 `products`에 대해 `category_id / discount_rate >= ? / stock > 0 / status='ON'` 등 화이트리스트 필터만 허용(SQL 인젝션 방지)
- [ ] 홈 컨트롤러(`mainController.js`)를 DB 기반 렌더링으로 전환:
  - `displayService.getPage(1, 'home')` 결과를 `res.render('user/index', { sections })`로 전달
  - EJS에서 `sections.forEach` → `sectionRegistry[type].view` include

### 4.3 완료 기준 (DoD)
- `page`/`page_section`에 홈 구성을 심으면(시드 데이터) 메인 화면이 그 순서·상품그룹대로 렌더됨
- **DB에서 섹션 sort_order를 바꾸면 배포 없이 화면 순서가 바뀐다**(SDUI 1차 목표 달성)
- 상품 그룹 "수동 선택형"과 "조건 자동형(카테고리+할인율+재고)" 각각 1개 이상 동작
- 노출 기간/PC·모바일 노출 필터가 서버에서 적용됨

---

## 4.5 Phase 1.5 — 레이아웃 골격 & 헤더/GNB (구조 우선) ⭐

> 목표: GS SHOP·신세계TV쇼핑형 **쇼핑몰 상단 구조(헤더 + GNB + 우측 유틸)와 레이아웃 골격**을 먼저 세운다. 그 위에 CT 컴포넌트를 배치(P2)한다. (설계 §7.2 `main_right_utility_v1`, §8 메뉴)

> **✅ 구현 완료(2026-07-09) — DoD(§4.5.5) 충족. 잔여는 폴리시 항목뿐**
>
> **(2026-07-09 추가분)** 레이아웃 골격 + 우측 유틸 레일 완료:
> - ✅ `views/partials/storefront/header.ejs` **헤더 partial 분해**(§4.5.2). `main_layout.ejs` 794줄 → 601줄, header 204줄(800줄 규약 준수). 분해 전후 홈 HTML **바이트 동일**(주석/공백 제외) 확인 → 회귀 없음.
> - ✅ `views/partials/storefront/right_utility.ejs` **우측 유틸 레일**(§4.5.4): 로그인박스(로그인/마이쇼핑) · 장바구니(cartCount 뱃지) · 찜 · 최근 본 상품(패널) · 멤버십 · 앱 QR · TOP.
> - ✅ `page.layout_type` 연동: `main_layout.ejs`가 `layoutType`으로 분기(`main_basic` → 본문만 / `main_right_utility_v1` → 본문 + 레일). `mainController.getHome`·`getHomePreview`가 `page.layout_type` 주입. 홈 `page(id=1)`을 `main_right_utility_v1`로 전환.
> - ✅ 최근 본 상품 기록: 상품 상세(`views/user/products/detail.ejs`)에서 localStorage(`yd_recent_products`, 최대 10건)에 적재 → 레일 패널이 렌더. (로그인 사용자 `recent_views` 테이블 연동은 **CT-8**)
> - **⚠️ 설계 편차(의도적)**: §4.5.2는 "Content 2컬럼"이라 기술하나, 현행 섹션들이 전부 **full-bleed**(`<section>` + 자체 `max-w` 컨테이너 + 배경색)이라 본문을 2컬럼 컨테이너로 감싸면 **모든 섹션 배경이 잘려 회귀**가 발생한다. 따라서 우측 유틸을 **`position:fixed` 레일**로 구현했다(부록 A **CT-7 `utility_rail` 규약과 동일**, 참조몰도 동일 방식). 본문 흐름 무변경 = 회귀 0.
> - **노출 규칙**: 레일은 `≥1600px`에서만 노출(본문 `max-w-1400px`와 미충돌). 그 미만에서는 기존 플로팅 TOP 버튼 유지. `≥1600px`에서는 레거시 `#scrollTopBtn`을 CSS로 숨겨 **TOP 중복 렌더 없음**(CT-7 DoD 선반영).
> - **QR/멤버십**: 데이터 소스가 없어 `site_settings.app_qr_image_url` / `app_download_url` / `membership_url` 설정 시에만 노출(미설정 시 슬롯 숨김). 외부 QR 생성 서비스는 사용하지 않음.
> - 검증: 홈 200 + 레일 렌더, `/products`·상품상세 레일 미노출(레이아웃 분기 정상), 상세 최근본 기록 JS 주입, 헤더 분해 전후 렌더 동일, pm2 신규 에러 없음.
>
> **(2026-07-08 기존분) — 헤더·GNB·카테고리 드롭다운**
> - **참조 실사이트 재확인**: `shinsegaetvshopping.com/plan/planMain`·`/broadcast/main` 직접 확인 → 헤더(로고/검색바/로그인·마이쇼핑·장바구니·고객센터) + GNB(카테고리·쇼핑라이브·TV편성표·오늘특가·공동구매·베스트·이벤트&혜택) 확정.
> - ✅ `storefront_menu` 테이블 + 시드(참조 GNB와 동일: 카테고리[고정]·쇼핑라이브·TV편성표·오늘특가·공동구매·베스트·이벤트&혜택). 미지원(쇼핑라이브/TV편성표/공동구매)은 `#` placeholder(P6 미디어 전).
> - ✅ `middleware/menuData.js`: `gnbMenus`(href 해석) + **`categoryTree`(NORMAL 재귀 트리, 전체 뎁스)** + `currentPath`(활성 밑줄) 주입.
> - ✅ `views/layouts/main_layout.ejs` **헤더 2행 재구성**: (행1) 로고 + **중앙 검색바** + 유저액션(로그인/마이쇼핑/장바구니/고객센터, 아이콘+라벨), (행2) **GNB = ☰카테고리(클릭 드롭다운) + 몰별 가변 메뉴(활성 밑줄)**. **"홈" 메뉴 제거**. 데스크톱+모바일 모두.
> - ✅ `views/partials/storefront/category_node.ejs`(재귀) + 카테고리 클릭 시 **하위 카테고리 div 패널**(전체 뎁스, 현재 데이터는 평면 10개). 카테고리 버튼은 페이지 이동 아님(개별 카테고리만 이동). 토글 JS(외부클릭/ESC 닫힘).
> - 검증: 홈 200, 헤더/GNB 구조 참조몰과 일치(스크린샷), 카테고리 링크 12개·패널 렌더, 회귀 없음.
> - ⬜ **잔여(폴리시, DoD 외)**: 카테고리 2단 컬럼(hover 확장)·3뎁스 드롭다운 정교화, 상단바 로그인 중복 정리(상단바 ↔ Row1 유저액션). 메뉴/카테고리 관리 UI는 **P3**.
> - **현재 메뉴 변경 방법**: 관리 UI 전까지 `storefront_menu` DB 직접 수정. 예: `UPDATE storefront_menu SET name='공동구매' WHERE id=11;`

### 4.5.0 확정 원칙 — "구조 고정 · 메뉴 데이터화" (2026-07-08 사용자 확정)

- **GNB 구조(골격)는 참조몰과 동일하게 고정**: GS SHOP·신세계TV쇼핑의 헤더/GNB는 거의 동일 → 공통 템플릿(HTML/CSS 골격)으로 고정한다.
- **카테고리 버튼은 고정 요소**: GNB 최좌측 "카테고리"(전체 분류 드롭다운)는 항상 존재.
- **나머지 메뉴 항목은 몰별 가변**: `쇼핑라이브/TV편성표/오늘특가/공동구매/베스트/이벤트&혜택` 같은 항목의 **명칭·순서·타입·개수는 몰마다 다름** → **하드코딩 금지**, `storefront_menu` 데이터로 렌더. (설계 §8.1 메뉴↔카테고리 분리)
- 즉 **골격=코드(고정), 항목=데이터(가변)**. 몰이 늘어도 골격은 재사용, 메뉴만 데이터로 갈아끼운다.

### 4.5.1 DB — `storefront_menu` (P3에서 앞당김)

> ⚠️ 개발 DB + `tables.sql` 3중 반영. `mall_id` 기본 1. (원래 P3 §6.1(b)에 있던 스키마를 여기로 이동 — 헤더/GNB가 이 데이터에 의존)

```sql
CREATE TABLE IF NOT EXISTS `storefront_menu` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `parent_id` BIGINT NULL,
  `depth` INT NOT NULL DEFAULT 1,            -- 1~3, 최상위=1 (앱 레이어에서 최대 3 강제)
  `name` VARCHAR(100) NOT NULL,              -- 몰별 가변 명칭
  `menu_type` VARCHAR(50) NOT NULL,          -- category / page / promotion / brand / external_url / custom
  `target_type` VARCHAR(50) NULL,
  `target_id` BIGINT NULL,
  `url` VARCHAR(500) NULL,
  `is_fixed` TINYINT(1) DEFAULT 0,           -- 1 = 카테고리 버튼 등 고정 항목(삭제 금지)
  `sort_order` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_menu_mall` (`mall_id`, `parent_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

> `is_fixed`는 P1.5에서 신설: "카테고리" 버튼 등 골격상 고정 항목을 표시(관리자에서 삭제 불가, 명칭만 변경 허용). depth CHECK는 앱 레이어(depthGuard, P3)에서 강제.

**시드(몰 1 기본, 참조몰형 예시 — 명칭은 이후 몰별 교체 가능)**:
`카테고리(is_fixed=1, menu_type=category)` · `신상품` · `베스트` · `오늘특가` · `기획전` · `이벤트&혜택`. (건강식품몰 성격에 맞춘 초기값; 참조몰의 `쇼핑라이브/TV편성표`는 P6 미디어 전까지 보류/대체)

### 4.5.2 레이아웃 골격 — `main_right_utility_v1`

- [ ] `views/layouts/main_layout.ejs`(또는 신규 `main_right_utility_layout.ejs`)를 §7.2 골격으로 정비:
  `Header(로고/검색/유저액션)` → `GNB(카테고리 버튼 + 메인 메뉴)` → `Content(2컬럼: 본문 + Right Utility)` → `Footer`.
- [ ] 헤더 partial 분해: `partials/storefront/header.ejs`(로고·검색·유저액션: 로그인/마이쇼핑/장바구니/고객센터).
- [ ] `layout_type` 값을 `page.layout_type`(이미 존재, 기본 `main_basic`)과 연동 — home을 `main_right_utility_v1`로.

### 4.5.3 GNB 렌더 (고정 골격 + 데이터 메뉴)

- [ ] `partials/storefront/gnb.ejs`: 최좌측 **고정 "카테고리" 버튼**(전체 카테고리 드롭다운 = `categories` 트리) + 그 우측 **데이터 기반 메인 메뉴**(`storefront_menu` 활성 항목 sort_order 순).
- [ ] `middleware/menuData.js` 교체: 현행 "THEME 카테고리 평면 조회"를 **`storefront_menu` 트리 조회**로 전환하여 `res.locals.gnbMenus`(+ 기존 `menuCategories`는 카테고리 드롭다운용 유지). 폴백: `storefront_menu` 비어 있으면 기존 THEME 카테고리 평면.
- [ ] `menu_type`별 링크 생성: `category`→카테고리 목록, `page`→`page.slug`, `promotion`→기획전, `external_url`→그대로. (3뎁스 드롭다운 렌더는 P3에서 뎁스 관리와 함께 완성; P1.5는 1뎁스 상단바 우선)

### 4.5.4 우측 유틸 레일 (Right Utility) — CT-7 정합

- [ ] `partials/storefront/right_utility.ejs`: 로그인 박스 / 최근 본 상품 / 앱다운 QR / 멤버십 숏컷 / TOP 버튼. (부록 A `utility_rail`·`recent_product`와 정합 — 여기서 전역 골격으로 확정)
- [ ] 최근 본 상품·장바구니 수는 기존 미들웨어(`cartData` 등) 재사용.

### 4.5.5 완료 기준 (DoD)

- 스토어프론트 헤더/GNB가 **참조몰형 골격**으로 렌더되고, GNB 메인 메뉴는 **`storefront_menu` 데이터**로 그려진다(하드코딩 아님).
- **카테고리 버튼은 항상 노출**(is_fixed), 나머지 메뉴는 DB에서 명칭·순서를 바꾸면 **무배포로 GNB가 바뀐다**.
- 우측 유틸 레일(로그인/최근본/QR/TOP)이 홈에 노출된다.
- `storefront_menu` 비어 있어도 기존 카테고리 폴백으로 GNB가 깨지지 않는다(회귀 안전).
- 몰 명칭만 다른 두 메뉴셋(예: 건강식품몰 vs 패션몰 §7.2)을 시드로 바꿔 끼워도 골격 코드 변경 없이 동작.

---

## 5. Phase 2 — 관리자 페이지 빌더

> 목표: 운영자가 코드 없이 메인 화면 섹션을 편집·발행. (설계 14, 19, 25.3)

> **✅ 구현 완료(2026-07-08)** — EJS + 바닐라 JS 에디터로 MVP 착수분 완성(React 아일랜드는 완전 DnD 단계로 defer, §5.3 후순위).
> - 테이블 `page_revision` 생성(개발 DB + `tables.sql`).
> - `services/display/pageBuilderService.js`: 섹션 CRUD·복제·순서변경·발행(스냅샷)·롤백·데이터소스 목록.
> - `displayService` 리팩터: `resolveSections()` 추출 + 스토어프론트는 **최신 발행 스냅샷(page_revision)** 기준, 스냅샷 미존재 시 라이브 `page_section` 폴백(P1 호환). 미리보기(`getDraftSections`)는 라이브 작업본 기준.
> - `sectionRegistry` 확장: `dataSource` + `fields`(설정폼 스키마).
> - `controllers/admin/pageBuilderController.js` + `routes/admin/page-builder.js`(admin.js 마운트) + `admin_menus` "페이지 빌더" 메뉴.
> - `views/admin/page-builder/editor.ejs`(좌: 섹션목록/추가/↑↓/복제/삭제, 중: PC·모바일 미리보기 iframe(draft), 우: 선택 섹션 설정폼) + `public/js/admin/page-builder.js`.
> - `mainController`: `buildHomeContext()` 추출 + `getHomePreview`(draft 렌더).
> - Tailwind v4 `@source "../../public/js"` 추가(JS 렌더 클래스 컴파일) → `build:css` 재빌드.
> - 검증(관리자 세션 curl): 에디터/미리보기 200, 섹션 추가·순서변경·발행(리비전 생성)·롤백 정상, 발행 후 스토어프론트 회귀 없음. 공유 DB 테스트 흔적 정리 완료.
> - **미구현(후순위)**: 완전 드래그앤드롭, 예약 발행 스케줄러, `main_display_*` 브리지(아래 §5.2 참고 — 별도 진행).

### 5.1 DB (발행/버전)

```sql
CREATE TABLE IF NOT EXISTS `page_revision` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `page_id` BIGINT NOT NULL,
  `revision_no` INT NOT NULL,
  `snapshot_json` JSON NOT NULL,             -- 발행 시점 섹션 구성 전체 스냅샷
  `status` VARCHAR(30) DEFAULT 'published',
  `created_by` VARCHAR(100) NULL,            -- admins.username
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `published_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rev_page` (`page_id`, `revision_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### 5.2 관리자 화면·라우트 (기존 패턴 준수)

- [ ] `controllers/admin/pageBuilderController.js` — `getList`, `getEditor`, `postSection`(추가), `postSectionUpdate`, `postSectionDelete`, `postSectionReorder`, `postDuplicate`, `postPreview`, `postPublish`, `postRollback`
- [ ] `routes/admin/page-builder.js` → `routes/admin.js`에 마운트
- [ ] `views/admin/page-builder/list.ejs`, `editor.ejs`(좌: 섹션 목록/추가, 중: PC·모바일 미리보기 iframe, 우: 선택 섹션 설정폼 — 설계 14.2)
- [ ] `admin_menus`에 "페이지 빌더" 메뉴 1건 추가 + `adminRoleGuard` 역할 노출 설정
- [ ] 섹션 설정폼은 `sectionRegistry`의 타입별 스키마로 동적 생성(상품형/배너형 공통·개별 옵션 — 설계 9.2)

### 5.3 우선 구현 범위(설계 14.2) / 후순위
- **우선**: 섹션 추가·삭제·복제, 위/아래 순서 변경, 데이터소스 선택, PC/모바일 미리보기, 임시저장, 발행, 롤백
- **후순위**: 완전 자유 드래그앤드롭, 예약 발행 스케줄러

### 5.4 완료 기준 (DoD)
- 운영자가 관리자에서 섹션을 추가/삭제/재정렬하고 **발행**하면 스토어프론트에 반영
- 발행 시 `page_revision` 스냅샷 생성, **이전 버전으로 롤백** 가능
- 미리보기(발행 전 draft 상태)가 실제 스토어프론트와 동일하게 보임
- 잘못된 설정 저장 시 사용자 친화 오류 메시지 노출(입력 검증)

---

## 6. Phase 3 — 메뉴/카테고리 빌더 → **M 트랙으로 전면 대체 (2026-07-09)**

> ## 🔴 이 장(§6)의 "자유형 메뉴 빌더" 설계는 폐기되었다.
>
> 근거: [`shopping_mall_builder_menu_design_summary.md`](./shopping_mall_builder_menu_design_summary.md)
> — "완전 동적 메뉴는 과설계. **통제된 동적 메뉴 시스템**이어야 한다."
>
> **대체 원칙**: `카테고리=동적 / 일반메뉴=사전정의 ON·OFF / 커스텀메뉴=슬롯 제한 / 시스템메뉴=고정`
> **위치 고정 원칙(사용자 확정)**: 커스텀 메뉴를 제외한 모든 메뉴는 **위치(position)가 코드에 고정**되고
> 운영자는 **ON/OFF·표시명·순서**만 관리한다. (예: 일반메뉴→`gnb`, 장바구니·찜·최근본→`right_rail`)
>
> ### 변경된 스펙
> | 항목 | 기존 §6 | 신규 M 트랙 |
> |---|---|---|
> | 메뉴 저장 | `storefront_menu` 단일 | `feature_menu`+`mall_feature_menu`+`custom_menu`+`navigation_config` |
> | 일반 메뉴 | 운영자가 URL 직접 입력 | 사전정의 기능코드, **URL 고정**, ON/OFF |
> | 커스텀 메뉴 | 무제한 | **GNB 슬롯 최대 3** (`navigation_config.max_custom_items`) |
> | **카테고리 뎁스** | **4뎁스** | **3뎁스로 축소 확정** |
> | 죽은 링크 | 발생 가능 | `module_ready=0` 이면 켜도 미노출 (게이트) |
>
> ### M 트랙 진행 현황
> | 단계 | 내용 | 상태 |
> |---|---|---|
> | **M1** | DB: `feature_menu`/`mall_feature_menu`/`custom_menu`/`navigation_config`/`brand_likes` + `categories` 컬럼 보강(mall_id·slug·depth·is_active·pc/mobile_visible) | ✅ 2026-07-09 |
> | **M2** | 시드/이관: 기능메뉴 카탈로그 23건, 몰1 활성 15건, `storefront_menu` 7행 매핑 | ✅ 2026-07-09 |
> | **M3** | 표준 라우트 `routes/feature.js`(`/best` `/new` `/deal/today` `/event`) + 찜한 브랜드(`/mypage/brand-likes`, `POST /likes/brand/toggle`) | ✅ 2026-07-09 |
> | **M4** | 서비스: `navigationService`(위치별 조립) + `depthGuard`(카테고리 max 3) | ⬜ |
> | **M5** | 렌더 전환: `middleware/menuData.js` → navigationService. GNB·우측레일을 데이터 기반으로 | ⬜ |
> | **M6** | 관리자 UI: 카테고리 트리 / 일반메뉴 ON·OFF / 커스텀 슬롯 / 시스템 노출 / 헤더 설정 | ⬜ |
> | **M7** | `storefront_menu` 제거(검증 후) | ⬜ |
> | **M8** | **고객센터 페이지** (신규 요구, 캡처 `capture/image copy.png`) — 좌측 LNB(1:1문의/문의내역/공지/FAQ 카테고리/비회원 주문조회/대표번호) + 본문(FAQ 검색·자주묻는질문 BEST10 아코디언·공지 목록) + 우측 유틸 레일. **FAQ 모듈 신설 필요**(`faq`, `faq_category` 테이블). `HEADER_CS` 의 `default_path` 를 `/boards/notice` → `/cs` 로 승격 | ⬜ |
>
> ### M1~M3 구현 메모 (2026-07-09)
> - `feature_menu.module_ready` 게이트 신설: 렌더 조건은 **`is_enabled AND module_ready`**. 모듈 미구현 메뉴(EXHIBITION/RANKING/OUTLET/COUPON/MEMBERSHIP/GROUP_BUY/LIVE)는 관리자에서 켜도 GNB에 나오지 않는다 → **죽은 `#` 링크 구조적 제거**.
> - 기존 GNB 6개(카테고리 제외) → **오늘특가·베스트·신상품·이벤트&혜택 4개**로 정리. `TV편성표`는 카탈로그에 없어 폐기, `쇼핑라이브`·`공동구매`는 `module_ready=0` 으로 비활성.
> - `/event` 는 이벤트 모듈 구현 전까지 `/boards/notice` 302 별칭(표준 URL 선점).
> - 상품목록 재사용: `req.featurePreset`(Express 5의 `req.query` 는 getter라 변형 금지) → `productController.getList` 가 병합.
> - **버그 수정**: P1.5 우측 레일의 `찜` 링크가 `/likes`(GET 라우트 없음 → 404)였다. `/mypage/likes` 로 교정.
> - 적용: `node scripts/migrate_menu_architecture.js` (멱등). `tables.sql` 반영 완료.

<details>
<summary>(참고) 폐기된 기존 §6 설계 — 자유형 메뉴 빌더</summary>

### 6.0 뎁스 제한(확정 스펙) ⭐

계층은 `parent_id` 자기참조(구조상 무제한)로 저장하되, **애플리케이션 레벨에서 최대 뎁스를 강제**한다.

| 대상 | 최대 뎁스 | depth 값 범위 | 비고 |
|---|---|---|---|
| **카테고리**(`categories`) | **4뎁스** | `depth` 1~4 | 대분류>중분류>소분류>세분류 |
| **스토어프론트 메뉴**(`storefront_menu`) | **3뎁스** | `depth` 1~3 | 상단메뉴 > 서브 > 서브의 서브 |

- **뎁스 계산**: 최상위(parent_id IS NULL) = **1**. 자식은 `부모.depth + 1`.
- **강제 규칙**: 신규/수정 저장 시 `부모.depth + 1 > 최대뎁스`이면 **저장 거부**(사용자 친화 오류). 5뎁스(카테고리)·4뎁스(메뉴) 이하 부모 아래에만 자식 생성 허용.
- **저장 전략**: `depth`를 **캐시 컬럼**으로 물리 저장(조회 성능·검증 단순화). 부모 이동 시 자신+모든 후손의 `depth`를 재계산해 갱신.
- **`type`(NORMAL/THEME/BRAND)은 뎁스가 아님** — 같은 분류축의 병렬 그룹이며, 뎁스 제한은 각 type 트리 내부에서 독립 적용.

### 6.1 DB

**(a) 기존 `categories`에 계층 컬럼 보강** — 현재 관리 UI가 `parent_id`를 안 쓰고 `depth` 컬럼도 없으므로 추가한다.

```sql
ALTER TABLE `categories`
  ADD COLUMN `depth` INT NOT NULL DEFAULT 1 COMMENT '계층 뎁스(1~4, 최상위=1)' AFTER `parent_id`,
  ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '노출 여부' AFTER `depth`;
-- parent_id 는 이미 존재(self FK). 기존 데이터는 전부 depth=1(평면)로 초기화됨.
```
> `categories`에는 **DB CHECK 제약을 강제하지 않는다**(부모 depth 참조 검증은 앱 레이어에서 수행). MySQL CHECK로는 "부모+1" 동적 검증이 불가하기 때문.

**(b) 신규 `storefront_menu`** — `depth` 포함.

```sql
CREATE TABLE IF NOT EXISTS `storefront_menu` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `parent_id` BIGINT NULL,
  `depth` INT NOT NULL DEFAULT 1,            -- 1~3, 최상위=1 (앱 레이어에서 최대 3 강제)
  `name` VARCHAR(100) NOT NULL,
  `menu_type` VARCHAR(50) NOT NULL,          -- category / page / promotion / brand / external_url / custom
  `target_type` VARCHAR(50) NULL,
  `target_id` BIGINT NULL,
  `url` VARCHAR(500) NULL,
  `sort_order` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_menu_mall` (`mall_id`, `parent_id`, `sort_order`),
  CONSTRAINT `chk_menu_depth` CHECK (`depth` BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### 6.2 작업
- [ ] **공통 뎁스 검증 유틸** `services/tree/depthGuard.js`
  - `assertDepthAllowed({ table, parentId, maxDepth })` → 부모 depth 조회 후 `+1 > maxDepth`면 예외
  - `recalcSubtreeDepth(table, nodeId)` → 부모 이동 시 자신+후손 depth 일괄 갱신(재귀/BFS)
  - `categories`·`storefront_menu` 양쪽에서 재사용 (카테고리 maxDepth=4, 메뉴 maxDepth=3)
- [ ] **카테고리 관리 개편**(`controllers/admin/categoryController.js`)
  - INSERT/UPDATE에 `parent_id` 처리 추가, 저장 시 `depthGuard`로 **4뎁스 초과 차단**
  - `views/admin/categories/list.ejs`를 **트리형 UI**로 개편(부모 선택, 하위 추가). 부모 선택지는 depth ≤ 3 인 카테고리만 노출(그 아래 자식이 4뎁스가 되도록)
  - Shopify 컬렉션 동기화 로직은 뎁스 도입과 무관하게 유지(THEME 제외 규칙 그대로)
- [ ] **메뉴 빌더 신설**: `controllers/admin/menuBuilderController.js` + `views/admin/menu-builder/*`
  - 메뉴 트리 관리, 대상 연결(category/page/promotion/brand/external_url/custom)
  - 저장 시 `depthGuard`로 **3뎁스 초과 차단**, 부모 선택지는 depth ≤ 2 인 메뉴만 노출
- [ ] **스토어프론트 렌더링**: `middleware/menuData.js`를 `storefront_menu` 트리 조회로 전환(폴백: 비어 있으면 기존 THEME 카테고리 평면 유지)
  - GNB 뷰는 3뎁스 드롭다운(1뎁스 상단바 + 2·3뎁스 펼침) 렌더 지원
- [ ] `menu_type=category`는 `categories` 참조, `page`는 `page.slug` 참조로 링크 생성

### 6.3 완료 기준 (DoD)
- 관리자에서 상단 메뉴를 추가/정렬/타입 지정하면 GNB에 반영
- 메뉴와 카테고리가 독립적으로 관리됨(카테고리 없는 순수 전시 메뉴 생성 가능)
- **카테고리 5뎁스째 생성 시도 → 저장 거부 + 오류 메시지**, 4뎁스까지는 정상 생성
- **메뉴 4뎁스째 생성 시도 → 저장 거부 + 오류 메시지**, 3뎁스까지는 정상 생성
- 부모를 다른 노드로 이동해도 자신+후손의 `depth`가 재계산되어 제한이 계속 지켜짐
- 스토어프론트 GNB가 최대 3뎁스 드롭다운으로 정상 노출

</details>

> ⚠️ 위 접힌 내용은 **폐기된 설계**다. 카테고리 뎁스는 **4 → 3**, `storefront_menu` 는 M7에서 제거된다.
> `depthGuard` 의 `maxDepth` 는 카테고리 **3**(메뉴 트리는 더 이상 존재하지 않음)으로 구현한다.

---

## 7. Phase 4 — 테마 시스템

> 목표: 몰의 색상·폰트·카드 스타일을 설정값으로 제어. (설계 13, 25.5)

### 7.1 DB
```sql
CREATE TABLE IF NOT EXISTS `theme` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `name` VARCHAR(100) NULL,
  `config_json` JSON NULL,   -- primaryColor / secondaryColor / fontFamily / buttonRadius / productCardStyle ...
  `is_active` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```
> 기존 `site_settings`(브랜드 색상 등)와 중복 최소화: 색상/로고는 `site_settings` 유지하고, `theme.config_json`은 **레이아웃/카드/버튼 스타일** 등 빌더 전용 항목만 담당하도록 경계 설정.

### 7.2 작업
- [ ] `middleware/siteSettings.js` 확장 또는 신규 `themeData.js`로 활성 테마를 `res.locals.theme`에 주입
- [ ] `main_layout.ejs` `<head>`에 CSS 변수 인라인 주입(`:root { --color-primary: ... }` — 설계 13장)
- [ ] 관리자 테마 설정 화면(색상 피커/폰트/버튼 라운드/카드 스타일)

### 7.3 완료 기준 (DoD)
- 테마 설정 변경 시 전 화면의 주요 색상·버튼·카드 스타일이 CSS 변수로 일괄 변경됨
- 하드코딩 색상값이 CSS 변수로 치환됨(주요 컴포넌트 기준)

---

## 8. Phase 5 — 멀티몰(도메인 기반)

> 목표: 하나의 인스턴스에서 도메인별로 다른 몰 노출. (설계 15, 25.5) — **단일 프로세스 내 논리 분리**(아직 SaaS 테넌시 아님)

### 8.1 DB
```sql
CREATE TABLE IF NOT EXISTS `mall` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `domain` VARCHAR(255) NULL,
  `logo_url` VARCHAR(500) NULL,
  `theme_id` BIGINT NULL,
  `status` VARCHAR(30) DEFAULT 'active',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mall_domain` (`domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### 8.2 작업
- [ ] `middleware/mallResolver.js` — 요청 Host 헤더 → `mall` 조회 → `req.mall` / `res.locals.mall` 주입(캐시)
- [ ] 지금까지 `mall_id = 1` 상수로 두었던 모든 조회(`page`/`product_group`/`storefront_menu`/`theme`)를 `req.mall.id` 기반으로 치환
- [ ] 관리자에 몰 목록/생성/도메인 매핑 화면
- [ ] `products`·`orders`·`users` 등 **거래 데이터의 몰 귀속 정책 결정**(공유 vs 분리) — 의사결정 필요 항목

### 8.3 완료 기준 (DoD)
- 서로 다른 도메인 접속 시 각기 다른 메뉴·섹션·테마의 몰이 노출됨
- 관리자에서 신규 몰 생성 → 기본 레이아웃 시드 → 즉시 접속 가능

### 8.4 ⚠️ 의사결정 필요 (설계자·기획 확인)
- 상품/회원/주문을 **몰 간 공유**할지 **몰별 분리**할지 (dev-mall은 현재 단일 상품 테이블)
- 분리 시 `products` 등 핵심 테이블에 `mall_id` 추가 + 전 쿼리 필터 필요 → **범위가 커지므로 별도 스펙 확정 후 진행**

---

## 9. Phase 6+ — SaaS 미디어 커머스 고도화 (장기 트랙)

> 별도 사업 결정·팀 구성 이후 착수. 상세 설계는 설계문서 **Part II(20~24장)** 참조. 이 문서에서는 진입 조건과 개괄만 명시한다.

| 항목 | 내용 | 설계 매핑 | 스택 변화 |
|---|---|---|---|
| 멀티테넌시 격리 | 전 테이블 `tenant_id` + Global Query Filter + RLS | 20장 | ORM/미들웨어 도입 검토 |
| 에지 라우팅 | 도메인→테넌트 해소를 에지 캐시(KV/Redis)로 0ms화 | 20.2 | 게이트웨이/에지 필요 |
| SDUI 전면화 | GraphQL Union/Interface 위젯 규약, 무배포 반영 | 21장 | **Next.js 스토어프론트 신설**(현 EJS와 병행/대체) |
| 비디오 커머스 | HLS 트랜스코딩·숏폼·라이브 | 22장 | AWS MediaLive/S3/CloudFront |
| O2O | QR·UTM·딥링크 팝업 전시 | 23장 | — |
| AI 에이전트 | Bedrock 멀티에이전트 실시간 상담 | 24장 | 서버리스 |

**진입 조건**: P0~P5 안정화 + 입점 브랜드(테넌트) 수요 확정 + 프론트엔드 Next.js 분리 결정.

> 참고: 현재 모노레포에는 이미 `spf-mall`(Next.js 헤드리스)·`spf-admin`(자체 관리자)이 존재하므로, SDUI 전면화 시 **spf-mall을 SDUI 렌더러로 확장**하는 경로가 자연스럽다(신규 프로젝트 생성 대신 재활용 검토).

---

## 10. 데이터 모델 종합 (신규 vs 기존)

| 개념 | 처리 | 비고 |
|---|---|---|
| 상품 | 기존 `products` 재사용 | 전시는 `product_group` 경유 |
| 카테고리 | 기존 `categories` 재사용 + `depth`/`is_active` 컬럼 보강 | **최대 4뎁스**(앱 레이어 강제), 전시 메뉴와 분리 |
| 배너 | 기존 `banners` 재사용 | 필요 시 `group_key` 컬럼 추가 |
| 페이지 | **신규 `page`** | P1 |
| 섹션 | **신규 `page_section`** | P1 |
| 상품 그룹 | **신규 `product_group` / `product_group_item`** | P1 |
| 발행 이력 | **신규 `page_revision`** | P2 |
| 전시 메뉴 | **신규 `storefront_menu`**(`depth` 포함) | P3, **최대 3뎁스** |
| 테마 | **신규 `theme`** | P4, `site_settings`와 경계 분리 |
| 몰 | **신규 `mall`** | P5 |
| 테넌트 격리 | `tenant_id`(또는 `mall_id` 승격) 전면 적용 | P6+ |

---

## 11. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| 조건 자동형 상품그룹의 동적 SQL | SQL 인젝션 | 필터 필드·연산자 **화이트리스트**만 허용, 파라미터화 |
| 메인 화면 회귀 | 운영 사고 | P0에서 리팩터링과 시각 결과 분리, P1 전환 시 기존 화면 폴백 유지 |
| 발행 실수로 메인 붕괴 | 매출 직결 | `page_revision` 롤백 필수(P2), 미리보기 강제 |
| `mall_id` 사후 확산 비용 | 대규모 수정 | 신규 테이블에 처음부터 `mall_id` 포함(값 1) |
| 거래 데이터 몰 귀속 미결정 | P5 지연 | P5 착수 전 기획 확정(8.4) |
| EJS↔Next.js 병행 부담 | 이중 유지보수 | SDUI는 P6 별도 트랙, 코어(P0~P5)는 EJS로 완결 |

---

## 12. 착수 체크리스트 (첫 스프린트)

1. [ ] 이 문서 리뷰·확정 → P0 범위 합의
2. [ ] P0: 메인 화면 섹션 partial 분해 + ProductCard 표준화 (DB 변경 없음)
3. [ ] P1 DB: `page`/`page_section`/`product_group`/`product_group_item` 생성(개발 DB + tables.sql), 홈 시드 데이터 투입
4. [ ] P1 서비스: `displayService` + `productGroupService` 구현, `mainController` DB 렌더링 전환
5. [ ] 검증: 관리자 없이 **DB에서 sort_order 변경 → 화면 순서 변경** 확인(SDUI 1차 달성)
6. [ ] P2 착수: 관리자 페이지 빌더 + 발행/롤백

---

## 부록 A. 섹션 컴포넌트 카탈로그 & 구현 트랙(CT)

> `docs/사이트개선/capture/`의 벤치마킹 캡처(신세계쇼핑·GS SHOP)에서 도출한 실제 컴포넌트 목록. 각 항목은 `sectionRegistry`에 등록되며, **`page_section` 한 행 = 화면에 배치된 한 인스턴스**다.

| 캡처 | section_type | 컴포넌트 | data_source | 멀티인스턴스 | 상태 |
|---|---|---|---|---|---|
| image, image2 | `hero_showcase` | 상품 쇼케이스 히어로(좌 LNB+중앙 슬라이더+썸네일+우 피처카드+유틸레일) | `hero_slide` | 예 | ✅ 구현 |
| (기존) | `hero_banner` | 전체폭 배너 스와이퍼 | `banner_group` | 예 | ✅ 구현 |
| image2 우측 | `promotion_banner` | 세로/직사각 프로모션 배너 | `banner_group` | 예 | 예정 |
| image3 | `benefit_bento` | "최고의 혜택" 벤토(대형 딜 + 원형 썸네일 그리드 + 컬러블록 프로모) | `product_group` + 프로모 카피 | 예 | 예정 |
| image4 | `brand_carousel` | 브랜드 로고 캐러셀(공식스토어 / GS X 브랜드) | `category`(type=BRAND) | 예 | 예정 |
| image5 | `product_carousel` | 상품 추천 캐러셀(페이징, 방송시간·태그) | `product_group` | 예 | 예정 |
| image6 | `ranking_tabs` | 랭킹(카테고리 아이콘 탭 + BEST 랭크 뱃지 그리드) | `product_group` + 카테고리 탭 | 예 | 예정 |
| (기존) | `product_grid` | N열 상품 그리드(베스트/신상품) | `product_group` | 예 | ✅ 구현(그리드 partial) |
| (기존) | `category_showcase` | 카테고리별 상품 탭(AJAX) | `category` | 예 | ✅ 구현 |
| image2, image7 | `utility_rail` | 바로접속 유틸 레일(장바구니/찜/최근본/TOP) | client + 고정 | 전역 1 | 🟡 전역 레일 구현(P1.5 §4.5.4). 히어로 내부 레일 완전 제거는 CT-7 |
| image2 | `quick_menu` | 퀵 사이드메뉴(출석체크/쇼핑라이브/웰컴혜택) | `menu` / config | 예 | 예정 |
| image, image2 | `live_cards` | 라이브/추천방송 카드(ON-AIR 타이머) | P6 미디어 연계 | 예 | P6 |
| (범용) | `recent_product` | 최근 본 상품 | client(localStorage) | 예 | 예정 |
| (범용) | `custom_html` | 제한적 커스텀 HTML | inline | 예 | 예정 |

> **구현 순서 제안**: `CT-0`(선행) → `product_carousel` → `brand_carousel` → `ranking_tabs` → `benefit_bento` → `promotion_banner` → `quick_menu`. (자주 쓰이고 데이터 소스가 단순한 것부터)

---

### A.0 컴포넌트 구현 트랙(CT) — 개요

- **트랙 성격**: 위 카탈로그의 "예정" 컴포넌트를 실제 렌더 가능한 섹션으로 만드는 작업 묶음. **CT 항목 1개 = 카탈로그 1행**을 완성한다.
- **Phase와의 관계**: CT는 P2(관리자 빌더)와 **병렬 진행 가능**. CT로 추가된 컴포넌트가 P2 에디터의 "섹션 추가" 팔레트에 자동 노출되려면 `sectionRegistry`에 `label`이 있어야 한다(이미 규약 §2.1).
- **공통 선행**: `CT-0`(데이터 리졸버 일반화)를 먼저 하면, 이후 CT들이 `displayService`의 if/else 체인을 건드리지 않고 **리졸버 파일 추가 + 레지스트리 등록만으로** 끝난다(강력 권장).

| CT | section_type | 데이터소스 | 신규 공통 인프라 | 선행 | 카탈로그 상태 |
|---|---|---|---|---|---|
| **CT-0** | (공통) 데이터 리졸버 일반화 | — | resolver map | — | — |
| **CT-1** | `product_carousel` | `product_group` | 없음(`product_grid` 리졸버 재사용) | CT-0 | 예정 |
| **CT-2** | `brand_carousel` | `categories`(type=BRAND) | 카테고리 리졸버 | CT-0 | 예정 |
| **CT-3** | `ranking_tabs` | `product_group` + 카테고리 탭 | AJAX 부분 렌더 라우트 | CT-1 | 예정 |
| **CT-4** | `benefit_bento` | `product_group` + 프로모 카피 | 없음 | CT-1 | 예정 |
| **CT-5** | `promotion_banner` | `banner_group` | `bannerService` + `banners.group_key` | CT-0 | 예정 |
| **CT-6** | `quick_menu` | menu / config | 없음(config_json) | CT-0 | 예정 |
| **CT-7** | `utility_rail`(전역) | client + 고정 | 전역 레이아웃 훅 | — | 부분(히어로 내) |
| **CT-8** | `recent_product` | client(localStorage) | 없음 | CT-0 | 예정 |
| **CT-9** | `custom_html` | inline | HTML sanitize 유틸 | CT-0 | 예정 |

> `hero_banner`·`hero_showcase`·`product_grid`·`category_showcase`는 **이미 구현**되어 CT 대상이 아니다. `live_cards`는 P6(미디어) 연계로 CT 범위 밖.

---

### A.1 공통 컴포넌트 추가 절차 (모든 CT 공통 레시피)

새 컴포넌트 1개를 추가하는 표준 5단계. 현재 소스(`services/display/*`, `views/partials/sections/*`) 기준.

1. **레지스트리 등록** — `services/display/sectionRegistry.js`에 `section_type: { view, label }` 추가.
2. **partial 생성** — `views/partials/sections/<type>.ejs`. 기존 partial의 로컬 계약(`title`, 데이터 배열, `config_json` 옵션)을 따른다. 새 CSS는 기존 Tailwind 유틸/`public/css/style.css` 규약 유지.
3. **데이터 해석 추가** — CT-0 이전이면 `displayService.getHomeSections`의 분기 추가, CT-0 이후면 `services/display/resolvers/<type>.js` 리졸버 파일 추가(권장). 상품형은 `productGroupService.resolve` 재사용.
4. **시드** — 필요 데이터소스(`product_group`(+`product_group_item`) 또는 `banners`)를 심고, `page_section`에 해당 `section_type` 1행 INSERT(원하는 `sort_order`).
5. **검증** — `pm2 restart dev-mall` → `curl`/브라우저로 노출 확인. `sort_order` 변경 → 무배포 위치 이동 확인.

**config_json 공통 옵션**: `columns`/`columnsPerView`(그리드·캐러셀 열수), `maxCount`(상품 수), `showBadge`/`showPrice`/`showDiscountRate`(ProductCard 위임), `moreLink`(더보기 URL). 컴포넌트별 추가 옵션은 각 CT에 명시.

**빈 데이터 처리(공통)**: 상품/배너가 0건이면 해당 섹션을 렌더에서 **스킵**(기존 `product_grid`·`category_showcase`·`kakao_cta` 동작과 동일). 리졸버가 `null` 반환 시 스킵으로 약속.

---

### A.2 CT-0 — 데이터 리졸버 일반화 (선행 권장)

> 목표: `displayService.getHomeSections`의 `section_type`별 if/else 체인을 **per-type 리졸버 맵**으로 분리해, 이후 CT가 리졸버 파일 추가만으로 끝나게 한다. (설계 17 sectionRendererMap의 서버측 대응)

**작업 태스크**
- [ ] `services/display/resolvers/` 디렉터리 신설. 각 리졸버는 `async resolve(section, shared) → locals | null`(null이면 섹션 스킵) 시그니처로 통일.
- [ ] 기존 분기(`product_grid`/`hero`/`category_showcase`/`value_proposition`/`kakao_cta`)를 각 리졸버 파일로 이관.
- [ ] `services/display/resolvers/index.js`에서 `section_type → resolver` 맵 제공(또는 `sectionRegistry`에 `resolver` 키 병기).
- [ ] `getHomeSections`는 `const locals = await resolvers[type]?.(section, shared)`만 호출하도록 축소(미등록/`null`이면 스킵).

**완료 기준(DoD)**
- 홈 렌더 결과가 CT-0 전과 **픽셀 동일**(회귀 없음).
- 새 컴포넌트 추가 시 `displayService.js`를 수정하지 않고 **리졸버 파일 + 레지스트리 등록**만으로 동작.
- `getHomeSections` 함수·파일이 축소되고 800줄/함수 50줄 규약 유지.

---

### A.3 CT-1 — product_carousel (상품 추천 캐러셀)

> 데이터소스: `product_group`. `product_grid`와 데이터는 동일, 표현만 가로 스크롤/페이징 캐러셀.

**작업 태스크**
- [ ] `sectionRegistry`: `product_carousel: { view: 'partials/sections/product_carousel', label: '상품 캐러셀' }`.
- [ ] `views/partials/sections/product_carousel.ejs`: `products` 배열을 가로 캐러셀로 렌더. `partials/product_card.ejs` 재사용. 좌우 화살표 + CSS scroll-snap(또는 경량 JS), 모바일 스와이프.
- [ ] 데이터 해석: `product_grid` 리졸버 공유(`productGroupService.getById` → `resolve`). CT-0 이후면 리졸버 맵에서 `product_grid`와 동일 리졸버 매핑.
- [ ] config_json: `columnsPerView`(뷰당 표시수, 기본 4/모바일 2), `autoplay`(선택), `maxCount`(기본 12), `moreLink`.
- [ ] 시드: `product_group` 1건(예: "여름 추천", condition badge 또는 manual) + `page_section` INSERT.

**완료 기준(DoD)**
- 홈에 캐러셀 노출, 좌우 이동/스와이프 동작, 반응형(PC 다열 / 모바일 축소).
- 같은 `section_type`을 **2행**으로 심어 멀티 인스턴스(서로 다른 그룹) 정상 노출.
- 상품 0건 시 섹션 스킵.

---

### A.4 CT-2 — brand_carousel (브랜드 로고 캐러셀)

> 데이터소스: `categories WHERE type='BRAND'`. **신규 카테고리(브랜드) 리졸버 필요**.

**작업 태스크**
- [ ] `sectionRegistry`: `brand_carousel` 등록.
- [ ] 브랜드 조회: `services/display/resolvers/brand_carousel.js`(또는 서비스 함수) — `categories`에서 `type='BRAND' AND is_active`인 로고/링크 목록(상품 수 조인 옵션, `display_order` 정렬).
- [ ] `views/partials/sections/brand_carousel.ejs`: 브랜드 로고 그리드/캐러셀, 각 로고 → 브랜드 카테고리 링크. 로고 미등록 시 브랜드명 텍스트 폴백.
- [ ] config_json: `columns`, `shape`(circle/rect), `maxCount`.
- [ ] 시드: 브랜드 카테고리(type=BRAND) 존재 확인(없으면 샘플 등록) + `page_section` INSERT.

**완료 기준(DoD)**
- 브랜드 로고가 카테고리(type=BRAND) 기반으로 렌더, 클릭 시 해당 브랜드 상품 목록 이동.
- 로고 미등록 브랜드는 텍스트 폴백으로 렌더.

---

### A.5 CT-3 — ranking_tabs (랭킹 탭)

> 데이터소스: `product_group` + 카테고리 탭. 기존 `category_showcase`의 AJAX 탭 전환 패턴 재사용.

**작업 태스크**
- [ ] `sectionRegistry`: `ranking_tabs` 등록.
- [ ] `views/partials/sections/ranking_tabs.ejs`: 카테고리 아이콘 탭 + 랭크 뱃지(1·2·3…) 그리드. 초기 탭은 SSR, 탭 전환은 AJAX.
- [ ] AJAX 부분 렌더 라우트: `GET /sections/ranking?group=&category=` → 상품 목록 HTML/JSON 반환(기존 카테고리 AJAX 컨트롤러 확장 또는 신규 `routes/sections.js`).
- [ ] config_json: `tabs`(카테고리 id 배열 또는 `auto`), `rankLimit`(탭당 노출 수), `sort`(sales/views).
- [ ] 시드: 랭킹용 `product_group`(sort_type=sales/views) + `page_section` INSERT.

**완료 기준(DoD)**
- 초기 로드는 SSR로 첫 탭 노출(FCP 확보), 탭 클릭 시 무새로고침 랭킹 갱신.
- 랭크 뱃지 1~N 표기, 상품 0건 탭은 빈 상태 메시지.

---

### A.6 CT-4 — benefit_bento (혜택 벤토)

> 데이터소스: `product_group` + 프로모 카피(config_json). "최고의 혜택" 벤토 레이아웃.

**작업 태스크**
- [ ] `sectionRegistry`: `benefit_bento` 등록.
- [ ] `views/partials/sections/benefit_bento.ejs`: CSS grid 벤토(대형 딜 카드 + 원형 썸네일 그리드 + 컬러블록 프로모). 반응형에서 1열 스택.
- [ ] 데이터 해석: `product_group`(썸네일 그리드) + config의 `dealProductId`(대형 딜 상품 조회).
- [ ] config_json: `dealProductId`, `promoBlocks`([{copy,color,url}]), `maxCount`.
- [ ] 시드: 딜 상품 id + 프로모 그룹 + `page_section` INSERT.

**완료 기준(DoD)**
- 벤토가 대형 딜 + 썸네일 그리드 + 프로모 블록으로 렌더, 데스크톱 벤토/모바일 스택.
- 딜 상품 미존재 시 해당 슬롯만 숨김(섹션 유지).

---

### A.7 CT-5 — promotion_banner (프로모션 배너)

> 데이터소스: `banner_group`. **신규 `bannerService` + `banners.group_key` 컬럼 필요**(§4.1 note).

**작업 태스크**
- [ ] (스키마) `banners`에 `group_key VARCHAR(50)` 컬럼 추가 — **개발 DB + 상용 DB + `tables.sql` 3중 반영**.
- [ ] `services/display/bannerService.js`: `getByGroup(groupKey)` — 활성/노출기간 필터 배너 목록.
- [ ] `sectionRegistry`: `promotion_banner` 등록 + `views/partials/sections/promotion_banner.ejs`(세로/직사각 배너, 링크·대체텍스트).
- [ ] config_json: `groupKey`, `layout`(vertical/rect), `columns`.
- [ ] 시드: 배너 몇 건 + `group_key` 지정 + `page_section` INSERT.

**완료 기준(DoD)**
- `banner_group` 배너가 노출·링크 이동, 노출기간 필터 적용.
- **동일 `bannerService`로 `hero_banner`도 리팩터**(카탈로그 '예정→구현' 정합, 배너 소스 일원화).

---

### A.8 CT-6 — quick_menu (퀵 사이드메뉴)

> 데이터소스: config_json(초기). P3 `storefront_menu` 도입 후 menu 소스로 승격 가능.

**작업 태스크**
- [ ] `sectionRegistry`: `quick_menu` 등록 + `views/partials/sections/quick_menu.ejs`(아이콘+라벨+링크, 뱃지 옵션).
- [ ] config_json: `items`([{icon,label,url,badge}]).
- [ ] 시드: `page_section`(config_json에 items) INSERT.

**완료 기준(DoD)**
- config_json 항목대로 퀵메뉴 렌더, 링크 이동, 뱃지 표시.
- (메모) P3 이후 `menu_type` 소스 연동 경로 열어둠.

---

### A.9 CT-7 ~ CT-9 — 경량 컴포넌트 (묶음)

**CT-7 `utility_rail`(전역)** — 현재 히어로 내부 부분 구현을 전역 컴포넌트로 승격.
- [x] 전역 partial 신설: `views/partials/storefront/right_utility.ejs`(장바구니/찜/최근본/TOP + 로그인박스, `position:fixed`) — **P1.5 §4.5.4에서 선구현**.
- [x] `main_layout.ejs`에 조건부 포함(`layout_type === 'main_right_utility_v1'`). 장바구니 수는 기존 `cartData` 미들웨어 재사용.
- [x] 중복 렌더 방지: `≥1600px`에서 레거시 `#scrollTopBtn` 및 히어로 내부 `.hero-util-rail`을 CSS로 숨김.
- [ ] **잔여**: 히어로(`hero_showcase.ejs`)에서 내부 유틸 레일 **완전 제거**(현재는 `<1600px` 구간을 위해 잔존). 전역 레일을 1600px 미만에서도 쓰려면 콘텐츠 경계 기준 위치 계산(`right: calc((100vw - 1400px)/2 - 90px)`) 또는 in-flow 컬럼 전환 필요.
- [ ] **잔여**: 홈 외 전 페이지 노출(현재 `layout_type`이 `main_right_utility_v1`인 페이지 = 홈만). 찜 개수 뱃지용 미들웨어.
- **DoD**: 전 페이지 공통 유틸레일 노출, TOP 스크롤 동작, **중복 렌더 없음**(전역 1 인스턴스 — 멀티인스턴스 아님).

**CT-8 `recent_product`** — 최근 본 상품(client).
- [ ] `sectionRegistry` 등록 + partial(클라이언트 컨테이너 + JS로 최근본 로드/렌더). 로그인 시 `recent_views` 테이블, 비로그인 시 localStorage.
- **DoD**: 조회 이력이 최근 본 상품으로 노출, 이력 없으면 섹션 스킵.

**CT-9 `custom_html`** — 제한적 커스텀 HTML(inline).
- [ ] `sectionRegistry` 등록 + partial. **보안 필수**: 저장/렌더 시 화이트리스트 sanitize(`<script>`·`on*` 핸들러·위험 태그 제거). 관리자 입력이라도 XSS 방지(설계 리스크 §11).
- [ ] config_json: `html`.
- **DoD**: 허용 태그만 렌더, 스크립트/이벤트 핸들러 제거 검증.

---

### A.10 CT 트랙 완료 기준 (트랙 DoD)

- 카탈로그 "예정" 컴포넌트가 모두 `sectionRegistry` 등록 + partial + 리졸버를 갖춰 **`page_section` INSERT만으로 홈에 배치** 가능.
- 각 컴포넌트가 **멀티 인스턴스**(같은 타입 여러 행)와 **무배포 순서변경**(`sort_order`)을 만족(부록 C 조립 모델 정합).
- 상품형은 `productGroupService`, 배너형은 `bannerService`, 브랜드형은 카테고리 리졸버로 **데이터소스가 3계열로 수렴**(중복 쿼리 로직 없음).


## 부록 C. 컴포넌트 조립 모델 — 넣기/빼기 · 순서 · 멀티 인스턴스 (요구사항 정합)

사용자 요구("요소를 넣고/빼고, 2개 이상 배치, 컴포넌트화해서 순서·배치")는 **P1의 `page_section` 스키마로 이미 100% 충족**된다. 추가 스키마 불필요.

| 요구 | 실현 메커니즘 (page_section) |
|---|---|
| **넣기** | 해당 `section_type` 행을 INSERT (관리자 "섹션 추가") |
| **빼기** | `is_active = 0` (숨김) 또는 행 DELETE |
| **2개 이상(멀티 인스턴스)** | 같은 `section_type`을 **여러 행**으로 추가하되 `data_source_id`/`config_json`만 다르게. 예: `product_carousel` 2개 = "여름신상"·"베스트뷰티" |
| **순서** | `sort_order` 값 (관리자 위/아래 이동) |
| **배치(위치)** | `position`(main_top/main_content/right 등) + `sort_order` |
| **PC/모바일 개별** | `visible_on_pc` / `visible_on_mobile` |
| **노출 기간** | `visible_start_at` / `visible_end_at` |
| **컴포넌트화** | `section_type` ↔ `sectionRegistry` ↔ 렌더러/설정폼 1:1 매핑(§2.1) |

**렌더 흐름**: 홈 요청 → `page`(home) 조회 → `page_section` 목록을 `sort_order`로 정렬 → 각 행의 `section_type`으로 `sectionRegistry[type].view` 렌더 + `data_source`로 데이터 주입. → 운영자가 DB(관리자)에서 섹션을 추가/삭제/재정렬하면 **무배포로 화면이 재구성**된다(SDUI).

> **현재 상태 정합**: 지금 홈은 컨트롤러가 히어로/베스트/신상품/카테고리를 **직접 쿼리**해 고정 순서로 렌더한다(부분적 DB 구동). 위 "임의 조립"을 실현하려면 **P1 렌더 엔진 전환**이 필요하다. 즉 캡처 컴포넌트들을 `sectionRegistry`에 등록하고, 홈을 `page_section` 반복 렌더로 바꾸는 것이 P1의 실제 작업이다.

## 부록 B. 설계 문서 대응표

| 이 문서 | 설계 문서 장 |
|---|---|
| P0 기반 정리 | 25.1 |
| P1 렌더 엔진 | 6.2 / 10 / 17 / 25.2 |
| P2 페이지 빌더 | 14 / 19 / 25.3 |
| P3 메뉴/카테고리 | 8 / 25.4 |
| P4 테마 | 13 / 25.5 |
| P5 멀티몰 | 15 / 25.5 |
| P6+ SaaS | Part II 20~24 / 26 |
| 공통 규약(SDUI) | 6.2 / 17 / 21 |
