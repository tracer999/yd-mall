-- 멤버십 2차: 생일 혜택 (등급별 생일 쿠폰) — 설계 §7.1
-- 쿠폰팩(membership_grade_coupon) 인프라를 재사용한다. issue_on 에 BIRTHDAY 를 추가하고,
-- 회원이 생일에 그 등급의 생일 쿠폰을 받도록 한다. 연 1회 중복 발급은 로그 테이블로 막는다.

ALTER TABLE `membership_grade_coupon`
  MODIFY COLUMN `issue_on` enum('ENTRY','BIRTHDAY') NOT NULL DEFAULT 'ENTRY'
  COMMENT '지급 시점 (ENTRY=등급 진입 시 / BIRTHDAY=생일)';

-- 생일 쿠폰 연 1회 발급 로그 (멱등 가드). 같은 회원·쿠폰·연도 조합은 한 번만.
CREATE TABLE IF NOT EXISTS `membership_birthday_issue_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint DEFAULT NULL COMMENT '발급 근거 몰 ID',
  `coupon_id` int NOT NULL COMMENT '발급한 쿠폰 ID',
  `issue_year` smallint NOT NULL COMMENT '발급 연도 (연 1회 가드)',
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_birthday_issue` (`user_id`, `coupon_id`, `issue_year`),
  KEY `idx_birthday_log_user` (`user_id`),
  CONSTRAINT `fk_birthday_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='생일 쿠폰 연 1회 발급 로그';
