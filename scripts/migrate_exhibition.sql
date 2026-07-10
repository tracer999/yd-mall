-- 기획전(Exhibition) 1차 스키마 — 테이블 3종
-- 설계: docs/사이트개선/exhibition_design_and_development.md §7
--
-- ⚠️ products.id 는 int, coupons.id 는 int 다. 이들을 참조하는 컬럼은 반드시 int.
--    bigint 로 두면 FK 생성이 실패한다. exhibition.id 계열은 신세대 테이블 관례대로 bigint.
-- ⚠️ mall_id 에 FK 를 걸지 않는다 — page/product_group/custom_menu 어디에도 mall FK 가 없다.

CREATE TABLE IF NOT EXISTS exhibition (
  id                    bigint       NOT NULL AUTO_INCREMENT,
  mall_id               bigint       NOT NULL DEFAULT 1 COMMENT '몰 ID',

  title                 varchar(200) NOT NULL COMMENT '기획전명',
  slug                  varchar(200) NOT NULL COMMENT 'SEO URL 슬러그(몰 스코프 유니크)',
  summary               varchar(500) DEFAULT NULL COMMENT '목록 카드·상세 헤더 한 줄 요약',
  description           text         COMMENT '상세 상단 설명(HTML 허용 → 렌더 시 새니타이즈)',

  exhibition_type       varchar(50)  NOT NULL DEFAULT 'THEME' COMMENT 'BRAND/SEASON/CATEGORY/COLLAB/BROADCAST/THEME',

  list_thumbnail_url    varchar(500) DEFAULT NULL COMMENT '목록 카드 썸네일',
  pc_hero_image_url     varchar(500) DEFAULT NULL COMMENT '상세 PC 대표 이미지',
  mobile_hero_image_url varchar(500) DEFAULT NULL COMMENT '상세 모바일 대표 이미지',
  og_image_url          varchar(500) DEFAULT NULL COMMENT '공유용 OG 이미지',

  status                varchar(30)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/HIDDEN. 예정·진행중·종료는 기간에서 파생',
  start_at              datetime     NOT NULL COMMENT '노출 시작',
  end_at                datetime     DEFAULT NULL COMMENT '노출 종료(NULL=무기한)',

  list_visible          tinyint(1)   NOT NULL DEFAULT 1 COMMENT '기획전 목록 노출',
  search_visible        tinyint(1)   NOT NULL DEFAULT 1 COMMENT '사이트 검색 노출',
  share_enabled         tinyint(1)   NOT NULL DEFAULT 1 COMMENT '공유 버튼 노출',

  detail_template_type  varchar(50)  NOT NULL DEFAULT 'TAB_SHOP' COMMENT 'TAB_SHOP/STORY/CATEGORY_SHOP/BRAND_SHOP',
  display_config_json   json         DEFAULT NULL COMMENT '템플릿별 추가 설정',

  ended_access_policy   varchar(30)  NOT NULL DEFAULT 'ALLOW' COMMENT '종료 후 접근: ALLOW/BLOCK/NOTICE',
  ended_purchase_policy varchar(30)  NOT NULL DEFAULT 'ALLOW' COMMENT '종료 후 구매: ALLOW/BLOCK',

  view_count            int          NOT NULL DEFAULT 0 COMMENT '상세 조회수',
  created_at            datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at            datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_exhibition_mall_slug (mall_id, slug),
  KEY idx_exhibition_mall_status (mall_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기획전';

CREATE TABLE IF NOT EXISTS exhibition_section (
  id                  bigint       NOT NULL AUTO_INCREMENT,
  exhibition_id       bigint       NOT NULL,

  section_name        varchar(100) NOT NULL COMMENT '탭·섹션 표시명 (예: MD추천)',
  section_code        varchar(100) NOT NULL COMMENT '기획전 내 식별자 (예: md-pick)',
  section_type        varchar(50)  NOT NULL DEFAULT 'PRODUCT_GRID' COMMENT 'PRODUCT_GRID/PRODUCT_CAROUSEL/HTML',

  sort_order          int          NOT NULL DEFAULT 0,
  is_tab              tinyint(1)   NOT NULL DEFAULT 1 COMMENT '내부 탭으로 노출',
  is_active           tinyint(1)   NOT NULL DEFAULT 1,

  display_config_json json         DEFAULT NULL,

  created_at          datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at          datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_exh_section_code (exhibition_id, section_code),
  KEY idx_exh_section_sort (exhibition_id, sort_order),
  CONSTRAINT fk_exh_section_exhibition FOREIGN KEY (exhibition_id) REFERENCES exhibition (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기획전 내부 섹션(탭)';

CREATE TABLE IF NOT EXISTS exhibition_product (
  id               bigint       NOT NULL AUTO_INCREMENT,
  exhibition_id    bigint       NOT NULL,
  section_id       bigint       DEFAULT NULL COMMENT 'NULL=섹션 미배정(전체 탭에만 노출)',
  product_id       int          NOT NULL COMMENT 'products.id 가 int 다. bigint 로 두면 FK 실패',

  sort_order       int          NOT NULL DEFAULT 0,
  is_fixed         tinyint(1)   NOT NULL DEFAULT 0 COMMENT '자동 그룹에서도 상단 고정',
  display_badge    varchar(50)  DEFAULT NULL COMMENT '카드 위 노출 배지(기획전 한정)',
  display_comment  varchar(200) DEFAULT NULL COMMENT 'MD 코멘트',

  visible          tinyint(1)   NOT NULL DEFAULT 1,
  purchase_enabled tinyint(1)   NOT NULL DEFAULT 1,

  created_at       datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at       datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_exh_product (exhibition_id, section_id, product_id),
  KEY idx_exh_product_sort (exhibition_id, section_id, sort_order),
  KEY idx_exh_product_product (product_id),
  CONSTRAINT fk_exh_product_exhibition FOREIGN KEY (exhibition_id) REFERENCES exhibition (id) ON DELETE CASCADE,
  CONSTRAINT fk_exh_product_section    FOREIGN KEY (section_id)    REFERENCES exhibition_section (id) ON DELETE CASCADE,
  CONSTRAINT fk_exh_product_product    FOREIGN KEY (product_id)    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기획전 상품 전시 매핑';
