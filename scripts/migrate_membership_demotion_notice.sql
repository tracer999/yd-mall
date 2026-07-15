CREATE TABLE IF NOT EXISTS membership_demotion_notice_log (
  id bigint NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  mall_id bigint DEFAULT NULL,
  period_ym char(7) NOT NULL COMMENT '안내 대상 월 (YYYY-MM)',
  from_grade_id int DEFAULT NULL,
  to_grade_id int DEFAULT NULL,
  channel varchar(20) NOT NULL DEFAULT 'EMAIL',
  notified_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_demotion_notice (user_id, mall_id, period_ym),
  KEY idx_demotion_user (user_id),
  CONSTRAINT fk_demotion_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='강등 사전 안내 발송 로그(월 1회 멱등)';
