# 관리자 메뉴 관리 (Admin Menus)

## 1. 개요

- **Base URL:** `/admin/menus`  
- **관련 테이블:** `admin_menus`  
- **컨트롤러:** `controllers/admin/menuController.js`  
- **뷰:** `views/admin/menus/list.ejs`  
- **접근 권한:** 라우트 마운트 시 `requireMenuAccess('/admin/menus')` + 컨트롤러 내부 `ensureMenuAdmin` (super_admin 또는 admin만 통과)

**관리자 사이드바** 메뉴의 순서, 이름, 경로, 아이콘, 활성 여부, 역할별 표시(`visible_roles`)를 DB에서 관리합니다. 메뉴 정의는 `adminMenu` 미들웨어(사이드바 렌더)와 `requireMenuAccess`(접근 제어)에서 사용됩니다.

> ⚠️ **`/admin/menus` 는 관리자 사이드바 메뉴 관리이지 스토어프론트 GNB 가 아닙니다.** 고객 화면의 GNB·헤더 유틸·우측 레일은 `feature_menu` / `mall_feature_menu` / `custom_menu` / `navigation_config` 로 **완전히 별개**로 관리합니다 → [스토어프론트 메뉴](./storefront_menus.md)
> 이름이 비슷해 두 화면을 혼동하기 쉽습니다. 여기서 메뉴를 켜고 꺼도 고객 화면은 아무것도 바뀌지 않습니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/menus` | getMenus | 메뉴 목록 + 편집 폼 (단일 페이지) |
| POST | `/admin/menus/save` | saveMenus | 전체 메뉴 일괄 저장 (추가·수정·삭제·순서) |

---

## 3. 메뉴 구조 (그룹 2뎁스)

- `admin_menus` 는 **그룹 행 + 잎 메뉴** 2뎁스 구조입니다.
- **그룹 행은 `path IS NULL`** 로 식별합니다(링크 없음, 사이드바에서 하위 메뉴를 펼치는 헤더 역할).
- 잎 메뉴는 `parent_id` 로 그룹에 속합니다. 최상위 잎(예: 대시보드)은 그룹 없이 그대로 노출됩니다.
- **권한(`visible_roles`)은 잎 메뉴에만 적용**합니다. 그룹 행의 `visible_roles` 는 비워 둡니다. 보이는 자식이 하나도 없는 그룹은 사이드바에서 통째로 숨겨집니다(`middleware/adminMenu.js`).

### 3.1 현재 데이터 (실측)

그룹 **8개** + 최상위 잎 2개(`몰 관리`, `대시보드`). `고객지원 관리`(id=49)가 뒤늦게 신설되면서 문의·FAQ·공지가 그리로 옮겨졌습니다.

| id | 그룹 | display_order | 잎 메뉴 (id · path · visible_roles) |
|----|------|---------------|--------------------------------------|
| 29 | 쇼핑몰 관리 | 20 | 15 `/admin/site-settings` · 10 `/admin/policies` · 38 `/admin/header-settings` · 41 `/admin/theme-settings`(**디자인 스타일**) — 여기까지 `super_admin,admin` · 1 `/admin/dashboard`(대시보드, `super_admin,admin,content_admin`) |
| 30 | 메뉴/카테고리 관리 | 30 | 2 `/admin/categories`(+`content_admin`) · 36 `/admin/feature-menus` · **57 `/admin/brands`**(+`content_admin`) · 37 `/admin/system-menus` · **56 `/admin/custom-menus`** · 40 `/admin/menu-preview` |
| 31 | 페이지/전시 관리 | 40 | 21 `/admin/page-builder` · 4 `/admin/banners` · **44 `/admin/exhibitions`** · **46 `/admin/group-buys`** · **58 `/admin/lives`** — 모두 `super_admin,admin,content_admin` |
| 32 | 상품 관리 | 50 | 3 `/admin/products` · 39 `/admin/product-groups` · **50 `/admin/best-groups`** · **51 `/admin/deals`** · **52 `/admin/deal-categories`** · **53 `/admin/recommend-groups`** · **54 `/admin/outlet`** · **55 `/admin/outlet/categories`** — 모두 `super_admin,admin,content_admin` |
| 33 | 프로모션 관리 | 60 | 13 `/admin/coupons` · 14 `/admin/points`(둘 다 `super_admin,admin`) · **45 `/admin/events`**(+`content_admin`) |
| 49 | **고객지원 관리** | 75 | 8 `/admin/inquiries`(`…,customer_admin`) · 42 `/admin/faqs`(`…,content_admin`) · 17 `/admin/notices`(`…,content_admin`) |
| 34 | 주문/회원 관리 | 70 | 5 `/admin/sales` · 6 `/admin/shipping`(`super_admin,customer_admin`) · 47 `/admin/shipping-policy` · 48 `/admin/claims` · 20 `/admin/shopify-orders`(**`is_active = 0`**) · 7 `/admin/users` |
| 35 | 운영/시스템 관리 | 80 | 11 `/admin/operators`(**`super_admin` 만**) · 12 `/admin/menus` · 16 `/admin/sys-settings` |

**최상위 잎**

| id | 이름 | path | display_order | is_active | visible_roles |
|----|------|------|---------------|-----------|----------------|
| 43 | 몰 관리 | `/admin/malls` | -10 (그룹보다 위) | 1 | `super_admin,admin` |

> **대시보드(id=1)는 최상위 잎이 아닙니다.** `쇼핑몰 관리`(id=29) 그룹의 잎(`/admin/dashboard`, `display_order = 5`, `is_active = 1`)으로 들어가 있습니다. 라우트(`/admin/dashboard`)에는 `requireMenuAccess` 가 걸려 있지 않으므로 역할과 무관하게 접근은 됩니다. `/admin` 은 접근 가능한 첫 메뉴로 리다이렉트하는 진입점입니다.
>
> `/admin/shopify-orders`(id=20)도 `is_active = 0` 입니다. 사이드바에서 빠질 뿐 아니라 라우트에 `requireMenuAccess('/admin/shopify-orders')` 가 걸려 있어 **`admin` 외 역할은 403** 입니다(§7.2).

---

## 4. 메뉴 목록 (GET /admin/menus)

- **쿼리:** `SELECT id, name, path, icon_class, display_order, parent_id, is_active, visible_roles FROM admin_menus ORDER BY display_order ASC, id ASC`
  - `WHERE parent_id IS NULL` 필터는 없습니다. 전체를 조회한 뒤 `flattenTree()` 로 **최상위 → 자식 순서**로 평탄화해 내려줍니다(그룹 필터를 걸면 자식 메뉴가 화면에서 사라짐).
  - 각 행에 `isGroup`(= `!path`), `depth`(0/1), `groupName` 이 덧붙습니다.
- **뷰 전달:** `menus`, `title: '관리자 메뉴 관리'`
- **화면:** 드래그 핸들로 순서 변경, 활성 토글, '상세' 펼침(아이콘 클래스 · 접근 가능한 역할 체크박스), 행 삭제, '메뉴 추가' 버튼. 모든 편집은 폼 하나(`#menuForm`)로 모아 한 번에 POST 합니다.

---

## 5. 메뉴 저장 (POST /admin/menus/save)

### 5.1 요청 파라미터 (배열 폼, 행 단위 인덱스 매칭)

| name | 타입 | 설명 |
|------|------|------|
| `id[]` | number (optional) | 기존 메뉴 ID (비어 있으면 신규 INSERT) |
| `name[]` | string | 메뉴명 (**필수** — 비면 그 행은 건너뜀) |
| `path[]` | string | 이동 URL. **비우면 `NULL` 로 저장 → 그룹 행** |
| `icon_class[]` | string | 아이콘 클래스 (Bootstrap Icons) |
| `visible_roles[]` | string | 접근 가능한 역할 CSV (빈 문자열이면 `NULL` = 전체 허용) |
| `is_active[]` | '1' / '0' | 활성 여부 |
| `parent_id[]` | number (optional) | 소속 그룹 ID (없으면 `NULL` = 최상위) |
| `delete_ids[]` | number | 삭제할 메뉴 ID (JS가 폼에 주입) |

- 값이 단일로 오면 배열로 변환합니다.
- `visible_roles` 는 hidden input 에 CSV 로 담기고, 상세 영역의 역할 체크박스(super_admin / admin / content_admin / customer_admin)가 이를 갱신합니다.

### 5.2 처리 로직

1. 트랜잭션 시작
2. **삭제 먼저.** `delete_ids` 중 하나라도 **삭제 대상에 없는 자식을 가진 그룹**이면 rollback 후 400 응답("하위 메뉴가 있는 그룹은 삭제할 수 없습니다").  
   → 그룹을 지우면 `parent_id` FK 가 `ON DELETE SET NULL` 이라 자식이 조용히 최상위로 승격되기 때문입니다.
3. 통과하면 `DELETE FROM admin_menus WHERE id IN (...)`
4. 각 행 순회:
   - `name` 이 비면 건너뜀. `path` 가 비면 `NULL`(그룹 행)로 저장.
   - **`display_order` 는 부모(그룹) 단위로 1부터 매깁니다.** 전역 순번으로 매기면 그룹 간 순서가 뒤섞입니다.
   - `id` 있으면 `UPDATE admin_menus SET name, path, icon_class, display_order, parent_id, visible_roles, is_active WHERE id = ?`
   - `id` 없으면 `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)`
5. commit 후 `/admin/menus` 로 리다이렉트 (예외 시 rollback + 500)

---

## 6. DB 스키마 (admin_menus)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | 메뉴 ID |
| name | VARCHAR(50) NOT NULL | 메뉴명 |
| path | VARCHAR(255) NULL | 이동 URL. **NULL = 그룹 행(링크 없음)** |
| icon_class | VARCHAR(100) NULL | 아이콘 클래스 (Bootstrap Icons 등) |
| display_order | INT NOT NULL DEFAULT 0 | 같은 부모 안에서의 표시 순서 (오름차순) |
| parent_id | INT NULL FK → admin_menus.id | 부모 메뉴 ID (NULL = 최상위). `ON DELETE SET NULL` |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | 활성 여부 (0이면 사이드바에서 제외) |
| visible_roles | VARCHAR(100) NULL | 표시할 역할 CSV (`super_admin,admin` 등). NULL/빈 값 = 전체 |

---

## 7. 연동

### 7.1 사이드바 렌더 — `middleware/adminMenu.js`

- `SELECT * FROM admin_menus WHERE is_active = 1 ORDER BY display_order ASC, id ASC`
- `res.locals.adminMenuTree` : `[{ ...그룹, isGroup: true, children: [...] }, { ...최상위잎, isGroup: false, children: [] }]` — 사이드바 렌더용
- `res.locals.adminMenus` : 권한을 통과한 **잎 메뉴 평면 목록** (하위호환)
- 노출 규칙 (`isVisibleTo`):
  - `super_admin` 은 전부 노출
  - `visible_roles` 가 비었으면 전부 노출
  - 역할이 없으면 제한된 메뉴는 숨김
  - 그 외에는 `visible_roles` CSV 에 역할이 포함될 때만 노출
- 보이는 자식이 0인 그룹은 트리에서 제외합니다(빈 껍데기 방지).
- 조회 실패 시 예외를 삼키고 빈 배열을 넣습니다(관리자 화면이 통째로 죽지 않도록).

### 7.2 접근 제어 — `middleware/adminRoleGuard.js`

`requireMenuAccess(menuPath)` 를 `routes/admin.js` 의 각 서브라우트 마운트에 겁니다.

- 세션에 관리자가 없으면 `/admin/login` 리다이렉트
- `super_admin` 은 무조건 통과
- `SELECT visible_roles FROM admin_menus WHERE path = ? AND is_active = 1 LIMIT 1`
  - **행이 없으면**(메뉴 정의 없음 · 비활성) → `admin` 만 통과, 나머지는 403
  - `visible_roles` 가 비어 있으면 모든 운영자 통과
  - CSV 에 역할이 포함되면 통과, 아니면 403

> 즉 `is_active = 0` 으로 끄면 사이드바에서 사라질 뿐 아니라 **`admin` 미만 역할은 해당 URL 직접 접근도 차단**됩니다.

---

## 8. 주의사항

- **사이드바 노출(`adminMenu`)과 접근 제어(`requireMenuAccess`)는 서로 다른 코드**입니다. `visible_roles` 를 바꾸면 둘 다 바뀌지만, 라우트에 `requireMenuAccess` 를 걸지 않은 URL 은 메뉴를 숨겨도 직접 접근이 가능합니다.
- `path` 는 `requireMenuAccess` 의 조회 키입니다. **경로를 오타로 바꾸면 그 메뉴는 "정의 없음"이 되어 `admin` 외 역할이 403** 을 받습니다.
- 그룹 행의 `visible_roles` 는 비워 두세요. 그룹에 역할을 걸어도 `adminMenu` 는 그룹의 `visible_roles` 를 검사하지 않습니다(잎에만 적용).
- 하위 메뉴가 남아 있는 그룹은 삭제되지 않습니다(400). 먼저 자식을 다른 그룹으로 옮기거나 함께 삭제하세요.
- **새 관리자 화면을 추가하면 `admin_menus` 행도 함께 넣어야 합니다.** `routes/admin.js` 의 `requireMenuAccess('/admin/xxx')` 는 `path` 로 행을 찾으므로, 행이 없으면 `admin`·`super_admin` 외 역할이 전부 403 을 받습니다. 최근 추가된 행(브랜드·베스트/랭킹·쇼핑특가·특가 카테고리·상품 추천관리·아울렛·아울렛 카테고리·쇼핑라이브·커스텀 메뉴)이 모두 그래서 등록되어 있습니다.
- `/admin/outlet/categories`(id=55)처럼 **하위 경로도 별도 행**이 필요합니다. 다만 라우트 가드는 마운트 지점(`/admin/outlet`)에만 걸리므로, 이 행은 사이드바 링크 용도입니다.

---

*Last Updated: 2026-07-15*
