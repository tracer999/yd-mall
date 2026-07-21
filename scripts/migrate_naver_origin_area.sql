-- 네이버 원산지 코드 리소스
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_naver_origin_area.sql
-- 설계: docs/사이트개선/네이버_스마트스토어_연동.md §12 #6
--
-- 왜 필요한가:
--   상품 등록 페이로드의 `originAreaInfo.originAreaCode` 는 네이버가 정한 코드값이다.
--   지금까지 관리자가 `0200037` 같은 코드를 **손으로 적어야** 했는데, 운영자가 알 수 없는
--   값이고 오타 하나가 등록 400 으로 돌아온다. 코드 목록을 리소스로 수집해 두고
--   화면에서 **검색·선택**하게 한다. (카테고리·브랜드와 같은 취급)
--
--   출처: GET /v1/product-origin-areas → { originAreaCodeNames: [{code, name}] }
--   2026-07-21 기준 535건. 코드 길이로 계층이 갈린다: 2 = 대분류(6개), 4 = 중분류, 7 = 시군구.
--   대분류: 00 국산 / 01 원양산 / 02 수입산 / 03 상세설명에 표시 / 04 직접입력 / 05 표기 의무대상 아님
--
-- 멱등: CREATE TABLE IF NOT EXISTS / ALTER 는 이미 있으면 건너뛴다.

CREATE TABLE IF NOT EXISTS naver_origin_area (
    code        VARCHAR(16)  NOT NULL COMMENT '네이버 원산지 코드 — 예: 00(국산), 0001110(국산:강원도>춘천시)',
    name        VARCHAR(255) NOT NULL COMMENT '표시명 — 계층이 : 와 > 로 이어진 전체 경로',
    parent_code VARCHAR(16)  NULL     COMMENT '상위 코드(코드 접두어로 계산)',
    level       TINYINT      NOT NULL DEFAULT 1 COMMENT '1=대분류(2자리) 2=중분류(4자리) 3=시군구(7자리)',
    is_active   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '이번 수집 응답에 없던 코드는 0으로 내린다',
    fetched_at  DATETIME     NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (code),
    KEY idx_origin_name (name),
    KEY idx_origin_level (level, is_active),
    KEY idx_origin_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='네이버 원산지 코드(상품 등록 originAreaCode 용)';

-- 수집 로그의 resource enum 에 ORIGIN_AREA 추가 (기존 값 유지).
ALTER TABLE naver_taxonomy_sync_log
    MODIFY COLUMN resource ENUM('CATEGORY','BRAND','ORIGIN_AREA') NOT NULL;
