-- ============================================================================
-- 멤버십 등급 시스템 — 시드 (설계 §18 권장 초기 정책)
--
--   전제: scripts/migrate_membership.sql 선행. 멱등(ON DUPLICATE KEY / INSERT ... SELECT 가드).
--   모든 활성 몰에 4등급(BASIC/SILVER/GOLD/VIP) + 혜택 + ACTIVE 평가정책 + 기준을 시드한다.
--
--   적립률 주의: 기존 시스템은 point_accumulate_rate(기본 5%)를 전 회원에게 준다.
--   등급 적립은 이를 **대체하지 않고(ADD)** 가산한다 — 기존 동작 회귀를 막기 위함.
--   (BASIC=가산 없음 / SILVER +0.5 / GOLD +1.0 / VIP +2.0)
-- ============================================================================

-- 1) 등급 정의 — 모든 몰 × 4등급 ------------------------------------------
INSERT INTO `membership_grade`
    (mall_id, grade_code, grade_name, rank_order, is_default, is_active, is_auto_evaluation, color, description, mypage_note)
SELECT m.id, g.grade_code, g.grade_name, g.rank_order, g.is_default, 1, 1, g.color, g.description, g.mypage_note
FROM `mall` m
CROSS JOIN (
        SELECT 'BASIC'  AS grade_code, '베이직' AS grade_name, 40 AS rank_order, 1 AS is_default, '#9ca3af' AS color, '가입 시 기본 등급' AS description, '구매 실적을 쌓으면 상위 등급으로 승급됩니다.' AS mypage_note
  UNION ALL SELECT 'SILVER', '실버', 30, 0, '#94a3b8', '누적 구매 실적 실버 등급', '실버 등급 혜택이 적용됩니다.'
  UNION ALL SELECT 'GOLD',   '골드', 20, 0, '#f59e0b', '누적 구매 실적 골드 등급', '골드 등급 할인·적립·배송 혜택이 적용됩니다.'
  UNION ALL SELECT 'VIP',    'VIP',  10, 0, '#7c3aed', '최상위 등급', 'VIP 전용 혜택이 적용됩니다.'
) g
WHERE m.is_active = 1
ON DUPLICATE KEY UPDATE grade_name = VALUES(grade_name), rank_order = VALUES(rank_order),
    is_default = VALUES(is_default), color = VALUES(color), description = VALUES(description);

-- 2) 등급별 혜택 ----------------------------------------------------------
INSERT INTO `membership_grade_benefit`
    (grade_id, discount_rate, max_discount_amount, min_order_amount, point_rate, point_rate_mode, free_shipping, free_ship_threshold)
SELECT g.id,
       CASE g.grade_code WHEN 'GOLD' THEN 2.00 WHEN 'VIP' THEN 5.00 ELSE 0.00 END,
       CASE g.grade_code WHEN 'GOLD' THEN 30000 WHEN 'VIP' THEN 100000 ELSE NULL END,
       0,
       CASE g.grade_code WHEN 'SILVER' THEN 0.50 WHEN 'GOLD' THEN 1.00 WHEN 'VIP' THEN 2.00 ELSE NULL END,
       'ADD',
       CASE g.grade_code WHEN 'VIP' THEN 1 ELSE 0 END,
       CASE g.grade_code WHEN 'GOLD' THEN 30000 ELSE NULL END
FROM `membership_grade` g
ON DUPLICATE KEY UPDATE
    discount_rate = VALUES(discount_rate), max_discount_amount = VALUES(max_discount_amount),
    point_rate = VALUES(point_rate), point_rate_mode = VALUES(point_rate_mode),
    free_shipping = VALUES(free_shipping), free_ship_threshold = VALUES(free_ship_threshold);

-- 3) 평가 정책 — 몰별 ACTIVE 1건 -----------------------------------------
INSERT INTO `membership_evaluation_policy`
    (mall_id, policy_name, version, status, performance_period_months, evaluation_cycle,
     amount_basis, condition_operator, upgrade_mode, downgrade_mode, new_member_protect_days, min_holding_days, effective_from)
SELECT m.id, '기본 등급 평가 정책', 1, 'ACTIVE', 12, 'MONTHLY', 'B_NET', 'OR', 'IMMEDIATE', 'SCHEDULED', 0, 0, CURDATE()
FROM `mall` m
WHERE m.is_active = 1
  AND NOT EXISTS (SELECT 1 FROM `membership_evaluation_policy` p WHERE p.mall_id = m.id AND p.status = 'ACTIVE');

-- 4) 등급별 진입/유지 기준 (설계 §18) ------------------------------------
INSERT INTO `membership_grade_criterion`
    (policy_id, grade_id, entry_amount_min, entry_order_count_min, retention_amount_min, retention_order_count_min)
SELECT p.id, g.id,
       CASE g.grade_code WHEN 'BASIC' THEN 0 WHEN 'SILVER' THEN 300000 WHEN 'GOLD' THEN 1000000 WHEN 'VIP' THEN 3000000 END,
       CASE g.grade_code WHEN 'BASIC' THEN 0 WHEN 'SILVER' THEN 3 WHEN 'GOLD' THEN 8 WHEN 'VIP' THEN 15 END,
       CASE g.grade_code WHEN 'BASIC' THEN NULL WHEN 'SILVER' THEN 200000 WHEN 'GOLD' THEN 800000 WHEN 'VIP' THEN 2500000 END,
       NULL
FROM `membership_evaluation_policy` p
JOIN `membership_grade` g ON g.mall_id = p.mall_id
WHERE p.status = 'ACTIVE'
ON DUPLICATE KEY UPDATE
    entry_amount_min = VALUES(entry_amount_min), entry_order_count_min = VALUES(entry_order_count_min),
    retention_amount_min = VALUES(retention_amount_min);

-- 5) 실적 원장 백필 — 기존 PAID 주문 (인정금액 = 상품 결제액, 배송비 제외) --------
--    회귀 안전: 이미 백필된 주문은 건너뛴다.
INSERT INTO `customer_performance_ledger`
    (user_id, mall_id, source_type, source_id, event_type, recognized_amount, recognized_order_count, occurred_at, memo)
SELECT o.user_id,
       COALESCE(o.mall_id, (SELECT id FROM mall WHERE is_default = 1 LIMIT 1)),
       'ORDER', o.id, 'ORDER_CONFIRMED',
       GREATEST(0, COALESCE(o.total_amount,0) - (COALESCE(o.shipping_fee,0) - COALESCE(o.shipping_discount,0))),
       1,
       COALESCE(o.paid_at, o.created_at),
       '기존 PAID 주문 백필'
FROM `orders` o
WHERE o.status = 'PAID' AND o.user_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM `customer_performance_ledger` l
      WHERE l.source_type = 'ORDER' AND l.source_id = o.id AND l.event_type = 'ORDER_CONFIRMED'
  );

-- 6) 회원 등급 상태 초기화 — 기본몰에 전 회원 BASIC 배정 --------------------
INSERT INTO `customer_membership`
    (user_id, mall_id, current_grade_id, grade_started_at, recognized_amount, recognized_order_count)
SELECT u.id, dm.mall_id, dm.basic_grade_id, NOW(), 0, 0
FROM `users` u
CROSS JOIN (
    SELECT m.id AS mall_id,
           (SELECT g.id FROM membership_grade g WHERE g.mall_id = m.id AND g.grade_code = 'BASIC' LIMIT 1) AS basic_grade_id
    FROM mall m WHERE m.is_default = 1 LIMIT 1
) dm
WHERE u.is_active = 1 AND dm.basic_grade_id IS NOT NULL
ON DUPLICATE KEY UPDATE user_id = customer_membership.user_id;  -- no-op: 이미 있으면 유지

-- 7) 가입(SIGNUP) 이력 시드 (BASIC 배정 기록) -----------------------------
INSERT INTO `membership_grade_history`
    (user_id, mall_id, from_grade_id, to_grade_id, change_type, reason_code, changed_by, effective_at)
SELECT cm.user_id, cm.mall_id, NULL, cm.current_grade_id, 'SIGNUP', 'SEED', 'SYSTEM', NOW()
FROM `customer_membership` cm
WHERE NOT EXISTS (
    SELECT 1 FROM `membership_grade_history` h
    WHERE h.user_id = cm.user_id AND h.mall_id = cm.mall_id
);
