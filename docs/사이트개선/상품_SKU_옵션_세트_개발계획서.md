# 상품·SKU·옵션·세트 개발 계획서

> **짝 문서**: 설계는 [`쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md`](./쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md) Part 2(§24~30). 이 문서는 그 설계를 **실제 개발 순서·산출물·검증**으로 옮긴 실행 계획이다.
> **범위**: 내부 상품·SKU·옵션·복합상품 + 장바구니·주문·재고 경로. **Shopify 연동은 제외**(비활성).
> **환경 전제**: 전 과정 개발 단계. DB 는 `yd_mall @ ydata.co.kr` 로컬·서버 공용 한 벌. 비파괴 증분으로 진행해 각 Phase 후 앱이 정상 동작해야 한다.

---

## 0. 원칙

1. **비파괴 우선** — 기존 컬럼/경로를 지우지 않고 추가한다. `products.price/stock/purchase_price` 는 대표 SKU **단방향 미러**로 유지, Phase 6에서만 강등. **`products.status` 는 유지**(상품 생명주기 게이트, SKU 로 내리지 않음).
2. **한 Phase = 배포 가능한 단위** — 각 Phase 끝에서 스모크 통과해야 다음으로.
3. **DB 변경은 `.sql` 파일 + `mysql` CLI 적용** — 프로젝트 규칙(mysql-client 사용). 스키마 변경은 `scripts/migrations/` 에 `.sql` 로 남기고 `tables.sql` 드리프트를 같이 줄인다.
4. **대표 SKU 단일 진실** — 단일상품/복합상품 모두 `is_default=1` SKU 1행 보장. 상품당 대표 SKU는 유일.
5. **읽기 헬퍼로 흡수** — SKU 조회를 서비스 계층(`services/catalog/skuService.js` 신설)로 모아, 컨트롤러 산개를 막는다.
6. **재고 정본은 `product_sku.stock` 하나** — 아래 §0.1 의 규칙을 모든 Phase가 따른다.

### 0.1 재고 모델 (정본 규칙)

```
product_sku.stock
  └─ 재고 정본 — 판매가능 판정 · 주문 검증 · 주문 차감 · 장바구니 수량 제한 · 목록/상세/검색 노출

products.stock
  └─ 대표 SKU(is_default=1) 미러 — 하위호환·폐기 전 읽기 폴백 전용
```

**`products.stock` 을 "전 SKU 합계"로 갱신하지 않는다.** 폐기 예정 컬럼에 새 의미를 부여하면 옵션 재고가 바뀔 때마다 동기화할 자리가 늘어난다. 방향은 언제나 반대다 — 읽는 쪽을 SKU 로 옮기고 컬럼은 버린다.

따라서 **상품 11063 처럼 `products.stock=0` 인데 옵션 SKU 합이 39,875 인 상태는 OPTION 상품에서 정상이다.** 잘못된 것은 그 값을 품절 판단에 쓰는 코드다.

**어떤 재고를 어디에 쓰는가** — 이 구분이 이 문서에서 가장 중요하다.

| 사용 위치 | 기준 재고 |
|---|---|
| 상품 카드·목록·검색 품절 표시 | 판매가능 SKU **합계** (`eff_stock`) |
| 상품 상세 전체 품절 여부 | 판매가능 SKU **합계** |
| JSON-LD `availability` | 판매가능 SKU가 **하나라도** 있는가 |
| 옵션별 품절 표시 | **개별** SKU 재고 |
| 장바구니 수량 변경 | 장바구니 행에 선택된 **그 SKU** 재고 |
| 주문 검증·차감 | 선택된 **그 SKU** 재고 |

> ⚠️ **합계를 쓰면 안 되는 자리에 합계를 쓰면 조용히 깨진다.** 빨강/M 재고 0 · 파랑/L 재고 100 인 상품에서 사용자가 빨강/M 을 담았는데 수량 제한을 합계(100)로 걸면, 장바구니에서는 통과하고 **주문 검증 단계에서 실패**한다.

### 0.2 `eff_stock` 정의 (이 저장소 실제 스키마 기준)

`product_sku` 에는 `is_active`·`deleted_at`·`reserved_stock`·`safety_stock` 컬럼이 **없다.** 판매가능 플래그는 `status ENUM('ON','OFF')` 이고, `stock_managed=0` 은 재고를 자기가 들고 있지 않은 SKU(복합상품 대표 SKU)다. 그래서 정의는 다음과 같다.

```sql
COALESCE((
    SELECT SUM(GREATEST(ps.stock, 0))
      FROM product_sku ps
     WHERE ps.product_id = p.id
       AND ps.status = 'ON'          -- 판매 중지된 SKU 는 판매가능 재고가 아니다
       AND ps.stock_managed = 1      -- 복합상품 대표 SKU 는 자기 재고가 없다
), 0) AS eff_stock
```

- **복합상품(BUNDLE/SET/GIFT_SET/BUILD_SET)** 은 전 SKU 가 `stock_managed=0` 이라 위 식이 항상 0 이다. 파생 가용수량(`compositeService.getAvailableQty`)으로 **덮어써야** 한다. 목록 쿼리 한 방으로는 못 구하므로 서비스 헬퍼가 담당한다.
- 예약재고·안전재고 개념은 현재 없다. 생기면 이 식 **한 곳만** 고치면 되도록 `eff_stock` 이라는 이름 뒤에 숨긴다.

> ⚠️ **이름 충돌.** `controllers/admin/productController.js` 의 관리자 목록이 이미 `eff_stock` 이라는 이름을 **다른 뜻**(status·stock_managed 무관 전 SKU 물리 합계)으로 쓰고 있다. Phase 8에서 관리자 쪽을 `total_stock` 으로 개명하고 `eff_stock` 은 위 정의로 통일한다.

---

## 1. 산출물 맵 (신설/수정 파일)

| Phase | 신설 | 수정 |
|---|---|---|
| 0 스키마 | `scripts/migrations/2026xx_sku_phase0.sql` | `tables.sql` |
| 1 백필 | `scripts/migrations/2026xx_sku_phase1_backfill.sql` | — |
| 2 읽기 | `services/catalog/skuService.js` | `controllers/productController.js`, `controllers/admin/productController.js`, 관련 목록/상세 뷰 |
| 3 쓰기·옵션 | `services/catalog/optionService.js`, `services/catalog/skuResolver.js` | `controllers/cartController.js`, `controllers/checkoutController.js`, `services/order/orderCancelService.js`, `controllers/admin/productController.js`(옵션 CRUD), 상품 등록/상세 뷰, `carts`/`order_items` 마이그레이션 |
| 4 복합상품 | `services/catalog/compositeService.js`, `scripts/migrations/2026xx_sku_phase4.sql` | 관리자 상품 등록(복합 유형), 재고차감(구성 SKU), 상세/장바구니 재고 표기 |
| 5 카테고리 옵션 | `services/catalog/categoryOptionService.js`, `scripts/migrations/2026xx_sku_phase5.sql` | 관리자 카테고리·상품 등록화면(추천 옵션) |
| 6 폐기 | — | 레거시 컬럼 참조 제거, 문서화 |
| 8 재고 읽기 정합 | `scripts/migrations/2026xx_sku_phase9_backfill.sql`(9와 공용) | `services/catalog/skuService.js`(`getTotalStock`·`decorateEffStock`), `controllers/productController.js`, `controllers/cartController.js`, `controllers/checkoutController.js`, `controllers/admin/productController.js`(개명), 관리자 상품선택 팝업 5개 컨트롤러(deal·category·recommendGroup·productGroup·brand), `views/partials/product_card.ejs`, `views/user/products/{list,detail}.ejs`, `views/user/search.ejs`, `views/user/outlet/list.ejs` |
| 9 불변식 가드 | (위 백필 SQL) | `services/mall/sampleSeeder.js` |

---

## 2. Phase별 상세

### Phase 0 — 스키마 추가 (무중단)

**목표**: 설계 §26 의 신규 테이블·컬럼을 전부 생성. 앱 동작 변화 0.

**작업**
- [ ] `product_sku`, `option_definition`, `option_value_definition`, `category_option`, `product_option`, `product_option_value`, `sku_option_value`, `product_attribute`, `composite_component` 생성
- [ ] `products` 에 `product_type ENUM(...) DEFAULT 'SINGLE'` 추가
- [ ] `carts.sku_id`, `order_items.sku_id`·`option_snapshot` 추가(컬럼만, 아직 미사용)
- [ ] `tables.sql` 에 동일 반영(드리프트 축소)

**검증**
- `SHOW TABLES` 로 9개 신규 테이블 확인, `DESC products` 에 `product_type` 확인
- 앱 기동 + 라우트 스모크(`/`, `/products`, `/admin/products`) 200

**리스크**: 없음(순수 추가). FK 대상 `products.id` INT 정합만 확인.

---

### Phase 1 — 백필 (기존 상품 → 대표 SKU)

**목표**: 상품 전건에 `is_default=1` SKU 1행 생성. 데이터 정합.

**작업**
- [ ] `INSERT INTO product_sku ... SELECT ... FROM products WHERE NOT EXISTS(대표 SKU)` (설계 §29 Phase 1 SQL — 재실행 안전)
- [ ] SKU status 는 `IF(products.status='OFF','OFF','ON')` 로만 세팅(5값 뭉갬 금지). `products.status` 는 원천 유지
- [ ] 검산: `SELECT COUNT(*) FROM products` == `SELECT COUNT(*) FROM product_sku WHERE is_default=1`
- [ ] 상품당 대표 SKU 유일성: `is_default=1` 이 product_id별 1행인지 확인

**검증**
- 카운트 일치, 가격/재고 표본 비교(상품 10건 `products.price/stock` == 대표 SKU)
- **status 회귀 확인**: `COMING_SOON`·`RESTOCK` 상품이 구매가능으로 바뀌지 않음(products.status 게이트 유지)

**리스크**: 재실행 시 중복 INSERT → `WHERE NOT EXISTS` 가드 SQL에 내장.

---

### Phase 2 — 읽기 경로 SKU 우선 (미러 유지)

**목표**: 조회를 대표 SKU 기준으로. 쓰기는 아직 products 미러 동기화.

**작업**
- [ ] `services/catalog/skuService.js`: `getDefaultSku(productId)`, `getSkusByProduct(productId)`, 가격/재고 조회 헬퍼
- [ ] 상품 목록/상세 조회에서 재고·가격을 대표 SKU 로(폴백: products 컬럼)
- [ ] 관리자 상품 저장 시 대표 SKU → products **단방향 미러** 유틸(SKU 가 원천). 레거시 products 직접 쓰기는 전환기 폴백만

**검증**: 목록/상세 가격·재고가 이전과 동일하게 보임(회귀 없음). SKU 값을 직접 바꾸면 화면 반영.

**리스크**: 미러 불일치 → 쓰기 경로를 미러 유틸 하나로 통일(단방향, SKU→products).

---

### Phase 3 — 쓰기 경로 SKU 기준 + 옵션상품

**목표**: 장바구니·주문·재고차감을 SKU 기준으로. 옵션상품(색상/사이즈) 등록·구매 가능.

**작업**
- [ ] `optionService.js`: 상품 옵션/옵션값 CRUD, 조합 → SKU 생성(카테시안)
- [ ] `skuResolver.js`: (productId, 선택 옵션값들) → sku_id 해석 + 재고/가격
- [ ] `cartController.js`: 담기 시 `sku_id` 저장(옵션상품 필수, 단일상품은 대표 SKU 자동)
- [ ] `checkoutController.js`: 재고 검증·차감을 `product_sku.stock` 기준으로(`:166` 대체)
- [ ] `orderCancelService.js`: 복원을 SKU 기준으로(`:64` 대체)
- [ ] `order_items` 저장 시 `sku_id`·`option_snapshot` 기록
- [ ] 관리자 상품 등록/수정 뷰: 옵션 정의 + SKU별 가격/재고 그리드
- [ ] 상품 상세 뷰: 옵션 선택 UI → 선택 조합으로 sku/재고/가격 갱신

**검증(핵심 회귀)**
- 단일상품: 담기→결제→`product_sku.stock` 차감, 취소→복원
- 옵션상품: 옵션 선택→해당 SKU 재고 차감(다른 SKU 무영향)
- 품절 SKU 선택 차단

**리스크**: 동시 주문 재고 정합 → 결제 트랜잭션 내 `SELECT ... FOR UPDATE`. 기존 카트(sku_id NULL) → 대표 SKU 폴백.

---

### Phase 4 — 복합상품(묶음/세트/기획)

**목표**: 구성 SKU 참조 복합상품. 재고 파생 + 구성 SKU 차감.

**작업**
- [ ] `compositeService.js`: 구성 CRUD, 가용수량 = `min(floor(구성재고/필요수량))`(설계 §27)
- [ ] 관리자: 상품 유형 BUNDLE/SET/GIFT_SET 등록, 구성 SKU 검색·수량 입력, 대표 SKU `stock_managed=0`
- [ ] 재고차감: 복합상품 주문 시 대표 SKU 미차감, **구성 SKU 각각** `qty×구성수량` 차감
- [ ] 상세/장바구니 재고 표기를 파생 가용수량으로

**검증**
- 세트 주문 시 구성 SKU 전부 차감, 취소 시 전부 복원
- 구성 중 하나 품절이면 세트 가용수량 0
- 구성 SKU 삭제 차단(RESTRICT)

**리스크**: 부분 취소/클레임 시 구성 단위 역산. → 주문 시점 구성 스냅샷(수량) 저장 검토.

---

### Phase 5 — 카테고리 옵션 템플릿 (추천·상속)

**목표**: 등록화면 추천 옵션. 강제 아님, 상위→하위 상속(§8).

**작업**
- [ ] `option_definition`·`option_value_definition` 표준 사전 시드(색상/사이즈/용량/수량/향/맛…)
- [ ] `categoryOptionService.js`: 카테고리 옵션 매핑 CRUD + 조상 상속 병합
- [ ] 관리자 카테고리 화면: 추천 옵션 지정(필수/추천/직접입력/상속)
- [ ] 상품 등록화면: 카테고리 선택 시 추천 옵션 프리필(판매자 가감 가능, 확정 시 product_option 으로 스냅샷)

**검증**: 카테고리 지정→하위 카테고리 상품 등록화면에 상속 옵션 노출, 템플릿 변경이 기존 상품에 자동 반영 안 됨(§11).

**리스크**: 3뎁스 상속 병합 성능/중복. → depth ≤3 고정이라 조상 조회 소량.

---

### Phase 6 — 레거시 폐기

**목표**: `products.price/stock/status/purchase_price` 를 미러/읽기 폴백 전용으로 강등.

**작업**
- [ ] 신규 쓰기 경로에서 products 재고/가격 직접 UPDATE 제거(대표 SKU만)
- [ ] products 컬럼은 물리 삭제하지 않고 미러로만 유지, 문서에 "읽기 폴백" 명시
- [ ] 잔존 직접 참조 grep 정리

**검증**: 전 구매·재고 경로가 SKU만으로 동작. products 컬럼 수정 없이도 재고 정상.

---

### Phase 8 — 재고 **읽기** 경로 정합 (`eff_stock` 도입)

**배경**: Phase 3·6 에서 **쓰기**(차감·복원·검증)는 SKU 기준으로 옮겼지만, **읽기**(표시·수량제한)는 `products.stock` 을 그대로 보는 자리가 남았다. 옵션상품은 `products.stock` 이 구조적으로 0 이므로 **팔 수 있는데 품절로 보이고 일부 경로는 실제로 막힌다.**

**실측 (mall 28)**: OPTION 36건 중 32건이 `products.stock=0` + SKU 합계 > 0. 예) 상품 11063 = 본체 0 / SKU 합 39,875.

#### 8.1 확인된 파손 지점 (8종)

| # | 위치 | 증상 | 심각도 |
|---|---|---|---|
| 1 | `controllers/checkoutController.js:583-595` | 장바구니→주문서 진입 시 `p.stock` 검증 → 옵션상품은 `max=0` 으로 **/cart 로 튕김. 주문 자체 불가** | 🔴 치명 |
| 2 | `controllers/cartController.js:214-220` | 장바구니 수량 변경이 `p.stock` 기준 → 옵션상품 **수량 증가 불가** | 🔴 치명 |
| 3 | `controllers/productController.js:593` | JSON-LD `availability` 가 `product.stock>0` → **검색엔진에 품절로 노출** | 🟠 높음 |
| 4 | `views/partials/product_card.ejs:28` | 카드 품절 뱃지 오표시 | 🟠 높음 |
| 5 | `views/user/products/list.ejs:388`, `search.ejs:71`, `outlet/list.ejs:171` | 목록·검색·아웃렛 품절 오표시 | 🟠 높음 |
| 6 | `views/user/products/detail.ejs:83,867` | 상세 `availableStock`/`PRODUCT_STOCK` = 0 | 🟠 높음 |
| 7 | 관리자 상품선택 팝업 **5곳**의 `p.stock > 0` / `p.stock <= 0` 재고 필터 — `dealController:397`, `categoryController:568`, `recommendGroupController:272`, `productGroupController:549`, `brandController:305` | **옵션상품이 "재고있음" 필터에서 전부 누락**(반대로 "재고없음"에는 전부 걸림) → 특가·그룹·브랜드관에 담을 수 없음 | 🟡 중간 |
| 8 | `heroSlideController:205`, `outletController:239`, `dealController:235,406`, `sourcingController:640` 등이 `p.stock` 을 **표시용으로 SELECT** | 필터는 아니지만 화면에 0 으로 표기 | 🟢 낮음 |

> `controllers/productController.js:506` 은 **복합상품만** `getAvailableQty` 로 덮어쓴다. OPTION 을 위한 else-if 가 없는 것이 1~6 의 공통 뿌리다.

#### 8.2 작업

- [ ] `skuService.getTotalStock(productId)` 신설 — §0.2 정의(단건). 복합상품이면 `getAvailableQty` 위임
- [ ] `skuService.decorateEffStock(rows)` 신설 — 목록용 N건 일괄(쿼리 1회, `IN (?) GROUP BY`). 상관 서브쿼리를 뷰마다 심지 않는다
- [ ] `productController.js:506` 에 OPTION 분기 추가. **`product.stock` 을 덮지 말고 `product.eff_stock` 에 넣는다**(호환용 덮어쓰기는 임시방편이라 채택하지 않음)
- [ ] JSON-LD(`:593`): `Number(product.eff_stock) > 0` 으로 판정
- [ ] 목록·검색·아웃렛·카드 쿼리에 `eff_stock` 을 실어 보내고, 뷰는 `product.stock` 대신 `eff_stock` 을 읽는다 (폴백: `eff_stock ?? stock`)
- [ ] 관리자 목록의 기존 `eff_stock` → `total_stock` 으로 개명(§0.2 이름 충돌 해소)
- [ ] 관리자 재고 필터 6곳을 `eff_stock > 0` 기준으로 교체
- [ ] `cartController.js:214`: **선택된 `c.sku_id` 의 재고**로 검증(합계 아님). `sku_id` 가 NULL 인 레거시 행은 대표 SKU 폴백
- [ ] `checkoutController.js:583`: 같은 규칙으로 교체(`c.sku_id` 기준)

**검증**
- 옵션상품 1건으로 e2e: 목록 카드 재고 표시 → 상세 → 담기 → **장바구니 수량 증가** → **주문서 진입** → 결제 → 해당 SKU만 차감
- 재고 0 옵션과 재고 있는 옵션이 섞인 상품: 카드는 판매중, 재고 0 옵션만 선택 불가
- 단일상품 회귀 없음(대표 SKU = `products.stock` 이라 값이 같아야 함)
- 복합상품: `eff_stock` 이 파생 가용수량과 일치
- JSON-LD `availability` 가 InStock

**리스크**: 목록 쿼리가 많아 누락 가능 → `grep -rn "\.stock" views/user views/partials` 로 잔존 참조 0 확인을 완료 조건에 넣는다.

---

### Phase 9 — 불변식 가드 (SKU 없는 상품 차단)

**배경**: Phase 1 백필은 **1회성**이었고, 그 뒤 상품을 만드는 경로 중 하나가 SKU 를 만들지 않아 **결함이 재생산되고 있다.**

`services/mall/sampleSeeder.js:162` 는 `products` 에 INSERT 만 하고 `product_sku` 를 만들지 않는다(파일 전체에 `product_sku` 참조 0회). 다른 생성 경로는 전부 만든다.

| 경로 | 대표 SKU 생성 |
|---|---|
| `productController.postAdd` (관리자 등록) | ✅ `syncDefaultSkuFromProduct` |
| `publishService` (소싱 이관) | ✅ |
| `derivedProductController` (세트·묶음) | ✅ (`stock_managed=0`) |
| **`sampleSeeder` (몰 생성 샘플)** | ❌ |

**이 프로젝트는 몰 빌더다.** 샘플 데이터를 넣어 몰을 새로 찍을 때마다 같은 상품들이 "보이는데 담을 수 없는" 상태로 다시 태어난다 — 즉 **납품되는 모든 몰에서 재발**한다.

**현재 실측**: SKU 0행 상품 = mall 28 의 6건(`11056`~`11061`, `SM28-P1`~`P6`, 전부 `2026-07-20 17:04:59` 동일 배치 = sampleSeeder 산물). 전 DB 통틀어 이 6건뿐. `resolveSkuForLine` 이 `null` 을 돌려주므로 `cartController.js:116` 에서 **에러 메시지도 없이 `redirect('back')` 으로 담기가 삼켜진다.**

#### 9.1 데이터 불변식

```
SINGLE  : 활성 SKU 정확히 1개, 그 SKU 의 is_default = 1
OPTION  : 활성 옵션 조합마다 SKU 1개, 동일 조합 중복 금지
복합상품 : 대표 SKU 1개(stock_managed=0) + composite_component 로 구성 참조
공통    : 판매 상품은 최소 1개의 SKU 를 가진다
```

#### 9.2 작업

- [x] **`sampleSeeder.js` 수정 (최우선 — 재발 차단)**. `prodIdByKey[p.sample_key] = r.insertId;` 앞에 대표 SKU 생성. `conn` 이 이미 있어 같은 트랜잭션에 참여한다
  ```js
  await skuService.syncDefaultSkuFromProduct(r.insertId, {
      mall_id: id, price: p.price, stock: 100, purchase_price: 0,
      status: 'ON', sku_code: slug.toUpperCase(),
  }, conn);
  ```
- [x] 기존 6건 처리 — **재시딩이 아니라 백필로 결정**(사용자 판단). 영향 범위가 최초 생성된 6건뿐이라 몰을 다시 만들 이유가 없고, 백필이 비파괴적이며 `carts`/`order_items` 참조 위험도 없다(당시 `carts` 0행)
- [x] 백필 SQL 을 재실행 안전한 형태로 `scripts/migrations/20260722_sku_phase9_default_backfill.sql` 에 남긴다(다른 몰에서 같은 상황이 생겼을 때의 복구 수단). 파생상품은 대표 SKU 를 `stock_managed=0` + `composite_component` 로 만들어야 해서 **대상에서 제외**
  ```sql
  INSERT INTO product_sku (mall_id, product_id, sku_code, purchase_price, price, stock, stock_managed, status, is_default)
  SELECT p.mall_id, p.id, CONCAT('DEFAULT-', p.id), COALESCE(p.purchase_price,0), p.price,
         COALESCE(p.stock,0), 1, IF(p.status='OFF','OFF','ON'), 1
    FROM products p
   WHERE p.product_type = 'SINGLE'
     AND NOT EXISTS (SELECT 1 FROM product_sku s WHERE s.product_id = p.id);
  ```
- [x] **상시 점검 쿼리**를 문서화(관리자 화면 노출은 후속). 몰 빌더는 만들고-지우고를 반복하므로 이 검사가 회귀 감지선이다. 백필 SQL §3 에도 검산으로 들어가 있다
  ```sql
  -- (a) SKU 가 하나도 없는 판매상품 — 0행이어야 한다
  SELECT p.id, p.mall_id, p.product_type, p.name FROM products p
   WHERE p.product_type IN ('SINGLE','OPTION')
     AND NOT EXISTS (SELECT 1 FROM product_sku s WHERE s.product_id = p.id);

  -- (b) 대표 SKU 가 2개 이상인 상품 — 0행이어야 한다
  SELECT product_id, COUNT(*) FROM product_sku WHERE is_default = 1
   GROUP BY product_id HAVING COUNT(*) > 1;
  ```

**검증 결과 (2026-07-22 · 전부 PASS)**
- 백필: `product_sku` 9,817 → **9,823**(+6). 6건 모두 `DEFAULT-{id}` · `is_default=1` · 가격·재고가 products 와 일치
- 불변식: SKU 0행 판매상품 **0** · 대표 SKU 중복 **0** · SINGLE 다중 SKU **0** · SINGLE 미러 불일치 **0**
- 시더: 임시 몰 생성 → 샘플 상품 6건 **전부 대표 SKU 1개**, 판매 SKU 해석 실패 0, 가격·재고 미러 불일치 0 → 몰 삭제 후 `product_sku` 9,823 → 9,823 **완전 원복**
- **사용자 영향 확인**: 상품 11056 담기 → `carts` 행 생성 + `sku_id=16587` 기록(예전에는 `resolveSkuForLine` 이 null 이라 에러 없이 삼켜졌다). 검증 후 카트 행 원복

---

## 3. MVP 최소 경로 (데모용)

**Phase 0 → 1 → 3(옵션상품) → 4(세트 1종)**. Phase 2는 3에 흡수 가능, Phase 5는 후속.
이 경로만으로 "단일·옵션·세트 + SKU 재고 기준"이 실물로 증명된다.

---

## 4. 공통 검증 체크리스트 (매 Phase)

- [ ] 앱 기동 로그 무에러
- [ ] 라우트 스모크: `/`, `/products`, `/products/{slug}`, `/cart`, `/admin/products`
- [ ] 주문 1건 전체 흐름: 담기 → 결제 → 재고 차감 → 취소 → 복원
- [ ] 기존 상품(단일) 회귀 없음

---

## 5. 진행 로그

**Phase 0~7 · 9 완료.** 스키마·백필·읽기미러·재고/주문 SKU화·옵션상품 CRUD·복합상품·카테고리 옵션·레거시 감사·기본/파생 메뉴 분리·불변식 가드까지 전부 e2e PASS. 완료 회차별 검증 수치와 커밋은 git 이력을 참조한다.

| Phase | 상태 | 비고 |
|---|---|---|
| **8 재고 읽기 정합** | ⬜ **유일한 잔여** | `eff_stock` 도입. §8.1 파손 8종 정리. **쓰기**는 SKU 로 옮겼으나 **읽기**(표시·수량제한)에 `products.stock` 참조가 다수 잔존해, 옵션상품은 주문서 진입·장바구니 수량변경이 **실제로 막힌다** |

> Phase 5(카테고리 옵션)의 상속 구현은 [`카테고리_브랜드_상품필터_설계.md`](./카테고리_브랜드_상품필터_설계.md) 가 facet 상속 로직의 재사용 근거로 참조한다 — §2 Phase 5 절은 그 때문에 남겨 둔다.
