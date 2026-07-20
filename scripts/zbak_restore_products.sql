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

-- 이 DB 는 sql_mode 가 비어 있다(비엄격). 그대로 두면 NOT NULL 컬럼에 NULL 을 넣어도
-- 에러 없이 0 으로 바뀌어 들어간다 → mall_id=0 고아 상품이 조용히 생긴다. 세션만 엄격으로 올린다.
SET SESSION sql_mode = 'STRICT_ALL_TABLES';

SET @target_code = IFNULL(@target_code, 'general'); -- 상품을 넣을 몰 코드
SET @src_code    = IFNULL(@src_code, 'general');   -- 백업본에서 꺼낼 원본 몰 코드
SET @limit       = IFNULL(@limit, 50);             -- 가져올 건수

-- COLLATE 명시 이유는 아래 PREPARE 쪽 주석 참고(사용자 변수 vs 컬럼 콜레이션 불일치).
SET @new_mall = (SELECT id FROM mall WHERE code COLLATE utf8mb4_general_ci = @target_code);

-- 대상 몰 코드가 틀리면 @new_mall 이 NULL 이다. 아래 zbak_pick 채우기에서 걸러
-- 0건으로 끝내고(아무것도 안 넣고), 마지막 SELECT 의 복원상품수 0 으로 드러난다.

DROP TEMPORARY TABLE IF EXISTS zbak_pick;
CREATE TEMPORARY TABLE zbak_pick (id INT PRIMARY KEY);

SET @sql = CONCAT(
    'INSERT INTO zbak_pick SELECT id FROM zbak_products ',
    -- COLLATE 명시: 사용자 변수는 utf8mb4_0900_ai_ci, 컬럼은 utf8mb4_general_ci 라 그냥 두면
    -- "Illegal mix of collations" 로 죽는다.
    'WHERE src_mall_code COLLATE utf8mb4_general_ci = ', QUOTE(@src_code),
    '   AND id NOT IN (SELECT id FROM products) ',
    '   AND ', IF(@new_mall IS NULL, '1=0', '1=1'), ' ',   -- 몰 코드 오타 시 0건으로 안전 종료
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
