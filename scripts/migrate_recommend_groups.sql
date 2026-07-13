-- 추천 그룹 (상품 추천관리)
--
-- 설계: docs/사이트개선/recommend_specialty_design_and_development.md §8-1 의 축소판.
-- 운영자가 그룹명(예: '면역력 관리', '선물 추천')을 만들고 상품을 직접 담으면,
-- /recommend 랜딩에 그룹 하나당 섹션 하나로 리스트된다.
--
-- product_group 을 재사용하지 않는 이유:
--   product_group 은 page_section.data_source_id 가 참조하는 페이지 빌더 데이터 소스다.
--   추천 그룹을 섞으면 빌더의 그룹 피커가 오염되고, 비활성/삭제 가드가 서로 얽힌다.
--   추천 그룹에는 group_type/filter/sort_type 이 필요 없고(수동 큐레이션 전용),
--   대신 product_group 에 없는 그룹 단위 노출 순서(sort_order)가 필요하다.
--
-- ⚠️ 실행 순서 (개발 DB = 운영 DB 다)
--   1) 이 파일의 CREATE TABLE 2개 → 언제 실행해도 무해하다(아무도 읽지 않음).
--   2) 코드 배포 (push → GitHub Actions).
--   3) 배포 확인 후 맨 아래 admin_menus INSERT 실행.
--      ⇒ 먼저 넣으면 라우트가 없는 운영 관리자 사이드바에 404 메뉴가 뜬다.

CREATE TABLE IF NOT EXISTS recommend_group (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    mall_id     BIGINT       NOT NULL DEFAULT 1,
    name        VARCHAR(100) NOT NULL COMMENT '섹션 제목으로 그대로 노출된다',
    description VARCHAR(200) NULL     COMMENT '제목 아래 근거 문구(선택)',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '추천 화면에서의 섹션 노출 순서',
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rg_mall_active (mall_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recommend_group_item (
    id                 BIGINT NOT NULL AUTO_INCREMENT,
    recommend_group_id BIGINT NOT NULL,
    product_id         INT    NOT NULL,
    sort_order         INT    NOT NULL DEFAULT 0,
    created_at         DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rgi_group_product (recommend_group_id, product_id),
    KEY idx_rgi_group_order (recommend_group_id, sort_order),
    CONSTRAINT fk_rgi_group FOREIGN KEY (recommend_group_id)
        REFERENCES recommend_group (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 아래는 배포 확인 후 실행 ──────────────────────────────────────
-- parent_id = 32 (상품 관리), display_order 6 = '특가 카테고리'(5) 다음.
--
-- INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
-- VALUES ('상품 추천관리', '/admin/recommend-groups', 'bi bi-stars', 6, 32, 1, 'super_admin,admin,content_admin');
