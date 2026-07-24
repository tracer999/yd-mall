# 스토어프론트 메뉴 (Storefront Menus)

## 1. 개요

고객 화면(스토어프론트)의 **GNB · 헤더 유틸 · 우측 유틸 레일** 메뉴를 관리합니다. 관리자 사이드바 메뉴(`admin_menus`)와는 완전히 별개입니다 → [관리자 메뉴 관리](./menus.md)

- **관련 테이블:** `feature_menu`(전역 카탈로그), `mall_feature_menu`(몰별 ON/OFF·순서), `custom_menu`(몰별 커스텀 메뉴), `navigation_config`(몰별 헤더 정책·스킨), `categories`(카테고리 드롭다운/아코디언)
- **컨트롤러:** `controllers/admin/featureMenuController.js`, `controllers/admin/customMenuController.js`, `controllers/admin/headerSettingsController.js`, `controllers/admin/menuPreviewController.js`
- **뷰:** `views/admin/feature-menus/list.ejs`, `views/admin/system-menus/list.ejs` (둘 다 `views/partials/admin/menu_editor.ejs` 공용), `views/admin/custom-menus/list.ejs` · `form.ejs`, `views/admin/header-settings/edit.ejs`, `views/admin/menu-preview/index.ejs`
- **조립 서비스:** `services/menu/navigationService.js` → `middleware/menuData.js` 가 `res.locals` 에 주입
- **스토어프론트 표준 URL:** `routes/feature.js`
- **몰 컨텍스트:** 관리자 화면은 `req.adminMallId`(없으면 1), 스토어프론트는 `req.mallId`(없으면 1)

### 설계 원칙

- 운영자는 **메뉴의 URL 과 위치(position)를 바꿀 수 없습니다.** 표준 URL 은 코드가 고정합니다(`feature_menu.default_path` ↔ `routes/feature.js`). 위치를 고를 수 있는 것은 커스텀 메뉴뿐입니다.
- **GNB 노출 조건은 3중입니다: `is_enabled` AND `module_ready` AND 콘텐츠 게이트.** 셋 중 하나라도 걸리면 메뉴는 조용히 빠집니다(죽은 링크·빈 화면 구조적 차단). → §6.2
- `is_required = 1` 인 메뉴(카테고리 버튼·검색·로그인·마이쇼핑·장바구니·TOP)는 끌 수 없습니다.
- 배지는 `NEW` / `HOT` / `SALE` 화이트리스트만 허용합니다(자유 입력 금지).
- PC/모바일은 **서버에서 기기 필터를 하지 않습니다.** 같은 HTML 에 함께 렌더되고 `pc_visible` / `mobile_visible` 값을 보고 뷰가 고릅니다.
- **헤더 스킨(`header_layout_type`)과 GNB 조립 방식(`nav_mode`)은 짝**입니다. 서버가 항상 함께 저장해 깨진 조합을 만들 수 없게 합니다. → §4

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/feature-menus` | featureMenuController.getList | 일반 메뉴 관리 — GNB 기능 메뉴 목록/편집 |
| POST | `/admin/feature-menus` | featureMenuController.postSave | GNB 메뉴 저장 |
| GET | `/admin/system-menus` | featureMenuController.getSystemList | 시스템 메뉴 설정 — 헤더 유틸 + 우측 레일 |
| POST | `/admin/system-menus` | featureMenuController.postSystemSave | 시스템 메뉴 저장 |
| GET | `/admin/custom-menus` | customMenuController.getList | 커스텀 메뉴 목록 (연결 끊김 표시) |
| GET | `/admin/custom-menus/add` | customMenuController.getAdd | 추가 폼 |
| POST | `/admin/custom-menus` | customMenuController.postSave | 추가 저장 |
| GET | `/admin/custom-menus/:id/edit` | customMenuController.getEdit | 수정 폼 |
| POST | `/admin/custom-menus/:id` | customMenuController.postSave | 수정 저장 |
| POST | `/admin/custom-menus/:id/toggle` | customMenuController.postToggle | 사용 여부 토글 (켤 때만 슬롯 검사) |
| POST | `/admin/custom-menus/:id/delete` | customMenuController.postDelete | 삭제 |
| GET | `/admin/header-settings` | headerSettingsController.getEdit | Header 설정 (navigation_config) 폼 |
| POST | `/admin/header-settings` | headerSettingsController.postUpdate | Header 설정 저장 (스킨 + nav_mode 동시 저장) |
| GET | `/admin/menu-preview` | menuPreviewController.getPreview | 메뉴 조립 결과 미리보기 (`?device=pc\|mobile&login=0\|1`) |
| POST | `/admin/menu-preview/gnb` | menuPreviewController.postGnb | GNB 순서·노출 일괄 저장 |

모두 `routes/admin.js` 에서 `requireMenuAccess('/admin/...')` 를 거쳐 마운트됩니다.

---

## 3. 일반 메뉴 관리 / 시스템 메뉴 설정

두 화면은 **같은 컨트롤러·같은 편집기(`menu_editor.ejs`)** 를 쓰고, 담당 `position` 만 다릅니다.

| 화면 | position | 성격 |
|------|----------|------|
| `/admin/feature-menus` (일반 메뉴 관리) | `gnb` | 상단 GNB 기능 메뉴 |
| `/admin/system-menus` (시스템 메뉴 설정) | `header_util`, `right_rail` | 헤더 유틸 + 우측 레일 (추가·삭제 불가) |

> 화면 분리 기준은 **`position` 이지 `is_system` 이 아닙니다.** `CATEGORY`(gnb)가 `is_system = 1` 이고 `RAIL_RECENT` 는 `is_system = 0` 이라, `is_system` 으로 가르면 GNB 버튼이 시스템 화면으로 끌려오고 최근본상품이 빠집니다.

### 3.1 목록 (GET)

`feature_menu` LEFT JOIN `mall_feature_menu`(mall_id = 현재 몰) 로, 담당 position 의 모든 카탈로그 항목을 가져옵니다. `mall_feature_menu` 행이 없으면 `is_enabled = 0`, `sort_order = feature_menu.default_sort_order` 로 간주합니다.

- **정렬:** `position ASC, sort_order ASC, default_sort_order ASC`
- **뷰 전달:** `screen`(담당 position·제목·설명), `groups`(position별 항목), `badgeTypes`, `config`(`max_gnb_items`, `max_custom_items`), `saved`

### 3.2 폼 필드 (`views/partials/admin/menu_editor.ejs`)

| name | 타입 | 설명 |
|------|------|------|
| `feature_code[]` | hidden | 기능 코드(행 식별자) |
| `enabled[]` | checkbox (value=feature_code) | 사용 여부. `module_ready = 0` 이면 잠금(disabled), `is_required = 1` 이면 켠 채 잠금 |
| `sort_order[]` | number | 같은 position 내 순서 |
| `display_name[]` | text | 표시명 (비우면 `feature_menu.default_name` 사용) |
| `badge_type[]` | select | NEW / HOT / SALE / 없음 |
| `pc_visible[]` | checkbox (value=feature_code) | PC 노출 |
| `mobile_visible[]` | checkbox (value=feature_code) | 모바일 노출 |
| `login_required[]` | checkbox (value=feature_code) | 로그인 사용자에게만 노출 |

체크박스는 켜진 것만 전송되므로 서버는 `Set` 으로 받아 판정합니다. `disabled` 체크박스는 전송되지 않으므로 서버가 값을 강제합니다.

### 3.3 저장 (POST)

1. 트랜잭션 시작
2. `feature_menu` 를 **서버가 다시 조회**해 `position` / `module_ready` / `is_required` 를 확인합니다. 폼이 보낸 값은 신뢰하지 않습니다.
3. 알 수 없는 `feature_code`, **그 화면이 담당하지 않는 position** 은 건너뜁니다(일반 메뉴 화면에서 시스템 메뉴를 조작하는 요청 위조 차단).
4. 강제 규칙: `is_required = 1` → `is_enabled = 1`, `module_ready = 0` → `is_enabled = 0`.
5. `INSERT ... ON DUPLICATE KEY UPDATE` 로 `mall_feature_menu` 에 upsert (`uk_mall_feature (mall_id, feature_code)`).
6. commit 후 `{화면 경로}?saved=1` 리다이렉트.

> ⚠️ **`is_enabled = 1` 로 켰다고 GNB 에 뜨는 것이 아닙니다.** 콘텐츠 게이트(§6.2)가 아울렛·공동구매·쇼핑라이브를 콘텐츠 유무로 한 번 더 거릅니다. "켰는데 안 보인다"의 원인은 대부분 이것입니다. 사유는 [메뉴 미리보기](#5-메뉴-미리보기-adminmenu-preview)가 알려줍니다.

---

## 3.5 커스텀 메뉴 관리 (`/admin/custom-menus`)

기능 메뉴(`feature_menu`)는 "기획전 목록"·"전문관 목록"처럼 **모듈 단위**로 고정돼 있습니다. 몰마다 다른 **개별 인스턴스**("○○ 콜라보 기획전", "건강기능식품" 카테고리)를 GNB 에 꽂는 것이 커스텀 메뉴입니다. 커스텀 메뉴는 기능 메뉴와 **동등한 GNB 항목**이라 하나의 `sort_order` 축에서 통합 정렬됩니다.

### 3.5.1 링크 유형 (`LINK_TYPES` 화이트리스트)

| link_type | kind | 필수 값 | 설명 |
|-----------|------|---------|------|
| `EXHIBITION` | resource | `link_target` | 기획전 · 전문관 상세로 직결 |
| `CATEGORY` | resource | `link_target` | 카테고리 상품 목록. **드로어형(unified)에서는 하위 카테고리를 자동 상속** |
| `BRAND` | resource | `link_target` | 브랜드 상품 목록 |
| `INTERNAL_PAGE` | url | `link_url` | `/` 로 시작하는 내부 경로 |
| `EXTERNAL_URL` | url | `link_url` | `http(s)://`. **항상 새 창**(서버가 `new_window=1` 강제) |
| `PRODUCT_GROUP` | — | — | 컬럼 값으로는 존재하지만 **관리자 선택지에 없고 렌더 해석기도 없습니다**(미구현 → 렌더 제외) |

- 리소스형(`EXHIBITION`/`CATEGORY`/`BRAND`)은 저장 시 **서버가 대상 id 를 다시 조회**해 같은 몰의 살아있는 대상인지 확인합니다(폼 값 불신). 삭제·비활성·미발행 대상은 저장 자체가 거부됩니다.
- 링크 유형을 바꾸면 안 쓰는 필드(`link_target` ↔ `link_url`)를 **NULL 로 지웁니다**. 유령 링크가 되살아나지 않게 하기 위함입니다.
- 메뉴 이름은 20자 이내.

### 3.5.2 위치와 슬롯

| location | 슬롯 제한 |
|----------|-----------|
| `gnb` | `navigation_config.max_custom_items` — **켜져 있는 GNB 커스텀 메뉴 수**로 검사(저장·토글 양쪽) |
| `footer` | 조립 시 20개 |
| `mobile_quick` | 조립 시 5개 |

### 3.5.3 연결 끊김 표시

목록은 `navigationService.getNavigation()` 을 **렌더와 같은 경로로** 호출해 실제 해석된 경로를 가져옵니다. 켜져 있는데 경로가 잡히지 않으면(`broken = true`) 대상이 깨진 것이며, 스토어프론트에서는 **조용히 제외**됩니다. 목록에 '연결 끊김'으로 표시되므로 여기서 확인하세요.

---

## 4. Header 설정 (`/admin/header-settings`)

`navigation_config`(몰당 1행)를 편집합니다. 행이 없으면 500 + "`scripts/migrate_menu_architecture.js` 를 실행하세요" 안내를 냅니다.

### 4.1 헤더 스킨 2종 (`HEADER_LAYOUT_TYPES`)

| header_layout_type | nav_mode | 이름 | 카테고리 |
|--------------------|----------|------|----------|
| `main_right_utility_v1` | `split` | 기본형 — 카테고리 버튼 + 평면 GNB (3단 헤더) | GNB 최좌측 `[☰ 카테고리]` 버튼의 **별도 드롭다운 패널**(3단 캐스케이드) |
| `compact_drawer_v1` | `unified` | 드로어형 — 햄버거 전체메뉴 + 아코디언 카테고리 | 카테고리 1뎁스가 **일반 메뉴와 같은 목록**에 놓이고 하위 뎁스는 `[+]` 아코디언 |

> **`navModeOf()` 가 스킨과 `nav_mode` 를 짝으로 강제 저장합니다.** 레이아웃만 바꾸고 `nav_mode` 를 두면 "드로어 헤더인데 카테고리가 메뉴 목록에 없는" 깨진 조합이 나오기 때문입니다. 운영자는 `nav_mode` 를 직접 고르지 않습니다.
>
> 과거의 `compact_inline_v1` 은 폐기됐습니다. 현재 지원 스킨은 위 2종뿐입니다.

### 4.2 폼 필드

| name | 타입 | 허용 값 / 범위 |
|------|------|----------------|
| `header_layout_type` | select | `main_right_utility_v1` / `compact_drawer_v1` (둘 다 `supported: true`) |
| `category_display_type` | select | `dropdown` (지원) / `mega` (**렌더 미지원**) |
| `max_gnb_items` | number | 1 ~ 20 |
| `max_custom_items` | number | 0 ~ 10 (`max_gnb_items` 를 넘으면 잘라 맞춤) |
| `category_max_depth` | number | 1 ~ 3 (프론트가 3뎁스까지만 렌더) |
| `use_search_bar` | checkbox | 1/0 |

### 4.3 저장 검증

- 문자열은 **화이트리스트**로, 정수는 **범위 clamp** 로 서버가 재검증합니다.
- `use_mega_menu` 는 렌더 미지원이므로 **항상 0** 으로 고정 저장합니다.
- **`category_max_depth` 는 현재 카테고리 데이터의 최대 depth 미만으로 내릴 수 없습니다.** 내리면 `navigationService` 가 `depth <= maxDepth` 로 걸러 기존 하위 카테고리가 스토어프론트에서 조용히 사라지기 때문입니다. 위반 시 `?error=...` 로 리다이렉트합니다.
- `nav_mode` 는 폼 필드가 아니라 **`header_layout_type` 에서 파생**됩니다.

---

## 5. 메뉴 미리보기 (`/admin/menu-preview`)

- 스토어프론트와 **같은 함수**(`navigationService.getNavigation`)를 호출합니다. 조립 로직을 다시 짜지 않아야 미리보기와 실제가 어긋나지 않습니다.
- 쿼리: `device=pc|mobile`, `login=0|1`
- 화면의 핵심은 "무엇이 보이는가"보다 **"무엇이 왜 안 보이는가"** 입니다. `findExcluded()` 가 제외 사유를 붙여 목록으로 보여줍니다.

| 제외 사유 | 판정 |
|-----------|------|
| 모듈 미구현 (켜도 노출되지 않음) | `feature_menu.module_ready = 0` |
| 사용 안 함 (운영자가 끔) | `mall_feature_menu.is_enabled = 0` |
| 로그인 필요 | `login_required = 1` 이고 비로그인 미리보기 |
| 노출 기간 전 / 종료 | `visible_start_at` / `visible_end_at` |
| **콘텐츠 부족 — 채울 내용이 없어 자동으로 숨겨짐** | `navigationService.checkContentGate()` 가 `false` (§6.2) |
| GNB 잘림 | `gnbCandidateCount - gnb.length` (= `max_gnb_items` 초과분) |

### 5.1 GNB 순서·노출 편집 (`POST /admin/menu-preview/gnb`)

같은 화면에서 GNB 순서·노출·기기별 표시를 **드래그 한 목록으로** 편집합니다. 담기는 항목이 모드마다 다릅니다.

| nav_mode | 목록에 담기는 것 |
|----------|------------------|
| `unified` | **카테고리 1뎁스 + 기능 메뉴 + 커스텀 메뉴** (셋이 하나의 순서 축) |
| `split` | 기능 메뉴 + 커스텀 메뉴만 (카테고리는 별도 패널이라 GNB 순서와 무관 → 목록에서 제외) |

- 저장은 원본 테이블(`categories.display_order` / `mall_feature_menu.sort_order` / `custom_menu.sort_order`)을 직접 고칩니다. 그래서 카테고리 관리·일반 메뉴 관리 화면과 값이 자동으로 연동됩니다.
- 순서는 화면 인덱스로 **1..N 을 다시 매깁니다**(세 테이블이 축을 공유해 값을 그대로 쓰면 동순위가 생김).
- 서버가 이 몰의 유효 키 집합을 다시 만들어 검사하므로, 조작된 키(타몰·split 에서의 `cat:` 키)는 반영되지 않습니다.
- 노출은 `pc_visible`/`mobile_visible` 로만 다룹니다. **카테고리의 `is_active` 는 건드리지 않습니다** — 그건 상품 목록 등 GNB 밖까지 죽입니다.

---

## 6. 조립 로직 (`services/menu/navigationService.js`)

`getNavigation(mallId, { isLoggedIn })` 반환값:

| 키 | 내용 |
|----|------|
| `config` | `navigation_config` (없으면 `DEFAULT_CONFIG` — `nav_mode='split'` 로 폴백) |
| `categoryTree` | NORMAL · `is_active = 1` · `depth <= category_max_depth` 카테고리의 `parent_id` 재귀 트리 |
| `categoryButton` | split 전용 — GNB 최좌측 고정 버튼(`feature_code = 'CATEGORY'`). **unified 에서는 항상 `null`** |
| `gnb` | 조립된 GNB 항목 목록. 각 항목은 `kind`(`feature`/`custom`/`category`)와 `children` 을 갖습니다 |
| `gnbCandidateCount` | 자르기 전 후보 수 — **관리자 미리보기 전용**(스토어프론트는 읽지 않음) |
| `gnbCategoryCount` | GNB 에 전개된 카테고리 수 (split 은 0) |
| `rightRail`, `headerUtil` | position 별 기능 메뉴 |
| `footer`, `mobileQuick` | position 별 기능 메뉴 + 커스텀 메뉴 (각각 20 / 5 슬롯) |

- 기능 메뉴 조회 조건: `mall_feature_menu.is_enabled = 1 AND feature_menu.module_ready = 1` + 노출 기간 → 그 뒤 **콘텐츠 게이트**(§6.2).
- `login_required = 1` 항목은 비로그인 사용자에게 숨깁니다(앱 레이어).
- 표시명은 `COALESCE(NULLIF(m.display_name, ''), f.default_name)`.
- 카테고리 트리에서 **부모가 필터에 걸려 빠지면 자식도 함께 숨깁니다**(최상위로 승격시키지 않음).

### 6.1 split vs unified

**`buildSplit`** — 기본형. 카테고리는 GNB 축 밖의 별도 패널입니다.
- `categoryButton` 에 CATEGORY 기능 메뉴를 담고, 나머지 기능 메뉴 + 커스텀 메뉴를 `sort_order` 하나로 병합 정렬합니다(안정 정렬이라 동순위면 기능 메뉴가 앞).
- `max_gnb_items` 로 뒤에서 자릅니다.

**`buildUnified`** — 드로어형. 카테고리가 메뉴의 본체입니다.
- **CATEGORY 기능 메뉴가 켜져 있으면 카테고리 1뎁스가 각각 하나의 GNB 항목**이 됩니다(하위 뎁스는 `children`). 순서 값은 `categories.display_order` 를 씁니다 — CATEGORY 행의 `sort_order` 는 더 이상 쓰이지 않습니다(항목별 순서가 따로 있으므로).
- **CATEGORY 를 끄면 카테고리가 통째로 빠집니다** — 일반 메뉴만 있는 몰이 됩니다.
- **절단(`max_gnb_items`)은 일반 메뉴에만 적용하고 카테고리는 자르지 않습니다.** 통째로 자르면 스토어가 반토막 나기 때문입니다.
- `categoryButton` 은 `null`.
- 커스텀 메뉴가 `link_type = 'CATEGORY'` 면 **그 카테고리의 children 을 자동 상속**합니다(운영자가 하위 메뉴를 따로 만들 필요 없음).
- 카테고리 노드와 일반 메뉴는 마지막에 **하나의 `sortOrder` 축**으로 다시 섞입니다.

### 6.2 콘텐츠 게이트 (`CONTENT_GATES` — `navigationService.js:152-243`)

`module_ready` 는 "모듈이 개발됐는가"만 봅니다. 모듈이 있어도 **채울 콘텐츠가 없으면 메뉴를 눌렀을 때 빈 화면**이 나옵니다. 그래서 조립 단계에서 한 번 더 거릅니다.

| feature_code | 통과 조건 | 이유 |
|--------------|-----------|------|
| `OUTLET` | 판매중 아울렛 상품 수 ≥ `outlet_setting.min_product_count` (기본 **30**) | 상시 매장이라 몇 개로는 매장 꼴이 안 난다 |
| `GROUP_BUY` | 공개된 공동구매 **1건 이상** | 한 건만 열려도 그 자체가 콘텐츠 |
| `LIVE` | 공개된 라이브 **1건 이상** | 위와 동일 |

- **캐시:** `GATE_TTL_MS = 30초`, 프로세스 메모리(`gateCache`). `menuData` 는 모든 페이지에서 도므로 캐시가 없으면 사이트 전체에 상시 COUNT 부하가 걸립니다.
- **무효화:** 관리자가 콘텐츠·설정을 바꾸면 `invalidateContentGate(mallId)` 로 즉시 비웁니다 — `outletController`(등록·수정·삭제·설정 저장), `groupBuyController`, `liveController`, `mallProvisioner`.
- **fail-safe:** 게이트 판정이 예외로 터지면 **숨기는 쪽**으로 갑니다(빈 메뉴를 보여주느니 없는 편이 낫다). 실패는 캐시하지 않습니다.
- **`checkContentGate(mallId, code)`** — 관리자 설명용. 게이트 없는 메뉴는 `null`, 통과 `true`, 콘텐츠 부족 `false`. 메뉴 미리보기가 이걸로 제외 사유를 붙입니다.

> 즉 **GNB 노출 = `is_enabled` AND `module_ready` AND 콘텐츠 게이트**. 아울렛 메뉴를 켰는데 안 보인다면 십중팔구 판매중 아울렛 상품이 30개 미만입니다.

### 6.3 커스텀 메뉴 링크 해석 (`LINK_RESOLVERS`)

| link_type | href |
|-----------|------|
| `INTERNAL_PAGE` | `link_url` |
| `EXTERNAL_URL` | `link_url` (**항상 새 창** — 관리자 설정과 무관하게 강제) |
| `CATEGORY` | `/products/category/{id}` — `type='NORMAL'` · 활성 · 같은 몰일 때만 |
| `BRAND` | `/products/brand/{id}` — `type='BRAND'` 일 때만 |
| `EXHIBITION` | `exhibitionService` 가 준 **`detailPath` 직결** — 전문관이면 `/specialty/{slug}`, 기획전이면 `/exhibition/{slug}` (301 없음) |
| `PRODUCT_GROUP` | **미등록 → 렌더 제외** (모듈 미구현) |

`loadLinkContext()` 가 대상(기획전·카테고리·브랜드)을 **서버에서 한 번에 재조회해 검증**합니다. 대상이 삭제·비활성·미발행·타몰이면 해석기가 `null` 을 돌려주고 그 메뉴는 **GNB 에서 자동 제외**됩니다(`feature_menu.module_ready` 와 같은 원칙 — 죽은 링크 구조적 차단). 관리자 목록에는 '연결 끊김'으로 표시됩니다(§3.5.3).

### 6.4 뷰 주입 (`middleware/menuData.js`)

`res.locals` 에 `nav`, `gnbMenus`, `categoryButton`, `rightRailMenus`, `headerUtilMenus`, `categoryTree`, `menuCategories`(THEME 카테고리 — 레거시 하위호환), `currentPath` 를 주입합니다. 조회 실패 시 예외를 삼키고 **빈 메뉴 + 카테고리 버튼 골격만** 유지해 헤더가 깨지지 않게 합니다.

- `navigationService` 항목을 뷰 형태로 변환하는 것은 `toViewItem(item)`(`menuData.js:30`)입니다. `children` 을 **재귀로 매핑**(`(item.children||[]).map(toViewItem)`)해 unified GNB 의 카테고리 하위 뎁스(2·3뎁스 드롭다운)를 표현합니다. split 에서는 `children` 이 항상 빈 배열이라 기존 뷰가 그대로 돕니다. 예전엔 여기서 children 을 버려 하위 뎁스를 표현할 수단이 없었습니다.

---

## 7. 표준 URL (`routes/feature.js`)

`feature_menu.default_path` 와 1:1 대응합니다.

> **현재 `module_ready = 0` 인 행은 하나도 없습니다.** 25개 카탈로그 전부 `module_ready = 1` 입니다. 즉 "모듈 미구현"으로 GNB 에서 빠지는 메뉴는 이제 없고, 빠진다면 `is_enabled` 이거나 콘텐츠 게이트입니다.

### 7.1 GNB 기능 메뉴 (15종)

| feature_code | default_name | default_path | 비고 |
|--------------|--------------|--------------|------|
| CATEGORY | 카테고리 | (NULL) | 카테고리 드롭다운/아코디언. `is_system`·`is_required`. unified 에선 카테고리 전개 게이트 |
| SHOPPING_DEAL | 쇼핑특가 | `/deals` | 기간·시간창·요일·선착순. **결제 금액에 직접 반영**. 0건이면 준비중 폴백. 구 `/deal/today` 는 301 |
| BEST | 베스트/랭킹 | `/best` | 랭킹 엔진(판매·좋아요 가중 합산 스냅샷 + MD 픽) |
| NEW_PRODUCT | 신상품 | `/new` | SDUI 랜딩(slug='new') 우선, 없으면 목록 폴백 |
| RECOMMEND | 추천 | `/recommend` | 세 섹션이 모두 비면 준비중 폴백 |
| EVENT | 이벤트&혜택 | `/event` | `routes/event.js`. **멤버십이 이 페이지의 하위 섹션으로 노출됨** |
| EXHIBITION | 기획전 | `/exhibition` | `routes/exhibition.js` |
| BRAND | 브랜드 | `/brands` | 브랜드 허브 |
| SPECIALTY | 전문관 | `/specialty` | `exhibition_type='SPECIALTY'` 인 기획전 |
| RANKING | 랭킹 | `/ranking` | **몰 1·2·6 전부 `is_enabled = 0`.** 베스트가 랭킹을 흡수해 `/ranking` 은 **301 → `/best`** |
| OUTLET | 아울렛 | `/outlet` | `routes/outlet.js`. **콘텐츠 게이트** 대상 |
| COUPON | 쿠폰 | `/coupon` | **몰 1·2·6 전부 `is_enabled = 0`.** 라우트는 살아 있음(0건이면 준비중 폴백) |
| MEMBERSHIP | 멤버십 | `/membership` | **몰 1·2·6 전부 `is_enabled = 0`.** GNB 대신 `/event` 하위 섹션으로 노출. 라우트는 유지(정적 제도 소개) |
| GROUP_BUY | 공동구매 | `/group-buy` | **콘텐츠 게이트** 대상 |
| LIVE | 쇼핑라이브 | `/live` | 외부 영상 임베드. **콘텐츠 게이트** 대상 |

> `TODAY_DEAL`(`/deal/today`)은 **삭제**됐고 `SHOPPING_DEAL`(`/deals`)이 대체했습니다.

### 7.2 헤더 유틸 · 우측 레일 (10종)

| feature_code | default_path | position | 비고 |
|--------------|--------------|----------|------|
| HEADER_SEARCH | `/search` | header_util | 필수 |
| HEADER_LOGIN | `/auth/login` | header_util | 필수 |
| HEADER_MYPAGE | `/mypage` | header_util | 필수 |
| HEADER_CART | `/cart` | header_util | 필수 |
| HEADER_CS | **`/cs`** | header_util | 시스템 (`/boards/notice` 아님) |
| RAIL_CART | `/cart` | right_rail | 시스템 |
| RAIL_WISHLIST | `/mypage/likes` | right_rail | 시스템 |
| RAIL_ORDERS | `/mypage/orders` | right_rail | |
| RAIL_RECENT | (NULL) | right_rail | 클라이언트 동작 |
| RAIL_TOP | (NULL) | right_rail | 필수 (클라이언트 동작) |

> `footer` · `mobile_quick` position 은 조립 코드에는 있으나 **`feature_menu` 카탈로그에 행이 없습니다.** 이 두 위치는 현재 커스텀 메뉴로만 채웁니다.
>
> `routes/feature.js` 는 app.js 에서 `'/'` 에 **먼저** 마운트됩니다. 여기에 `/group-buy` · `/coupon` · `/live` · `/outlet` 같은 경로를 남겨두면 뒤에 오는 전용 라우터에 요청이 영영 닿지 못합니다.

### 7.3 GNB 활성화 현황 (현재 데이터)

`mall_feature_menu.is_enabled` 스냅샷 (기본몰 1·종합관 2 기준). 세 몰 모두 꺼진 메뉴만 굳이 적습니다.

| feature_code | is_enabled | 메모 |
|--------------|:----------:|------|
| RANKING | **0** (전 몰) | 베스트가 흡수 → `/ranking` 301 → `/best` |
| MEMBERSHIP | **0** (전 몰) | GNB 대신 `/event` 하위 섹션. 라우트는 유지 |
| COUPON | **0** (전 몰) | 라우트는 살아 있음(0건이면 준비중 폴백) |
| SHOPPING_DEAL | 1 | 구 `TODAY_DEAL` 을 흡수 — `/deals` 랜딩(구 `/deal/today` 는 301) |
| SPECIALTY | 1 | 전문관(`exhibition_type='SPECIALTY'`). `routes/specialty.js` — 목록 `/specialty` 전용, **상세 `/specialty/:slug` 는 `exhibitionController.getDetail` 공유**(유형 불일치 시 301) |
| OUTLET · GROUP_BUY · LIVE | 1 | **콘텐츠 게이트** 대상(§6.2) — 켜져 있어도 콘텐츠 0건이면 숨김 |

- **`max_gnb_items` 절단은 `navigationService` 가 적용**합니다 — `buildSplit`(`services/menu/navigationService.js:449`) / `buildUnified`(`:519`). 기본몰·종합관은 **12**, 소형몰(unified)은 8입니다(§8.4). unified 는 이 상한을 일반 메뉴에만 적용하고 카테고리는 자르지 않습니다.

---

## 8. DB 테이블

### 8.1 feature_menu — 기능/시스템 메뉴 카탈로그 (전역, 몰 무관)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| feature_code | VARCHAR(50) **UNIQUE** | 기능 코드(고정 식별자) |
| default_name | VARCHAR(100) NOT NULL | 기본 메뉴명 |
| default_path | VARCHAR(255) NULL | 표준 URL (운영자 변경 불가). NULL = 클라이언트 동작 |
| position | VARCHAR(30) NOT NULL (INDEX) | `gnb` / `right_rail` / `header_util` / `footer` / `mobile_quick` |
| required_module | VARCHAR(50) NULL | 필요 기능 모듈 |
| module_ready | TINYINT(1) NOT NULL DEFAULT 0 | 1 = 모듈 구현됨(렌더 허용). **현재 전 행 1** |
| default_enabled | TINYINT(1) NOT NULL DEFAULT 1 | 새 몰에 메뉴 행을 만들 때의 기본 ON/OFF (`featureMenuSync`) |
| is_system | TINYINT(1) NOT NULL DEFAULT 0 | 1 = 시스템 메뉴(추가·삭제 불가) |
| is_required | TINYINT(1) NOT NULL DEFAULT 0 | 1 = 항상 노출(끌 수 없음) |
| default_sort_order | INT NOT NULL DEFAULT 0 | 기본 순서 |
| description | VARCHAR(255) NULL | 설명 |

### 8.2 mall_feature_menu — 몰별 ON/OFF·순서 오버라이드

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| mall_id | BIGINT NOT NULL DEFAULT 1 | |
| feature_code | VARCHAR(50) NOT NULL → feature_menu.feature_code | `ON DELETE CASCADE` |
| display_name | VARCHAR(100) NULL | NULL/빈 값이면 `default_name` 사용 |
| sort_order | INT NOT NULL DEFAULT 0 | 같은 position 내 순서 |
| is_enabled | TINYINT(1) NOT NULL DEFAULT 0 | 사용 여부 |
| pc_visible / mobile_visible | TINYINT(1) NOT NULL DEFAULT 1 | 기기별 노출 (뷰가 필터) |
| login_required | TINYINT(1) NOT NULL DEFAULT 0 | 로그인 사용자에게만 노출 |
| badge_type | VARCHAR(20) NULL | NEW / HOT / SALE |
| visible_start_at / visible_end_at | DATETIME NULL | 노출 기간 |
| updated_at | DATETIME | |

UNIQUE `uk_mall_feature (mall_id, feature_code)` — upsert 키.

### 8.3 custom_menu — 몰별 커스텀 메뉴 (슬롯 제한)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| mall_id | BIGINT NOT NULL DEFAULT 1 | |
| display_name | VARCHAR(100) NOT NULL | 메뉴명 (폼에서 20자 제한) |
| link_type | VARCHAR(30) NOT NULL DEFAULT 'INTERNAL_PAGE' | INTERNAL_PAGE / EXTERNAL_URL / CATEGORY / BRAND / EXHIBITION / PRODUCT_GROUP(미구현) |
| link_target | BIGINT NULL | 내부 리소스 id (**FK 없음** — 저장 시 서버가 재조회 검증) |
| link_url | VARCHAR(500) NULL | INTERNAL_PAGE / EXTERNAL_URL 일 때만 사용 |
| location | VARCHAR(30) NOT NULL DEFAULT 'gnb' | **커스텀 메뉴만 위치 선택 가능** (gnb / footer / mobile_quick) |
| sort_order | INT NOT NULL DEFAULT 0 | |
| is_enabled | TINYINT(1) NOT NULL DEFAULT 1 | |
| pc_visible / mobile_visible | TINYINT(1) NOT NULL DEFAULT 1 | |
| login_required | TINYINT(1) NOT NULL DEFAULT 0 | |
| badge_type | VARCHAR(20) NULL | NEW / HOT / SALE |
| new_window | TINYINT(1) NOT NULL DEFAULT 0 | EXTERNAL_URL 은 서버가 1로 강제 |
| visible_start_at / visible_end_at | DATETIME NULL | 노출 기간 |
| created_at / updated_at | DATETIME | |

### 8.4 navigation_config — 몰별 내비게이션 정책 (몰당 1행)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT PK | |
| mall_id | BIGINT NOT NULL **UNIQUE** (`uk_navconfig_mall`) | |
| header_layout_type | VARCHAR(50) NOT NULL DEFAULT 'main_right_utility_v1' | 헤더 스킨 — `main_right_utility_v1` / `compact_drawer_v1` |
| **nav_mode** | VARCHAR(20) NOT NULL DEFAULT 'split' | GNB 조립 방식 — `split` / `unified`. **`header_layout_type` 과 짝으로 저장** |
| category_display_type | VARCHAR(50) NOT NULL DEFAULT 'dropdown' | dropdown / mega(미지원) |
| max_gnb_items | INT NOT NULL DEFAULT 8 | GNB 최대 노출 수. **unified 에서는 일반 메뉴에만 적용**(카테고리는 안 자름) |
| max_custom_items | INT NOT NULL DEFAULT 3 | GNB 커스텀 메뉴 슬롯 수 |
| category_max_depth | INT NOT NULL DEFAULT 3 | 카테고리 최대 뎁스 (앱 레이어 강제) |
| use_mega_menu | TINYINT(1) NOT NULL DEFAULT 0 | 렌더 미지원 — 항상 0 |
| use_search_bar | TINYINT(1) NOT NULL DEFAULT 1 | |
| config_json | JSON NULL | 미사용 |
| updated_at | DATETIME | |

**현재 데이터**

| mall | header_layout_type | nav_mode | max_gnb_items | max_custom_items |
|------|--------------------|----------|---------------|------------------|
| 1 health (기본몰) | main_right_utility_v1 | split | 12 | 3 |
| 2 general | main_right_utility_v1 | split | 12 | 3 |
| 6 test_small | compact_drawer_v1 | **unified** | 8 | 5 |

---

## 9. 주의사항

- **"켰는데 GNB 에 안 뜬다"의 1순위 원인은 콘텐츠 게이트입니다**(아울렛·공동구매·쇼핑라이브). `/admin/menu-preview` 의 제외 목록에서 '콘텐츠 부족'을 확인하세요. → §6.2
- **RANKING · COUPON · MEMBERSHIP 은 세 몰 모두 꺼져 있습니다.** 켜기 전에 의도를 확인하세요 — `/ranking` 은 `/best` 로 301 되고(같은 기능이 두 번 노출됨), 멤버십은 `/event` 하위 섹션이 정식 노출 경로입니다.
- **unified 몰에서 CATEGORY 기능 메뉴를 끄면 카테고리가 통째로 사라집니다.** split 에서는 카테고리 버튼만 사라지지만, unified 에서는 카테고리가 메뉴의 본체입니다.
- `custom_menu.link_target` 에는 FK 가 없습니다. 대상을 지우면 메뉴는 남지만 **렌더에서 자동 제외**되고 관리자 목록에 '연결 끊김'으로 뜹니다(기획전 삭제는 `exhibitionController` 가 연결된 커스텀 메뉴 수를 세어 차단합니다).
- `category_max_depth` 를 낮추면 기존 하위 카테고리가 스토어프론트에서 사라집니다. Header 설정이 하향을 막지만, DB 를 직접 수정하면 막히지 않습니다.
- `navigation_config` 행이 없는 몰은 Header 설정 화면이 500 입니다. 몰을 새로 만들면 `mallProvisioner` 가 프리셋대로 행을 만듭니다 → [malls.md](./malls.md)
- **프리셋 재적용은 GNB 메뉴 세트를 프리셋 목록으로 되돌립니다.** 프리셋 `featureMenus` 에 없는 GNB 메뉴는 전부 꺼집니다(OUTLET·GROUP_BUY·LIVE 포함). → [malls.md](./malls.md) §7
- 콘텐츠 게이트 캐시는 30초 TTL · 프로세스 메모리입니다. 관리자 화면 밖(스크립트·DB 직접 수정)에서 아울렛 상품을 바꾸면 최대 30초 지연이 생깁니다.
- 메뉴 조회가 실패해도 헤더는 빈 메뉴로 렌더됩니다(`menuData` 가 예외를 삼킴). 메뉴가 통째로 사라졌다면 서버 로그의 `Menu Middleware Error` 를 확인하세요.
- 몰 컨텍스트가 없으면 `mall_id = 1` 로 폴백합니다.

---

*Last Updated: 2026-07-15*
