-- 배송비 2차 — 지역 할증 (제주·도서산간)
-- 설계: docs/사이트개선/shipping_fee_design_and_development.md §2-2 · §8-2 (S12·S13)
--
-- `orders.receiver_zipcode` 는 이미 있다. 없는 것은 우편번호 대역 데이터다.
-- 대역 시드는 scripts/seed_shipping_zones.js 가 넣는다(운영 기준을 하나 정해 적재 후 관리자에서 편집).
--
-- 스키마는 1차보다 먼저 적재해도 무해하다 — 빈 테이블/기본값 컬럼은 옛 코드가 읽지 않는다.

CREATE TABLE IF NOT EXISTS shipping_zipcode_zone (
  id           int         NOT NULL AUTO_INCREMENT,
  zone_type    enum('JEJU','ISLAND') NOT NULL COMMENT 'JEJU=제주 / ISLAND=도서산간',
  zipcode_from char(5)     NOT NULL COMMENT '5자리 신우편번호 시작',
  zipcode_to   char(5)     NOT NULL COMMENT '5자리 신우편번호 끝(포함)',
  label        varchar(100) DEFAULT NULL COMMENT '지역명(운영자 식별용)',

  created_at   timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_zipcode_range (zipcode_from, zipcode_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='배송비 할증 우편번호 대역';

ALTER TABLE shipping_policy
  ADD COLUMN jeju_extra   int NOT NULL DEFAULT 3000 COMMENT '제주 추가 배송비'     AFTER free_threshold,
  ADD COLUMN island_extra int NOT NULL DEFAULT 5000 COMMENT '도서산간 추가 배송비' AFTER jeju_extra;
