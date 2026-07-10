-- 쿠폰 1차 — 다운로드 쿠폰존 + 몰 스코프 + 상태 + RESERVED 점유 (D1)
-- 설계: docs/사이트개선/coupon_design_and_development.md §5-2 · §6-2 · §6-3
--
-- ⚠️ 이 마이그레이션의 백필과 `routes/auth.js` · `checkoutController` · `admin/couponController` 의
--    읽기 지점 교체는 **같은 배포에 묶여야 한다.** 나누면 회원가입 쿠폰 지급이 끊긴다(dev DB = prod DB).
--
-- ⚠️ `is_active` 를 지우지 않는다. 운영은 아직 옛 코드를 돌리고 있고 그 코드가 `is_active` 를 읽는다.
--    새 코드는 `status` 를 읽고, 쓰기 시 두 컬럼을 함께 갱신한다(status 가 정본, is_active 는 미러).
--    배포가 안정된 뒤 별도 마이그레이션으로 제거한다.
--
-- ⚠️ users.id · coupons.id · orders.id 는 int 다. 참조 컬럼을 bigint 로 두면 FK 생성이 실패한다.
--    mall_id 만 bigint(mall.id 와 동일). mall 에는 FK 를 걸지 않는다 — 다른 테이블도 안 건다.

-- ── coupons ────────────────────────────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN mall_id           bigint      DEFAULT NULL COMMENT 'NULL = 전 몰 공용' AFTER id,
  ADD COLUMN issue_method      enum('AUTO_SIGNUP','ADMIN','CODE','DOWNLOAD') NOT NULL DEFAULT 'ADMIN'
                               COMMENT '발급 방식. coupon_type 은 목적 라벨로만 남는다' AFTER coupon_type,
  ADD COLUMN status            enum('DRAFT','ACTIVE','PAUSED','ENDED') NOT NULL DEFAULT 'ACTIVE'
                               COMMENT '정본. is_active 는 하위호환 미러' AFTER is_active,
  ADD COLUMN download_start_at datetime    DEFAULT NULL COMMENT '수령 가능 기간 시작 (사용 기간 valid_* 과 별개)',
  ADD COLUMN download_end_at   datetime    DEFAULT NULL COMMENT '수령 가능 기간 끝',
  ADD COLUMN issue_limit       int         DEFAULT NULL COMMENT '수령(발급) 한도. NULL=무제한. max_total_uses 는 사용 한도다',
  ADD COLUMN issued_count      int         NOT NULL DEFAULT 0 COMMENT '현재 발급 수. 선착순 판정에 쓴다',
  ADD COLUMN valid_days        int         DEFAULT NULL COMMENT '발급일 기준 상대 유효기간(일). user_coupons.expires_at 에 계산해 박는다',
  ADD KEY idx_coupons_download (issue_method, status, download_end_at);

-- 백필 — 현행 동작을 그대로 보존한다.
--   NEW_SIGNUP 은 routes/auth.js 의 자동발급 트리거로 **동작**하고 있었다 → AUTO_SIGNUP
--   SPECIAL 은 code 입력형으로 **동작**하고 있었다                      → CODE
UPDATE coupons SET issue_method = CASE
  WHEN coupon_type = 'NEW_SIGNUP' THEN 'AUTO_SIGNUP'
  WHEN coupon_type = 'SPECIAL'    THEN 'CODE'
  ELSE 'ADMIN' END;

UPDATE coupons SET status = CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'PAUSED' END;

-- 이미 발급된 수를 issued_count 에 반영해 둔다(선착순 판정의 출발점).
UPDATE coupons c
   SET issued_count = (SELECT COUNT(*) FROM user_coupons uc WHERE uc.coupon_id = c.id);

-- max_total_uses 의 의미가 바뀐다 — 옛 코드는 이 값을 **발급** 한도로 썼고(auth.js · postIssue ·
-- postApplyCouponCode 가 전체 user_coupons 행 수와 비교했다), 새 설계는 **사용** 한도로 쓴다(§5-2).
-- 기존 쿠폰의 발급 한도가 조용히 풀리지 않도록 issue_limit 로 옮겨 담는다.
UPDATE coupons SET issue_limit = max_total_uses WHERE max_total_uses IS NOT NULL AND issue_limit IS NULL;

-- ── user_coupons ───────────────────────────────────────────────────────────
ALTER TABLE user_coupons
  MODIFY COLUMN issued_by enum('AUTO','ADMIN','CODE','DOWNLOAD','EVENT') NOT NULL,
  ADD COLUMN expires_at        datetime DEFAULT NULL COMMENT 'valid_days 계산 결과. NULL 이면 coupons.valid_to' AFTER issued_at,
  ADD COLUMN reserved_order_id int      DEFAULT NULL COMMENT 'PENDING 주문이 점유 중. 결제 확정 시 NULL' AFTER order_id,
  ADD COLUMN reserved_at       datetime DEFAULT NULL COMMENT '점유 시각. 방치된 점유를 나이로 무시할 때 쓴다',
  ADD KEY idx_uc_reserved (reserved_order_id),
  ADD CONSTRAINT fk_user_coupons_reserved_order
      FOREIGN KEY (reserved_order_id) REFERENCES orders (id) ON DELETE SET NULL;

-- ── coupon_download ────────────────────────────────────────────────────────
-- 다운로드 1인 1회를 **DB 제약**으로 막는다. 애플리케이션 NOT EXISTS 는 경쟁 조건에 진다(§6-3).
-- 전역 UNIQUE(user_id, coupon_id) 는 걸지 않는다 — 관리자 재발급(사용한 쿠폰 재지급)을 깨뜨린다.
CREATE TABLE IF NOT EXISTS coupon_download (
  user_id    int       NOT NULL,
  coupon_id  int       NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, coupon_id),
  KEY idx_coupon_download_coupon (coupon_id),
  CONSTRAINT fk_cd_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_cd_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쿠폰 다운로드 수령 이력 (1인 1회 보장)';
