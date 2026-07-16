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

| Phase | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 0 스키마 | ✅ 완료 | (미커밋) | 9테이블+3컬럼 생성, 앱 기동·라우트 스모크 통과. `scripts/migrations/20260716_sku_phase0.sql` |
| 1 백필 | ✅ 완료 | (미커밋) | 10,007건 대표 SKU 생성, 중복 0, 가격/재고 불일치 0, status 원천 유지. `..._phase1_backfill.sql` |
| 2 읽기·미러 | ✅ 완료 | (미커밋) | `skuService.js` + postAdd/postEdit/postUpdateStatus 대표 SKU 단방향 미러. 서비스 검증 PASS, 앱 기동·스모크 통과. (read-prefers-SKU 는 Phase 3에 흡수) |
| 3a 재고·주문 SKU화 | ✅ 완료 | (미커밋) | skuService 재고 헬퍼(차감·복원·검증, COALESCE 폴백+products 미러). checkout/cancel/cart 배선. 델타 검증 PASS(with-sku·null-fallback), 앱 스모크 통과 |
| 3b 옵션상품 CRUD·상세 | ✅ 완료 | (미커밋) | `optionService.js`(생성/해석/라벨), 관리자 옵션·SKU 편집기(`/admin/products/options/:id`), 고객 상세 **구매 패널 활성화 + 옵션 선택 UI**. e2e PASS: 옵션 선택→장바구니(sku_id)→결제→SKU 재고차감(5→3)→option_snapshot("화이트 / M"). ※사용자 결정으로 스토어프론트 구매 UI 활성화 |
| 4 복합상품 | ✅ 완료 | (미커밋) | `compositeService.js`(구성 CRUD·가용수량 파생·구성검색), 관리자 세트·묶음 편집기(`/admin/products/composite/:id`), skuService 차감/복원이 복합상품 구성 SKU 처리. e2e PASS: 세트 구매 qty2→구성 −2/−4, 대표 SKU 미차감, 복원 대칭 |
| 5 카테고리 옵션 | ✅ 완료 | (미커밋) | 표준 옵션 사전 시드(3몰×8옵션), `categoryOptionService`(매핑·조상 상속), 관리자 카테고리 옵션 관리 화면, 옵션 편집기 "카테고리 추천 옵션 불러오기" 프리필. e2e PASS: 저장→프리필 반환(색상5·사이즈4), 상속 PASS |
| 6 폐기(감사) | ✅ 완료 | (미커밋) | 감사 결과: 런타임 재고 쓰기 전부 `product_sku` 경유(skuService), `products.stock`은 단일 대표 SKU **미러**로만(is_default 가드). 기존 직접쓰기(checkout:166·cancel:64) 제거됨. Shopify 웹훅만 논외. products.price/stock/purchase_price = 읽기폴백·미러(신규 쓰기 없음). 컬럼 물리삭제 안 함(설계 방침) |
