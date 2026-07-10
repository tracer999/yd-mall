-- 배송비 1차 — 기본 배송비 + 무료배송 기준
-- 설계: docs/사이트개선/shipping_fee_design_and_development.md §2-1 · §8-1 (S1)
--
-- `views/user/guide.ejs` 는 "5만원 이상 무료, 미만 시 3,000원" 을 이미 고객에게 고지하고 있는데
-- 시스템 어디에도 배송비가 없었다. 고지한 정책을 구현한다.
--
-- ⚠️ mall.id 는 bigint 다. site_settings.mall_id 도 bigint. 여기서도 bigint 로 맞춘다.
--    (products.id · users.id · coupons.id 만 int 인 구세대 테이블이다)
-- ⚠️ mall_id 에 FK 를 걸지 않는다 — page/product_group/custom_menu 어디에도 mall FK 가 없다.
-- ⚠️ 기존 22건은 shipping_fee=0, shipping_discount=0 으로 백필된다(DEFAULT).
--    total_amount = subtotal − coupon − point 와 정확히 일치하므로 과거 총액은 바뀌지 않는다.

CREATE TABLE IF NOT EXISTS shipping_policy (
  id             int         NOT NULL AUTO_INCREMENT,
  mall_id        bigint      NOT NULL COMMENT '몰 ID. 몰당 1행',

  base_fee       int         NOT NULL DEFAULT 3000 COMMENT '기본 배송비',
  free_threshold int         DEFAULT NULL COMMENT '이 금액(subtotal_amount) 이상이면 기본 배송비 면제. NULL=무료배송 없음',

  is_active      tinyint(1)  NOT NULL DEFAULT 1 COMMENT '0 이면 배송비를 청구하지 않는다',

  created_at     timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_shipping_policy_mall (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 배송비 정책';

-- 고지된 정책으로 초기화 (views/user/guide.ejs)
INSERT INTO shipping_policy (mall_id, base_fee, free_threshold) VALUES (1, 3000, 50000), (2, 3000, 50000)
ON DUPLICATE KEY UPDATE mall_id = mall_id;

-- orders 에 배송비 두 칸. shipping_discount 는 2차의 무료배송 쿠폰이 채운다.
ALTER TABLE orders
  ADD COLUMN shipping_fee      int NOT NULL DEFAULT 0 COMMENT '배송비(지역 할증 포함)'      AFTER subtotal_amount,
  ADD COLUMN shipping_discount int NOT NULL DEFAULT 0 COMMENT '배송비 쿠폰 할인. shipping_fee 를 초과할 수 없다' AFTER shipping_fee;
