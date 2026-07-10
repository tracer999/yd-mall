-- 주문/클레임 1차 — 상태 분리 + 변경 이력 (O1 · O2)
-- 설계: docs/사이트개선/order_claim_design_and_development.md §2-1
--
-- ⚠️ `orders.status` 를 지우지 않는다. dev·prod 가 같은 DB 라 운영이 옛 코드를 돌리는 동안
--    그 코드가 `status` 를 읽는다. **`status` 가 계속 정본**이고 새 컬럼은 그것을 세분화한다.
--
-- ⚠️ 쓰지 않을 컬럼은 만들지 않는다. 레퍼런스의 fulfillment_status·settlement_status 는 제외.
--    (배송 이행은 shipments.status 가, 정산은 단일 판매자라 개념 자체가 없다)

ALTER TABLE orders
  ADD COLUMN payment_status enum('PENDING','PAID','CANCELLED','REFUNDED','PARTIAL_REFUNDED')
             NOT NULL DEFAULT 'PENDING' COMMENT '결제 상태. 주문 상태와 분리된다' AFTER status,
  ADD COLUMN claim_status   enum('NONE','REQUESTED','APPROVED','REJECTED','COMPLETED')
             NOT NULL DEFAULT 'NONE'    COMMENT '취소·반품·교환 진행 상태' AFTER payment_status,
  ADD COLUMN refund_status  enum('NONE','REQUESTED','COMPLETED','FAILED')
             NOT NULL DEFAULT 'NONE'    COMMENT '환불(금액 반환) 상태. 반품과 다른 업무다' AFTER claim_status,
  -- 코드가 이미 쓰고 있었으나 존재하지 않던 컬럼. 고객 주문 취소가 항상 500 이었다(§0-1).
  ADD COLUMN cancel_reason  varchar(255) DEFAULT NULL COMMENT '취소 사유' AFTER shipping_message,
  -- 재고·쿠폰·적립금 복원의 멱등 가드(§0-2). 두 번째 취소 경로가 생겨도 재고는 한 번만 돌아온다.
  ADD COLUMN resources_restored_at datetime DEFAULT NULL COMMENT '재고·쿠폰·적립금을 되돌린 시각',
  ADD KEY idx_orders_claim_status (claim_status),
  ADD KEY idx_orders_refund_status (refund_status);

-- 기존 22건 백필 — 현행 `status` 에서 파생시킨다. 총액·상태 어느 것도 바뀌지 않는다.
UPDATE orders SET payment_status = CASE
  WHEN status = 'PENDING'   THEN 'PENDING'
  WHEN status = 'CANCELLED' THEN 'CANCELLED'
  WHEN status = 'REFUNDED'  THEN 'REFUNDED'
  ELSE 'PAID' END;

-- 이미 취소된 주문은 자원이 복원된 것으로 본다(재차 복원되지 않게).
UPDATE orders SET resources_restored_at = COALESCE(paid_at, created_at)
 WHERE status IN ('CANCELLED', 'REFUNDED');

UPDATE orders SET claim_status  = 'COMPLETED' WHERE status IN ('CANCELLED', 'REFUNDED');
UPDATE orders SET refund_status = 'COMPLETED' WHERE status = 'REFUNDED';

-- 주문 변경 이력 (레퍼런스 §2.1). 누가·언제·무엇을 바꿨는지.
CREATE TABLE IF NOT EXISTS order_status_logs (
  id         bigint      NOT NULL AUTO_INCREMENT,
  order_id   int         NOT NULL COMMENT 'orders.id 는 int 다. bigint 로 두면 FK 실패',

  field      varchar(40) NOT NULL COMMENT '바뀐 필드 (status · payment_status · claim_status · refund_status …)',
  old_value  varchar(60) DEFAULT NULL,
  new_value  varchar(60) DEFAULT NULL,

  actor_type enum('CUSTOMER','ADMIN','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  actor_id   int         DEFAULT NULL COMMENT 'users.id 또는 admins.id. FK 를 걸지 않는다(두 테이블을 가리킨다)',
  memo       varchar(255) DEFAULT NULL,

  created_at datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_osl_order (order_id, created_at),
  CONSTRAINT fk_osl_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='주문 상태 변경 이력';
