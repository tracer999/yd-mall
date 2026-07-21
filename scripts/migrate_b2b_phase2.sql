-- B2B 2단계 — 주문 절차 (docs/사이트개선/b2b_사업자몰_구현설계.md §7, §9.3)
--
-- 주문 엔진은 공통이다. orders 를 쪼개지 않고 컬럼을 더하고, B2B 고유 정보만 확장 테이블로 뺀다.
-- 모두 기본값이 있거나 NULL 허용이라 기존 B2C 주문 흐름은 바뀌지 않는다.
--
-- 재실행 가능하도록 컬럼 존재 여부를 INFORMATION_SCHEMA 로 보고 동적 실행한다
-- (MySQL 8.4 는 ADD COLUMN IF NOT EXISTS 미지원).

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

-- ── 장바구니: 거래 유형 (B2C/B2B 혼합 금지) ──
CALL _b2b_add_column('carts', 'cart_type',
  "`cart_type` enum('B2C','B2B') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'B2C' COMMENT '거래 유형. 혼합 담기 금지(설계 §6.3)'");

-- ── 주문: 유형 + 세액 ──
CALL _b2b_add_column('orders', 'order_type',
  "`order_type` enum('B2C','B2B') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'B2C' COMMENT '주문 유형. 엔진은 공통, 관리 화면만 분리'");
CALL _b2b_add_column('orders', 'supply_amount',
  "`supply_amount` int DEFAULT NULL COMMENT '공급가액(과세분). 세금계산서 근거'");
CALL _b2b_add_column('orders', 'vat_amount',
  "`vat_amount` int DEFAULT NULL COMMENT '부가세'");
CALL _b2b_add_column('orders', 'tax_free_amount',
  "`tax_free_amount` int DEFAULT NULL COMMENT '면세 라인 합계'");

/*
 * 재고를 언제 깎았는지 명시한다.
 *
 * 지금까지 "재고를 되돌려야 하는가"는 orders.status 가 PAID 이상인지로 판정했다
 * (services/order/orderCancelService.js). B2B 는 **승인 시점(status 는 아직 PENDING)** 에
 * 재고를 차감하므로, 그 판정으로는 승인 후 미입금 취소에서 재고가 영영 돌아오지 않는다.
 * 상태가 아니라 사실을 기록해 두 흐름이 같은 근거를 쓰게 한다.
 */
CALL _b2b_add_column('orders', 'stock_deducted_at',
  "`stock_deducted_at` datetime DEFAULT NULL COMMENT '재고를 실제로 깎은 시각. 복원 판정의 근거(상태가 아니라 사실)'");

-- ── 주문 상품: 라인별 세액·가격 근거 ──
CALL _b2b_add_column('order_items', 'supply_price',
  "`supply_price` int DEFAULT NULL COMMENT '라인 공급가액'");
CALL _b2b_add_column('order_items', 'vat_price',
  "`vat_price` int DEFAULT NULL COMMENT '라인 부가세'");
CALL _b2b_add_column('order_items', 'price_source',
  "`price_source` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'B2B_DEFAULT/VOLUME/TIER/CUSTOMER_CONTRACT/NEGOTIATED_QUOTE'");
CALL _b2b_add_column('order_items', 'list_price',
  "`list_price` int DEFAULT NULL COMMENT '적용 전 정가(할인 근거)'");

DROP PROCEDURE IF EXISTS _b2b_add_column;

-- ── B2B 주문 확장정보 ──
CREATE TABLE IF NOT EXISTS `b2b_order_detail` (
  `order_id`              int NOT NULL COMMENT 'orders.id (1:1)',
  `business_profile_id`   int NOT NULL COMMENT 'business_profile.id',
  `quote_id`              int DEFAULT NULL COMMENT '견적에서 전환된 주문 (3단계)',
  `quote_revision`        int DEFAULT NULL,
  `purchase_order_number` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '고객사 발주번호(PO)',
  `approval_status`       enum('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'REQUESTED' COMMENT '판매자 승인 단계. orders.status 와 별개 축',
  `approved_at`           datetime DEFAULT NULL,
  `approved_by`           int DEFAULT NULL COMMENT 'admins.id',
  `reject_reason`         varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `payment_terms`         enum('PREPAY','CREDIT') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'PREPAY' COMMENT '선결제/후불. 여신은 4단계',
  `payment_due_at`        datetime DEFAULT NULL COMMENT '입금 기한. 이 시각까지 재고를 점유한다',
  `deposit_name`          varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '입금자명',
  `deposited_at`          datetime DEFAULT NULL,
  `tax_invoice_required`  tinyint(1) NOT NULL DEFAULT '1',
  `tax_invoice_status`    enum('NOT_ISSUED','REQUESTED','ISSUED','CANCELLED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'NOT_ISSUED',
  `tax_invoice_no`        varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tax_invoice_issued_at` datetime DEFAULT NULL,
  `requested_delivery_date` date DEFAULT NULL COMMENT '납기 희망일',
  `buyer_note`            text COLLATE utf8mb4_general_ci COMMENT '고객 요청사항',
  `admin_note`            text COLLATE utf8mb4_general_ci,
  `created_at`            timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `idx_bod_profile` (`business_profile_id`),
  KEY `idx_bod_approval` (`approval_status`,`payment_due_at`),
  CONSTRAINT `fk_bod_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bod_profile` FOREIGN KEY (`business_profile_id`) REFERENCES `business_profile` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='B2B 주문 확장정보';

SELECT 'B2B 2단계 스키마 적용 완료' AS msg;
