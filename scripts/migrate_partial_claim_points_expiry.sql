-- 부분 취소·부분 반품 / 반품 회수 추적 / 포인트 유효기간
--
-- 세 가지를 한 파일에 묶은 이유 — 셋 다 "주문 이후"의 돈을 다루고, 부분 환불이 도입되면
-- 포인트 환급도 부분이 되기 때문에 따로 배포하면 중간 상태에서 금액이 어긋난다.
--
-- 되돌리기(롤백)는 아래 DROP 문 주석을 참고. 데이터가 쌓인 뒤에는 되돌리지 말 것.

-- ─────────────────────────────────────────────────────────────
-- 1. 클레임 품목 (부분 취소·부분 반품)
--
-- 지금까지 클레임은 주문 단위였다. 3개 중 1개만 반품하려면 전체를 취소하고 다시 주문받아야 했고,
-- 그 과정에서 재고·쿠폰·적립금이 어긋났다. 이 테이블이 "무엇을 몇 개" 를 들고,
-- 행이 하나도 없는 클레임은 **전건 클레임**으로 읽는다(기존 데이터가 그대로 유효하다).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_claim_items (
    id              BIGINT NOT NULL AUTO_INCREMENT COMMENT 'PK',
    claim_id        BIGINT NOT NULL COMMENT 'order_claims.id',
    order_item_id   INT NOT NULL COMMENT 'order_items.id — 어느 품목인가',
    quantity        INT NOT NULL COMMENT '이 클레임에 포함된 수량 (주문 수량 이하)',
    refund_amount   INT NOT NULL DEFAULT 0 COMMENT '이 품목 몫으로 계산된 환불액(할인 안분 후). 승인 시점에 확정한다',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_oci_claim (claim_id),
    KEY idx_oci_item (order_item_id),
    CONSTRAINT fk_oci_claim FOREIGN KEY (claim_id) REFERENCES order_claims (id) ON DELETE CASCADE,
    CONSTRAINT fk_oci_item  FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='클레임 대상 품목 — 행이 없으면 주문 전건 클레임';

-- 부분 클레임 여부를 클레임 자체에도 남긴다(목록에서 조인 없이 뱃지를 그리기 위함).
ALTER TABLE order_claims
    ADD COLUMN is_partial TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = 일부 품목만 대상' AFTER claim_type;

-- ─────────────────────────────────────────────────────────────
-- 2. 반품 회수 송장
--
-- 반품을 승인해도 물건이 언제 돌아오는지 시스템이 몰랐다. 회수는 **보내는 방향이 반대**일 뿐
-- 택배사·송장·상태가 같으므로 shipments 를 재사용하고 방향 컬럼으로만 가른다.
-- (RETURNING/RETURNED 상태값은 이미 enum 에 있다)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE shipments
    ADD COLUMN direction ENUM('OUTBOUND','RETURN') NOT NULL DEFAULT 'OUTBOUND'
        COMMENT 'OUTBOUND = 고객에게 보냄, RETURN = 고객에게서 회수' AFTER order_id,
    ADD COLUMN claim_id BIGINT DEFAULT NULL COMMENT '회수 송장이 속한 클레임 (direction=RETURN 일 때)' AFTER direction,
    ADD COLUMN picked_up_at TIMESTAMP NULL DEFAULT NULL COMMENT '회수 완료 시각' AFTER delivered_at,
    ADD KEY idx_ship_claim (claim_id);

-- 기존 행은 전부 출고 송장이다(위 DEFAULT 로 이미 OUTBOUND).
-- order_id 단건 조회가 회수 송장까지 물어 오지 않도록, 조회하는 쪽은 direction 을 반드시 건다.

-- ─────────────────────────────────────────────────────────────
-- 3. 포인트 유효기간
--
-- 적립금이 소멸 없이 쌓이면 회계상 부채가 무한히 늘어난다. 나중에 도입하면 이미 지급된
-- 포인트에 소급 적용할 수 없으므로 지금 컬럼을 만든다.
-- expires_at 이 NULL 이면 "기한 없음"이다 — 기능을 꺼 두면 기존과 똑같이 동작한다.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE point_transactions
    ADD COLUMN expires_at DATETIME DEFAULT NULL COMMENT '이 적립분의 소멸 예정일. NULL = 기한 없음' AFTER description,
    ADD COLUMN expired_amount INT NOT NULL DEFAULT 0 COMMENT '이 적립분에서 이미 소멸 처리된 금액' AFTER expires_at,
    ADD KEY idx_pt_expires (expires_at);

-- 소멸 처리 이력을 남길 트랜잭션 타입 추가.
-- (POINT_EXPIRE = 기한 만료 소멸, ORDER_PARTIAL_REFUND = 부분 환불에 따른 포인트 환급)
ALTER TABLE point_transactions
    MODIFY COLUMN transaction_type ENUM(
        'PURCHASE_ACCUMULATE','PURCHASE_USE','ADMIN_GRANT','ADMIN_DEDUCT',
        'ORDER_CANCEL_RESTORE','ORDER_CANCEL_REVOKE',
        'POINT_EXPIRE','ORDER_PARTIAL_REFUND'
    ) NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. 되돌리기 (참고 — 데이터가 쌓인 뒤에는 실행하지 말 것)
-- ─────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS order_claim_items;
-- ALTER TABLE order_claims DROP COLUMN is_partial;
-- ALTER TABLE shipments DROP KEY idx_ship_claim, DROP COLUMN picked_up_at, DROP COLUMN claim_id, DROP COLUMN direction;
-- ALTER TABLE point_transactions DROP KEY idx_pt_expires, DROP COLUMN expired_amount, DROP COLUMN expires_at;
