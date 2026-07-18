-- 네이버 기반 글로벌 카테고리 재구성 — Phase 0 (비파괴: 컬럼·로그·스냅샷)
-- 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §3, §5 Phase 0
--
-- 실행:
--   mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_category_00_columns.sql
--
-- 원칙: 멱등(information_schema/IF NOT EXISTS 가드), 파괴 없음. 파괴적 Phase 2·3 이전 안전망.

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 1) categories 컬럼 추가 — origin(출처) / naver_category_id(네이버 노드 매핑)
--    origin 은 "사용자 생성분 보존"의 집행 근거. 없으면 규칙을 강제할 수 없다.
--    ⚠ categories.naver_category_id 와 products.naver_category_id 는 축이 다르다:
--       categories = 이 우리 노드 ↔ 네이버 노드 매핑
--       products   = 이 상품이 근거로 삼은 네이버 리프
-- ---------------------------------------------------------------------------
SET @has_origin := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'origin');
SET @sql := IF(@has_origin = 0,
    "ALTER TABLE categories ADD COLUMN origin ENUM('naver','user') NOT NULL DEFAULT 'user' COMMENT '출처 — naver:표준시드 / user:사용자·상품등록 생성' AFTER type",
    "SELECT 'categories.origin 이미 존재 — 건너뜀'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_ncid := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'naver_category_id');
SET @sql := IF(@has_ncid = 0,
    "ALTER TABLE categories ADD COLUMN naver_category_id VARCHAR(64) NULL COMMENT '대응 네이버 카테고리 ID(origin=naver 일 때)' AFTER shopify_collection_id",
    "SELECT 'categories.naver_category_id 이미 존재 — 건너뜀'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 인덱스
SET @has_idx1 := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND INDEX_NAME = 'idx_categories_naver');
SET @sql := IF(@has_idx1 = 0,
    "ALTER TABLE categories ADD KEY idx_categories_naver (naver_category_id)",
    "SELECT 'idx_categories_naver 이미 존재 — 건너뜀'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_idx2 := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND INDEX_NAME = 'idx_categories_origin');
SET @sql := IF(@has_idx2 = 0,
    "ALTER TABLE categories ADD KEY idx_categories_origin (type, origin)",
    "SELECT 'idx_categories_origin 이미 존재 — 건너뜀'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 2) category_remap_log — 시드/재매핑/정리/동기화 감사·롤백 원장
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_remap_log (
    id                BIGINT      NOT NULL AUTO_INCREMENT,
    phase             VARCHAR(32) NOT NULL COMMENT 'SEED | REMAP | PRUNE | SYNC',
    from_category_id  INT         NULL COMMENT '이동 전 우리 카테고리',
    to_category_id    INT         NULL COMMENT '이동 후 우리 카테고리(네이버 노드)',
    naver_category_id VARCHAR(64) NULL,
    product_count     INT         NULL COMMENT '이동한 상품 수',
    match_kind        ENUM('PATH','NAME','FUZZY','MANUAL','NONE') NULL,
    score             DECIMAL(4,3) NULL,
    reverted          TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '관리자 롤백 여부',
    note              VARCHAR(500) NULL,
    created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_crl_phase (phase, created_at),
    KEY idx_crl_from (from_category_id),
    KEY idx_crl_kind (match_kind, reverted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='카테고리 재구성 감사·롤백 원장';

-- ---------------------------------------------------------------------------
-- 3) 스냅샷 — 파괴적 Phase 2·3 롤백 근거. 1회성(IF NOT EXISTS 로 재실행 안전).
--    categories 전량 + products(id, category_id) 만.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories_bak_20260719 AS SELECT * FROM categories;
CREATE TABLE IF NOT EXISTS products_catmap_bak_20260719 AS
    SELECT id, category_id, brand_category_id, naver_category_id FROM products;

-- 확인
SELECT 'Phase0 완료' AS status,
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='categories' AND COLUMN_NAME IN ('origin','naver_category_id')) AS new_cols,
    (SELECT COUNT(*) FROM categories_bak_20260719) AS cat_snapshot,
    (SELECT COUNT(*) FROM products_catmap_bak_20260719) AS prod_snapshot;
