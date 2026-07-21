-- B2B 3단계 — 가격 정책 + 견적·협상 (docs/사이트개선/b2b_사업자몰_구현설계.md §4.2, §8, §9.2, §9.4)
--
-- 가격: 등급가·거래처 계약가를 정책 계층으로 둔다. 1단계의 기본 전용가·수량구간가와 합쳐
--       5단계 우선순위가 완성된다(services/b2b/b2bPricingService.js).
-- 견적: 주문의 임시 상태가 아니라 **별도 도메인**이다. 금액·조건 변경은 리비전으로 남기고
--       메시지는 커뮤니케이션으로 분리한다(설계 §8.2, §17.4).

-- ── 가격 정책 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `b2b_price_policy` (
  `id`          int NOT NULL AUTO_INCREMENT,
  `name`        varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `policy_type` enum('TIER','CUSTOMER_CONTRACT') COLLATE utf8mb4_general_ci NOT NULL COMMENT '등급 정책 / 거래처 전용 계약',
  `tier_id`     int DEFAULT NULL COMMENT 'policy_type=TIER 일 때 대상 등급',
  `priority`    int NOT NULL DEFAULT '0' COMMENT '같은 층에서 큰 값이 이긴다',
  `valid_from`  date DEFAULT NULL,
  `valid_to`    date DEFAULT NULL,
  `status`      enum('ACTIVE','INACTIVE') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pp_lookup` (`policy_type`,`status`),
  KEY `idx_pp_tier` (`tier_id`),
  CONSTRAINT `fk_pp_tier` FOREIGN KEY (`tier_id`) REFERENCES `b2b_tier` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='B2B 가격 정책 (등급가·계약가)';

CREATE TABLE IF NOT EXISTS `b2b_price_item` (
  `id`              int NOT NULL AUTO_INCREMENT,
  `price_policy_id` int NOT NULL,
  `product_id`      int NOT NULL,
  `sku_id`          int DEFAULT NULL COMMENT 'NULL=상품 전체',
  `fixed_price`     int DEFAULT NULL COMMENT '고정 단가(우선)',
  `discount_rate`   decimal(5,2) DEFAULT NULL COMMENT '판매가 대비 % (fixed_price 없을 때)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ppi` (`price_policy_id`,`product_id`,`sku_id`),
  KEY `idx_ppi_product` (`product_id`),
  CONSTRAINT `fk_ppi_policy` FOREIGN KEY (`price_policy_id`) REFERENCES `b2b_price_policy` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='정책별 상품 단가';

-- ── 견적 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `quote` (
  `id`                  int NOT NULL AUTO_INCREMENT,
  `mall_id`             bigint NOT NULL DEFAULT '1' COMMENT '상품이 속한 몰',
  `quote_number`        varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Q-YYYYMMDD-NNNNN',
  `business_profile_id` int NOT NULL,
  `requested_by`        int NOT NULL COMMENT 'users.id',
  `assigned_admin_id`   int DEFAULT NULL COMMENT '담당 영업 admins.id',
  `status`              enum('DRAFT','REQUESTED','UNDER_REVIEW','SELLER_PROPOSED','BUYER_COUNTERED',
                             'BUYER_ACCEPTED','SELLER_ACCEPTED','REJECTED','EXPIRED',
                             'CONVERTED_TO_ORDER','CANCELLED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'DRAFT',
  `version`             int NOT NULL DEFAULT '1' COMMENT '현재 리비전 번호',
  `catalog_total`       int NOT NULL DEFAULT '0' COMMENT '정가 합계',
  `proposed_total`      int DEFAULT NULL COMMENT '판매자 제안 합계',
  `final_total`         int DEFAULT NULL COMMENT '확정 합계(상품+배송−할인)',
  `supply_amount`       int DEFAULT NULL,
  `vat_amount`          int DEFAULT NULL,
  `tax_free_amount`     int DEFAULT NULL,
  `shipping_amount`     int NOT NULL DEFAULT '0',
  `discount_amount`     int NOT NULL DEFAULT '0' COMMENT '전체 할인',
  `valid_until`         date DEFAULT NULL COMMENT '견적 유효기간',
  `payment_terms`       varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `delivery_terms`      varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `requested_delivery_date` date DEFAULT NULL,
  `converted_order_id`  int DEFAULT NULL COMMENT '주문 전환 잠금. 중복 전환을 이 컬럼으로 막는다',
  `created_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_quote_number` (`quote_number`),
  KEY `idx_quote_status` (`status`,`created_at`),
  KEY `idx_quote_profile` (`business_profile_id`),
  KEY `idx_quote_order` (`converted_order_id`),
  CONSTRAINT `fk_quote_profile` FOREIGN KEY (`business_profile_id`) REFERENCES `business_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_quote_order` FOREIGN KEY (`converted_order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='견적 (주문과 별도 도메인)';

CREATE TABLE IF NOT EXISTS `quote_item` (
  `id`                    int NOT NULL AUTO_INCREMENT,
  `quote_id`              int NOT NULL,
  `product_id`            int DEFAULT NULL COMMENT '상품 삭제 대비 nullable',
  `sku_id`                int DEFAULT NULL,
  `product_name_snapshot` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `sku_snapshot`          varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '옵션 조합 텍스트',
  `tax_type_snapshot`     enum('TAXABLE','TAX_FREE','ZERO_RATED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'TAXABLE',
  `quantity`              int NOT NULL,
  `catalog_unit_price`    int NOT NULL COMMENT '정가',
  `requested_unit_price`  int DEFAULT NULL COMMENT '고객 희망 단가',
  `proposed_unit_price`   int DEFAULT NULL COMMENT '판매자 제안 단가',
  `final_unit_price`      int DEFAULT NULL COMMENT '확정 단가 — 주문 전환의 유일한 근거',
  `item_note`             varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `display_order`         int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_qi_quote` (`quote_id`),
  CONSTRAINT `fk_qi_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='견적 품목';

CREATE TABLE IF NOT EXISTS `quote_message` (
  `id`          int NOT NULL AUTO_INCREMENT,
  `quote_id`    int NOT NULL,
  `sender_type` enum('BUYER','SELLER') COLLATE utf8mb4_general_ci NOT NULL,
  `sender_id`   int NOT NULL COMMENT 'users.id 또는 admins.id',
  `message`     text COLLATE utf8mb4_general_ci NOT NULL,
  `visibility`  enum('ALL','INTERNAL') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'ALL' COMMENT 'INTERNAL=관리자 전용 메모',
  `created_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qm_quote` (`quote_id`,`created_at`),
  CONSTRAINT `fk_qm_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='견적 협상 메시지 (커뮤니케이션)';

CREATE TABLE IF NOT EXISTS `quote_attachment` (
  `id`            int NOT NULL AUTO_INCREMENT,
  `quote_id`      int NOT NULL,
  `uploaded_by`   int NOT NULL,
  `uploader_type` enum('BUYER','SELLER') COLLATE utf8mb4_general_ci NOT NULL,
  `filename`      varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '원본 파일명',
  `storage_path`  varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'storage/ 하위(public 아님)',
  `mime_type`     varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `file_size`     int DEFAULT NULL,
  `created_at`    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qa_quote` (`quote_id`),
  CONSTRAINT `fk_qa_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='견적 첨부파일';

CREATE TABLE IF NOT EXISTS `quote_revision` (
  `id`              int NOT NULL AUTO_INCREMENT,
  `quote_id`        int NOT NULL,
  `revision_number` int NOT NULL,
  `changed_by`      int DEFAULT NULL,
  `changer_type`    enum('BUYER','SELLER','SYSTEM') COLLATE utf8mb4_general_ci NOT NULL,
  `status_after`    varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  `summary`         varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '무엇이 바뀌었는지 한 줄',
  `snapshot_json`   json NOT NULL COMMENT '해당 시점 quote + quote_item 전체',
  `pdf_path`        varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '이 리비전으로 발행한 견적서 PDF',
  `created_at`      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_qr` (`quote_id`,`revision_number`),
  CONSTRAINT `fk_qr_quote` FOREIGN KEY (`quote_id`) REFERENCES `quote` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='견적 리비전 (금액·조건 변경 이력)';

-- 견적에서 전환된 주문을 되짚는다(b2b_order_detail.quote_id 는 2단계에 이미 있다).
SELECT 'B2B 3단계 스키마 적용 완료' AS msg;
