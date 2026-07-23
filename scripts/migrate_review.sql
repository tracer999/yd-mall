-- 리뷰 작성 · 관리 · 적립
--
-- 지금까지 `reviews` 는 **읽기만** 되는 테이블이었다(상품 상세의 리뷰 탭).
-- 작성 경로도, 관리 화면도, 적립도 없었다. 세 가지를 한꺼번에 붙인다.
--
-- ── 왜 주문을 붙이나
-- "산 사람만 리뷰를 쓴다"를 지키려면 **어느 주문으로 샀는지**를 알아야 한다.
-- 그리고 적립 금액을 **구매 금액 구간**으로 정하므로 그 주문의 결제금액이 필요하다.
-- 그래서 review 는 (회원, 상품)이 아니라 (회원, 상품, **주문 품목**) 단위로 하나씩 쓴다 —
-- 같은 상품을 두 번 사면 두 번 쓸 수 있고, 한 주문에서 두 번 쓸 수는 없다.

-- ─────────────────────────────────────────────────────────────
-- 1. reviews 확장
-- ─────────────────────────────────────────────────────────────
ALTER TABLE reviews
    ADD COLUMN mall_id BIGINT DEFAULT NULL COMMENT '작성 시점의 몰' AFTER id,
    ADD COLUMN order_id INT DEFAULT NULL COMMENT '이 리뷰의 근거가 된 주문(구매자 검증·적립 금액 판정)' AFTER product_id,
    ADD COLUMN order_item_id INT DEFAULT NULL COMMENT '주문 품목. 같은 상품을 여러 번 사면 각각 쓸 수 있다' AFTER order_id,
    ADD COLUMN image_url VARCHAR(255) DEFAULT NULL COMMENT '사진 리뷰 이미지. NULL 이면 텍스트 리뷰' AFTER content,
    ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = 관리자가 숨김(고객 화면 미노출)' AFTER image_url,
    ADD COLUMN point_awarded INT NOT NULL DEFAULT 0 COMMENT '이 리뷰로 지급된 적립금. 0 = 지급 없음' AFTER is_visible,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ADD KEY idx_reviews_order (order_id),
    ADD KEY idx_reviews_visible (product_id, is_visible);

-- 한 주문 품목당 리뷰 하나. 이 제약이 "한 번 사고 여러 번 적립"을 막는다.
-- (order_item_id 가 NULL 인 예전 행은 UNIQUE 에 걸리지 않는다 — MySQL 은 NULL 을 중복으로 보지 않는다)
ALTER TABLE reviews
    ADD UNIQUE KEY uq_review_order_item (order_item_id);

-- ─────────────────────────────────────────────────────────────
-- 2. 리뷰 적립 구간
--
-- 적립을 **비율이 아니라 금액**으로 준다. 리뷰는 상품값에 비례해 수고가 커지지 않기 때문이다.
-- 대신 "얼마짜리를 샀는가"로 구간을 나눈다(회원 등급과는 무관하다 — 등급 혜택은 구매 적립에만 붙는다).
--
-- 구간은 `min_amount` **이상**이며, 주문 결제금액이 걸리는 구간 중 **가장 높은 것**이 적용된다.
-- 행을 추가·삭제해 구간을 자유롭게 바꿀 수 있다. 행이 하나도 없으면 리뷰 적립은 없다.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_point_policy (
    id          INT NOT NULL AUTO_INCREMENT,
    mall_id     BIGINT NOT NULL DEFAULT 1 COMMENT '몰별로 다르게 운영할 수 있다',
    min_amount  INT NOT NULL COMMENT '구매금액 하한(이 금액 이상). 0 이면 전 구간',
    text_point  INT NOT NULL DEFAULT 0 COMMENT '글만 쓴 리뷰 적립액(원)',
    photo_point INT NOT NULL DEFAULT 0 COMMENT '사진을 올린 리뷰 적립액(원). 글 적립을 대체한다',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rpp_mall_amount (mall_id, min_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='리뷰 적립 구간 — 구매금액 구간별 지급액';

-- 기본 구간은 넣지 않는다.
-- 행이 없으면 "리뷰 적립 안 함" 으로 동작하며, 운영자가 사이트 설정에서 직접 만든다
-- (납품되는 몰마다 시드가 필요해지면 "여기선 되는데 고객 몰에선 안 되는" 기능이 된다).

-- ─────────────────────────────────────────────────────────────
-- 3. 포인트 트랜잭션 타입에 리뷰 적립 추가
-- ─────────────────────────────────────────────────────────────
ALTER TABLE point_transactions
    MODIFY COLUMN transaction_type ENUM(
        'PURCHASE_ACCUMULATE','PURCHASE_USE','ADMIN_GRANT','ADMIN_DEDUCT',
        'ORDER_CANCEL_RESTORE','ORDER_CANCEL_REVOKE',
        'POINT_EXPIRE','ORDER_PARTIAL_REFUND','PURCHASE_CONFIRM',
        'REVIEW_REWARD'
    ) NOT NULL;

-- ── 되돌리기 (참고) ──────────────────────────────────────────
-- DROP TABLE IF EXISTS review_point_policy;
-- ALTER TABLE reviews DROP KEY uq_review_order_item, DROP KEY idx_reviews_visible, DROP KEY idx_reviews_order,
--   DROP COLUMN updated_at, DROP COLUMN point_awarded, DROP COLUMN is_visible,
--   DROP COLUMN image_url, DROP COLUMN order_item_id, DROP COLUMN order_id, DROP COLUMN mall_id;
