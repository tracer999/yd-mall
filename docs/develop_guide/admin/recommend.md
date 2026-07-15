# 상품 추천관리 (Recommend Groups)

## 1. 개요

**추천 그룹 하나 = `/recommend` 랜딩의 섹션 하나**입니다. 그룹명(`name`)이 섹션 제목, 설명(`description`)이 그 아래 **근거 문구**가 됩니다.

추천 화면의 본질은 목록이 아니라 **근거**입니다. 같은 상품이라도 "최근 보신 «홍삼정»과 함께 많이 본 상품"이라는 문구가 붙어야 베스트와 구별됩니다(`recommendService.js:9-12`).

> ⚠️ **이름이 비슷한 두 기능을 혼동하지 마세요.**
>
> | | 상품 추천관리 (이 문서) | 상품 추천 상품 관리 |
> |---|---|---|
> | 화면 | `/admin/recommend-groups` | `/admin/products` 상품 편집 안의 "추천 상품" API |
> | 테이블 | `recommend_group` / `recommend_group_item` | **`product_recommendations`** |
> | 의미 | GNB '추천' 메뉴 랜딩의 큐레이션 섹션 | **상품상세(PDP)의 "함께 보면 좋은 상품"** (item-to-item, 양방향 자동 등록) |
> | 관계 | GNB 추천 메뉴와 직결 | GNB 추천 메뉴와 **무관** (단, `/recommend` 개인화 섹션이 씨앗을 통해 간접 소비) |

- **Base URL:** `/admin/recommend-groups`
- **관련 테이블:** `recommend_group`, `recommend_group_item`, (참조) `products`, `recent_views`, `product_recommendations`
- **컨트롤러:** `controllers/admin/recommendGroupController.js`
- **서비스:** `services/recommend/recommendService.js`
- **뷰:** `views/admin/recommend-groups/list.ejs`, `edit.ejs` (등록·수정 공용)
- **고객 화면:** `/recommend` (`routes/recommend.js`, `controllers/recommendController.js`)
- **권한:** `admin_menus` id=53, parent_id=32(상품 관리), `visible_roles = super_admin,admin,content_admin`

> **`product_group` 과도 별개 테이블입니다.** 추천 그룹의 구성 방식은 **수동 선택 하나뿐**입니다. 조건 검색(뱃지·카테고리 자동 수집)은 이미 `product_group` 이 하고 있고, 추천 화면의 자동 섹션(MD 추천·지금 많이 보는)이 그 역할을 합니다. 여기는 **"운영자가 이름을 붙이고 손으로 고른 것"** 만 담습니다.

---

## 2. 라우트 (`routes/admin/recommend-groups.js`)

| 메서드 | URL | 핸들러 | 설명 |
|--------|-----|--------|------|
| GET | `/admin/recommend-groups` | getList | 그룹 목록 (담긴 수 / **노출 가능 수**) |
| GET | `/admin/recommend-groups/new` | getNew | 등록 폼 |
| POST | `/admin/recommend-groups` | postCreate | 등록 |
| GET | `/admin/recommend-groups/:id` | getEdit | 수정 폼 + 담긴 상품 |
| POST | `/admin/recommend-groups/:id` | postUpdate | 수정 |
| POST | `/admin/recommend-groups/:id/delete` | postDelete | 삭제 (아이템 CASCADE) |
| GET | `/admin/recommend-groups/:id/product-search` | getProductSearch | 상품 조회 팝업 (JSON) |
| POST | `/admin/recommend-groups/:id/items/bulk` | postAddItems | 여러 상품 담기 (AJAX) |
| POST | `/admin/recommend-groups/:id/items/reorder` | postReorderItems | 순서 변경 (AJAX) |
| POST | `/admin/recommend-groups/:id/items/:itemId/delete` | postRemoveItem | 상품 빼기 |

Express 5 는 `:id(\d+)` 를 지원하지 않아 `/new` 를 `/:id` 보다 먼저 선언하고 `requireNumericId` 로 숫자 검증합니다.

---

## 3. 관리자 화면

### 3.1 목록

`recommend_group` + 서브셀렉트 2개. 정렬 `sort_order ASC, id ASC`.

| 컬럼 | 의미 |
|------|------|
| `item_count` | 담긴 상품 수 |
| **`visible_count`** | 그중 **실제로 고객에게 보이는** 수 (`p.visibility='PUBLIC' AND p.status <> 'OFF'`) |

두 값을 나란히 보여주는 이유는 §3.3 과 같습니다.

### 3.2 그룹 폼

| name | 컬럼 | 비고 |
|------|------|------|
| name | `name` | **필수**, 100자. **섹션 제목으로 그대로 노출** |
| description | `description` | 200자. **제목 아래 근거 문구** (선택) |
| sort_order | `sort_order` | 0~9999. 추천 화면의 섹션 순서. 새 그룹은 맨 뒤(`MAX+1`) |
| is_active | `is_active` | 끄면 그 섹션이 추천 화면에서 사라짐 |

**`product_group` 과 달리 삭제·비활성 가드가 필요 없습니다** — `page_section` 이 `recommend_group` 을 참조하지 않기 때문입니다. 그룹을 끄면 그 섹션이 추천 화면에서 사라질 뿐입니다.

### 3.3 상품 큐레이션

- **담기(`postAddItems`, AJAX):** `product_ids[]` 를 받아 이 몰 소유 상품만 남기고, 이미 담긴 것은 **조용히 건너뜁니다**(`{ added, skipped }` 반환). 유니크 `uq_rgi_group_product` 가 최종 방어선입니다.
- **상품 조회 팝업(`getProductSearch`):** **검색어는 선택입니다** — 카테고리·브랜드 필터만으로도 조회할 수 있어야 합니다. 필터: `q`(name·product_code), `category_id`, `brand_id`, `in_stock`(y/n), `visibility`(PUBLIC/HIDDEN/MEMBER_ONLY). 이미 담긴 상품은 후보에서 제외. 최대 100건(`limited` 플래그).
- **순서(`postReorderItems`):** 드래그 순서를 1..N 으로 재기록(트랜잭션).
- **관리자 목록은 숨김 상품도 보여줍니다.** 고객 화면(`recommendService`)은 `PUBLIC` + 판매중만 그리므로, 숨김 상품을 담아 둔 운영자가 "왜 안 뜨지?"로 헤매지 않도록 **숨김 배지를 달아 그대로 노출**합니다(`recommendGroupController.js:59-63`).
- 모든 하위 조작은 `ownsGroup(groupId, mallId)` 로 몰 소유를 먼저 확인합니다(요청 위조 차단).

---

## 4. 고객 화면 `/recommend`

`recommendService.getLanding(mallId, userId)` 가 **4종 섹션**을 조립합니다. 섹션당 최대 **12건**(`SECTION_LIMIT`).

| # | 섹션 | key | 데이터 소스 | 근거 문구(reason) |
|---|------|-----|-------------|-------------------|
| ① | 회원님을 위한 추천 (개인화) | `personal` | `recent_views`(씨앗 5건) → `product_recommendations`(연관) | "최근 보신 «X»과 함께 많이 본 상품" |
| ② | 추천 그룹 (큐레이션) | `group:{id}` | `recommend_group` / `recommend_group_item` | `recommend_group.description` |
| ③ | MD 추천 | `md` | `products.product_badge` 에 `RECOMMEND` (`FIND_IN_SET`) | "MD가 직접 고른 상품" |
| ④ | 지금 많이 보는 상품 | `trending` | `products.view_count DESC` (`> 0`) | "최근 조회가 많은 상품" |

### 4.1 조립 순서 (중요)

**계산 순서와 화면 순서가 다릅니다** (`getLanding`, `recommendService.js:216-269`).

```
1) 추천 그룹을 먼저 계산  ← 화면에는 ② 자리에 놓지만 계산은 첫 번째
2) 개인화 (그룹 상품 제외)
3) 화면 배치: 개인화 → 그룹 → MD → 많이보는
4) 뒤 섹션은 앞 섹션에 나온 상품을 전부 제외 (seen Set)
```

**왜 그룹을 먼저 계산하는가:** 운영자가 손으로 담은 그룹은 온전히 보여주고, 알고리즘 섹션이 그 상품을 **피해가게** 하려는 것입니다. 반대로 하면 개인화가 집어간 상품이 큐레이션 그룹에서 조용히 빠집니다.

**그룹끼리는 서로 제외하지 않습니다** — 두 그룹에 같은 상품을 담았다면 그것은 운영자의 의도입니다.

### 4.2 개인화 섹션 (`getPersonalized`)

1. **씨앗:** `recent_views` 최신 5건 (로그인 필수)
2. **연관:** 그 씨앗들의 `product_recommendations.related_id`
3. **제외:** **본 상품 전부**(씨앗 5건이 아니라 `recent_views` 전체) + 추천 그룹에 이미 실린 상품. 이미 본 것을 다시 추천하면 "추천"이 아니라 "히스토리"입니다.
4. **정렬:** `FIELD(pr.product_id, …)` 로 **씨앗의 최신 순서**를 살립니다 — 가장 최근에 본 상품의 연관 상품이 위로 옵니다.
5. **폴백:** 연관 데이터가 0건이면 **씨앗 상품과 같은 카테고리의 인기 상품**(`view_count DESC`)으로 채우고, 근거 문구도 "최근 보신 «X»과 **비슷한** 상품"으로 바뀝니다(`isCategoryFallback`).

> ⚠️ `product_recommendations` 는 **PDP 용 item-to-item 데이터**입니다. 기준 상품 없이 단독으로 목록을 만들 수 없습니다. 여기서는 **씨앗을 통해서만** 씁니다.

**비로그인:** 개인화 섹션 자리를 **베스트 복제로 채우지 않습니다.** 그러면 추천 메뉴가 베스트와 구별되지 않습니다. 대신 **로그인 CTA** 를 그 자리에 둡니다(뷰에서 처리).

### 4.3 노출 재검증 · 폴백 · SEO

- **렌더 시점 재검증:** 담긴 `product_id` 를 그대로 믿지 않습니다. 담은 뒤에 상품이 숨김·판매중지로 바뀔 수 있으므로 조회할 때마다 `p.visibility='PUBLIC' AND p.status <> 'OFF'` + `mall_id` 로 다시 거릅니다. **저장된 목록을 신뢰하면 숨긴 상품이 추천에 뜹니다.** 담긴 상품이 전부 숨겨졌으면 빈 섹션을 그리지 않습니다.
- **0건 폴백:** 전 섹션이 비면 `COMING_SOON.recommend` 준비중 랜딩 (`recommendController.js:26`).
- **`noindex,follow`** — 개인화 결과가 섞이는 화면이라 색인 대상이 아닙니다.
- **특가:** 전 섹션을 `CARD_COLS`(정가)로 뽑은 뒤 표시 직전에 `dealSvc.applyDeals()` 로 덮습니다(`recommendService.js:267`).
- **라우팅 주의:** `/recommend` 는 `routes/feature.js` 안에 두면 안 됩니다. `featureRoutes` 가 `app.js` 에서 `'/'` 에 **먼저** 마운트되므로, 거기에 `router.get('/recommend')` 를 두면 뒤에 오는 `app.use('/recommend', ...)` 가 영영 닿지 못합니다.

### 4.4 협업 필터링을 하지 않는 이유

주문 22건 · 좋아요 11건(2026-07 실측)으로 만든 추천은 추천이 아니라 난수입니다. 데이터가 쌓이면 규칙형 → 개인화형으로 올립니다(설계문서 §4-1).

---

## 5. DB

### 5.1 `recommend_group`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint PK | |
| mall_id | bigint | |
| name | varchar(100) NOT NULL | **섹션 제목으로 그대로 노출** |
| description | varchar(200) | **제목 아래 근거 문구**(선택) |
| sort_order | int | 추천 화면에서의 섹션 노출 순서 |
| is_active | tinyint(1) | 0 이면 섹션이 사라짐 |

인덱스: `idx_rg_mall_active (mall_id, is_active, sort_order)`
**현재 데이터 0행** — 아직 운영 그룹이 없습니다.

### 5.2 `recommend_group_item`

`id`, `recommend_group_id`(FK **ON DELETE CASCADE**), `product_id`(int — **FK 없음**), `sort_order`
유니크: `uq_rgi_group_product (recommend_group_id, product_id)`

### 5.3 (참조) `product_recommendations` — **다른 기능**

`product_id`(기준), `related_id`(추천), `display_order`. 유니크 `uq_recommendation (product_id, related_id)`, 양쪽 FK CASCADE.
`/admin/products` 에서 관리하며 **상품상세의 "함께 보면 좋은 상품"** 입니다. 등록 시 역방향(`related_id → product_id`)도 함께 `INSERT IGNORE` 합니다(`controllers/admin/productController.js:472-478`).

---

## 6. 주의사항

- **`/admin/products` 의 "추천 상품 관리"와 다른 기능입니다.** 그쪽은 `product_recommendations`(상품상세 연관상품)이고 GNB 추천 메뉴와 무관합니다. 이 문서의 추천 그룹은 `recommend_group` 입니다. 이름 때문에 자주 혼동됩니다.
- **`recommend_group_item.product_id` 에 FK 가 없습니다.** 상품을 삭제해도 아이템 행이 남습니다. 다만 조회가 `JOIN products` + `VISIBLE` 이라 화면에는 안 뜹니다(고아 행이 조용히 쌓입니다).
- **관리자 화면과 고객 화면의 노출 기준이 다릅니다.** 관리자는 숨김 상품도 보여주고(배지 표시), 고객은 `PUBLIC` + 판매중만 봅니다. 목록의 `item_count` vs `visible_count` 차이가 그 신호입니다.
- **그룹이 0개여도 `/recommend` 는 뜹니다** — MD 추천·지금 많이 보는 상품이 채웁니다. 전 섹션이 0건일 때만 준비중 랜딩입니다.
- **섹션당 12건이 상한입니다**(`SECTION_LIMIT`). 그룹에 30개를 담아도 앞 12개만 나옵니다. 페이지네이션·더보기가 없습니다.
- **몰 스코프.** `recommend_group_item` 에는 `mall_id` 가 없습니다. 반드시 `ownsGroup(groupId, mallId)` 로 부모를 먼저 확인하세요.
- **미구현:** 규칙형 추천(`rule_json` — 조건 기반 자동 수집), 추천 랜딩 최상단 배너 슬롯(`group_key='menu:RECOMMEND'` — 계획에는 있었으나 코드에 없습니다), 협업 필터링.

---

*Last Updated: 2026-07-15*
