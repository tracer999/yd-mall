-- 멤버십 2차: 등급 진입 쿠폰 자동 발급 (쿠폰팩) — 설계 §7.1
-- 등급에 연결된 쿠폰을 회원이 그 등급에 **진입(승급)** 할 때 자동 발급한다.
-- MVP 는 issue_on='ENTRY'(진입 시)만. 정기(PERIODIC) 발급은 이후 확장.

CREATE TABLE IF NOT EXISTS `membership_grade_coupon` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `grade_id` int NOT NULL COMMENT '등급 ID (FK)',
  `coupon_id` int NOT NULL COMMENT '지급할 쿠폰 ID (FK)',
  `issue_on` enum('ENTRY') NOT NULL DEFAULT 'ENTRY' COMMENT '지급 시점 (ENTRY=등급 진입 시)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '사용 여부',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grade_coupon` (`grade_id`, `coupon_id`, `issue_on`),
  KEY `idx_grade_coupon_grade` (`grade_id`),
  CONSTRAINT `fk_grade_coupon_grade` FOREIGN KEY (`grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_grade_coupon_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급 진입 지급 쿠폰(쿠폰팩)';
