-- =============================================================================
-- 상품 필터(facet) Phase 1 — 스키마
-- 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §6, §10
--
-- 카테고리마다 다른 필터를 코드가 아니라 DB 로 정의한다.
-- 몰 빌더 제품 성격상 "몰마다 다른 필터 셋" 이 필연이라 하드코딩하면 안 된다.
--
--   facet_definition        필터 1개의 정의 (색상, 발 길이, 에너지소비효율등급 …)
--   facet_value_definition  그 필터가 가질 수 있는 값 (닫힌 집합인 필터만)
--   category_facet          카테고리 ↔ 필터 부여 (계층 상속)
--
-- 값 저장소는 신설하지 않는다. 이미 있는 product_attribute(EAV)를 쓴다.
-- 규약: product_attribute.attr_name = facet_definition.facet_code
--       product_attribute.attr_value = facet_value_definition.value_code (닫힌 집합)
--                                      또는 숫자 문자열 (RANGE 타입)
--
-- 이 마이그레이션은 앱 동작을 바꾸지 않는다(테이블만 생성).
--
-- 적용: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < 20260722_facet_phase1_schema.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. facet_definition — 필터 정의 (전 몰 공통 카탈로그)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `facet_definition` (
  `id`            int NOT NULL AUTO_INCREMENT,
  `facet_code`    varchar(50)  NOT NULL COMMENT '필터 코드. product_attribute.attr_name 및 URL 쿼리 키(소문자)와 동일',
  `facet_name`    varchar(50)  NOT NULL COMMENT '화면 표시명 (색상, 발 길이 …)',
  `tier`          tinyint      NOT NULL DEFAULT '2' COMMENT '0=공통(전 카테고리) 1=그룹(여러 카테고리 공유) 2=카테고리 전용',
  `ui_type`       enum('CHECKBOX','CHIP','COLOR_SWATCH','SIZE_GRID','RANGE','TOGGLE','SELECT')
                               NOT NULL DEFAULT 'CHECKBOX' COMMENT '필터 위젯 종류',
  `value_source`  enum('DEFINITION','ATTRIBUTE','OPTION','COLUMN','CATEGORY','DERIVED')
                               NOT NULL DEFAULT 'ATTRIBUTE' COMMENT '값을 어디서 얻는가',
  `source_key`    varchar(100) DEFAULT NULL COMMENT 'ATTRIBUTE=product_attribute.attr_name / COLUMN=products 컬럼명',
  `data_type`     enum('STRING','NUMBER','BOOL','RANGE') NOT NULL DEFAULT 'STRING',
  `unit`          varchar(20)  DEFAULT NULL COMMENT '단위 표기 (mm, ml, g, cm, 인치 …)',
  `is_multi`      tinyint(1)   NOT NULL DEFAULT '1' COMMENT '다중 선택 허용. 네이버 attributeClassificationType(SINGLE/MULTI_SELECT)와 대응',
  `meta_json`     json         DEFAULT NULL COMMENT '구간 프리셋·별칭 사전 등 위젯별 부가 설정',
  `is_active`     tinyint(1)   NOT NULL DEFAULT '1' COMMENT '0 이면 정의만 두고 노출하지 않는다(예: 리뷰 0건인 평점 필터)',
  `display_order` int          NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_facet_code` (`facet_code`),
  KEY `idx_facet_tier` (`tier`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 필터(facet) 정의';


-- -----------------------------------------------------------------------------
-- 2. facet_value_definition — 필터 값 (닫힌 집합인 필터만)
--
-- 자유 텍스트는 필터가 될 수 없다. 값이 여기 없으면 필터로 노출하지 않는다.
-- meta_json 예: {"hex":"#111111","aliases":["차콜","먹색"]}  ← 색상 스와치 + 별칭 흡수
--               {"min":0,"max":30000}                        ← 가격/수치 구간
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `facet_value_definition` (
  `id`            int NOT NULL AUTO_INCREMENT,
  `facet_id`      int          NOT NULL,
  `value_code`    varchar(50)  NOT NULL COMMENT 'product_attribute.attr_value 및 URL 값과 동일',
  `display_name`  varchar(100) NOT NULL,
  `meta_json`     json         DEFAULT NULL COMMENT 'hex(색상칩) / aliases(별칭 흡수) / min·max(구간)',
  `display_order` int          NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_facet_value` (`facet_id`, `value_code`),
  CONSTRAINT `fk_fvd_facet` FOREIGN KEY (`facet_id`) REFERENCES `facet_definition` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 필터 값 정의';


-- -----------------------------------------------------------------------------
-- 3. category_facet — 카테고리 ↔ 필터 부여 (계층 상속)
--
-- 상속 규칙은 category_option 과 동일하다(services/catalog/categoryOptionService.js:53-84).
--   상위에서 inherit_to_children=1 이면 하위로 전파, 하위에 같은 facet 행이 있으면 하위가 이긴다.
--   is_visible=0 은 "상위에서 상속받았지만 여기서는 끈다" 는 뜻이다.
--   (예: 도서에서 COLOR·SIZE 끄기 / 여가·생활편의에서 DELIVERY·STOCK 끄기)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `category_facet` (
  `id`                  int NOT NULL AUTO_INCREMENT,
  `category_id`         int        NOT NULL COMMENT '1·2·3뎁스 모두 가능',
  `facet_id`            int        NOT NULL,
  `is_primary`          tinyint(1) NOT NULL DEFAULT '0' COMMENT '1뎁스 진입 시 접지 않고 바로 노출',
  `is_visible`          tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = 이 카테고리에서 숨김(상속 취소)',
  `inherit_to_children` tinyint(1) NOT NULL DEFAULT '1',
  `display_order`       int        NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cat_facet` (`category_id`, `facet_id`),
  KEY `idx_cf_category` (`category_id`, `display_order`),
  CONSTRAINT `fk_cf_facet` FOREIGN KEY (`facet_id`) REFERENCES `facet_definition` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='카테고리별 필터 부여';


-- -----------------------------------------------------------------------------
-- 4. product_attribute — 조회용 인덱스 추가
--
-- 테이블은 20260716_sku_phase0.sql 에서 이미 만들었으나 0행이고 참조 코드도 없었다.
-- 필터가 이 테이블을 EXISTS 로 때리므로 (attr_name, attr_value, product_id) 커버링 인덱스가 필요하다.
-- ※ MySQL 8 은 CREATE INDEX IF NOT EXISTS 를 지원하지 않아 프로시저로 감싼다.
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `_facet_add_index`;
DELIMITER //
CREATE PROCEDURE `_facet_add_index`()
BEGIN
    -- 기본 펼침 여부. 카테고리 매핑이 없는 Tier 0 이 전부 펼쳐지면 1뎁스에서
    -- 필터가 12개씩 열려 오히려 못 쓴다. 기본으로 펼칠 것만 1 로 둔다.
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'facet_definition'
                     AND COLUMN_NAME = 'is_primary_default') THEN
        ALTER TABLE `facet_definition`
            ADD COLUMN `is_primary_default` tinyint(1) NOT NULL DEFAULT '0'
            COMMENT '카테고리 매핑이 없을 때의 기본 펼침 여부(주로 Tier 0)'
            AFTER `is_active`;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attribute'
                     AND INDEX_NAME = 'idx_attr_filter') THEN
        ALTER TABLE `product_attribute` ADD INDEX `idx_attr_filter` (`attr_name`, `attr_value`, `product_id`);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attribute'
                     AND INDEX_NAME = 'idx_attr_product_name') THEN
        ALTER TABLE `product_attribute` ADD INDEX `idx_attr_product_name` (`product_id`, `attr_name`);
    END IF;
END //
DELIMITER ;
CALL `_facet_add_index`();
DROP PROCEDURE `_facet_add_index`;


-- -----------------------------------------------------------------------------
-- 검증
-- -----------------------------------------------------------------------------
--   SHOW TABLES LIKE 'facet%';                    -- 2건
--   SHOW TABLES LIKE 'category_facet';            -- 1건
--   SHOW INDEX FROM product_attribute;            -- idx_attr_filter, idx_attr_product_name 존재
