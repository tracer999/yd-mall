-- Shopify 연동 테이블
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'NEWtec4075@@' dev_mall < scripts/shopify-create-tables.sql

CREATE TABLE IF NOT EXISTS `shopify_product_mappings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL COMMENT 'dev-mall 상품 ID (FK)',
  `shopify_product_id` VARCHAR(100) NOT NULL COMMENT 'gid://shopify/Product/xxx',
  `shopify_variant_id` VARCHAR(100) NOT NULL COMMENT 'gid://shopify/ProductVariant/xxx',
  `shopify_handle` VARCHAR(255) COMMENT 'Shopify 상품 핸들 (URL slug)',
  `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_product_id` (`product_id`),
  UNIQUE KEY `uk_shopify_product_id` (`shopify_product_id`),
  CONSTRAINT `fk_spm_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='dev-mall 상품 ↔ Shopify 상품 매핑';

CREATE TABLE IF NOT EXISTS `shopify_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `shopify_order_id` VARCHAR(100) NOT NULL UNIQUE COMMENT 'Shopify 주문 GID 또는 숫자 ID',
  `shopify_order_number` VARCHAR(50) COMMENT 'Shopify 주문 번호 (#1001 등)',
  `customer_email` VARCHAR(255),
  `total_price` DECIMAL(12,2),
  `currency` VARCHAR(10),
  `financial_status` VARCHAR(50) COMMENT 'pending/paid/refunded/...',
  `fulfillment_status` VARCHAR(50) COMMENT 'null/fulfilled/partial/...',
  `raw_payload` JSON COMMENT 'Webhook 원본 payload',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Shopify Webhook으로 수신된 주문 데이터';

-- 상품 설명(description) 본문 내 이미지 → Shopify Files(CDN) 업로드 매핑
-- 동일 원본 이미지를 중복 업로드하지 않도록 source_url(해시 기준)로 캐싱한다.
CREATE TABLE IF NOT EXISTS `shopify_image_mappings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `source_hash` CHAR(64) NOT NULL COMMENT 'sha256(source_url)',
  `source_url` VARCHAR(1024) NOT NULL COMMENT '원본 이미지 절대 URL (dev-mall/cafe24 등)',
  `shopify_file_id` VARCHAR(255) COMMENT 'gid://shopify/MediaImage/xxx',
  `shopify_cdn_url` VARCHAR(1024) COMMENT 'cdn.shopify.com 이미지 URL',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_source_hash` (`source_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='설명 본문 이미지 ↔ Shopify CDN 업로드 매핑';
