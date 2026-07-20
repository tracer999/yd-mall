-- 백업(zbak_*) 상품을 새로 만든 몰로 복원한다. "신규 납품" 재현용.
--
-- 사용법:
--   mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall \
--     -e "SET @target_code='만든몰코드', @src_code='general', @limit=50;" \
--     --init-command="" < scripts/zbak_restore_products.sql
--   (또는 아래 SET 3줄을 직접 고쳐서 그냥 실행)
--
-- 전제: zbak_products / zbak_product_sku / zbak_product_images /
--       zbak_product_option / zbak_product_option_value / zbak_sku_option_value
--
-- 주의: theme_category_id 는 NULL 로 넣는다 — THEME 카테고리는 몰과 함께 삭제되기 때문.
--       src_code='test_02' 인 6건은 category_id/brand_category_id 가 몰 전용 카테고리를
--       가리켜 FK 오류가 난다. 쓰려면 해당 두 컬럼도 NULL 로 바꿔야 한다.

SET @target_code = IFNULL(@target_code, 'main');   -- 상품을 넣을 몰 코드
SET @src_code    = IFNULL(@src_code, 'general');   -- 백업본에서 꺼낼 원본 몰 코드
SET @limit       = IFNULL(@limit, 50);             -- 가져올 건수

SET @new_mall = (SELECT id FROM mall WHERE code = @target_code);

-- 대상 몰 코드가 틀리면 @new_mall 이 NULL 이 되고, products.mall_id 는 NOT NULL 이라
-- 아래 INSERT 가 "Column 'mall_id' cannot be null" 로 즉시 실패한다(조용한 오삽입 없음).

DROP TEMPORARY TABLE IF EXISTS zbak_pick;
CREATE TEMPORARY TABLE zbak_pick (id INT PRIMARY KEY);

SET @sql = CONCAT(
    'INSERT INTO zbak_pick SELECT id FROM zbak_products ',
    'WHERE src_mall_code = ', QUOTE(@src_code),
    '   AND id NOT IN (SELECT id FROM products) ',
    ' ORDER BY id LIMIT ', CAST(@limit AS CHAR));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

INSERT INTO products
    (id, mall_id, category_id, product_type, brand_category_id, naver_category_id,
     naver_brand_id, name, product_code, provider, description, short_description,
     meta_description, main_image, thumbnail_image, video_url, video_type,
     purchase_price, original_price, price, discount_rate, stock, status,
     sale_start_date, visibility, view_count, created_at, theme_category_id,
     is_ai_recommendation, ai_recommendation_content, slug,
     distribution_badge, product_badge, badge_expire_date)
SELECT
     id, @new_mall, category_id, product_type, brand_category_id, naver_category_id,
     naver_brand_id, name, product_code, provider, description, short_description,
     meta_description, main_image, thumbnail_image, video_url, video_type,
     purchase_price, original_price, price, discount_rate, stock, status,
     sale_start_date, visibility, view_count, created_at, NULL,
     is_ai_recommendation, ai_recommendation_content, slug,
     distribution_badge, product_badge, badge_expire_date
  FROM zbak_products WHERE id IN (SELECT id FROM zbak_pick);

INSERT INTO product_sku    SELECT * FROM zbak_product_sku    WHERE product_id IN (SELECT id FROM zbak_pick);
INSERT INTO product_images SELECT * FROM zbak_product_images WHERE product_id IN (SELECT id FROM zbak_pick);
INSERT INTO product_option SELECT * FROM zbak_product_option WHERE product_id IN (SELECT id FROM zbak_pick);

INSERT INTO product_option_value
    SELECT * FROM zbak_product_option_value
     WHERE product_option_id IN (SELECT id FROM zbak_product_option WHERE product_id IN (SELECT id FROM zbak_pick));

INSERT INTO sku_option_value
    SELECT * FROM zbak_sku_option_value
     WHERE sku_id IN (SELECT id FROM zbak_product_sku WHERE product_id IN (SELECT id FROM zbak_pick));

SELECT @target_code AS 대상몰, @new_mall AS 몰ID,
       (SELECT COUNT(*) FROM zbak_pick) AS 복원상품수,
       (SELECT COUNT(*) FROM products WHERE mall_id = @new_mall) AS 몰_총상품수;
