-- 멤버십 2차: 혜택별 사용여부 토글 — 각 등급 혜택(할인·적립·배송)을 개별 on/off.
-- "사용"인 혜택만 결제에 적용된다. 값이 있어도 enabled=0 이면 미적용.
-- (쿠폰팩·생일 쿠폰의 on/off 는 membership_grade_coupon 연결/해제로 관리한다.)

ALTER TABLE `membership_grade_benefit`
  ADD COLUMN `discount_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '정률 할인 혜택 사용 여부' AFTER `grade_id`,
  ADD COLUMN `point_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '등급 적립 혜택 사용 여부' AFTER `max_discount_amount`,
  ADD COLUMN `shipping_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '배송 혜택(무료배송/문턱) 사용 여부' AFTER `point_rate_mode`;
