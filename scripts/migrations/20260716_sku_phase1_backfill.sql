-- =====================================================================
-- Phase 1: 기존 상품 전건 → 대표 SKU(is_default=1) 백필
-- 설계 §29 Phase 1 / 계획 Phase 1
-- 재실행 안전: 대표 SKU 없는 상품만 INSERT (WHERE NOT EXISTS)
-- status 는 on/off 만 세팅(5값 뭉갬 금지). products.status 는 원천 유지.
-- =====================================================================

INSERT INTO product_sku
  (mall_id, product_id, sku_code, purchase_price, price, stock, stock_managed, status, is_default)
SELECT
  p.mall_id, p.id, p.product_code, p.purchase_price, p.price, p.stock, 1,
  IF(p.status = 'OFF', 'OFF', 'ON'),
  1
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_sku s WHERE s.product_id = p.id AND s.is_default = 1
);
