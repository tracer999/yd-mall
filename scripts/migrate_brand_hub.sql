-- 브랜드 허브 재설계 — 스키마
-- docs/사이트개선/brand_hub_dev_plan.md §4
--
-- 브랜드 마스터는 categories(type='BRAND') 를 그대로 두고 1:1 확장 테이블만 붙인다.
-- products.brand_category_id / coupons.scope_json.brandIds / best_group.ref_id /
-- brand_likes.category_id / custom_menu.link_target 이 전부 categories.id 를 참조하므로
-- 마스터를 옮기면 전면 마이그레이션이 된다.

-- ─────────────────────────────────────────────────────────
-- 1. brand_profile — 브랜드 전용 속성 (categories 1:1 확장)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_profile (
  category_id      INT          NOT NULL PRIMARY KEY,
  mall_id          BIGINT       NOT NULL DEFAULT 1,
  name_en          VARCHAR(100) NULL,
  alias            VARCHAR(255) NULL COMMENT '콤마 구분 별칭',
  initial          VARCHAR(8)   NULL COMMENT '초성 인덱스 버킷: ㄱ~ㅎ / A~Z / #',
  initial_chosung  VARCHAR(32)  NULL COMMENT '초성 검색용 (나이키 → ㄴㅇㅋ)',
  tagline          VARCHAR(200) NULL,
  story            TEXT         NULL,
  country          VARCHAR(50)  NULL,
  official_yn      TINYINT(1)   NOT NULL DEFAULT 0,
  shop_enabled     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '공식 브랜드관 확장 활성',
  hero_image_url   VARCHAR(500) NULL,
  seo_title        VARCHAR(200) NULL,
  seo_description  VARCHAR(300) NULL,
  seller_name      VARCHAR(100) NULL COMMENT 'products.provider 유래',
  is_seller        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '브랜드가 아닌 입점 셀러',
  approved_at      DATETIME     NULL,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bp_mall_initial (mall_id, initial),
  KEY idx_bp_official (mall_id, official_yn),
  CONSTRAINT fk_brand_profile_cat FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 2. brand_stat — 집계 캐시 (브랜드 홈 전 섹션의 성능 기반)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_stat (
  category_id       INT           NOT NULL PRIMARY KEY,
  mall_id           BIGINT        NOT NULL,
  product_count     INT           NOT NULL DEFAULT 0,
  new_count         INT           NOT NULL DEFAULT 0,
  top_category_id   INT           NULL,
  min_price         INT           NULL,
  max_price         INT           NULL,
  view_score        INT           NOT NULL DEFAULT 0,
  sales_count       INT           NOT NULL DEFAULT 0,
  like_count        INT           NOT NULL DEFAULT 0,
  brand_like_count  INT           NOT NULL DEFAULT 0,
  cart_count        INT           NOT NULL DEFAULT 0,
  popularity_score  DECIMAL(12,2) NOT NULL DEFAULT 0,
  benefit_count     INT           NOT NULL DEFAULT 0,
  rep_product_ids   JSON          NULL COMMENT '타일 썸네일용 대표 상품 4개',
  last_product_at   DATETIME      NULL,
  calculated_at     DATETIME      NOT NULL,
  KEY idx_bs_mall_pop (mall_id, popularity_score DESC),
  KEY idx_bs_mall_count (mall_id, product_count DESC),
  KEY idx_bs_mall_new (mall_id, last_product_at DESC),
  KEY idx_bs_mall_topcat (mall_id, top_category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 3. brand_category_stat — 브랜드 × 카테고리 (다대다 물질화)
--    매핑 테이블을 새로 만들지 않고 products 조인 결과를 캐시한다.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_category_stat (
  mall_id       BIGINT NOT NULL,
  category_id   INT    NOT NULL COMMENT '브랜드',
  cat_id        INT    NOT NULL COMMENT '상품 카테고리',
  root_cat_id   INT    NOT NULL COMMENT '루트 카테고리',
  product_count INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (mall_id, category_id, cat_id),
  KEY idx_bcs_root (mall_id, root_cat_id, product_count DESC),
  KEY idx_bcs_cat (mall_id, cat_id, product_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────
-- 4. exhibition — 브랜드 기획전이 어느 브랜드인지 가리킬 컬럼
--    exhibition_type='BRAND' 행은 이미 있으나 브랜드 참조가 없다.
-- ─────────────────────────────────────────────────────────
ALTER TABLE exhibition
  ADD COLUMN brand_category_id INT NULL AFTER exhibition_type,
  ADD KEY idx_ex_brand (mall_id, brand_category_id);
