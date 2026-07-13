-- 아울렛 데모 시드 (mall 2 종합관)
--
-- 아울렛 모듈이 실제로 도는지 확인하기 위한 개발용 데이터다.
-- mall 1(건강식품관)은 할인 상품이 0건이고 이월 개념이 없어 시드하지 않는다 — 설계상 아울렛 비대상이다.
--
-- 되돌리기:
--   DELETE FROM outlet_product WHERE mall_id = 2;
--   DELETE FROM categories WHERE mall_id = 2 AND type = 'OUTLET';
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' dev_mall < scripts/seed_outlet_demo.sql

-- ── 아울렛 카테고리 (mall 2) ─────────────────────────────
-- '무엇을 파는가'의 축이다. 할인 사유(왜 싼가)와는 다른 축이다.
INSERT INTO categories (mall_id, name, parent_id, depth, type, display_order, is_active, description)
SELECT * FROM (
    SELECT 2 AS mall_id, '의류' AS name, NULL AS parent_id, 1 AS depth, 'OUTLET' AS type,
           1 AS display_order, 1 AS is_active, '시즌 이월 의류' AS description
    UNION ALL SELECT 2, '신발', NULL, 1, 'OUTLET', 2, 1, '이월·전시 신발'
    UNION ALL SELECT 2, '가방·잡화', NULL, 1, 'OUTLET', 3, 1, '이월 가방·지갑·잡화'
    UNION ALL SELECT 2, '유아동', NULL, 1, 'OUTLET', 4, 1, '유아동 이월상품'
) AS t
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE mall_id = 2 AND type = 'OUTLET');

-- ── 1) 시즌 이월 (SEASON_OFF) ────────────────────────────
-- 상품명에 25SS/25FW 가 박힌 상품들. 아울렛의 가장 전형적인 사유다.
INSERT IGNORE INTO outlet_product
    (mall_id, product_id, outlet_category_id, outlet_type, outlet_reason, sort_order, is_visible)
SELECT
    2, p.id,
    (SELECT id FROM categories WHERE mall_id = 2 AND type = 'OUTLET' AND name =
        CASE
            WHEN p.name REGEXP '신발|스니커|슈즈|부츠' THEN '신발'
            WHEN p.name REGEXP '가방|백팩|지갑|클러치' THEN '가방·잡화'
            ELSE '의류'
        END LIMIT 1),
    'SEASON_OFF',
    CONCAT(REGEXP_SUBSTR(p.name, '2[45](SS|FW)'), ' 시즌 이월 — 새 상품입니다'),
    0, 1
FROM products p
WHERE p.mall_id = 2 AND p.status = 'ON' AND p.visibility = 'PUBLIC'
  AND p.discount_rate >= 30 AND p.name REGEXP '2[45](SS|FW)'
LIMIT 20;

-- ── 2) 재고 정리 (OVERSTOCK) ─────────────────────────────
-- 시즌 표기는 없지만 할인율이 높은 재고 과다 상품.
INSERT IGNORE INTO outlet_product
    (mall_id, product_id, outlet_category_id, outlet_type, outlet_reason, sort_order, is_visible)
SELECT
    2, p.id,
    (SELECT id FROM categories WHERE mall_id = 2 AND type = 'OUTLET' AND name =
        CASE
            WHEN c.name REGEXP '신발' THEN '신발'
            WHEN c.name REGEXP '가방|지갑' THEN '가방·잡화'
            WHEN c.name REGEXP '유아동' THEN '유아동'
            ELSE '의류'
        END LIMIT 1),
    'OVERSTOCK', '재고 정리 — 제품 이상 없음', 10, 1
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.mall_id = 2 AND p.status = 'ON' AND p.visibility = 'PUBLIC'
  AND p.discount_rate >= 40
  AND NOT EXISTS (SELECT 1 FROM outlet_product op WHERE op.mall_id = 2 AND op.product_id = p.id)
LIMIT 14;

-- ── 3) 전시상품 (DISPLAY) — 상태 등급·하자 고지 필수 ──────
INSERT IGNORE INTO outlet_product
    (mall_id, product_id, outlet_category_id, outlet_type, outlet_reason,
     condition_grade, defect_description, sort_order, is_visible)
SELECT
    2, p.id,
    (SELECT id FROM categories WHERE mall_id = 2 AND type = 'OUTLET' AND name = '신발' LIMIT 1),
    'DISPLAY', '매장 전시품 — 착용감 확인용으로 진열됐던 상품입니다',
    'B', '전시 중 발생한 미세한 먼지·눌림이 있을 수 있습니다. 기능·소재 이상은 없습니다.',
    20, 1
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.mall_id = 2 AND p.status = 'ON' AND p.visibility = 'PUBLIC'
  AND p.discount_rate >= 30 AND c.name = '신발'
  AND NOT EXISTS (SELECT 1 FROM outlet_product op WHERE op.mall_id = 2 AND op.product_id = p.id)
LIMIT 4;

-- ── 4) 포장 훼손 (PACKAGE_DAMAGE) ───────────────────────
INSERT IGNORE INTO outlet_product
    (mall_id, product_id, outlet_category_id, outlet_type, outlet_reason,
     condition_grade, defect_description, sort_order, is_visible)
SELECT
    2, p.id,
    (SELECT id FROM categories WHERE mall_id = 2 AND type = 'OUTLET' AND name = '가방·잡화' LIMIT 1),
    'PACKAGE_DAMAGE', '외부 포장 손상 — 제품 자체는 새 상품입니다',
    'A', '박스 모서리 눌림·찢어짐이 있습니다. 제품 본체에는 하자가 없습니다.',
    30, 1
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.mall_id = 2 AND p.status = 'ON' AND p.visibility = 'PUBLIC'
  AND p.discount_rate >= 30 AND c.name REGEXP '가방|지갑'
  AND NOT EXISTS (SELECT 1 FROM outlet_product op WHERE op.mall_id = 2 AND op.product_id = p.id)
LIMIT 3;

-- ── 5) 리퍼브 (REFURBISHED) — C 등급 포함 ────────────────
INSERT IGNORE INTO outlet_product
    (mall_id, product_id, outlet_category_id, outlet_type, outlet_reason,
     condition_grade, defect_description, sort_order, is_visible)
SELECT
    2, p.id,
    (SELECT id FROM categories WHERE mall_id = 2 AND type = 'OUTLET' AND name = '가방·잡화' LIMIT 1),
    'REFURBISHED', '반품 상품을 점검·정비 후 재판매합니다',
    'C', '사용감이 있습니다. 표면 스크래치·모서리 마모가 눈에 띕니다. 기능은 정상 작동합니다.',
    40, 1
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.mall_id = 2 AND p.status = 'ON' AND p.visibility = 'PUBLIC'
  AND p.discount_rate >= 40 AND c.name REGEXP '가방|지갑'
  AND NOT EXISTS (SELECT 1 FROM outlet_product op WHERE op.mall_id = 2 AND op.product_id = p.id)
LIMIT 2;

SELECT outlet_type, COUNT(*) AS cnt FROM outlet_product WHERE mall_id = 2 GROUP BY outlet_type;
SELECT COUNT(*) AS 총_아울렛상품 FROM outlet_product WHERE mall_id = 2;
