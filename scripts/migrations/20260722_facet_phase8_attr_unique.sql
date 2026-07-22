-- =============================================================================
-- 상품 필터(facet) Phase 8 — product_attribute 중복 방지
-- 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §9, §10(Phase 8)
--
-- 자동 추출(옵션값·상품명·공급사 원본 파싱)은 여러 번 돌 수 있다. 같은 값이 계속 쌓이면
-- 파셋 카운트가 부풀고 검수 화면이 중복으로 뒤덮인다. (상품, 속성명, 속성값) 을 유일하게 만든다.
--
-- ⚠ 유니크를 걸기 전에 기존 중복을 먼저 정리한다(지금은 0행이지만 재실행 대비).
--   같은 값이 승인(1)·대기(0) 로 둘 다 있으면 승인 쪽을 남긴다.
--
-- 멱등하다. 적용: mysql ... yd_mall < 20260722_facet_phase8_attr_unique.sql
-- =============================================================================

-- 1) 중복 제거 — (product_id, attr_name, attr_value) 그룹에서 is_searchable 이 큰 행을 남긴다.
DELETE pa FROM product_attribute pa
JOIN (
    SELECT product_id, attr_name, attr_value,
           MAX(is_searchable) AS keep_searchable,
           MIN(id)            AS keep_id
      FROM product_attribute
     GROUP BY product_id, attr_name, attr_value
    HAVING COUNT(*) > 1
) d ON d.product_id = pa.product_id AND d.attr_name = pa.attr_name AND d.attr_value = pa.attr_value
WHERE pa.id <> (
    SELECT MIN(x.id) FROM (SELECT * FROM product_attribute) x
     WHERE x.product_id = pa.product_id AND x.attr_name = pa.attr_name
       AND x.attr_value = pa.attr_value AND x.is_searchable = d.keep_searchable
);

-- 2) 유니크 인덱스
DROP PROCEDURE IF EXISTS `_facet_attr_uk`;
DELIMITER //
CREATE PROCEDURE `_facet_attr_uk`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attribute'
                     AND INDEX_NAME = 'uk_product_attr_value') THEN
        ALTER TABLE `product_attribute`
            ADD UNIQUE KEY `uk_product_attr_value` (`product_id`, `attr_name`, `attr_value`);
    END IF;
END //
DELIMITER ;
CALL `_facet_attr_uk`();
DROP PROCEDURE `_facet_attr_uk`;


-- 검증
--   SHOW INDEX FROM product_attribute;   -- uk_product_attr_value 존재
--   SELECT product_id, attr_name, attr_value, COUNT(*) c FROM product_attribute
--    GROUP BY 1,2,3 HAVING c > 1;        -- 0행
