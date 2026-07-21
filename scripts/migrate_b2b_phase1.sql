-- B2B(사업자몰) 1단계 스키마 — docs/사이트개선/b2b_사업자몰_구현설계.md §9
--
-- 설계 원칙:
--   · B2B 는 **모든 몰에서 기본 동작**한다. 몰별 on/off 설정이 없다.
--   · 몰별 운영 데이터를 미리 넣지 않는다. 등급·전용가는 관리자가 화면에서 만든다.
--   · 동작 설정값(입금기한·세액표기 등)은 system_settings 에 두고 코드가 기본값을 갖는다
--     → 행이 없어도 정상 동작하므로 새로 찍어낸 몰에서 그대로 쓸 수 있다.
--
-- 사업자 신원(business_profile)과 거래처 등급(b2b_tier)은 **몰 스코프가 아니다.**
-- 사업자등록증으로 확인한 회사는 어느 몰에서 보든 같은 회사이기 때문이다.
-- (상품·전용가는 products 를 통해 자연히 몰 스코프를 따른다.)

DROP TABLE IF EXISTS `b2b_volume_price`;
DROP TABLE IF EXISTS `product_b2b_setting`;
DROP TABLE IF EXISTS `business_profile`;
DROP TABLE IF EXISTS `b2b_tier`;
DROP TABLE IF EXISTS `mall_b2b_setting`;

-- ── 거래처 등급 (관리자가 화면에서 생성. 비어 있어도 동작한다) ──────
CREATE TABLE IF NOT EXISTS `b2b_tier` (
  `id`          int NOT NULL AUTO_INCREMENT,
  `tier_code`   varchar(30) COLLATE utf8mb4_general_ci NOT NULL COMMENT '불변 코드 (DEALER/DEALER_VIP/WHOLESALE)',
  `tier_name`   varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '노출 등급명',
  `rank_order`  int NOT NULL DEFAULT '100' COMMENT '작을수록 상위',
  `is_default`  tinyint(1) NOT NULL DEFAULT '0' COMMENT '승인 시 자동 배정 등급 (없으면 등급 없이 승인)',
  `is_active`   tinyint(1) NOT NULL DEFAULT '1',
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tier_code` (`tier_code`),
  KEY `idx_tier_rank` (`rank_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='B2B 거래처 등급 (B2C membership_grade 와 별도 축, 몰 무관)';

-- ── 사업자 회원 프로필 (users 1:1, 몰 무관) ───────────────────────
CREATE TABLE IF NOT EXISTS `business_profile` (
  `id`                  int NOT NULL AUTO_INCREMENT,
  `user_id`             int NOT NULL COMMENT 'users.id (1:1)',
  `company_name`        varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '상호',
  `business_number`     varchar(20) COLLATE utf8mb4_general_ci NOT NULL COMMENT '사업자등록번호(숫자 10자리)',
  `representative_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '대표자명',
  `business_type`       varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '업태',
  `business_category`   varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '종목',
  `company_zipcode`     varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `company_address`     varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사업장 주소',
  `company_detailed_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tax_invoice_email`   varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '세금계산서 수신 이메일',
  `manager_name`        varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '담당자명',
  `manager_phone`       varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '담당자 연락처',
  `license_file`        varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사업자등록증 저장 경로(storage/ 하위, public 아님)',
  `license_original_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '업로드 원본 파일명',
  `tier_id`             int DEFAULT NULL COMMENT 'b2b_tier.id',
  `price_policy_id`     int DEFAULT NULL COMMENT '전용 계약 정책 (3단계)',
  `status`              enum('PENDING','UNDER_REVIEW','APPROVED','SUSPENDED','REJECTED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'PENDING' COMMENT '승인 상태. APPROVED 만 B2B 컨텍스트 활성',
  `reject_reason`       varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `contract_valid_from` date DEFAULT NULL COMMENT '계약 시작(NULL=무제한)',
  `contract_valid_to`   date DEFAULT NULL COMMENT '계약 종료(NULL=무제한)',
  `sales_manager_id`    int DEFAULT NULL COMMENT '담당 영업 admins.id',
  `admin_note`          text COLLATE utf8mb4_general_ci COMMENT '관리자 메모',
  `applied_at`          timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '신청 일시',
  `approved_at`         datetime DEFAULT NULL,
  `approved_by`         int DEFAULT NULL COMMENT 'admins.id',
  `created_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bp_user` (`user_id`),
  UNIQUE KEY `uk_bp_bizno` (`business_number`),
  KEY `idx_bp_status` (`status`),
  KEY `idx_bp_tier` (`tier_id`),
  CONSTRAINT `fk_bp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bp_tier` FOREIGN KEY (`tier_id`) REFERENCES `b2b_tier` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='사업자 회원 프로필 (users 1:1, 몰 무관)';

-- ── 상품별 B2B 판매 설정 (몰 스코프는 products 가 갖는다) ──────────
CREATE TABLE IF NOT EXISTS `product_b2b_setting` (
  `product_id`         int NOT NULL COMMENT 'products.id (1:1)',
  `is_b2b_sale`        tinyint(1) NOT NULL DEFAULT '0' COMMENT 'B2B 판매 여부. 0이면 B2B 컨텍스트에서도 B2C 가격',
  `sales_channel`      enum('B2C_ONLY','B2B_ONLY','BOTH') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'BOTH' COMMENT '노출 채널. B2B_ONLY 는 일반 사용자에게 404',
  `b2b_price`          int DEFAULT NULL COMMENT '기본 B2B가(부가세 포함 기준). NULL=전용가 없음',
  `min_order_qty`      int NOT NULL DEFAULT '1' COMMENT 'MOQ',
  `order_unit`         int NOT NULL DEFAULT '1' COMMENT '주문 단위(배수)',
  `max_order_qty`      int DEFAULT NULL COMMENT '상한(NULL=무제한)',
  `transaction_mode`   enum('DIRECT_ORDER','QUOTE_OPTIONAL','QUOTE_REQUIRED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'QUOTE_OPTIONAL' COMMENT '거래 방식',
  `quote_required_qty` int DEFAULT NULL COMMENT '이 수량 이상이면 견적 필수',
  `price_visibility`   enum('PUBLIC','APPROVED_ONLY','HIDDEN') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'APPROVED_ONLY' COMMENT '전용가 공개 범위',
  `updated_at`         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  KEY `idx_pbs_sale` (`is_b2b_sale`),
  KEY `idx_pbs_channel` (`sales_channel`),
  CONSTRAINT `fk_pbs_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품별 B2B 판매 설정 (없으면 B2B 판매 안 함)';

-- ── 수량 구간 가격 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `b2b_volume_price` (
  `id`           int NOT NULL AUTO_INCREMENT,
  `product_id`   int NOT NULL,
  `sku_id`       int DEFAULT NULL COMMENT 'NULL=상품 전체 공통',
  `tier_id`      int DEFAULT NULL COMMENT 'NULL=전체 사업자 공통',
  `min_quantity` int NOT NULL COMMENT '이 수량 이상일 때 적용',
  `unit_price`   int NOT NULL COMMENT '적용 단가(부가세 포함 기준)',
  `created_at`   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vp` (`product_id`,`sku_id`,`tier_id`,`min_quantity`),
  KEY `idx_vp_lookup` (`product_id`,`min_quantity`),
  CONSTRAINT `fk_vp_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vp_tier` FOREIGN KEY (`tier_id`) REFERENCES `b2b_tier` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='수량 구간 가격';

-- 과세구분 — 세금계산서 서식과 공급가 분해를 가른다 (설계 §4.7).
-- 기본값 TAXABLE 이라 기존 상품·화면·주문은 그대로다.
--
-- MySQL 8.4 는 `ADD COLUMN IF NOT EXISTS` 를 지원하지 않는다. 이 스크립트를 두 번 돌려도
-- 안전하도록 INFORMATION_SCHEMA 로 존재 여부를 보고 동적 실행한다.
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'tax_type'
);
SET @ddl := IF(@col_exists = 0,
  "ALTER TABLE `products` ADD COLUMN `tax_type` enum('TAXABLE','TAX_FREE','ZERO_RATED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'TAXABLE' COMMENT '과세구분 — 세금계산서 서식과 공급가 분해를 가른다 (설계 §4.7)' AFTER `price`",
  'SELECT ''products.tax_type 이미 존재 — 건너뜀'' AS msg'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
