-- P5 멀티몰 기반: mall 정의 테이블 + products.mall_id (무해 · 기존 동작 불변)
CREATE TABLE IF NOT EXISTS mall (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  code       VARCHAR(50)  NOT NULL COMMENT '고정 식별자 (health / general)',
  name       VARCHAR(100) NOT NULL,
  domain     VARCHAR(255) DEFAULT NULL COMMENT '향후 도메인 기반 라우팅용',
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  is_default TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '해석기 폴백 대상 (1개만 1)',
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mall_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰 정의';

-- id 는 기존 mall_id=1 과 반드시 일치시킨다.
INSERT INTO mall (id, code, name, is_active, is_default) VALUES
  (1, 'health',  '와이디몰 건강식품관', 1, 1),
  (2, 'general', '와이디몰 종합관',     1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active), is_default = VALUES(is_default);

-- products 에 mall_id 추가 (기존 행은 DEFAULT 1 로 자동 백필)
-- 재실행 안전: 이미 있으면 에러 나므로 수동 확인 후 1회 실행.
--   ALTER TABLE products ADD COLUMN mall_id BIGINT NOT NULL DEFAULT 1 AFTER id;
--   ALTER TABLE products ADD INDEX idx_products_mall (mall_id);
-- (2026-07-10 운영 적용 완료)
