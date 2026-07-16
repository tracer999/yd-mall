-- 몰별 카테고리/브랜드 표시 override (설계 §3.3 / §10-3)
--
-- 카테고리·브랜드는 글로벌 한 벌(mall_id=0)이라 categories.is_active 등은 전 몰 공통 kill-switch.
-- 그와 별개로 "이 몰에서만 이 (유효)카테고리를 숨긴다"를 담는 몰별 override 테이블.
--
-- 규칙: 행이 존재하고 hidden=1 이면 그 몰 스토어프론트에서 숨김.
--       행이 없으면 기본 노출(단, valid = 그 몰에 상품이 있는 카테고리일 때만 애초에 노출됨).
-- additive DDL → transition-safe(코드가 아직 안 읽어도 무해).

CREATE TABLE IF NOT EXISTS mall_category_visibility (
  mall_id     BIGINT      NOT NULL,
  category_id INT         NOT NULL,
  hidden      TINYINT(1)  NOT NULL DEFAULT 1,
  updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (mall_id, category_id),
  KEY idx_mall (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
