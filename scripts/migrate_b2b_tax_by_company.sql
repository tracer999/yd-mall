-- 과세구분을 거래처(사업자) 단위로 (2026-07-21 결정)
--
-- 기업회원 승인이 곧 "이 회사와 B2B 거래를 튼다" 는 뜻이므로, 세금계산서 서식(과세/면세/영세율)도
-- 그 회사에 대해 정한다. 상품마다 정하지 않는다.
--
-- ⚠️ products.tax_type 은 **지우지 않는다.** B2B 와 무관하게 외부 채널이 쓴다:
--    · services/sourcing/supplier/domeggook — 공급처가 '과세상품' 으로 과세구분을 준다
--    · services/sourcing/channel/naverMapper — 네이버 스마트스토어 등록 필수 필드(현재 'TAX' 하드코딩)
--    B2B 세액 계산만 거래처 값을 쓰고, 상품 컬럼은 채널 연동 몫으로 남긴다.

DROP PROCEDURE IF EXISTS _b2b_add_column;
DELIMITER //
CREATE PROCEDURE _b2b_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) = 0 THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

CALL _b2b_add_column('business_profile', 'tax_type',
  "`tax_type` enum('TAXABLE','TAX_FREE','ZERO_RATED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'TAXABLE' COMMENT '이 거래처에 발행할 증빙 구분 — 과세(세금계산서)/면세(계산서)/영세율. B2B 세액 계산의 기준' AFTER `tax_invoice_email`");

DROP PROCEDURE IF EXISTS _b2b_add_column;

SELECT '거래처 과세구분 추가 완료' AS msg;
SELECT id, company_name, tax_type, extra_discount_rate FROM business_profile;
