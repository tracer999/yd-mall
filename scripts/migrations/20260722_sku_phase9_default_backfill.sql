-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 9 — 대표 SKU 백필 (SKU 가 하나도 없는 상품 구제)
--
-- 계획서: docs/사이트개선/상품_SKU_옵션_세트_개발계획서.md §Phase 9
-- 설계  : docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §25.1 ("항상 SKU")
--
-- 배경
--   이 저장소는 "단일상품도 SKU 1행" 설계다. 재고·가격의 정본은 product_sku 이고
--   products.stock/price 는 대표 SKU 의 미러일 뿐이다. SKU 가 없는 상품은
--   skuService.resolveSkuForLine 이 null 을 돌려주므로 **장바구니에 담기지 않는다**
--   (cartController 가 에러 없이 redirect('back') 으로 삼킨다).
--
--   Phase 1 백필은 1회성이었고, 그 뒤 services/mall/sampleSeeder.js 가 SKU 없이
--   상품을 만들어 결함이 재생산됐다. **재발 차단은 그 시더 수정이 담당**하고,
--   이 SQL 은 이미 생긴 것을 되살리는 복구 수단이다.
--
-- 성격
--   재실행 안전(NOT EXISTS 가드). 몇 번 돌려도 중복 INSERT 되지 않는다.
--   파생상품(BUNDLE/SET/GIFT_SET/BUILD_SET)은 제외한다 — 대표 SKU 를
--   stock_managed=0 으로 만들고 composite_component 를 함께 걸어야 해서
--   여기서 단순 INSERT 로 만들면 안 된다(derivedProductController 담당).
--
-- 적용
--   mysql -h ydata.co.kr -u ydatasvc -p'***' yd_mall < scripts/migrations/20260722_sku_phase9_default_backfill.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 적용 전 대상 확인
SELECT p.id, p.mall_id, p.product_type, p.name, p.stock, p.price
  FROM products p
 WHERE p.product_type IN ('SINGLE', 'OPTION')
   AND NOT EXISTS (SELECT 1 FROM product_sku s WHERE s.product_id = p.id);

-- 2) 백필 — products 값을 그대로 대표 SKU 로 옮긴다(미러 방향과 동일).
--    status 는 5값을 2값으로 뭉개되 OFF 만 OFF (skuService.mapProductStatusToSku 와 같은 규칙).
--    products.status 는 건드리지 않는다 — 생명주기 게이트로 계속 쓴다.
INSERT INTO product_sku
    (mall_id, product_id, sku_code, purchase_price, price, stock, stock_managed, status, is_default, display_order)
SELECT p.mall_id,
       p.id,
       CONCAT('DEFAULT-', p.id),
       COALESCE(p.purchase_price, 0),
       p.price,
       GREATEST(COALESCE(p.stock, 0), 0),
       1,
       IF(p.status = 'OFF', 'OFF', 'ON'),
       1,
       0
  FROM products p
 WHERE p.product_type IN ('SINGLE', 'OPTION')
   AND NOT EXISTS (SELECT 1 FROM product_sku s WHERE s.product_id = p.id);

-- 3) 검산 — 아래 두 쿼리는 모두 0행이어야 한다.
--    (a) SKU 가 하나도 없는 판매상품
SELECT p.id, p.mall_id, p.product_type, p.name
  FROM products p
 WHERE p.product_type IN ('SINGLE', 'OPTION')
   AND NOT EXISTS (SELECT 1 FROM product_sku s WHERE s.product_id = p.id);

--    (b) 대표 SKU 가 2개 이상인 상품 (불변식: 상품당 대표 SKU 는 유일)
SELECT product_id, COUNT(*) AS default_cnt
  FROM product_sku
 WHERE is_default = 1
 GROUP BY product_id
HAVING COUNT(*) > 1;
