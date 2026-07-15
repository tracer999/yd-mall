-- ============================================================================
-- 멤버십 등급 시스템 — DDL (설계: docs/사이트개선/membership_grade_admin_design.md)
--
--   설계 §11 데이터 모델의 MVP 구현. §11 의 membership_benefit_policy + membership_grade_benefit
--   (재사용 혜택 정책 + 등급 연결)은 MVP 에서 **등급당 혜택 1행**(membership_grade_benefit)으로
--   단순화한다. 혜택이 3종(정률할인·추가적립·무료배송)뿐이라 별도 정책 재사용이 아직 불필요하다.
--
--   멀티몰: 회원(users)은 몰 전역 공유(users 에 mall_id 없음)지만 등급은 몰별로 분리한다(설계 부록 A.7).
--   따라서 등급·정책·혜택·회원등급·실적원장은 모두 mall_id 로 스코핑한다.
--
--   적용: mysql -h ydata.co.kr -u ydatasvc -p'***' yd_mall < scripts/migrate_membership.sql
--   (개발 DB 기준. 상용 없음.) 시드는 scripts/seed_membership.sql.
-- ============================================================================

-- 1) 등급 정의 -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '등급 ID (PK)',
  `mall_id` bigint NOT NULL COMMENT '몰 ID (몰별 등급 분리)',
  `grade_code` varchar(30) NOT NULL COMMENT 'API·연계용 불변 코드 (BASIC/SILVER/...)',
  `grade_name` varchar(50) NOT NULL COMMENT '사용자 노출 등급명',
  `rank_order` int NOT NULL DEFAULT '100' COMMENT '순위. 1이 최상위 (작을수록 상위)',
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT '기본 가입 등급 (몰당 1개만 1)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '사용 여부',
  `is_auto_evaluation` tinyint(1) NOT NULL DEFAULT '1' COMMENT '자동 평가 대상 여부 (0=수동 전용 등급)',
  `color` varchar(20) DEFAULT NULL COMMENT '사용자 노출 색상 (#hex)',
  `badge_icon` varchar(100) DEFAULT NULL COMMENT '배지 아이콘 클래스',
  `description` varchar(255) DEFAULT NULL COMMENT '설명',
  `mypage_note` varchar(255) DEFAULT NULL COMMENT '마이페이지 안내 문구',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grade_mall_code` (`mall_id`, `grade_code`),
  KEY `idx_grade_mall_rank` (`mall_id`, `rank_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='멤버십 등급 정의 (몰별)';

-- 2) 등급별 혜택 (등급당 1행, MVP 단순화) ----------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade_benefit` (
  `grade_id` int NOT NULL COMMENT '등급 ID (PK, FK membership_grade)',
  `discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '주문 상품금액 정률 할인 (%)',
  `max_discount_amount` int DEFAULT NULL COMMENT '등급 할인 최대액 (NULL=무제한)',
  `min_order_amount` int NOT NULL DEFAULT '0' COMMENT '등급 할인 최소 주문금액',
  `point_rate` decimal(5,2) DEFAULT NULL COMMENT '등급 적립률 (%). NULL=등급 적립 없음(기본률만)',
  `point_rate_mode` enum('REPLACE','ADD') NOT NULL DEFAULT 'ADD' COMMENT 'REPLACE=기본 적립률 대체 / ADD=기본률에 가산',
  `free_shipping` tinyint(1) NOT NULL DEFAULT '0' COMMENT '무조건 무료배송 (지역할증 제외)',
  `free_ship_threshold` int DEFAULT NULL COMMENT '등급별 무료배송 문턱 override (NULL=몰 기본 정책 사용)',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`grade_id`),
  CONSTRAINT `fk_grade_benefit_grade` FOREIGN KEY (`grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급별 혜택 (정률할인·추가적립·무료배송)';

-- 3) 평가 정책 (몰별, 버전 관리) -------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_evaluation_policy` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '정책 ID (PK)',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `policy_name` varchar(100) NOT NULL COMMENT '정책명',
  `version` int NOT NULL DEFAULT '1' COMMENT '버전',
  `status` enum('DRAFT','SCHEDULED','ACTIVE','ENDED') NOT NULL DEFAULT 'DRAFT' COMMENT '작성중/예약/적용중/종료',
  `performance_period_months` int NOT NULL DEFAULT '12' COMMENT '실적 인정 기간(개월). 최근 N개월 이동 구간',
  `evaluation_cycle` enum('MONTHLY','DAILY','MANUAL') NOT NULL DEFAULT 'MONTHLY' COMMENT '정기 평가 주기',
  `amount_basis` enum('A_GROSS','B_NET','C_PAID','D_NET_PLUS_SHIP') NOT NULL DEFAULT 'B_NET' COMMENT '인정 구매금액 산식 (설계 §6.2)',
  `condition_operator` enum('AMOUNT_ONLY','AND','OR') NOT NULL DEFAULT 'OR' COMMENT '금액/건수 조건 결합',
  `upgrade_mode` enum('IMMEDIATE','SCHEDULED') NOT NULL DEFAULT 'SCHEDULED' COMMENT '승급 반영: 즉시/정기평가',
  `downgrade_mode` enum('SCHEDULED','IMMEDIATE','NONE') NOT NULL DEFAULT 'SCHEDULED' COMMENT '강등 반영: 정기/즉시/안함',
  `new_member_protect_days` int NOT NULL DEFAULT '0' COMMENT '신규 회원 보호기간(일)',
  `min_holding_days` int NOT NULL DEFAULT '0' COMMENT '승급 후 최소 유지기간(일)',
  `effective_from` date DEFAULT NULL COMMENT '적용 시작일',
  `effective_to` date DEFAULT NULL COMMENT '적용 종료일',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eval_policy_mall_status` (`mall_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='멤버십 등급 평가 정책 (몰별·버전)';

-- 4) 등급별 진입/유지 기준 (정책 × 등급) ----------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade_criterion` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `policy_id` int NOT NULL COMMENT '평가 정책 ID (FK)',
  `grade_id` int NOT NULL COMMENT '등급 ID (FK)',
  `entry_amount_min` bigint NOT NULL DEFAULT '0' COMMENT '승급 진입 최소 인정금액',
  `entry_order_count_min` int NOT NULL DEFAULT '0' COMMENT '승급 진입 최소 인정 주문건수',
  `retention_amount_min` bigint DEFAULT NULL COMMENT '유지 최소 인정금액 (NULL=진입 기준과 동일)',
  `retention_order_count_min` int DEFAULT NULL COMMENT '유지 최소 주문건수 (NULL=진입과 동일)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_criterion_policy_grade` (`policy_id`, `grade_id`),
  CONSTRAINT `fk_criterion_policy` FOREIGN KEY (`policy_id`) REFERENCES `membership_evaluation_policy` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_criterion_grade` FOREIGN KEY (`grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급별 진입·유지 기준';

-- 5) 회원 등급 상태 (회원 × 몰) --------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_membership` (
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `current_grade_id` int DEFAULT NULL COMMENT '현재 등급 ID (FK)',
  `grade_started_at` timestamp NULL DEFAULT NULL COMMENT '현재 등급 적용 시작',
  `grade_expires_at` timestamp NULL DEFAULT NULL COMMENT '등급 만료(수동/기간제)',
  `is_locked` tinyint(1) NOT NULL DEFAULT '0' COMMENT '자동 평가 제외(고정)',
  `lock_reason` varchar(255) DEFAULT NULL COMMENT '고정 사유',
  `lock_expires_at` timestamp NULL DEFAULT NULL COMMENT '고정 만료(NULL=무기한)',
  `recognized_amount` bigint NOT NULL DEFAULT '0' COMMENT '최근 평가 시점 인정금액(캐시)',
  `recognized_order_count` int NOT NULL DEFAULT '0' COMMENT '최근 평가 시점 인정 주문건수(캐시)',
  `last_evaluated_at` timestamp NULL DEFAULT NULL COMMENT '마지막 평가 일시',
  `next_evaluation_at` timestamp NULL DEFAULT NULL COMMENT '다음 평가 예정',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `mall_id`),
  KEY `idx_membership_grade` (`current_grade_id`),
  KEY `idx_membership_mall_grade` (`mall_id`, `current_grade_id`),
  CONSTRAINT `fk_membership_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_membership_grade` FOREIGN KEY (`current_grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 등급 상태 (회원×몰)';

-- 6) 실적 원장 (구매확정 적립 / 취소 역분개) -------------------------------
CREATE TABLE IF NOT EXISTS `customer_performance_ledger` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `source_type` varchar(30) NOT NULL DEFAULT 'ORDER' COMMENT '실적 출처',
  `source_id` bigint DEFAULT NULL COMMENT '출처 엔티티 ID (orders.id)',
  `event_type` enum('ORDER_CONFIRMED','ORDER_REVERSED','ADMIN_ADJUST') NOT NULL COMMENT '적립/역분개/수동조정',
  `recognized_amount` int NOT NULL DEFAULT '0' COMMENT '인정 금액 (역분개는 음수)',
  `recognized_order_count` int NOT NULL DEFAULT '0' COMMENT '인정 주문건수 (역분개는 음수)',
  `reversal_of_ledger_id` bigint DEFAULT NULL COMMENT '역분개 대상 원장 ID',
  `memo` varchar(255) DEFAULT NULL COMMENT '메모',
  `occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '실적 발생 시각(집계 기준일)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_user_mall_time` (`user_id`, `mall_id`, `occurred_at`),
  KEY `idx_ledger_source` (`source_type`, `source_id`),
  CONSTRAINT `fk_ledger_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 인정 실적 원장';

-- 7) 등급 변경 이력 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade_history` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `from_grade_id` int DEFAULT NULL COMMENT '이전 등급',
  `to_grade_id` int DEFAULT NULL COMMENT '변경 등급',
  `change_type` enum('SIGNUP','UPGRADE','DOWNGRADE','MAINTAIN','MANUAL','LOCK','UNLOCK') NOT NULL COMMENT '변경 유형',
  `reason_code` varchar(50) DEFAULT NULL COMMENT '사유 코드',
  `reason_text` varchar(255) DEFAULT NULL COMMENT '상세 사유',
  `policy_id` int DEFAULT NULL COMMENT '적용 정책 ID',
  `evaluation_run_id` bigint DEFAULT NULL COMMENT '평가 실행 ID',
  `recognized_amount` bigint DEFAULT NULL COMMENT '변경 시점 인정금액',
  `effective_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '적용 시각',
  `changed_by` varchar(50) NOT NULL DEFAULT 'SYSTEM' COMMENT '변경 주체 (SYSTEM 또는 admin id)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_user_mall` (`user_id`, `mall_id`),
  KEY `idx_history_run` (`evaluation_run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급 변경 이력';

-- 8) 평가 실행 이력 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_evaluation_run` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `policy_id` int DEFAULT NULL COMMENT '평가 정책 ID',
  `mode` enum('SCHEDULED','MANUAL','SIMULATE') NOT NULL DEFAULT 'MANUAL' COMMENT '실행 유형',
  `status` enum('RUNNING','SUCCESS','FAILED') NOT NULL DEFAULT 'RUNNING' COMMENT '상태',
  `target_count` int NOT NULL DEFAULT '0' COMMENT '평가 대상 수',
  `upgrade_count` int NOT NULL DEFAULT '0',
  `downgrade_count` int NOT NULL DEFAULT '0',
  `maintain_count` int NOT NULL DEFAULT '0',
  `failure_count` int NOT NULL DEFAULT '0',
  `message` varchar(500) DEFAULT NULL COMMENT '결과/오류 메시지',
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_eval_run_mall` (`mall_id`, `started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급 평가 실행 이력';

-- 9) 주문 등급혜택 스냅샷 (설계 §2.2) -------------------------------------
CREATE TABLE IF NOT EXISTS `order_membership_benefit_snapshot` (
  `order_id` int NOT NULL COMMENT '주문 ID (PK, FK)',
  `user_id` int DEFAULT NULL COMMENT '회원 ID',
  `mall_id` bigint DEFAULT NULL COMMENT '몰 ID',
  `grade_id` int DEFAULT NULL COMMENT '주문 당시 등급 ID',
  `grade_code_snapshot` varchar(30) DEFAULT NULL COMMENT '주문 당시 등급 코드',
  `grade_name_snapshot` varchar(50) DEFAULT NULL COMMENT '주문 당시 등급명',
  `grade_discount_amount` int NOT NULL DEFAULT '0' COMMENT '등급 할인 적용액',
  `grade_point_rate` decimal(5,2) DEFAULT NULL COMMENT '적용 등급 적립률(%)',
  `grade_point_expected` int NOT NULL DEFAULT '0' COMMENT '등급 기준 예상 적립액',
  `free_shipping_applied` tinyint(1) NOT NULL DEFAULT '0' COMMENT '등급 무료배송 적용 여부',
  `benefit_details_json` json DEFAULT NULL COMMENT '계산 근거 스냅샷',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `idx_snapshot_user` (`user_id`),
  CONSTRAINT `fk_snapshot_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='주문 등급혜택 스냅샷';
