-- 외부몰 연동 — 가져온 공급처 상품을 "우리 몰 상품"으로 등록한 결과를 추적한다.
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sourcing_03_publish.sql
--
-- 왜 필요한가: supplier_product 는 공급처 원본 스냅샷이고, products 는 우리 몰 판매상품이다.
-- 둘을 이어 두지 않으면 (1) 같은 상품을 몇 번이고 중복 등록하게 되고,
-- (2) 나중에 공급가·재고가 바뀌었을 때 어떤 우리 상품을 갱신해야 할지 알 수 없다.
--
-- ⚠ 스마트스토어 등록(channel_product_mapping, Phase 3)과는 **별개 경로**다.
--   이건 우리 몰 자체 판매용이다.

-- 재실행 안전: 컬럼이 이미 있으면 건너뛴다(MySQL 8.4 에는 ADD COLUMN IF NOT EXISTS 가 없다).
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE supplier_product
       ADD COLUMN mall_product_id INT NULL COMMENT ''이 공급처 상품으로 만든 우리 몰 products.id (NULL=미등록)'',
       ADD COLUMN published_at DATETIME NULL COMMENT ''우리 몰 상품으로 등록한 시각'',
       ADD COLUMN published_by VARCHAR(100) NULL COMMENT ''등록 실행 관리자'',
       ADD KEY idx_sp_mall_product (mall_product_id)',
    'SELECT ''supplier_product.mall_product_id 이미 존재 — 건너뜀'' AS msg'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supplier_product'
    AND COLUMN_NAME = 'mall_product_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
