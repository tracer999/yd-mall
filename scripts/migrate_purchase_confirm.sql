-- 구매확정
--
-- ── 왜 필요한가
-- 지금까지 주문은 `배송완료` 가 마지막이었다. 그런데 배송완료는 "물건이 도착했다"일 뿐,
-- 고객이 **물건을 확인하고 받아들였다**는 뜻은 아니다. 그 사이가 반품 가능 기간(7일)이다.
-- 구매확정은 그 기간을 고객이 스스로 끝내는 행위이며, 이 시점이
--   · 적립금을 실제로 주는 시점이고
--   · 반품을 더 받지 않는 시점이다.
--
-- ── 적립 시점을 왜 옮기나
-- 결제 즉시 적립하면, 반품하는 고객에게도 일단 포인트를 줬다가 도로 뺏어야 한다.
-- 이미 써 버렸으면 회수할 수도 없다(orderCancelService 가 잔액만큼만 깎는 이유).
-- 구매확정 시 지급하면 그 문제가 사라진다.
--
-- 되돌리기는 아래 주석 참고. 데이터가 쌓인 뒤에는 되돌리지 말 것.

ALTER TABLE orders
    ADD COLUMN confirmed_at DATETIME DEFAULT NULL
        COMMENT '구매확정 시각. NULL = 아직 확정 전' AFTER paid_at,
    ADD COLUMN confirm_source ENUM('CUSTOMER','AUTO','ADMIN') DEFAULT NULL
        COMMENT '누가 확정했나 — 고객 / 기간 경과 자동 / 관리자' AFTER confirmed_at,
    ADD KEY idx_orders_confirmed (confirmed_at);

-- 적립 트랜잭션 타입에 '구매확정 적립' 을 추가한다.
-- 기존 PURCHASE_ACCUMULATE 는 결제 시점 적립분(구매확정 도입 전 주문)이 쓰고 있으므로 남긴다.
ALTER TABLE point_transactions
    MODIFY COLUMN transaction_type ENUM(
        'PURCHASE_ACCUMULATE','PURCHASE_USE','ADMIN_GRANT','ADMIN_DEDUCT',
        'ORDER_CANCEL_RESTORE','ORDER_CANCEL_REVOKE',
        'POINT_EXPIRE','ORDER_PARTIAL_REFUND',
        'PURCHASE_CONFIRM'
    ) NOT NULL;

-- ── 기존 주문 처리 ────────────────────────────────────────────
-- 이미 배송완료된 주문은 **확정하지 않는다.** 확정하면 그 순간 적립이 한 번 더 나가거나
-- (중복 가드가 막지만) 반품 기간이 갑자기 끝나 고객이 손해를 본다.
-- 기존 주문은 confirmed_at = NULL 로 두고, 고객이 직접 확정하거나 자동 확정 기간을 타게 한다.
-- 적립은 이미 결제 시점에 지급됐으므로 구매확정 시 중복 지급되지 않는다
--   (purchaseConfirmService 가 PURCHASE_ACCUMULATE 이력을 먼저 확인한다).

-- ── 되돌리기 (참고) ──────────────────────────────────────────
-- ALTER TABLE orders DROP KEY idx_orders_confirmed, DROP COLUMN confirm_source, DROP COLUMN confirmed_at;
