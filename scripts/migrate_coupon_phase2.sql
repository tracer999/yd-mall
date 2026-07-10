-- 쿠폰 2차 — 정률 할인 + 적용 범위 + 무료배송 쿠폰 (P1 · P7 · P8)
-- 설계: docs/사이트개선/coupon_design_and_development.md §5-3 · §6-1
--       docs/사이트개선/shipping_fee_design_and_development.md §2-3 · §3
--
-- 선행: 0.5차 배송비(orders.shipping_fee) — migrate_shipping_fee.sql
--
-- ⚠️ 무료배송 쿠폰이 들어오는 순간 "주문당 쿠폰 1장" 제약이 깨진다.
--    5,000원 할인 쿠폰을 쓰면 무료배송 쿠폰을 못 쓰는 몰은 없다.
--    조합 그룹의 최소 구현 — 주문 쿠폰 1장(orders.user_coupon_id) + 배송비 쿠폰 1장
--    (orders.shipping_coupon_id). 3장 이상 다중 적용은 3차.

-- ── coupons: 혜택 유형 4종 ──────────────────────────────────────────────────
--   FIXED          정액 할인 (discount_amount)
--   PERCENT        정률 할인 (discount_rate, max_discount_amount 필수)
--   SHIPPING_FREE  배송비 전액 (shipping_fee 상한)
--   SHIPPING_FIXED 배송비 정액 (discount_amount, shipping_fee 상한)
ALTER TABLE coupons
  ADD COLUMN benefit_type        enum('FIXED','PERCENT','SHIPPING_FREE','SHIPPING_FIXED')
                                 NOT NULL DEFAULT 'FIXED' AFTER issue_method,
  ADD COLUMN discount_rate       decimal(5,2) DEFAULT NULL COMMENT 'PERCENT 일 때 할인율(%)',
  ADD COLUMN max_discount_amount int          DEFAULT NULL COMMENT 'PERCENT 필수. 없으면 고액 주문에서 할인이 무한정 커진다',
  ADD COLUMN scope_json          json         DEFAULT NULL COMMENT '포함/제외 규칙. {"include":{"categoryIds":[]},"exclude":{"productIds":[]}}';

-- 기존 3건은 전부 정액이다. DEFAULT 'FIXED' 로 이미 백필됐다.

-- 조합 그룹은 benefit_type 에서 파생한다 — 별도 컬럼을 두지 않는다.
--   SHIPPING_* → SHIPPING 그룹 → orders.shipping_coupon_id
--   그 외      → ORDER 그룹    → orders.user_coupon_id

-- ── orders: 배송비 쿠폰 슬롯 ────────────────────────────────────────────────
-- ⚠️ user_coupons.id 는 int 다. bigint 로 두면 FK 생성이 실패한다.
ALTER TABLE orders
  ADD COLUMN shipping_coupon_id int DEFAULT NULL COMMENT '배송비 쿠폰(SHIPPING 그룹). 주문 쿠폰과 별개 슬롯' AFTER user_coupon_id,
  ADD KEY idx_orders_shipping_coupon (shipping_coupon_id),
  ADD CONSTRAINT fk_orders_shipping_coupon
      FOREIGN KEY (shipping_coupon_id) REFERENCES user_coupons (id) ON DELETE SET NULL;
