-- B2B 단순화 (2026-07-21 결정)
--
-- 앞선 설계가 과했다. 실제로 필요한 건 "이 상품을 사업자에게 팔 것인가 / 몇 개 이상부터 /
-- 몇 % 할인" 세 가지뿐이고, 나머지 조건은 **견적 단계에서 담당자가 협의**하면 된다.
--
-- 없애는 것과 이유:
--   · 상품별 수량 구간가       → 견적에서 협의한다
--   · 상품별 가격 정책(등급가·계약가) → 거래처 추가 할인율 하나로 대체
--   · 거래처 등급              → 등급별 가격이 사라져 이름표만 남는다
--   · 판매 채널(B2B 전용 상품) → 상품은 언제나 B2C 판매. B2B 는 추가 옵션일 뿐
--   · 거래방식·견적필수수량    → 지금 쓰지 않는다
--   · 주문단위·최대수량        → "몇 개 이상"만 남긴다
--   · 가격 공개범위            → 승인된 사업자에게만 보이는 것으로 고정
--
-- 가격은 금액이 아니라 **할인율**로 통일한다. 판매가가 바뀌면 전용가도 따라 움직인다.
--   전용가 = 판매가 × (1 − (상품 할인율 + 거래처 추가 할인율) / 100)   ← 단순 합산

-- ── 1) 상품 B2B 설정 단순화 ──────────────────────────────────────
DROP PROCEDURE IF EXISTS _b2b_drop_column;
DROP PROCEDURE IF EXISTS _b2b_add_column;
DROP PROCEDURE IF EXISTS _b2b_drop_fk;
DELIMITER //
CREATE PROCEDURE _b2b_drop_column(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
  IF (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) > 0 THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
-- 컬럼을 지우기 전에 그 컬럼을 쓰는 외래키를 먼저 푼다(제약이 남아 있으면 DROP COLUMN 이 막힌다).
CREATE PROCEDURE _b2b_drop_fk(IN tbl VARCHAR(64), IN fk VARCHAR(64))
BEGIN
  IF (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = tbl
         AND CONSTRAINT_NAME = fk AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0 THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP FOREIGN KEY `', fk, '`');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
CREATE PROCEDURE _b2b_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) = 0 THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- 할인율 방식으로 전환
CALL _b2b_add_column('product_b2b_setting', 'discount_rate',
  "`discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'B2B 할인율(%). 판매가 대비. 0이면 일반가와 같다'");

-- 기존 금액(b2b_price)이 있으면 할인율로 환산해 옮긴다 — 설정을 잃지 않는다.
-- 이 스크립트를 두 번 돌리면 b2b_price 가 이미 없으므로, 컬럼이 있을 때만 실행한다.
SET @has_price := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_b2b_setting' AND COLUMN_NAME = 'b2b_price');
SET @conv := IF(@has_price > 0,
  'UPDATE product_b2b_setting s JOIN products p ON p.id = s.product_id
      SET s.discount_rate = LEAST(99.99, GREATEST(0, ROUND((1 - s.b2b_price / p.price) * 100, 2)))
    WHERE s.b2b_price IS NOT NULL AND p.price > 0 AND s.discount_rate = 0',
  'SELECT ''b2b_price 없음 — 환산 건너뜀'' AS msg');
PREPARE st FROM @conv; EXECUTE st; DEALLOCATE PREPARE st;

CALL _b2b_drop_column('product_b2b_setting', 'b2b_price');
CALL _b2b_drop_column('product_b2b_setting', 'sales_channel');
CALL _b2b_drop_column('product_b2b_setting', 'order_unit');
CALL _b2b_drop_column('product_b2b_setting', 'max_order_qty');
CALL _b2b_drop_column('product_b2b_setting', 'transaction_mode');
CALL _b2b_drop_column('product_b2b_setting', 'quote_required_qty');
CALL _b2b_drop_column('product_b2b_setting', 'price_visibility');
CALL _b2b_drop_column('product_b2b_setting', 'mall_id');

-- ── 2) 거래처 추가 할인율 ────────────────────────────────────────
CALL _b2b_add_column('business_profile', 'extra_discount_rate',
  "`extra_discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '거래처 추가 할인율(%). 상품 할인율에 단순 합산된다'");

CALL _b2b_drop_column('business_profile', 'price_policy_id');
CALL _b2b_drop_fk('business_profile', 'fk_bp_tier');
CALL _b2b_drop_column('business_profile', 'tier_id');

DROP PROCEDURE IF EXISTS _b2b_drop_column;
DROP PROCEDURE IF EXISTS _b2b_add_column;
DROP PROCEDURE IF EXISTS _b2b_drop_fk;

-- ── 3) 더 이상 쓰지 않는 테이블 ──────────────────────────────────
DROP TABLE IF EXISTS `b2b_price_item`;
DROP TABLE IF EXISTS `b2b_price_policy`;
DROP TABLE IF EXISTS `b2b_volume_price`;
DROP TABLE IF EXISTS `b2b_tier`;

-- ── 4) 관리자 메뉴 정리 ──────────────────────────────────────────
-- 상품별 B2B 설정은 상품 등록/수정 화면 안으로 들어갔고, 등급·가격정책은 없어졌다.
DELETE FROM admin_menus WHERE path IN ('/admin/b2b/tiers', '/admin/b2b/price-policies');

-- 거래처 할인 화면을 하나 추가한다(거래처 목록 + 추가 할인율).
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '거래처 할인', '/admin/b2b/discounts', 'bi bi-percent', 2,
       (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name = 'B2B 관리' AND m.parent_id IS NULL LIMIT 1),
       1, NULL
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/discounts');

SELECT 'B2B 단순화 완료' AS msg;
SELECT id, name, path, display_order FROM admin_menus
 WHERE parent_id = (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name='B2B 관리' AND m.parent_id IS NULL LIMIT 1)
 ORDER BY display_order;
