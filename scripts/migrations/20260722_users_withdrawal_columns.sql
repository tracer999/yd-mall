-- 회원 탈퇴 컬럼 복구 (스키마 드리프트 해소)
--
-- tables.sql 에는 `withdraw_reason` / `withdrawn_at` 이 정의돼 있으나 실제 DB 에는 없었다.
-- 그 결과 아래 두 기능이 'Unknown column' 으로 깨져 있었다.
--   - 회원 탈퇴        : controllers/mypageController.js (UPDATE ... withdrawn_at = NOW())
--   - 관리자 탈퇴 필터 : controllers/admin/userController.js (searchStatus='withdrawn')
--
-- 또한 "탈퇴 회원만 삭제 허용" 규칙이 이 컬럼을 판정 근거로 쓴다.
-- 컬럼 추가만 하므로 기존 행에는 영향이 없다(전부 NULL = 탈퇴하지 않음).

ALTER TABLE `users`
  ADD COLUMN `withdraw_reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '탈퇴 사유' AFTER `is_active`,
  ADD COLUMN `withdrawn_at` timestamp NULL DEFAULT NULL COMMENT '탈퇴 일시' AFTER `withdraw_reason`;

-- 관리자 회원 목록이 '탈퇴' 상태로 자주 거른다.
ALTER TABLE `users` ADD INDEX `idx_users_withdrawn_at` (`withdrawn_at`);
