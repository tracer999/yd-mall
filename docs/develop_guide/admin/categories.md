# 카테고리 관리 (Categories)

## 1. 개요

- **Base URL:** `/admin/categories`  
- **관련 테이블:** `categories`, `navigation_config` (뎁스 상한), `products` (상품수 집계)  
- **컨트롤러:** `controllers/admin/categoryController.js`  
- **가드:** `services/tree/depthGuard.js`  
- **뷰:** `views/admin/categories/list.ejs` (범위 탭 + 목록 + 등록 모달 + 행별 인라인 수정 폼)

이 화면은 **상품 카테고리(`type='NORMAL'`) 전용**입니다. 브랜드(`type='BRAND'`)는 **브랜드 관리(`/admin/brands`)로 이관**했습니다 — 브랜드 1,401건이 같은 화면에 얹히면 부모 후보 JSON·DOM 이 함께 터지고, 브랜드 전용 속성(`brand_profile`)은 어차피 그쪽에서 편집해야 했습니다.

계층은 `parent_id` 자기참조(최대 3뎁스)입니다. 탭은 분류축이 아니라 **범위(scope)** 입니다.

| scope | 대상 | 렌더 |
|---|---|---|
| `used` (기본) | 편집 몰에 상품이 있는 카테고리 + 경로 유지용 조상 | 뎁스별 아코디언 트리, **최상위 서브트리 단위** 페이징 |
| `all` | 빈 카테고리 포함 전체 | **평면 목록 + 경로 문자열**, 행 단위 페이징 |

편집 대상 몰(`req.adminMallId`, `middleware/adminMallContext.js`) 기준으로 상품수·`used` 판정·몰별 표시가 계산됩니다.

---

## 2. 라우트 및 동작

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/categories` | getList | 범위별 목록 + 등록 모달 (`?scope=used\|all`, `?page=`, `?error=`) |
| POST | `/admin/categories/add` | postAdd | 카테고리 추가 (multipart, `upload.single('logo_image')`) |
| POST | `/admin/categories/edit` | postEdit | 카테고리 수정 (multipart, `upload.single('logo_image')`) |
| POST | `/admin/categories/delete` | postDelete | 카테고리/브랜드 삭제 |
| POST | `/admin/categories/visibility` | postVisibility | `is_active` 일괄 저장 |
| POST | `/admin/categories/mall-visibility` | postMallVisibility | 몰별 표시 override 토글(1건) |

- `logo_image` 는 `middleware/upload.js` 규칙에 따라 `public/uploads/brands/` 에 저장되고 `/uploads/brands/<파일명>` 으로 기록됩니다.
- `?showEmpty=1` (구 링크)는 `scope=all` 로 흡수합니다.

### 2.1 return_url — 브랜드 관리와 공유하는 엔드포인트

`delete` · `visibility` · `mall-visibility` 세 개는 **브랜드 관리(`/admin/brands`) 화면도 그대로 사용**합니다. 좁은 컬럼만 만지거나(`is_active`) 별도 테이블이라 브랜드에도 안전하고, `postDelete` 는 read-then-guard 라 컬럼 클로버가 없기 때문입니다.

- 폼이 `return_url` hidden 을 실어 보내면 `backUrl(req)` 가 그리로 리다이렉트합니다. **오픈 리다이렉트 방지** — `/admin/` 으로 시작하는 내부 경로만 허용하고, 아니면 `/admin/categories?scope=<scope>` 로 폴백합니다.
- `fromBrandScreen(req)` 이 `return_url` 을 보고 삭제 실패 안내 문구를 "카테고리" / "브랜드" 로 가릅니다.
- 반대로 **`add` · `edit` 은 공유하지 않습니다.** 브랜드는 `brandController.postAdd` / `postInlineEdit` 전용 핸들러를 씁니다 (§5 하단 참고).

---

## 3. 목록 조회 (GET /admin/categories)

- **쿼리:** `SELECT * FROM categories WHERE type = 'NORMAL' AND mall_id IN (0, ?) ORDER BY display_order ASC, id ASC`  
- **상품수:** `products` 를 `category_id` 로 GROUP BY 하여 카테고리별 상품수(`productCount`)를 붙입니다(편집 몰 한정).  
- **트리 구성:** `flattenTree()` 가 부모 → 자식 순으로 평탄화하며 `_depth`(1부터)를 부여합니다. 정렬 기준은 `display_order`, 동률은 `id`. **트리는 요청당 1회만** 만듭니다.  
- **used 판정:** `productCount > 0` 인 노드에서 조상 방향으로 거슬러 올라가며 `keep` 집합을 채웁니다(경로 보존). `scopeCounts = { used: keep.size, all: rows.length }` 는 탭 배지용으로 scope 와 무관하게 항상 계산합니다.  
- **경로(`parentPath`):** `nameById` + `parentOf` 로 조상 이름을 이어 `"건강식품 > 홍삼"` 형태로 만듭니다(all 탭 전용 컬럼).  
- **테이블 컬럼(used):** 순서 · 이미지(1뎁스만) · 이름 · 간략 설명(1뎁스만) · 상위 카테고리 · 사용 여부 · 이 몰 표시 · 상품수 · 관리  
- **테이블 컬럼(all):** 순서 · 이름 · **경로** · 사용 여부 · 이 몰 표시 · 상품수 · 관리  
- **수정:** 각 행이 자체 `/admin/categories/edit` POST 폼(multipart)이며 `form="cat-form-<id>"` 로 셀 전반의 input 을 묶습니다.

> ⚠️ **all 탭의 hidden 보존이 필수입니다.** `postEdit` 의 UPDATE 는 "보내지 않은 컬럼은 지운다" 계약이라, 위젯이 없는 `existing_logo` · `description` · `parent_id` · `pc_visible` · `mobile_visible` 을 hidden 으로 되돌려 보내지 않으면 수정할 때마다 그 값들이 NULL/0 으로 덮입니다.

### 3.1 페이지네이션

| scope | 단위 | 상수 | 이유 |
|---|---|---|---|
| `used` | 최상위(1뎁스) + 그 서브트리 전체 | `TOP_PER_PAGE = 100` | 아코디언 정합성 — 서브트리가 페이지 경계에서 쪼개지면 안 됨 |
| `all` | 행 | `FLAT_PER_PAGE = 100` | 최상위가 12개인데 3뎁스가 2,094개(몰2)라 서브트리 단위로는 전량이 1페이지에 들어옴 |

`pageInfo = { page, totalPages, total, perPage, unit }`. `unit` 은 화면에 "대분류/카테고리 전체 N개 중 …" 으로 찍습니다.

> **느림의 원인은 쿼리가 아니라 DOM 이었습니다.** 구 화면은 브랜드 1,401 + 카테고리 2,348 행을 한 번에 그려 응답이 수십 MB 로 불어났습니다(코드 주석의 18MB/70초 사건). 브랜드 분리 + `type='NORMAL'` 스코프 + all 탭 평면화로 최악 케이스가 1.8MB/0.35초 수준이 됩니다.

- 페이징 링크는 `scope` 를 캐리합니다. 구 화면은 `?tab=&page=` 만 실어 `showEmpty` 가 유실됐습니다(다음 페이지를 누르면 "상품 있는 것만" 으로 리셋).

### 3.2 상위 카테고리 선택지 (parentOptions)

- 1벌만 만들어 뷰에 넘기고, 클라이언트가 select focus 시점에 자기/후손을 걸러 씁니다(노드마다 만들면 O(n³)).  
- 후보는 `depth <= maxDepth - 1` 인 노드뿐입니다(NORMAL 만이므로 mall2 기준 254건). 자기/후손 제외는 UX 편의이고, 실제 방어는 서버의 `wouldCreateCycle` / `assertDepthAllowed` 가 합니다.

---

## 4. 카테고리 추가 (POST /admin/categories/add)

- **파라미터:** `name` (필수), `type` (NORMAL/BRAND, 그 외는 NORMAL), `scope`, `return_url`, `parent_id` (없으면 최상위), `display_order` (비우면 같은 type·몰의 MAX+1), `description`, `logo_image` (파일), `is_active` / `pc_visible` / `mobile_visible` (기본 1)  
- **검증 순서:**
  1. `assertSameType()` — 상위 카테고리는 **같은 type 안에서만** 지정 가능
  2. `depthGuard.assertDepthAllowed({ parentId })` — 부모.depth + 1 이 상한을 넘으면 `DepthLimitError`(400)
- **동작:** `INSERT INTO categories (mall_id, name, display_order, type, logo_image_path, description, parent_id, depth, is_active, pc_visible, mobile_visible)`  
- **Shopify:** THEME 이 아니면 `syncCategoryById()` 를 백그라운드로 호출(현재 비활성이라 스킵)  
- **성공 시:** `backUrl(req, { saved: 1 })` — `return_url` 또는 `/admin/categories?scope=<scope>`

> 체크박스는 `hidden value=0` + `checkbox value=1` 쌍으로 전송합니다(JS 없이도 해제가 전달되도록). `toBool()` 이 마지막 값을 실제 선택으로 봅니다.

---

## 5. 카테고리 수정 (POST /admin/categories/edit)

- **파라미터:** `id`, `name`, `display_order`, `type`, `scope`, `return_url`, `parent_id`, `description`, `existing_logo` (기존 로고 유지), `logo_image` (새 파일), `is_active` / `pc_visible` / `mobile_visible`  
- **부모가 바뀐 경우에만** 다음 3단계를 수행합니다:
  1. `assertSameType()` — 같은 type 안에서만
  2. `depthGuard.wouldCreateCycle({ nodeId, candidateParentId })` — 자기 자신/자기 후손을 부모로 지정하면 차단
  3. `depthGuard.assertDepthAllowed({ parentId })` — 이동 후 뎁스 상한 검사
- **동작:** 트랜잭션 안에서 `UPDATE categories SET name, display_order, type, logo_image_path, description, parent_id, is_active, pc_visible, mobile_visible WHERE id = ?` 후, 부모가 바뀌었으면 `depthGuard.recalcSubtreeDepth({ nodeId })` 로 **자신 + 모든 후손의 depth 를 BFS 재계산**합니다. 재계산 중 상한을 넘으면 예외 → 롤백.  
- **Shopify:** THEME 이 아니면 `syncCategoryById()` 백그라운드 호출  
- **성공 시:** `return_to=detail` 이면 상세로, 아니면 `backUrl(req, { saved: 1 })`  

> **브랜드는 이 핸들러를 쓰지 않습니다.** 전(全)컬럼 UPDATE 계약이 위험하고, 브랜드는 전부 1뎁스라 뎁스·순환·서브트리 재계산을 하나도 쓰지 않습니다. `brandController.postInlineEdit` 이 `name` · `display_order` · `onboarded_at` · `is_active` · `logo_image_path`(COALESCE) 만 좁게 갱신합니다.

---

## 6. 카테고리 삭제 (POST /admin/categories/delete)

- **파라미터:** `id`, `return_url`, `scope`  
- **가드 (중요):** `SELECT COUNT(*) FROM categories WHERE parent_id = ?` 가 0보다 크면 **삭제를 차단**하고 `"하위 카테고리 N개가 있어 삭제할 수 없습니다…"` 로 리다이렉트합니다.  
  `categories.parent_id` FK 는 `ON DELETE SET NULL` 이라, 막지 않으면 부모 삭제 시 자식들이 **조용히 최상위로 승격되고 `depth` 가 어긋난 채 남습니다**. 이것이 차단하는 이유입니다.  
- **동작:** `deleteCategoryFromShopify(id)` (DB 삭제 전, `shopify_collection_id` 를 읽어야 하므로) → `DELETE FROM categories WHERE id = ?`  
- **가드 2:** 전 몰 통틀어 `products.category_id` / `brand_category_id` 참조가 있으면 차단합니다(FK 가 `ON DELETE SET NULL` 이라, 막지 않으면 타몰 참조가 조용히 풀립니다).  
- **성공 시:** `backUrl(req, { saved: 1 })` — 브랜드 화면에서 왔으면 `/admin/brands` 로 복귀  
- **참고:** 상품이 해당 카테고리를 참조하면 `products.category_id` / `brand_category_id` / `theme_category_id` FK 가 모두 `ON DELETE SET NULL` 이라 상품은 남고 참조만 끊깁니다.

---

## 7. 계층 가드 (services/tree/depthGuard.js)

`parent_id` 자기참조 구조는 뎁스가 무제한이므로, 최대 뎁스는 **앱 레이어에서 강제**합니다(MySQL CHECK 로는 "부모.depth + 1" 같은 동적 검증이 불가능). `depth` 는 캐시 컬럼으로 물리 저장하며, 부모가 바뀌면 후손까지 재계산해야 합니다.

- **상한:** `navigation_config.category_max_depth` (몰별, 없으면 **3**) — `getCategoryMaxDepth(mallId)`
- **type 은 뎁스가 아니라 병렬 분류축**입니다. 뎁스 제한은 각 type 트리 내부에서 독립 적용되고, 부모는 같은 type 안에서만 고를 수 있습니다.

| 위험 | 막지 않으면 | 가드 |
|------|-------------|------|
| 뎁스 초과 | 4단계 이상 생성 | `assertDepthAllowed({ parentId })` — 부모.depth + 1 > 상한이면 `DepthLimitError`(statusCode 400). 최상위(parentId 없음)는 depth 1 반환 |
| 순환 참조 | `recalcSubtreeDepth` BFS 가 DB 를 오염시킨 뒤 예외 | `wouldCreateCycle({ nodeId, candidateParentId })` — 후보 부모에서 위로 거슬러 올라가 자신을 만나면 true. **UPDATE 전에** 호출 |
| 부모 삭제 | `ON DELETE SET NULL` 로 자식이 조용히 최상위 승격 + depth 불일치 | 자식이 있으면 삭제 차단 (`postDelete`) |

- 보조 함수: `maxParentDepth()` (부모가 될 수 있는 최대 depth = 상한 − 1), `recalcSubtreeDepth()` (BFS 로 자신+후손 depth 갱신, 상한 초과 시 `DepthLimitError`)
- 대상 테이블은 화이트리스트(`ALLOWED_TABLES`)로 제한합니다(식별자 SQL 인젝션 방지).

---

## 8. DB 스키마 (categories)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK AUTO_INCREMENT | 카테고리 ID |
| mall_id | BIGINT NOT NULL DEFAULT 1 | 몰 ID (멀티몰) |
| name | VARCHAR(50) NOT NULL | 카테고리명 |
| slug | VARCHAR(255) NULL | URL 슬러그 |
| display_order | INT DEFAULT 0 | 노출 순서 |
| parent_id | INT NULL, Self FK (`ON DELETE SET NULL`) | 상위 카테고리 |
| depth | INT NOT NULL DEFAULT 1 | 계층 뎁스 (1~3, 최상위=1) — 캐시 컬럼 |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | 노출 여부 |
| pc_visible | TINYINT(1) NOT NULL DEFAULT 1 | PC 노출 |
| mobile_visible | TINYINT(1) NOT NULL DEFAULT 1 | 모바일 노출 |
| type | ENUM('NORMAL','THEME','BRAND') NOT NULL DEFAULT 'NORMAL' | 분류축 (상품 / 테마 / 브랜드) |
| logo_image_path | VARCHAR(255) NULL | 브랜드 로고·카테고리 이미지 경로 |
| description | VARCHAR(255) NULL | 간략 설명 (NORMAL 1뎁스 메가메뉴용) |
| shopify_collection_id | VARCHAR(100) NULL | Shopify 컬렉션 ID (연동 비활성) |

> `tables.sql` 에는 위 컬럼 일부(`shopify_collection_id` 등)가 정의돼 있지 않습니다(스키마 드리프트). 운영 DB 기준은 위 표입니다.

---

*Last Updated: 2026-07-23*
