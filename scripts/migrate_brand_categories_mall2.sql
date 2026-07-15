-- ---------------------------------------------------------------------------
-- mall_id=2(종합관) 브랜드 카테고리 생성 + 상품 연결
--
--   products.provider (브랜드명 문자열) 를 소스로
--   categories(mall_id=2, type='BRAND') 행을 만들고
--   products.brand_category_id 로 연결한다. mall_id=1 과 동일한 규칙.
--
-- 멱등: 재실행해도 브랜드가 중복 생성되지 않고, display_order 와 링크만 재동기화된다.
--
-- 실행:
--   mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall --default-character-set=utf8mb4 \
--     < scripts/migrate_brand_categories_mall2.sql
--
-- 롤백:
--   scripts/rollback_brand_categories_mall2.sql
--
-- 주의: provider 에는 '오너클랜', '에이치플러스몰' 같은 판매처/셀러명도 섞여 있다.
--       (2026-07-10 기준 의도적으로 전부 브랜드로 생성. 필요 시 관리자에서 개별 비활성)
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

-- TEMPORARY TABLE 은 롤백되지 않으므로 트랜잭션 밖에서 준비한다.
DROP TEMPORARY TABLE IF EXISTS tmp_brand_src;
DROP TEMPORARY TABLE IF EXISTS tmp_brand_existing;

CREATE TEMPORARY TABLE tmp_brand_src (
    name        VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
    product_cnt INT NOT NULL,
    ord         INT NOT NULL,
    KEY idx_name (name)
) ENGINE=InnoDB;

-- display_order = 상품 수 내림차순(동수는 이름 오름차순)
INSERT INTO tmp_brand_src (name, product_cnt, ord)
SELECT t.name, t.cnt, ROW_NUMBER() OVER (ORDER BY t.cnt DESC, t.name ASC)
FROM (
    SELECT TRIM(provider) AS name, COUNT(*) AS cnt
    FROM products
    WHERE mall_id = 2 AND TRIM(COALESCE(provider, '')) <> ''
    GROUP BY TRIM(provider)
) t;

-- 대상 테이블(categories)을 INSERT ... SELECT 안에서 직접 읽지 않도록 스냅샷을 뜬다.
CREATE TEMPORARY TABLE tmp_brand_existing (
    name VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
    KEY idx_name (name)
) ENGINE=InnoDB;

INSERT INTO tmp_brand_existing (name)
SELECT name FROM categories WHERE mall_id = 2 AND type = 'BRAND';

START TRANSACTION;

-- 1) 브랜드 카테고리 생성 (없는 것만)
INSERT INTO categories
    (mall_id, name, slug, display_order, parent_id, depth, is_active, pc_visible, mobile_visible, type)
SELECT 2, s.name, NULL, s.ord, NULL, 1, 1, 1, 1, 'BRAND'
FROM tmp_brand_src s
LEFT JOIN tmp_brand_existing e ON e.name = s.name
WHERE e.name IS NULL;

-- 2) display_order 재동기화 (재실행 시 기존 행 순서도 최신 상품 수 기준으로 갱신)
UPDATE categories c
JOIN tmp_brand_src s ON s.name = c.name
SET c.display_order = s.ord
WHERE c.mall_id = 2 AND c.type = 'BRAND' AND c.display_order <> s.ord;

-- 3) 상품 → 브랜드 연결
--    general_ci 는 PAD SPACE 라 후행 공백이 있는 provider 도 TRIM 없이 매칭되지만,
--    명시적으로 TRIM 해서 의도를 드러낸다.
UPDATE products p
JOIN categories c
  ON c.mall_id = 2 AND c.type = 'BRAND' AND c.name = TRIM(p.provider)
SET p.brand_category_id = c.id
WHERE p.mall_id = 2
  AND TRIM(COALESCE(p.provider, '')) <> ''
  AND (p.brand_category_id IS NULL OR p.brand_category_id <> c.id);

COMMIT;

-- ---------------------------------------------------------------------------
-- 검증
-- ---------------------------------------------------------------------------
SELECT 'brand_categories(mall=2)' AS metric, COUNT(*) AS value
FROM categories WHERE mall_id = 2 AND type = 'BRAND'
UNION ALL
SELECT 'products_linked', COUNT(*)
FROM products WHERE mall_id = 2 AND brand_category_id IS NOT NULL
UNION ALL
SELECT 'products_unlinked(provider 없음)', COUNT(*)
FROM products WHERE mall_id = 2 AND TRIM(COALESCE(provider, '')) = ''
UNION ALL
SELECT 'products_unlinked(provider 있는데 미연결 — 0이어야 정상)', COUNT(*)
FROM products WHERE mall_id = 2 AND TRIM(COALESCE(provider, '')) <> '' AND brand_category_id IS NULL
UNION ALL
SELECT '다른 몰 브랜드로 잘못 연결(0이어야 정상)', COUNT(*)
FROM products p JOIN categories c ON c.id = p.brand_category_id
WHERE p.mall_id = 2 AND c.mall_id <> 2
UNION ALL
SELECT 'mall=1 브랜드 수(25 유지되어야 정상)', COUNT(*)
FROM categories WHERE mall_id = 1 AND type = 'BRAND';

DROP TEMPORARY TABLE IF EXISTS tmp_brand_src;
DROP TEMPORARY TABLE IF EXISTS tmp_brand_existing;
