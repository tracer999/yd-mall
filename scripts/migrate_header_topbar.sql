-- 헤더 톱바(배너·알림) — 몰별 콘텐츠
--
-- 헤더 최상단 바에 노출할 프로모션 배너(최대 3개)와 알림 문구(1개)를 담는다.
-- 둘 다 없으면 스토어프론트는 바 자체를 렌더하지 않는다.
--
-- banners 테이블을 재사용하지 않는다: 그 테이블에는 mall_id 가 없어(전 몰 공용)
-- 몰별 톱바를 구분할 수 없다. 슬롯 고정(UNIQUE) 구조라 관리자 폼이 upsert 로 단순해지는 이점도 있다.
CREATE TABLE IF NOT EXISTS header_topbar_item (
  id           INT          NOT NULL AUTO_INCREMENT,
  mall_id      BIGINT       NOT NULL DEFAULT 1,
  kind         ENUM('NOTICE','BANNER') NOT NULL COMMENT 'NOTICE=문구 1개 / BANNER=이미지 최대 3개',
  slot         TINYINT      NOT NULL DEFAULT 1 COMMENT '배너 슬롯 1~3 (알림은 항상 1)',
  message      VARCHAR(200) DEFAULT NULL COMMENT 'NOTICE 문구',
  image_url    VARCHAR(255) DEFAULT NULL COMMENT 'BANNER 이미지 경로',
  link_url     VARCHAR(255) DEFAULT NULL COMMENT '클릭 시 이동 (비면 링크 없음)',
  new_window   TINYINT(1)   NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  start_date   DATE         DEFAULT NULL COMMENT '노출 시작일 (비면 제한 없음)',
  end_date     DATE         DEFAULT NULL COMMENT '노출 종료일 (비면 제한 없음)',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- 슬롯을 고정한다 — 배너가 4개로 늘어나는 사고를 스키마가 막는다(관리자도 3슬롯만 낸다).
  UNIQUE KEY uk_topbar_slot (mall_id, kind, slot),
  KEY idx_topbar_mall (mall_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='헤더 톱바 배너·알림 (몰별)';
