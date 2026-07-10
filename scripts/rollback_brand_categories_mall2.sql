-- ---------------------------------------------------------------------------
-- migrate_brand_categories_mall2.sql 롤백
--
--   mall_id=2 상품의 brand_category_id 를 NULL 로 되돌리고
--   mall_id=2 의 BRAND 카테고리를 전부 삭제한다.
--
--   brand_likes.category_id 는 ON DELETE CASCADE,
--   products.brand_category_id 는 ON DELETE SET NULL 이므로 잔여 참조는 남지 않는다.
--   단 banners(banner_type='BRAND', category_id) 는 FK 가 없으므로 함께 확인할 것.
--
-- 실행:
--   mysql -h ydata.co.kr -u ydatasvc -p'...' dev_mall --default-character-set=utf8mb4 \
--     < scripts/rollback_brand_categories_mall2.sql
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

START TRANSACTION;

UPDATE products SET brand_category_id = NULL
WHERE mall_id = 2 AND brand_category_id IS NOT NULL;

DELETE FROM categories WHERE mall_id = 2 AND type = 'BRAND';

COMMIT;

SELECT 'brand_categories(mall=2)' AS metric, COUNT(*) AS value
FROM categories WHERE mall_id = 2 AND type = 'BRAND'
UNION ALL
SELECT 'products_linked(mall=2)', COUNT(*)
FROM products WHERE mall_id = 2 AND brand_category_id IS NOT NULL
UNION ALL
SELECT '고아 브랜드 배너(수동 확인 필요)', COUNT(*)
FROM banners b
WHERE b.banner_type = 'BRAND'
  AND b.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = b.category_id);
