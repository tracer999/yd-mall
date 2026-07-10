-- 0차 결함 수정 — 주문 취소 시 자원 복원 (쿠폰 문서 C1)
-- 설계: docs/사이트개선/coupon_design_and_development.md §10-2-0
--
-- 취소 시 되돌려야 하는 것은 재고·쿠폰·적립금 셋이다. 적립금 이동을 기록하려면
-- point_transactions.transaction_type 에 취소 사유 두 개가 필요하다.
--
-- ⚠️ ENUM 확장은 하위호환이다. 옛 코드는 새 값을 쓰지 않으므로 배포 전에 적용해도 안전하다.

ALTER TABLE point_transactions
  MODIFY COLUMN transaction_type
    ENUM('PURCHASE_ACCUMULATE','PURCHASE_USE','ADMIN_GRANT','ADMIN_DEDUCT',
         'ORDER_CANCEL_RESTORE','ORDER_CANCEL_REVOKE') NOT NULL
    COMMENT 'ORDER_CANCEL_RESTORE=취소 시 사용 적립금 환급 / ORDER_CANCEL_REVOKE=취소 시 구매 적립 회수';

-- 취소 시 쿠폰 복원 여부 (기본 켬). 끄면 취소해도 쿠폰이 소멸한다.
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('coupon_restore_on_cancel', '1', '주문 취소 시 사용한 쿠폰을 복원할지 여부 (1=복원, 0=소멸)')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
