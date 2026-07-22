-- =============================================================================
-- 상품 필터(facet) Phase 2c — 1뎁스 카테고리 ↔ 필터 매핑
-- 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §4
--
-- 카테고리는 **이름으로** 매칭한다. ID 하드코딩 금지 —
-- 새로 찍어낸 몰에도 같은 이름의 1뎁스가 있으면 그대로 적용되어야 한다.
--
-- is_primary = 1  → 1뎁스 진입 시 접지 않고 바로 노출 (카테고리당 5~7개 이내)
-- Tier 0 은 자동 적용이라 여기 넣지 않는다. 단 **끄고 싶을 때만** is_visible=0 행을 넣는다.
--
-- 멱등하다. 적용: mysql ... yd_mall < 20260722_facet_phase2c_mapping.sql
-- =============================================================================

-- 매핑 헬퍼 프로시저: (1뎁스 이름, facet_code, is_primary, display_order)
DROP PROCEDURE IF EXISTS `_facet_map`;
DELIMITER //
CREATE PROCEDURE `_facet_map`(
    IN p_cat_name VARCHAR(50), IN p_facet VARCHAR(50),
    IN p_primary TINYINT, IN p_order INT
)
BEGIN
    INSERT INTO category_facet (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order)
    SELECT c.id, f.id, p_primary, 1, 1, p_order
      FROM categories c
      JOIN facet_definition f ON f.facet_code = p_facet
     WHERE c.depth = 1 AND c.type = 'NORMAL' AND c.name = p_cat_name
    ON DUPLICATE KEY UPDATE
        is_primary = VALUES(is_primary), display_order = VALUES(display_order), is_visible = 1;
END //

-- Tier 0 을 특정 카테고리에서 끄는 헬퍼 (서비스 상품에서 배송·재고 등)
CREATE PROCEDURE `_facet_hide`(IN p_cat_name VARCHAR(50), IN p_facet VARCHAR(50))
BEGIN
    INSERT INTO category_facet (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order)
    SELECT c.id, f.id, 0, 0, 1, 999
      FROM categories c
      JOIN facet_definition f ON f.facet_code = p_facet
     WHERE c.depth = 1 AND c.type = 'NORMAL' AND c.name = p_cat_name
    ON DUPLICATE KEY UPDATE is_visible = 0;
END //
DELIMITER ;


-- -----------------------------------------------------------------------------
-- 4.1 패션의류
-- -----------------------------------------------------------------------------
CALL _facet_map('패션의류','GENDER',      1, 10);
CALL _facet_map('패션의류','SIZE_ALPHA',  1, 20);
CALL _facet_map('패션의류','COLOR',       1, 30);
CALL _facet_map('패션의류','MATERIAL',    1, 40);
CALL _facet_map('패션의류','SIZE_KR_W',   0, 50);
CALL _facet_map('패션의류','SIZE_WAIST',  0, 60);
CALL _facet_map('패션의류','FIT',         0, 70);
CALL _facet_map('패션의류','SLEEVE',      0, 80);
CALL _facet_map('패션의류','PATTERN',     0, 90);
CALL _facet_map('패션의류','SEASON',      0,100);
CALL _facet_map('패션의류','WASH',        0,110);

-- -----------------------------------------------------------------------------
-- 4.2 패션잡화 — 품목마다 고시가 갈린다(SHOES/BAG/JEWELLERY/FASHION_ITEMS).
--     품목 축은 Tier 0 CATEGORY 가 담당하고, 여기서는 속성만 붙인다.
-- -----------------------------------------------------------------------------
CALL _facet_map('패션잡화','GENDER',        1, 10);
CALL _facet_map('패션잡화','COLOR',         1, 20);
CALL _facet_map('패션잡화','MATERIAL',      1, 30);
CALL _facet_map('패션잡화','SIZE_SHOE_MM',  0, 40);
CALL _facet_map('패션잡화','HEEL_HEIGHT',   0, 50);
CALL _facet_map('패션잡화','SIZE_BAG',      0, 60);
CALL _facet_map('패션잡화','LUGGAGE_INCH',  0, 70);
CALL _facet_map('패션잡화','PURITY',        0, 80);
CALL _facet_map('패션잡화','WEIGHT_G',      0, 90);
CALL _facet_map('패션잡화','WARRANTY_CARD', 0,100);
CALL _facet_map('패션잡화','BAND_MATERIAL', 0,110);

-- -----------------------------------------------------------------------------
-- 4.3 화장품/미용 — FUNCTION 은 고시 '기능성 화장품' 필드와 직결된다.
-- -----------------------------------------------------------------------------
CALL _facet_map('화장품/미용','SKIN_TYPE',        1, 10);
CALL _facet_map('화장품/미용','FUNCTION',         1, 20);
CALL _facet_map('화장품/미용','CONCERN',          1, 30);
CALL _facet_map('화장품/미용','FORM',             1, 40);
CALL _facet_map('화장품/미용','CAPACITY',         1, 50);
CALL _facet_map('화장품/미용','SPF',              0, 60);
CALL _facet_map('화장품/미용','INGREDIENT_FREE',  0, 70);
CALL _facet_map('화장품/미용','SCENT',            0, 80);
CALL _facet_map('화장품/미용','SHADE',            0, 90);
CALL _facet_map('화장품/미용','GENDER',           0,100);
CALL _facet_map('화장품/미용','ORIGIN',           0,110);

-- -----------------------------------------------------------------------------
-- 4.4 디지털/가전 — 7종 가전 고시가 공유하는 필드가 그대로 필터가 된다.
-- -----------------------------------------------------------------------------
CALL _facet_map('디지털/가전','MAKER',         1, 10);
CALL _facet_map('디지털/가전','ENERGY_GRADE',  1, 20);
CALL _facet_map('디지털/가전','RELEASE_YEAR',  1, 30);
CALL _facet_map('디지털/가전','FORM_FACTOR',   1, 40);
CALL _facet_map('디지털/가전','SCREEN_INCH',   0, 50);
CALL _facet_map('디지털/가전','STORAGE',       0, 60);
CALL _facet_map('디지털/가전','OS',            0, 70);
CALL _facet_map('디지털/가전','CONNECTIVITY',  0, 80);
CALL _facet_map('디지털/가전','POWER_W',       0, 90);
CALL _facet_map('디지털/가전','VOLTAGE',       0,100);
CALL _facet_map('디지털/가전','INSTALL_FEE',   0,110);
CALL _facet_map('디지털/가전','CARRIER',       0,120);
CALL _facet_map('디지털/가전','WARRANTY',      0,130);
CALL _facet_map('디지털/가전','KC_CERT',       0,140);
CALL _facet_map('디지털/가전','COLOR',         0,150);

-- -----------------------------------------------------------------------------
-- 4.5 가구/인테리어
-- -----------------------------------------------------------------------------
CALL _facet_map('가구/인테리어','COLOR',            1, 10);
CALL _facet_map('가구/인테리어','MATERIAL',         1, 20);
CALL _facet_map('가구/인테리어','ASSEMBLY',         1, 30);
CALL _facet_map('가구/인테리어','INSTALL_FEE',      1, 40);
CALL _facet_map('가구/인테리어','STYLE',            1, 50);
CALL _facet_map('가구/인테리어','SIZE_BED',         0, 60);
CALL _facet_map('가구/인테리어','SEATS',            0, 70);
CALL _facet_map('가구/인테리어','WIDTH_CM',         0, 80);
CALL _facet_map('가구/인테리어','SET_COMPOSITION',  0, 90);
CALL _facet_map('가구/인테리어','SEASON',           0,100);
CALL _facet_map('가구/인테리어','WASH',             0,110);
CALL _facet_map('가구/인테리어','ORIGIN',           0,120);
CALL _facet_map('가구/인테리어','KC_CERT',          0,130);

-- -----------------------------------------------------------------------------
-- 4.6 출산/육아 — 사용 연령·KC 인증이 최우선(어린이제품안전특별법)
-- -----------------------------------------------------------------------------
CALL _facet_map('출산/육아','AGE_RANGE',      1, 10);
CALL _facet_map('출산/육아','KC_CERT',        1, 20);
CALL _facet_map('출산/육아','BABY_GENDER',    1, 30);
CALL _facet_map('출산/육아','COLOR',          1, 40);
CALL _facet_map('출산/육아','MATERIAL',       1, 50);
CALL _facet_map('출산/육아','SIZE_KIDS_CM',   0, 60);
CALL _facet_map('출산/육아','DIAPER_STAGE',   0, 70);
CALL _facet_map('출산/육아','DIAPER_TYPE',    0, 80);
CALL _facet_map('출산/육아','FORMULA_STAGE',  0, 90);
CALL _facet_map('출산/육아','WEIGHT_LIMIT',   0,100);
CALL _facet_map('출산/육아','SET_QTY',        0,110);
CALL _facet_map('출산/육아','SAFETY_MARK',    0,120);
CALL _facet_map('출산/육아','ECO_CERT',       0,130);

-- -----------------------------------------------------------------------------
-- 4.7 식품
-- -----------------------------------------------------------------------------
CALL _facet_map('식품','STORAGE_TEMP',  1, 10);
CALL _facet_map('식품','ORIGIN',        1, 20);
CALL _facet_map('식품','WEIGHT_RANGE',  1, 30);
CALL _facet_map('식품','SET_QTY',       1, 40);
CALL _facet_map('식품','FOOD_CERT',     1, 50);
CALL _facet_map('식품','HEALTH_FUNC',   1, 60);
CALL _facet_map('식품','HFF_CERT',      0, 70);
CALL _facet_map('식품','ALLERGY_FREE',  0, 80);
CALL _facet_map('식품','NUTRITION',     0, 90);
CALL _facet_map('식품','FLAVOR',        0,100);
CALL _facet_map('식품','COOK_TYPE',     0,110);
CALL _facet_map('식품','GMO',           0,120);
CALL _facet_map('식품','EXPIRY_SOON',   0,130);

-- -----------------------------------------------------------------------------
-- 4.8 스포츠/레저 — 종목 축은 CATEGORY(2뎁스 32종)가 담당한다.
-- -----------------------------------------------------------------------------
CALL _facet_map('스포츠/레저','GEAR_TYPE',        1, 10);
CALL _facet_map('스포츠/레저','GENDER',           1, 20);
CALL _facet_map('스포츠/레저','COLOR',            1, 30);
CALL _facet_map('스포츠/레저','MATERIAL',         1, 40);
CALL _facet_map('스포츠/레저','SIZE_ALPHA',       0, 50);
CALL _facet_map('스포츠/레저','SIZE_SHOE_MM',     0, 60);
CALL _facet_map('스포츠/레저','SKILL_LEVEL',      0, 70);
CALL _facet_map('스포츠/레저','USE_ENV',          0, 80);
CALL _facet_map('스포츠/레저','CAPACITY_PERSON',  0, 90);
CALL _facet_map('스포츠/레저','SET_COMPOSITION',  0,100);
CALL _facet_map('스포츠/레저','SEASON',           0,110);
CALL _facet_map('스포츠/레저','KC_CERT',          0,120);

-- -----------------------------------------------------------------------------
-- 4.9 생활/건강 — 2뎁스 35개가 서로 너무 이질적이다(주방용품·반려동물·공구·문구·
--     자동차용품·의료용품·원예…). 1뎁스에서는 공통 + 카테고리 + 색상·소재만 노출하고,
--     품목별 속성 필터는 2뎁스를 고른 뒤에 부여한다(후속 작업).
-- -----------------------------------------------------------------------------
CALL _facet_map('생활/건강','COLOR',     1, 10);
CALL _facet_map('생활/건강','MATERIAL',  1, 20);
CALL _facet_map('생활/건강','ORIGIN',    0, 30);
CALL _facet_map('생활/건강','SET_QTY',   0, 40);

-- -----------------------------------------------------------------------------
-- 4.10 여가/생활편의 — 물리 상품이 아니라 서비스·이용권이다.
--      ⚠ 배송·재고 필터를 노출하면 안 된다. 이 절의 핵심은 아래 _facet_hide 두 줄이다.
-- -----------------------------------------------------------------------------
CALL _facet_map('여가/생활편의','REGION',       1, 10);
CALL _facet_map('여가/생활편의','DURATION',     1, 20);
CALL _facet_map('여가/생활편의','USE_METHOD',   1, 30);
CALL _facet_map('여가/생활편의','HEADCOUNT',    0, 40);
CALL _facet_map('여가/생활편의','VALID_UNTIL',  0, 50);
CALL _facet_map('여가/생활편의','REFUND',       0, 60);
CALL _facet_map('여가/생활편의','RESERVE',      0, 70);
CALL _facet_hide('여가/생활편의','DELIVERY');
CALL _facet_hide('여가/생활편의','STOCK');

-- -----------------------------------------------------------------------------
-- 4.11 도서 — 저자·출판사·출간일이 브랜드·사이즈를 대체한다.
--      색상·사이즈·소재는 애초에 붙이지 않는다(Tier 1 은 opt-in 이라 별도 hide 불필요).
-- -----------------------------------------------------------------------------
CALL _facet_map('도서','AUTHOR',          1, 10);
CALL _facet_map('도서','PUBLISHER',       1, 20);
CALL _facet_map('도서','PUBLISH_YEAR',    1, 30);
CALL _facet_map('도서','BOOK_FORM',       1, 40);
CALL _facet_map('도서','BOOK_CONDITION',  1, 50);
CALL _facet_map('도서','LANGUAGE',        0, 60);
CALL _facet_map('도서','TARGET_AGE',      0, 70);
CALL _facet_map('도서','PAGES',           0, 80);
CALL _facet_map('도서','BOOK_SIZE',       0, 90);
-- 도서는 브랜드 개념이 없다(출판사가 그 역할). 브랜드 필터를 끈다.
CALL _facet_hide('도서','BRAND');

-- 4.12 미분류 — 공통 필터만. 매핑 없음.

DROP PROCEDURE `_facet_map`;
DROP PROCEDURE `_facet_hide`;


-- -----------------------------------------------------------------------------
-- 가격 구간 — 카테고리별 오버라이드 (§3.3)
-- 전 카테고리 동일 구간을 쓰면 안 된다(식품 평균 6.7만 vs 디지털·가전 평균 68만).
-- Tier 0 PRICE 는 category_facet 행이 없어도 동작하므로, 여기서는 구간을 바꾸기 위해
-- 행을 만들고 meta_json 으로 facet_definition 의 기본 프리셋을 덮어쓴다.
-- -----------------------------------------------------------------------------
INSERT INTO category_facet (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order, meta_json)
SELECT c.id, f.id, 1, 1, 1, 20,
       JSON_OBJECT('preset', JSON_ARRAY(
           JSON_OBJECT('code','P1','name','1만원 이하','min',0,'max',10000),
           JSON_OBJECT('code','P2','name','1~3만원','min',10000,'max',30000),
           JSON_OBJECT('code','P3','name','3~5만원','min',30000,'max',50000),
           JSON_OBJECT('code','P4','name','5~10만원','min',50000,'max',100000),
           JSON_OBJECT('code','P5','name','10만원 이상','min',100000,'max',NULL)))
  FROM categories c JOIN facet_definition f ON f.facet_code = 'PRICE'
 WHERE c.depth = 1 AND c.type = 'NORMAL' AND c.name IN ('식품','화장품/미용','도서')
ON DUPLICATE KEY UPDATE meta_json = VALUES(meta_json);

INSERT INTO category_facet (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order, meta_json)
SELECT c.id, f.id, 1, 1, 1, 20,
       JSON_OBJECT('preset', JSON_ARRAY(
           JSON_OBJECT('code','P1','name','3만원 이하','min',0,'max',30000),
           JSON_OBJECT('code','P2','name','3~10만원','min',30000,'max',100000),
           JSON_OBJECT('code','P3','name','10~30만원','min',100000,'max',300000),
           JSON_OBJECT('code','P4','name','30~50만원','min',300000,'max',500000),
           JSON_OBJECT('code','P5','name','50만원 이상','min',500000,'max',NULL)))
  FROM categories c JOIN facet_definition f ON f.facet_code = 'PRICE'
 WHERE c.depth = 1 AND c.type = 'NORMAL' AND c.name = '스포츠/레저'
ON DUPLICATE KEY UPDATE meta_json = VALUES(meta_json);

INSERT INTO category_facet (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order, meta_json)
SELECT c.id, f.id, 1, 1, 1, 20,
       JSON_OBJECT('preset', JSON_ARRAY(
           JSON_OBJECT('code','P1','name','10만원 이하','min',0,'max',100000),
           JSON_OBJECT('code','P2','name','10~30만원','min',100000,'max',300000),
           JSON_OBJECT('code','P3','name','30~50만원','min',300000,'max',500000),
           JSON_OBJECT('code','P4','name','50~100만원','min',500000,'max',1000000),
           JSON_OBJECT('code','P5','name','100만원 이상','min',1000000,'max',NULL)))
  FROM categories c JOIN facet_definition f ON f.facet_code = 'PRICE'
 WHERE c.depth = 1 AND c.type = 'NORMAL' AND c.name = '가구/인테리어'
ON DUPLICATE KEY UPDATE meta_json = VALUES(meta_json);

INSERT INTO category_facet (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order, meta_json)
SELECT c.id, f.id, 1, 1, 1, 20,
       JSON_OBJECT('preset', JSON_ARRAY(
           JSON_OBJECT('code','P1','name','10만원 이하','min',0,'max',100000),
           JSON_OBJECT('code','P2','name','10~50만원','min',100000,'max',500000),
           JSON_OBJECT('code','P3','name','50~100만원','min',500000,'max',1000000),
           JSON_OBJECT('code','P4','name','100~200만원','min',1000000,'max',2000000),
           JSON_OBJECT('code','P5','name','200만원 이상','min',2000000,'max',NULL)))
  FROM categories c JOIN facet_definition f ON f.facet_code = 'PRICE'
 WHERE c.depth = 1 AND c.type = 'NORMAL' AND c.name = '디지털/가전'
ON DUPLICATE KEY UPDATE meta_json = VALUES(meta_json);


-- -----------------------------------------------------------------------------
-- 검증
--   SELECT c.name, COUNT(*) AS facets, SUM(cf.is_primary) AS primaries
--     FROM category_facet cf JOIN categories c ON c.id = cf.category_id
--    WHERE cf.is_visible = 1 GROUP BY c.name ORDER BY facets DESC;
-- -----------------------------------------------------------------------------
