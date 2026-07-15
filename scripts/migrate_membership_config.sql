-- 멤버십 2차: 몰별 멤버십 운영 설정 (설계 §7.3) — 등급 할인 × 쿠폰 중복 모드
CREATE TABLE IF NOT EXISTS `membership_config` (
  `mall_id` bigint NOT NULL COMMENT '몰 ID (PK)',
  `discount_stacking_mode` enum('STACK','COUPON_PRIORITY') NOT NULL DEFAULT 'STACK'
    COMMENT 'STACK=등급할인+쿠폰 중복 / COUPON_PRIORITY=쿠폰 사용 시 등급 할인 미적용',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`mall_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 멤버십 운영 설정';
