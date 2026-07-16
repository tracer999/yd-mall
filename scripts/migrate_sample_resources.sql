-- 샘플 데이터 리소스 테이블 — 몰 생성 시 주입되는 샘플의 "원본"
-- 설계: docs/사이트개선/샘플_데이터_리소스_설계.md
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sample_resources.sql
--
-- 배경: services/mall/sampleSeeder.js 가 CATEGORIES/BRANDS/PRODUCTS 를 파일 상수로 하드코딩하고 있었다.
--       납품처마다 샘플을 바꾸려면 코드를 고쳐야 해서, 이를 리소스 테이블로 옮긴다.
--       관리 화면: 서비스 관리 → 샘플 데이터 관리 (/admin/service/samples).
--
-- 원칙:
--   1) **몰과 무관한 전역 리소스**. mall_id 없음 — 납품 시 몰이 0개여도 존재해야 한다.
--      ⚠ 그래서 mallEraser 의 MALL_SCOPED_TABLES 에 넣지 않는다(몰 삭제와 무관).
--   2) 시더는 sample_key 로 서로를 참조한다(자동증가 id 가 아니라). 행을 지웠다 다시 넣어도 관계 유지.
--   3) 이미지는 반드시 커밋되는 경로만 쓴다: /images/placeholders/sample/* (기본 SVG) 또는
--      /images/sample/* (큐레이션 자산). **/uploads/* 는 .gitignore 라 납품본에서 깨진다.**
--   4) 기본 시드는 기존 하드코딩 상수와 동일하게 넣어 전환 전후 동작을 보존한다.

-- ---------------------------------------------------------------------------
-- 1) sample_category — 샘플 카테고리 + 샘플 브랜드
--    실제 categories 모델과 동일하게 type 으로 분기한다(브랜드는 categories.type='BRAND').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sample_category (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    sample_key    VARCHAR(50) NOT NULL COMMENT '시더 참조 키(living/beauty/origin…). slug 접두어에도 쓰임',
    type          ENUM('NORMAL','BRAND') NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL=카테고리, BRAND=브랜드',
    name          VARCHAR(100) NOT NULL COMMENT '표시명',
    image_path    VARCHAR(255) NULL COMMENT 'categories.logo_image_path 로 들어감. /images/... 경로만',
    display_order INT         NOT NULL DEFAULT 0,
    is_active     TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '0이면 시딩에서 제외',
    created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sc_type_key (type, sample_key),
    KEY idx_sc_active (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='샘플 카테고리/브랜드 리소스(전역 — 몰 생성 시 복제됨)';

-- ---------------------------------------------------------------------------
-- 2) sample_product — 샘플 상품
--    category_key/brand_key 는 sample_category.sample_key 를 가리킨다(FK 아님 — 키 기반 느슨한 참조).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sample_product (
    id                BIGINT      NOT NULL AUTO_INCREMENT,
    sample_key        VARCHAR(50) NOT NULL COMMENT '시더 참조 키(p1…). products.slug = sm{mallId}-{sample_key}',
    category_key      VARCHAR(50) NOT NULL COMMENT 'sample_category(type=NORMAL).sample_key',
    brand_key         VARCHAR(50) NULL COMMENT 'sample_category(type=BRAND).sample_key',
    name              VARCHAR(255) NOT NULL,
    short_description VARCHAR(500) NULL,
    price             INT         NOT NULL DEFAULT 0,
    original_price    INT         NULL COMMENT '없으면 price 와 동일 취급(할인율 0)',
    badge             VARCHAR(20) NULL COMMENT 'products.product_badge (BEST/NEW/RECOMMEND…)',
    main_image        VARCHAR(255) NULL COMMENT '대표+썸네일 공용. /images/... 경로만',
    deal_price        INT         NULL COMMENT '값이 있으면 샘플 특가(deal_item)에 포함',
    is_new            TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '1이면 sale_start_date=오늘 → 신상품 캐러셀',
    display_order     INT         NOT NULL DEFAULT 0,
    is_active         TINYINT(1)  NOT NULL DEFAULT 1,
    created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sp_key (sample_key),
    KEY idx_sp_active (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='샘플 상품 리소스(전역 — 몰 생성 시 복제됨)';

-- ---------------------------------------------------------------------------
-- 3) sample_hero_slide — 샘플 슬라이더(히어로 쇼케이스)
--    hero_slide(mall_id 보유)로 복제된다.
--    ⚠ banners 테이블은 mall_id 가 없어(전 몰 공용) 몰별 샘플 배너로 쓸 수 없다.
--      그래서 샘플 슬라이더는 hero_slide 만 사용한다(현행 sampleSeeder 와 동일).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sample_hero_slide (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    slot        ENUM('MAIN','FEATURE') NOT NULL DEFAULT 'MAIN' COMMENT 'MAIN=중앙 슬라이더, FEATURE=우측 카드',
    product_key VARCHAR(50) NULL COMMENT 'sample_product.sample_key (링크·상품 연결용)',
    label       VARCHAR(50) NULL COMMENT '예: [리빙 컬렉션]',
    headline    VARCHAR(200) NULL COMMENT '없으면 상품명으로 폴백',
    image_path  VARCHAR(255) NULL COMMENT '없으면 상품 대표이미지로 폴백. /images/... 경로만',
    sort_order  INT         NOT NULL DEFAULT 0,
    is_active   TINYINT(1)  NOT NULL DEFAULT 1,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_shs_slot_product (slot, product_key),
    KEY idx_shs_slot (slot, sort_order),
    KEY idx_shs_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='샘플 히어로 슬라이드 리소스(전역 — 몰 생성 시 hero_slide 로 복제됨)';

-- 위 CREATE 가 이미 존재하던 테이블이라면 UNIQUE 키를 보강한다(멱등).
SET @db := DATABASE();
SET @has_uk := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sample_hero_slide' AND INDEX_NAME = 'uk_shs_slot_product');
SET @sql := IF(@has_uk = 0,
    'ALTER TABLE sample_hero_slide ADD UNIQUE KEY uk_shs_slot_product (slot, product_key)',
    "SELECT 'uk_shs_slot_product 이미 존재 — 건너뜀'");
PREPARE s1 FROM @sql; EXECUTE s1; DEALLOCATE PREPARE s1;

-- ---------------------------------------------------------------------------
-- 4) 기본 시드 — 기존 sampleSeeder.js 하드코딩 상수와 **동일한 값**.
--    전환 전후로 몰 생성 결과가 바뀌지 않도록 한다. 재실행 가드는 sample_key 기준.
-- ---------------------------------------------------------------------------

-- ⚠️ 기본 시드는 **완전히 빈 설치일 때만** 넣는다(@fresh).
--    scripts/extract_sample_from_mall.js --replace 로 샘플을 교체한 뒤 이 파일을 다시 돌려도
--    플레이스홀더가 되살아나 실제 샘플과 섞이지 않게 하기 위함이다.
--    (UNION ALL 파생테이블 + WHERE @fresh — INSERT ... VALUES 에는 WHERE 를 붙일 수 없다)
SET @fresh := IF((SELECT COUNT(*) FROM sample_product) = 0
               AND (SELECT COUNT(*) FROM sample_category) = 0, 1, 0);

-- 카테고리(NORMAL) 3종 + 브랜드(BRAND) 2종
INSERT IGNORE INTO sample_category (sample_key, type, name, image_path, display_order)
SELECT k, t, n, i, o FROM (
              SELECT 'living' AS k, 'NORMAL' AS t, '리빙'       AS n, '/images/placeholders/sample/cat-a.svg'   AS i, 1 AS o
    UNION ALL SELECT 'beauty',      'NORMAL',      '뷰티',            '/images/placeholders/sample/cat-b.svg',        2
    UNION ALL SELECT 'food',        'NORMAL',      '푸드',            '/images/placeholders/sample/cat-c.svg',        3
    UNION ALL SELECT 'origin',      'BRAND',       '오리진',          '/images/placeholders/sample/brand-1.svg',      1
    UNION ALL SELECT 'daily',       'BRAND',       '데일리로그',      '/images/placeholders/sample/brand-2.svg',      2
) x WHERE @fresh = 1;

-- 상품 6종
INSERT IGNORE INTO sample_product
    (sample_key, category_key, brand_key, name, short_description, price, original_price, badge, main_image, deal_price, is_new, display_order)
SELECT k, ck, bk, n, sd, pr, op, bg, im, dp, nw, o FROM (
              SELECT 'p1' AS k, 'living' AS ck, 'origin' AS bk, '코튼 워시드 담요' AS n,
                     '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.' AS sd,
                     39000 AS pr, 49000 AS op, 'BEST' AS bg, '/images/placeholders/sample/prod-1.svg' AS im,
                     34000 AS dp, 0 AS nw, 1 AS o
    UNION ALL SELECT 'p2','living','daily', '오크 우드 트레이',     '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.', 24000, 24000, 'NEW',       '/images/placeholders/sample/prod-2.svg', NULL,  1, 2
    UNION ALL SELECT 'p3','beauty','origin','데일리 핸드크림 세트', '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.', 18000, 22000, 'BEST',      '/images/placeholders/sample/prod-3.svg', NULL,  0, 3
    UNION ALL SELECT 'p4','beauty','daily', '틴티드 립밤 3종',      '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.', 12000, 12000, 'NEW',       '/images/placeholders/sample/prod-1.svg', NULL,  1, 4
    UNION ALL SELECT 'p5','food',  'origin','핸드드립 커피백 20입', '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.', 15000, 20000, 'BEST',      '/images/placeholders/sample/prod-2.svg', 12000, 0, 5
    UNION ALL SELECT 'p6','food',  'daily', '유기농 그래놀라',      '샘플 상품입니다. 상품 관리에서 자유롭게 수정·삭제하세요.',  9900,  9900, 'RECOMMEND', '/images/placeholders/sample/prod-3.svg', NULL,  0, 6
) x WHERE @fresh = 1;

-- 히어로 슬라이드 — MAIN 3(p1/p3/p5) + FEATURE 1(p2)
INSERT IGNORE INTO sample_hero_slide (slot, product_key, label, headline, image_path, sort_order)
SELECT s, pk, l, h, i, o FROM (
              SELECT 'MAIN' AS s, 'p1' AS pk, '리빙 컬렉션' AS l, '집을 감싸는 부드러움' AS h, '/images/placeholders/sample/hero-1.svg' AS i, 0 AS o
    UNION ALL SELECT 'MAIN',      'p3',       '뷰티 에센셜',       '하루를 채우는 케어',         '/images/placeholders/sample/hero-2.svg',      1
    UNION ALL SELECT 'MAIN',      'p5',       '푸드 셀렉션',       '아침을 여는 한 잔',          '/images/placeholders/sample/hero-3.svg',      2
    UNION ALL SELECT 'FEATURE',   'p2',       '신상품',            '새로 나온 아이템',           '/images/placeholders/sample/prod-2.svg',      0
) x WHERE @fresh = 1;
