-- 주문/클레임 2차 — 클레임 + 환불 (O7)
-- 설계: docs/사이트개선/order_claim_design_and_development.md §2-2
--
-- 취소·반품·교환·환불은 서로 다른 업무다(레퍼런스 §3).
--   반품 = 상품 회수 업무    order_claims
--   환불 = 금액 반환 업무    order_refunds
-- 상품이 회수됐지만 환불되지 않을 수 있고, 배송 전 취소처럼 반품 없이 환불만 발생할 수도 있다.
--
-- ⚠️ orders.id · admins.id · users.id 는 int 다. 참조 컬럼을 bigint 로 두면 FK 생성이 실패한다.
-- ⚠️ 클레임은 **주문 단위**다. 상품별(부분) 클레임은 3차 — 쿠폰 할인액 배분이 선행이다
--    (쿠폰 문서 §13-3: 부분 취소 → 상품 쿠폰 → 다중 쿠폰).

CREATE TABLE IF NOT EXISTS order_claims (
  id           bigint      NOT NULL AUTO_INCREMENT,
  order_id     int         NOT NULL,

  claim_type   enum('CANCEL','RETURN','EXCHANGE') NOT NULL COMMENT 'EXCHANGE 는 3차 — 신청을 차단한다',
  status       enum('REQUESTED','APPROVED','REJECTED','COMPLETED','WITHDRAWN') NOT NULL DEFAULT 'REQUESTED',

  reason_type  enum('CHANGE_OF_MIND','DEFECT','WRONG_DELIVERY','OTHER') NOT NULL DEFAULT 'OTHER',
  reason_detail varchar(500) DEFAULT NULL,

  responsible  enum('CUSTOMER','SELLER') NOT NULL DEFAULT 'CUSTOMER'
               COMMENT '귀책. 고객이면 반품 배송비를 청구한다(단순 변심)',
  return_shipping_fee int NOT NULL DEFAULT 0 COMMENT '환불액에서 차감할 반품 배송비',

  requested_by enum('CUSTOMER','ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  requested_at datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at datetime    DEFAULT NULL,
  processed_by int         DEFAULT NULL COMMENT 'admins.id. FK 를 걸지 않는다(고객 자동승인 시 NULL)',
  admin_memo   varchar(500) DEFAULT NULL,

  created_at   datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_claim_order (order_id),
  KEY idx_claim_status (status, claim_type),
  CONSTRAINT fk_claim_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='주문 클레임(취소·반품·교환)';

-- 진행 중인 클레임은 주문당 하나만. 승인/거절/철회된 뒤에는 다시 신청할 수 있어야 하므로
-- UNIQUE 제약 대신 애플리케이션이 REQUESTED 존재 여부로 막는다(claimService.requestClaim).

CREATE TABLE IF NOT EXISTS order_refunds (
  id           bigint      NOT NULL AUTO_INCREMENT,
  order_id     int         NOT NULL,
  claim_id     bigint      DEFAULT NULL COMMENT '클레임 없이 환불만 하는 경우 NULL',

  refund_amount int        NOT NULL COMMENT '실제 반환 금액 (total_amount − 반품배송비)',
  shipping_fee_refund int  NOT NULL DEFAULT 0 COMMENT '환불에 포함된 배송비(참고용)',
  return_shipping_fee_deducted int NOT NULL DEFAULT 0 COMMENT '차감한 반품 배송비',

  method       enum('PG','MANUAL','NONE') NOT NULL DEFAULT 'PG'
               COMMENT 'PG=토스 취소 / MANUAL=계좌 수동 / NONE=결제 없던 주문',
  status       enum('REQUESTED','COMPLETED','FAILED') NOT NULL DEFAULT 'REQUESTED',

  pg_response   text        DEFAULT NULL,
  failed_reason varchar(500) DEFAULT NULL,

  created_at    datetime   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at  datetime   DEFAULT NULL,

  PRIMARY KEY (id),
  KEY idx_refund_order (order_id),
  KEY idx_refund_status (status),
  CONSTRAINT fk_refund_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_claim FOREIGN KEY (claim_id) REFERENCES order_claims (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='환불(금액 반환) 이력';

-- 배송 상태 확장 (§2-3). 옛 코드는 'READY'/'IN_TRANSIT'/'DELIVERED' 만 쓴다 — 확장은 하위호환이다.
ALTER TABLE shipments
  MODIFY COLUMN status enum('READY','READY_TO_SHIP','SHIPPED','IN_TRANSIT','DELIVERED',
                            'DELIVERY_FAILED','RETURNING','RETURNED')
         CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'READY' COMMENT '배송 상태';

-- 관리자 메뉴 '클레임 관리' — 화면 메뉴는 하나로 유지한다(레퍼런스 §5).
-- ⚠️ is_active = 0. 라우트 배포를 확인한 뒤 켠다.
--    UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/claims';
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '클레임 관리', '/admin/claims', 'bi-arrow-counterclockwise', 4, 34, 0, 'super_admin,admin,customer_admin'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM admin_menus WHERE path = '/admin/claims');

-- 뒤 항목을 한 칸씩 민다. 절대값이라 재실행해도 결과가 같다.
UPDATE admin_menus SET display_order = 5 WHERE parent_id = 34 AND path = '/admin/shopify-orders';
UPDATE admin_menus SET display_order = 6 WHERE parent_id = 34 AND path = '/admin/users';
UPDATE admin_menus SET display_order = 7 WHERE parent_id = 34 AND path = '/admin/inquiries';
