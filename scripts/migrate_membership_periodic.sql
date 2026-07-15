-- 멤버십 2차: 정기(월) 쿠폰팩 — 설계 §7.1
-- 등급 회원에게 매월 1회 쿠폰을 발급한다. 쿠폰팩 인프라(membership_grade_coupon) 재사용.

ALTER TABLE `membership_grade_coupon`
  MODIFY COLUMN `issue_on` enum('ENTRY','BIRTHDAY','PERIODIC') NOT NULL DEFAULT 'ENTRY'
  COMMENT '지급 시점 (ENTRY=진입 / BIRTHDAY=생일 / PERIODIC=정기 월)';

-- 정기 쿠폰 월 1회 발급 로그 (멱등 가드). 같은 회원·쿠폰·월(YYYY-MM) 조합은 한 번만.
CREATE TABLE IF NOT EXISTS `membership_periodic_issue_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint DEFAULT NULL COMMENT '발급 근거 몰 ID',
  `coupon_id` int NOT NULL COMMENT '발급한 쿠폰 ID',
  `period_ym` char(7) NOT NULL COMMENT '발급 대상 월 (YYYY-MM)',
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_periodic_issue` (`user_id`, `coupon_id`, `period_ym`),
  KEY `idx_periodic_log_user` (`user_id`),
  CONSTRAINT `fk_periodic_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='정기 쿠폰 월 1회 발급 로그';
