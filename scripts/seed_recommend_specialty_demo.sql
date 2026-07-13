-- 추천 · 전문관 데모 데이터 시드
-- 설계: docs/사이트개선/recommend_specialty_design_and_development.md
--
-- ⚠️ 개발 DB = 운영 DB 다. 여기서 만든 전문관은 그대로 고객에게 노출된다.
--    되돌리려면 맨 아래 §롤백 을 실행한다(slug 로 특정 가능하게 지어뒀다).
--
-- 여러 번 실행해도 안전하다(exhibition 은 (mall_id, slug) 유니크, 매핑은 (exh, section, product) 유니크).

-- ─────────────────────────────────────────────────────────
-- 1. 전문관 (exhibition_type='SPECIALTY', end_at=NULL → 상시)
-- ─────────────────────────────────────────────────────────
INSERT IGNORE INTO exhibition
    (mall_id, title, slug, summary, description, exhibition_type, status,
     start_at, end_at, list_visible, search_visible, detail_template_type)
VALUES
    -- 몰 1 (건강식품 전문몰) — 카테고리 복제가 아니라 **탐색 의도**로 나눈다.
    (1, '선물관', 'gift-shop',
        '부모님·명절·집들이 — 마음을 전하는 건강 선물',
        '받는 분을 생각해 고른 선물용 구성입니다. 포장·배송까지 신경 썼습니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP'),
    (1, '프리미엄관', 'premium-shop',
        '엄선한 원료, 높은 함량 — 프리미엄 라인',
        '원료와 함량을 기준으로 상위 라인만 모았습니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP'),
    (1, '이너뷰티관', 'inner-beauty-shop',
        '콜라겐·이너뷰티 — 안에서부터 가꾸는 관리',
        '먹는 관리, 이너뷰티 상품을 모았습니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP'),
    (1, '데일리케어관', 'daily-care-shop',
        '유산균·비타민 — 매일 챙기는 기본 관리',
        '매일 꾸준히 복용하는 기본 건강관리 상품입니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP'),

    -- 몰 2 (종합관)
    (2, '뷰티관', 'beauty-shop', '스킨케어·메이크업 상시 매장',
        '뷰티 카테고리를 상시 운영합니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP'),
    (2, '패션관', 'fashion-shop', '여성·남성 패션 상시 매장',
        '패션 카테고리를 상시 운영합니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP'),
    (2, '식품관', 'food-shop', '신선·가공식품 상시 매장',
        '식품 카테고리를 상시 운영합니다.',
        'SPECIALTY', 'PUBLISHED', NOW(), NULL, 1, 1, 'TAB_SHOP');

-- ─────────────────────────────────────────────────────────
-- 2. 전문관 상품 매핑
--    섹션(section_id)은 두지 않는다 — NULL 이면 '전체' 탭에 그대로 노출된다.
--    조회수 상위 12개씩. 상시 매장이므로 운영자가 이후 관리자에서 교체한다.
-- ─────────────────────────────────────────────────────────
DROP TEMPORARY TABLE IF EXISTS tmp_spec_map;
CREATE TEMPORARY TABLE tmp_spec_map (slug VARCHAR(200), mall_id BIGINT, cat_ids VARCHAR(50));
INSERT INTO tmp_spec_map VALUES
    ('gift-shop',        1, '15,16'),   -- 인삼/홍삼 · 건강환/즙
    ('premium-shop',     1, '1,3'),     -- 건강식품(기타) · 영양제 (가격 상위로 자름)
    ('inner-beauty-shop',1, '39'),      -- 콜라겐/이너뷰티
    ('daily-care-shop',  1, '14,3'),    -- 유산균 · 영양제
    ('beauty-shop',      2, '224'),     -- 뷰티
    ('fashion-shop',     2, '219,220'), -- 여성패션 · 남성패션
    ('food-shop',        2, '225');     -- 식품

-- 재실행 시 매핑을 새로 깐다(카테고리 구성이 바뀌면 상품도 바뀌어야 한다).
DELETE ep FROM exhibition_product ep
  JOIN exhibition e ON e.id = ep.exhibition_id
 WHERE e.exhibition_type = 'SPECIALTY';

/*
 * ⚠️ 카테고리 **하위 트리까지** 포함해야 한다.
 *    몰 2(종합관)의 상품은 대부분 depth 2~3 카테고리에 붙어 있어서,
 *    상위 카테고리 직속 매칭만 하면 패션관이 2건짜리 빈 매장이 된다.
 *    categories 는 최대 3뎁스이므로 부모·조부모까지만 거슬러 올라가면 충분하다.
 */
INSERT IGNORE INTO exhibition_product (exhibition_id, section_id, product_id, sort_order, visible, purchase_enabled)
SELECT x.id, NULL, x.pid, x.rn, 1, 1
  FROM (
        SELECT e.id,
               p.id AS pid,
               ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY p.price DESC, p.view_count DESC, p.id) AS rn
          FROM tmp_spec_map t
          JOIN exhibition e  ON e.mall_id = t.mall_id AND e.slug = t.slug
          JOIN products p    ON p.mall_id = t.mall_id
                            AND p.visibility = 'PUBLIC' AND p.status <> 'OFF'
          JOIN categories c  ON c.id = p.category_id
          LEFT JOIN categories c2 ON c2.id = c.parent_id
          LEFT JOIN categories c3 ON c3.id = c2.parent_id
         WHERE FIND_IN_SET(c.id, t.cat_ids)
            OR FIND_IN_SET(c2.id, t.cat_ids)
            OR FIND_IN_SET(c3.id, t.cat_ids)
  ) x
 WHERE x.rn <= 12;

DROP TEMPORARY TABLE IF EXISTS tmp_spec_map;

-- ─────────────────────────────────────────────────────────
-- 3. 추천 — MD 추천 섹션용 RECOMMEND 뱃지
--    몰 1 은 이미 14건 있다. 몰 2 는 0건이라 MD 추천 섹션이 통째로 비므로 12건 부여한다.
--    product_badge 는 CSV 다 — 기존 뱃지를 덮지 않고 뒤에 붙인다.
-- ─────────────────────────────────────────────────────────
UPDATE products p
   JOIN (
        SELECT id FROM products
         WHERE mall_id = 2 AND visibility = 'PUBLIC' AND status <> 'OFF'
           AND NOT FIND_IN_SET('RECOMMEND', product_badge)
         ORDER BY view_count DESC, id
         LIMIT 12
   ) s ON s.id = p.id
   SET p.product_badge = CASE
        WHEN p.product_badge IS NULL OR p.product_badge = '' THEN 'RECOMMEND'
        ELSE CONCAT(p.product_badge, ',RECOMMEND')
   END;


-- ═════════════════════════════════════════════════════════
-- 롤백 — 데모 데이터를 전부 되돌린다
-- ═════════════════════════════════════════════════════════
-- DELETE FROM exhibition
--  WHERE exhibition_type = 'SPECIALTY'
--    AND slug IN ('gift-shop','premium-shop','inner-beauty-shop','daily-care-shop',
--                 'beauty-shop','fashion-shop','food-shop');
--   (exhibition_product 는 ON DELETE CASCADE 로 함께 지워진다)
--
-- UPDATE products SET product_badge = NULLIF(TRIM(BOTH ',' FROM
--          REPLACE(CONCAT(',', product_badge, ','), ',RECOMMEND,', ',')), '')
--  WHERE mall_id = 2 AND FIND_IN_SET('RECOMMEND', product_badge);
