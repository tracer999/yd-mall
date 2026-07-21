-- 네이버 고시 유형 — 리프 카테고리별 지정 + 몰의 유형별 기본값
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_naver_notice_mapping.sql
-- 설계: docs/사이트개선/네이버_스마트스토어_연동.md §6.5
--
-- 왜 필요한가:
--   고시 유형(36종)은 상품 품목군마다 다르다. 그런데 지금까지는
--   `naver_publish_profile.notice_type` 하나 = **몰당 1개**뿐이라, 의류와 건강기능식품을
--   함께 파는 종합몰에서는 어느 한쪽이 반드시 틀린 고시로 나간다.
--
--   ⚠ 네이버는 **카테고리별 고시 유형을 알려주지 않는다.**
--     `GET /v1/products-for-provided-notice?leafCategoryId=` 로 걸러 보려 했으나
--     파라미터가 무시되고 36종 전체가 그대로 온다(2026-07-21 실호출 확인).
--     따라서 이 매핑은 **우리가 만들어 보관해야 한다.**
--
--   그래서 네이버 리프 카테고리(naver_category)에 고시 유형을 붙인다.
--   상품은 이미 naver_category_id 를 갖고 있으므로 등록 시 그대로 따라온다.
--
-- 멱등: 컬럼·테이블이 이미 있으면 건너뛴다.

-- ---------------------------------------------------------------------------
-- 1) 리프 카테고리 → 고시 유형
-- ---------------------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'naver_category'
                AND COLUMN_NAME = 'notice_type');
SET @sql := IF(@col = 0,
    'ALTER TABLE naver_category
        ADD COLUMN notice_type VARCHAR(64) NULL COMMENT ''고시 유형 코드 — naver_notice_schema.notice_type'',
        ADD COLUMN notice_source VARCHAR(16) NOT NULL DEFAULT ''RULE''
            COMMENT ''RULE=경로 규칙 자동 / MANUAL=사람이 지정(규칙 재적용에도 보존)'',
        ADD KEY idx_naver_category_notice (notice_type)',
    'SELECT ''naver_category.notice_type 이미 존재 — 건너뜀''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 2) 몰의 **유형별** 고시 기본값
--
-- 유형이 달라지면 채워야 할 항목도 달라진다. 몰 프로필의 값 한 벌로는
-- 의류 상품에 건강기능식품 항목을 보내게 된다. 유형마다 한 벌씩 둔다.
-- (naver_publish_profile.notice_type / notice_defaults_json 은 카테고리에
--  유형이 없을 때 쓰는 **폴백**으로 남는다.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mall_notice_default (
    mall_id     BIGINT      NOT NULL,
    notice_type VARCHAR(64) NOT NULL COMMENT 'naver_notice_schema.notice_type',
    values_json JSON        NOT NULL COMMENT '{필드명: 값} — 서버가 폼에서 조립한다(사용자는 JSON 을 보지 않는다)',
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (mall_id, notice_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='몰별·고시유형별 기본값';
