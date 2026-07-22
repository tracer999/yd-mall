-- =============================================================================
-- 상품 필터(facet) Phase 0 — 선행 정리
-- 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §1.5, §10
--
-- 두 가지를 정리한다.
--   D-1  naver_category_id 계열 컬럼의 collation 불일치 → JOIN 시 ERROR 1267
--   D-2  도매꾹 수량별 단가표 오파싱으로 오염된 가격(2,147,483,647원)
--
-- 적용:  mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < 20260722_facet_phase0_cleanup.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- D-1. collation 통일
--
-- yd_mall 은 collation 이 3종 혼재한다(general_ci 109 / unicode_ci 24 / 0900_ai_ci 13).
-- 전부를 통일하는 것은 과하므로, **JOIN 축이 되는 컬럼만** naver_* 쪽 기준인
-- utf8mb4_unicode_ci 로 맞춘다. naver_* 계열은 PK 라 이쪽을 바꾸는 편이 범위가 넓다.
--
-- 이 조치 전에는 아래가 실패했다.
--   SELECT ... FROM categories c JOIN naver_category nc
--     ON nc.naver_category_id = c.naver_category_id;
--   → ERROR 1267 (HY000): Illegal mix of collations
--
-- 기존 코드는 COLLATE 를 손으로 붙여 우회 중이다(제거 대상은 아니지만 이제 불필요).
--   services/sourcing/categoryReflect.js:125-130
--   controllers/admin/sourcingController.js:560-564
-- -----------------------------------------------------------------------------

ALTER TABLE categories
    MODIFY COLUMN naver_category_id VARCHAR(64)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
        COMMENT '대응 네이버 카테고리 ID(origin=naver 일 때)';

ALTER TABLE products
    MODIFY COLUMN naver_category_id VARCHAR(64)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
        COMMENT '등록 근거 네이버 카테고리 ID(참조)',
    MODIFY COLUMN naver_brand_id VARCHAR(64)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
        COMMENT '등록 근거 네이버 브랜드 ID(참조)';

-- zbak_products 는 백업 테이블이라 JOIN 대상이 아니다. 의도적으로 건드리지 않는다.


-- -----------------------------------------------------------------------------
-- D-2. 오염된 가격 복원
--
-- 원인: 도매꾹 price.dome 은 단일가("9900") 뿐 아니라 수량별 단가표
--       ("1+17000|2+16800" = 1개↑ 17,000원 / 2개↑ 16,800원) 로도 온다.
--       normalize.js 의 toNum() 이 숫자 아닌 문자를 지워 "117000216800" 을 만들었고,
--       sql_mode 가 비어 있어(비엄격) DB 가 에러 없이 잘랐다.
--         117,000,216,800 → decimal(12,2) → 9,999,999,999.99 → INT → 2,147,483,647
--
-- 코드 수정: services/sourcing/supplier/domeggook/normalize.js  parsePriceField()
-- 재발 방지: services/sourcing/publishService.js  MAX_PRICE 가드
--
-- 아래는 이미 오염된 행을 raw_json 원본에서 **결정적으로 재계산**한다.
-- (매직 넘버를 박지 않는다 — 같은 스크립트를 다시 돌려도 같은 결과가 나온다)
-- -----------------------------------------------------------------------------

-- (1) 공급처 원본: 수량별 단가표의 첫 구간 단가 = 1개 기준 공급가
UPDATE supplier_product
SET supply_price = CAST(
        SUBSTRING_INDEX(
            SUBSTRING_INDEX(JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.price.dome')), '|', 1),
            '+', -1
        ) AS DECIMAL(12, 2)
    )
WHERE supplier IN ('DOMEGGOOK', 'DOMEME')
  AND supply_price > 100000000
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.price.dome')) LIKE '%+%';

-- (2) 우리 몰 상품: 매입가·판매가 재적용
--     ⚠ 이 몰은 mall_channel_setting.default_margin_rate 가 없어 발행 당시 마진율이 0 이었다.
--       따라서 판매가 = 공급가로 복원한다. 마진은 관리자 화면에서 다시 잡아야 한다.
UPDATE products p
JOIN supplier_product sp ON sp.mall_product_id = p.id
SET p.purchase_price = ROUND(sp.supply_price),
    p.price          = ROUND(sp.supply_price)
WHERE p.price > 100000000;

-- (3) SKU: 상품 가격과 동기화(옵션 추가금이 0 인 건들이라 그대로 맞춘다)
UPDATE product_sku s
JOIN products p ON p.id = s.product_id
SET s.purchase_price = p.purchase_price,
    s.price          = p.price
WHERE s.price > 100000000;


-- -----------------------------------------------------------------------------
-- 검증
-- -----------------------------------------------------------------------------
-- 1) collation 통일 확인 — COLLATE 없이 JOIN 이 성공해야 한다.
--    SELECT COUNT(*) FROM categories c
--      JOIN naver_category nc ON nc.naver_category_id = c.naver_category_id;
--
-- 2) 오염 가격 0건 확인
--    SELECT COUNT(*) FROM products     WHERE price > 100000000;   -- 0
--    SELECT COUNT(*) FROM product_sku  WHERE price > 100000000;   -- 0
--    SELECT COUNT(*) FROM supplier_product WHERE supply_price > 100000000;  -- 0
--
-- 3) 실사용 최고가 확인 — 24K 골드바 24,539,130원이 최고여야 한다(정상 상품).
--    SELECT id, name, price FROM products ORDER BY price DESC LIMIT 5;
