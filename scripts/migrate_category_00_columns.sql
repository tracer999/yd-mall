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
-- 감사 로그·스냅샷 테이블은 두지 않는다.
-- 파괴적 작업을 돌릴 때 필요하면 그때 임시 백업 테이블을 만들고, 끝나면 지운다.
-- 상시 스키마에는 시스템 구성에 필요한 테이블만 남긴다.
-- ---------------------------------------------------------------------------

-- 확인
SELECT 'Phase0 완료' AS status,
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='categories' AND COLUMN_NAME IN ('origin','naver_category_id')) AS new_cols;
