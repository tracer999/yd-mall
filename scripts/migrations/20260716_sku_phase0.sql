-- =====================================================================
-- Phase 0: 상품·SKU·옵션·세트 스키마 추가 (무중단, 순수 additive)
-- 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §26
-- 계획: docs/사이트개선/상품_SKU_옵션_세트_개발계획서.md Phase 0
-- 주의: MySQL 8.x 는 ADD COLUMN IF NOT EXISTS 미지원 → 1회성 실행 전제.
--       재실행 시 ALTER 중복 오류는 무시 가능(컬럼 이미 존재).
-- =====================================================================

-- 26.1 상품 유형 플래그 --------------------------------------------------
ALTER TABLE products
  ADD COLUMN product_type ENUM('SINGLE','OPTION','BUNDLE','SET','GIFT_SET','BUILD_SET')
      NOT NULL DEFAULT 'SINGLE' COMMENT '상품 형태' AFTER category_id;

-- 26.2 SKU — 재고·거래의 기준 단위 --------------------------------------
CREATE TABLE IF NOT EXISTS product_sku (
  id            INT NOT NULL AUTO_INCREMENT,
  mall_id       BIGINT NOT NULL DEFAULT 1,
  product_id    INT NOT NULL COMMENT '소속 상품(products.id, INT)',
  sku_code      VARCHAR(100) DEFAULT NULL COMMENT '내부 SKU 코드',
  barcode       VARCHAR(100) DEFAULT NULL,
  supplier_code VARCHAR(100) DEFAULT NULL COMMENT '공급처 상품코드',
  purchase_price INT DEFAULT 0 COMMENT '원가',
  price         INT NOT NULL COMMENT '판매가',
  stock         INT NOT NULL DEFAULT 0,
  stock_managed TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0=재고를 구성 SKU에서 파생(복합상품 대표 SKU)',
  status        ENUM('ON','OFF') NOT NULL DEFAULT 'ON' COMMENT 'SKU(variant) on/off. 생명주기는 products.status',
  is_default    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '단일상품/대표 SKU 여부(상품당 1행)',
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sku_code (product_id, sku_code),
  KEY idx_sku_product (product_id),
  KEY idx_sku_mall (mall_id),
  CONSTRAINT fk_sku_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 SKU(재고·거래 단위)';

-- 26.3 옵션 사전 (표준 옵션명/옵션값 — mall 스코프) ----------------------
CREATE TABLE IF NOT EXISTS option_definition (
  id           INT NOT NULL AUTO_INCREMENT,
  mall_id      BIGINT NOT NULL DEFAULT 1,
  option_code  VARCHAR(50) NOT NULL COMMENT 'COLOR, SIZE, CAPACITY ...',
  option_name  VARCHAR(50) NOT NULL COMMENT '기본 표시명(색상)',
  input_type   ENUM('SELECT','TEXT') NOT NULL DEFAULT 'SELECT',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_option_def (mall_id, option_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='표준 옵션명 사전';

CREATE TABLE IF NOT EXISTS option_value_definition (
  id            INT NOT NULL AUTO_INCREMENT,
  option_definition_id INT NOT NULL,
  value_code    VARCHAR(50) NOT NULL COMMENT 'BLACK',
  display_name  VARCHAR(100) NOT NULL COMMENT '블랙',
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_optval (option_definition_id, value_code),
  CONSTRAINT fk_optval_def FOREIGN KEY (option_definition_id) REFERENCES option_definition (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='표준 옵션값 사전(추천값)';

-- 26.4 카테고리-옵션 추천 매핑 (강제 아님, 상속) ------------------------
CREATE TABLE IF NOT EXISTS category_option (
  id            INT NOT NULL AUTO_INCREMENT,
  category_id   INT NOT NULL,
  option_definition_id INT NOT NULL,
  is_required   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '빌더는 필수 최소화 권장',
  is_recommended TINYINT(1) NOT NULL DEFAULT 1,
  allow_custom_value TINYINT(1) NOT NULL DEFAULT 1,
  inherit_to_children TINYINT(1) NOT NULL DEFAULT 1 COMMENT '하위 상속',
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cat_opt (category_id, option_definition_id),
  CONSTRAINT fk_catopt_cat FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
  CONSTRAINT fk_catopt_def FOREIGN KEY (option_definition_id) REFERENCES option_definition (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='카테고리별 추천 옵션 템플릿';

-- 26.5 상품 확정 옵션 (템플릿과 분리) ----------------------------------
CREATE TABLE IF NOT EXISTS product_option (
  id            INT NOT NULL AUTO_INCREMENT,
  product_id    INT NOT NULL,
  option_definition_id INT DEFAULT NULL COMMENT '표준 사전 참조(직접입력이면 NULL)',
  option_name   VARCHAR(50) NOT NULL COMMENT '확정 표시명 스냅샷',
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_prodopt_product (product_id),
  CONSTRAINT fk_prodopt_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 확정 옵션명';

CREATE TABLE IF NOT EXISTS product_option_value (
  id            INT NOT NULL AUTO_INCREMENT,
  product_option_id INT NOT NULL,
  value_name    VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_prodoptval_opt (product_option_id),
  CONSTRAINT fk_prodoptval_opt FOREIGN KEY (product_option_id) REFERENCES product_option (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 확정 옵션값';

-- 26.6 SKU ↔ 옵션값 조합 -----------------------------------------------
CREATE TABLE IF NOT EXISTS sku_option_value (
  sku_id           INT NOT NULL,
  product_option_id INT NOT NULL,
  product_option_value_id INT NOT NULL,
  PRIMARY KEY (sku_id, product_option_id),
  KEY idx_sov_value (product_option_value_id),
  CONSTRAINT fk_sov_sku FOREIGN KEY (sku_id) REFERENCES product_sku (id) ON DELETE CASCADE,
  CONSTRAINT fk_sov_optval FOREIGN KEY (product_option_value_id) REFERENCES product_option_value (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='SKU-옵션값 조합';

-- 26.7 상품 속성 (판매옵션과 분리) -------------------------------------
CREATE TABLE IF NOT EXISTS product_attribute (
  id            INT NOT NULL AUTO_INCREMENT,
  product_id    INT NOT NULL,
  attr_name     VARCHAR(50) NOT NULL COMMENT '제조사, 원산지, 재질 ...',
  attr_value    VARCHAR(255) NOT NULL,
  is_searchable TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_attr_product (product_id),
  CONSTRAINT fk_attr_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 속성(검색/설명용, 구매 선택 아님)';

-- 26.8 복합상품 구성 (묶음/세트/기획) ---------------------------------
CREATE TABLE IF NOT EXISTS composite_component (
  id            INT NOT NULL AUTO_INCREMENT,
  composite_product_id INT NOT NULL COMMENT '복합상품 products.id',
  component_sku_id INT NOT NULL COMMENT '구성 SKU(product_sku.id)',
  quantity      INT NOT NULL DEFAULT 1 COMMENT '세트당 필요 수량',
  is_optional   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '선택형 세트(BUILD_SET)용',
  display_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_comp (composite_product_id, component_sku_id),
  KEY idx_comp_sku (component_sku_id),
  CONSTRAINT fk_comp_product FOREIGN KEY (composite_product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_comp_sku FOREIGN KEY (component_sku_id) REFERENCES product_sku (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='복합상품 구성(기존 SKU 참조)';

-- 28. 장바구니·주문 확장 (컬럼만, 아직 미사용) -------------------------
ALTER TABLE carts
  ADD COLUMN sku_id INT DEFAULT NULL COMMENT '선택 SKU(옵션상품 필수)' AFTER product_id,
  ADD KEY idx_carts_sku (sku_id),
  ADD CONSTRAINT fk_carts_sku FOREIGN KEY (sku_id) REFERENCES product_sku (id) ON DELETE CASCADE;

ALTER TABLE order_items
  ADD COLUMN sku_id INT DEFAULT NULL COMMENT '주문 SKU(삭제 대비 스냅샷 병행)' AFTER product_id,
  ADD COLUMN option_snapshot VARCHAR(255) DEFAULT NULL COMMENT '주문 시점 옵션 조합 텍스트(예: 블랙 / M)' AFTER product_name,
  ADD KEY idx_order_items_sku (sku_id);
