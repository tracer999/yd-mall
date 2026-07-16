-- 외부몰 연동 2차 — 네이버 스마트스토어 카테고리/브랜드 "참조 리소스" 스키마
-- 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
--
-- 실행(승인 후):
--   mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sourcing_02_naver_taxonomy.sql
--
-- 목적: 네이버 커머스 API(GET /external/v1/categories)로 수집한 전체 카테고리/브랜드를
--       "상품 등록 시 참고하는 리소스"로 저장한다. **몰 categories 에 자동 반영하지 않는다.**
--       상품 등록 화면에서 관리자가 네이버 카테고리를 검색·선택하면 taxonomyResolver 가
--       그걸 근거로 몰 카테고리를 생성/매핑하고, 상품에는 네이버 참조 ID 를 함께 저장한다.
--
-- 원칙:
--   1) naver_category/naver_brand 는 **전역 리소스**(mall_id 없음) — 네이버 분류는 판매자 공통.
--   2) 멱등: CREATE TABLE IF NOT EXISTS, 컬럼 추가는 information_schema 가드.
--   3) 수집분에 없어진 항목은 삭제하지 않고 is_active=0 (soft) — 과거 매핑 추적 보존.

-- ---------------------------------------------------------------------------
-- 1) naver_category — 네이버 전체 카테고리 트리(수집 스냅샷)
--    naver_category_id 는 네이버가 주는 문자열 ID(예: '50000008') — 우리 PK 로 사용.
--    whole_category_name 예: "식품>건강식품>홍삼". is_leaf(=last) 인 것만 상품 등록에 선택 가능.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS naver_category (
    naver_category_id   VARCHAR(64)  NOT NULL COMMENT '네이버 카테고리 ID(문자열)',
    name                VARCHAR(255) NOT NULL COMMENT '카테고리명(말단 표시명)',
    whole_category_name VARCHAR(500) NOT NULL DEFAULT '' COMMENT '전체 경로 "대>중>소>세"',
    parent_naver_id     VARCHAR(64)  NULL COMMENT '상위 카테고리 ID(응답에서 유도, 없으면 NULL)',
    category_level      TINYINT      NULL COMMENT '깊이(1=대분류 …). 응답 미제공 시 NULL',
    is_leaf             TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '말단 여부(last). 상품 등록엔 리프만 선택',
    is_active           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '최근 수집분에 존재=1. 사라지면 0(soft)',
    raw_json            JSON         NULL COMMENT '원본 응답 항목(스키마 변화 대비 보존)',
    fetched_at          DATETIME     NOT NULL COMMENT '이 항목이 마지막으로 수집된 시각',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (naver_category_id),
    KEY idx_nc_leaf_active (is_leaf, is_active),
    KEY idx_nc_parent (parent_naver_id),
    FULLTEXT KEY ft_nc_whole (whole_category_name, name) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='네이버 스마트스토어 전체 카테고리(참조 리소스 — 몰 categories 와 무관)';

-- ---------------------------------------------------------------------------
-- 2) naver_brand — 네이버 브랜드 목록(최소 골격)
--    ⚠ 브랜드는 카테고리처럼 "전체 목록" API 로 떨어지지 않고 카탈로그/브랜드 조회
--       구조가 달라, 인증정보 발급 후 실제 응답을 보고 컬럼을 확정한다.
--       지금은 (id, name) 최소 컬럼 + raw_json 으로 두어 수집 골격을 먼저 세운다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS naver_brand (
    naver_brand_id      VARCHAR(64)  NOT NULL COMMENT '네이버 브랜드 ID',
    name                VARCHAR(255) NOT NULL COMMENT '브랜드명',
    name_en             VARCHAR(255) NULL COMMENT '영문 브랜드명(있으면)',
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    raw_json            JSON         NULL,
    fetched_at          DATETIME     NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (naver_brand_id),
    KEY idx_nb_active (is_active),
    KEY idx_nb_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='네이버 브랜드 목록(참조 리소스 — 골격, 발급 후 확정)';

-- ---------------------------------------------------------------------------
-- 3) naver_taxonomy_sync_log — 수집 회차 로그(관리자 현황 화면 근거)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS naver_taxonomy_sync_log (
    id             BIGINT      NOT NULL AUTO_INCREMENT,
    resource       ENUM('CATEGORY','BRAND') NOT NULL,
    trigger_by     ENUM('CRON','MANUAL')    NOT NULL DEFAULT 'CRON',
    credential_id  BIGINT      NULL COMMENT '사용한 mall_channel_credential.id',
    status         ENUM('RUNNING','SUCCESS','FAILED','SKIPPED') NOT NULL DEFAULT 'RUNNING',
    total_count    INT         NULL COMMENT '이번 수집 항목 수',
    upserted_count INT         NULL COMMENT '신규+갱신 수',
    deactivated_count INT      NULL COMMENT 'is_active=0 로 내린 수',
    message        VARCHAR(500) NULL,
    started_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at    DATETIME    NULL,
    PRIMARY KEY (id),
    KEY idx_ntsl_res (resource, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='네이버 카테고리/브랜드 수집 회차 로그';

-- ---------------------------------------------------------------------------
-- 4) naver_taxonomy_schedule — 수집 주기(단일 행). best_ranking_schedule 패턴.
--    고정 셸 크론(naver_taxonomy_cron.sh)이 5분마다 깨어나 "지금 주기가 됐는지"만 본다.
--    interval_hours 마다 실행 — 기본 24시간(하루 1회).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS naver_taxonomy_schedule (
    id             TINYINT     NOT NULL DEFAULT 1,
    enabled        TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '자동 수집 사용여부',
    interval_hours INT         NOT NULL DEFAULT 24 COMMENT '수집 주기(시간). 24=하루 1회',
    last_run_at    DATETIME    NULL COMMENT '마지막 실행 시각',
    last_status    ENUM('SUCCESS','FAILED','SKIPPED') NULL,
    updated_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='네이버 카테고리 수집 스케줄(단일 행)';

INSERT INTO naver_taxonomy_schedule (id, enabled, interval_hours)
SELECT 1, 1, 24
WHERE NOT EXISTS (SELECT 1 FROM naver_taxonomy_schedule WHERE id = 1);

-- ---------------------------------------------------------------------------
-- 5) products 참조 컬럼 추가 — 상품이 근거로 삼은 네이버 카테고리/브랜드 ID(멱등 가드)
--    ⚠ 몰 카테고리 매핑 결과(category_id/brand_category_id)와 별개.
--      이건 "이 상품은 네이버 어느 분류를 근거로 등록됐나"의 추적/역연동용 참조값이다.
-- ---------------------------------------------------------------------------
SET @db := DATABASE();

SET @has_ncid := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'naver_category_id');
SET @sql := IF(@has_ncid = 0,
    "ALTER TABLE products ADD COLUMN naver_category_id VARCHAR(64) NULL COMMENT '등록 근거 네이버 카테고리 ID(참조)' AFTER brand_category_id",
    "SELECT 'products.naver_category_id 이미 존재 — 건너뜀'");
PREPARE s1 FROM @sql; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @has_nbid := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'naver_brand_id');
SET @sql := IF(@has_nbid = 0,
    "ALTER TABLE products ADD COLUMN naver_brand_id VARCHAR(64) NULL COMMENT '등록 근거 네이버 브랜드 ID(참조)' AFTER naver_category_id",
    "SELECT 'products.naver_brand_id 이미 존재 — 건너뜀'");
PREPARE s2 FROM @sql; EXECUTE s2; DEALLOCATE PREPARE s2;

-- 조회 인덱스(존재 시 건너뜀)
SET @has_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_naver_cat');
SET @sql := IF(@has_idx = 0,
    "ALTER TABLE products ADD KEY idx_products_naver_cat (naver_category_id)",
    "SELECT 'idx_products_naver_cat 이미 존재 — 건너뜀'");
PREPARE s3 FROM @sql; EXECUTE s3; DEALLOCATE PREPARE s3;

-- ---------------------------------------------------------------------------
-- 6) 관리자 메뉴 — "외부몰 연동" 그룹 아래 "네이버 카테고리 리소스"
--    그룹 id 는 migrate_sourcing_01 에서 만든 '외부몰 연동'(parent NULL, path NULL).
-- ---------------------------------------------------------------------------
SELECT id INTO @sourcing_gid
FROM admin_menus
WHERE name = '외부몰 연동' AND parent_id IS NULL AND path IS NULL
LIMIT 1;

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '네이버 카테고리 리소스' AS name, '/admin/sourcing/naver-taxonomy' AS path, 'bi bi-diagram-3' AS icon_class,
    7 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE @sourcing_gid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/naver-taxonomy');
