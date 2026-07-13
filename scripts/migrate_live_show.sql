-- ============================================================================
-- 쇼핑라이브(Live Shopping) — 테이블 4종
--
-- 설계: docs/사이트개선/live sales.md
--
-- ⚠️ 실행 순서 (개발 DB = 배포 서버 DB 다. 순서를 지킬 것 — 설계서 §9)
--
--   1. 이 파일의 CREATE TABLE 실행        → 아무도 안 읽으므로 무해
--   2. 코드 커밋 → push → 배포
--        이 시점에 /live 가 준비중 랜딩 → 실모듈로 바뀐다.
--        발행된 라이브가 0건이면 컨트롤러가 COMING_SOON.live 로 폴백하므로 화면은 그대로다.
--   3. 배포 확인 후 맨 아래 admin_menus INSERT 를 수동 실행
--        먼저 넣으면 라우트 없는 관리자 사이드바에 404 메뉴가 뜬다.
--
-- GNB 는 건드리지 않는다. feature_menu.LIVE 는 이미 module_ready=1 이고
-- 두 몰 모두 mall_feature_menu.is_enabled=1 이라 '쇼핑라이브' 메뉴가 이미 떠 있다.
--
-- FK 관례: 부모(live_show)는 mall_id 에 FK 를 걸지 않는다(group_buy·exhibition 과 동일).
--          자식 매핑 테이블만 FK + ON DELETE CASCADE.
-- ============================================================================

-- ── 1. 라이브쇼 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_show (
  id                    BIGINT       NOT NULL AUTO_INCREMENT,
  mall_id               BIGINT       NOT NULL DEFAULT 1,

  title                 VARCHAR(200) NOT NULL,
  slug                  VARCHAR(200) NOT NULL COMMENT '/live/{slug}',
  summary               VARCHAR(500) NULL,
  description           TEXT         NULL COMMENT '방송 소개 (htmlSanitizer 통과 필수)',
  notice                TEXT         NULL COMMENT '대표 공지 (영상 아래 고정)',

  list_thumbnail_url    VARCHAR(500) NULL,
  pc_hero_image_url     VARCHAR(500) NULL COMMENT 'SCHEDULED/ENDED 폴백 이미지',
  mobile_hero_image_url VARCHAR(500) NULL,
  og_image_url          VARCHAR(500) NULL,

  -- 영상: iframe HTML 통짜 저장 금지. provider + video_id 만 저장하고 embed URL 은 서버가 조립한다.
  provider              VARCHAR(30)  NOT NULL DEFAULT 'YOUTUBE' COMMENT 'YOUTUBE | VIMEO',
  video_id              VARCHAR(100) NULL,
  replay_provider       VARCHAR(30)  NULL,
  replay_video_id       VARCHAR(100) NULL COMMENT '없으면 방송 video_id 재사용',

  status                VARCHAR(30)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|SCHEDULED|ON_AIR|ENDED|CANCELLED',
  start_at              DATETIME     NOT NULL,
  end_at                DATETIME     NULL,

  purchase_enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  ended_purchase_policy VARCHAR(30)  NOT NULL DEFAULT 'DISALLOW' COMMENT 'ALLOW | DISALLOW',
  ended_access_policy   VARCHAR(30)  NOT NULL DEFAULT 'ALLOW'    COMMENT 'ALLOW | DISALLOW',
  replay_enabled        TINYINT(1)   NOT NULL DEFAULT 1,

  list_visible          TINYINT(1)   NOT NULL DEFAULT 1,
  search_visible        TINYINT(1)   NOT NULL DEFAULT 1,
  share_enabled         TINYINT(1)   NOT NULL DEFAULT 1,

  view_count            INT          NOT NULL DEFAULT 0,

  created_at            DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_live_show_mall_slug (mall_id, slug),
  KEY idx_live_show_mall_status (mall_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쇼핑라이브 방송';

-- ── 2. 방송 상품 ────────────────────────────────────────────────────────────
-- 이 몰에는 상품 옵션/SKU 테이블이 없다. 단일 price/stock 이므로 옵션 컬럼도 없다.
CREATE TABLE IF NOT EXISTS live_show_product (
  id                      BIGINT       NOT NULL AUTO_INCREMENT,
  live_show_id            BIGINT       NOT NULL,
  product_id              INT          NOT NULL COMMENT 'products.id = int',

  role                    VARCHAR(30)  NOT NULL DEFAULT 'MAIN' COMMENT 'MAIN | RELATED',
  sort_order              INT          NOT NULL DEFAULT 0,

  badge_text              VARCHAR(100) NULL COMMENT '"방송 한정 특가" 등',
  normal_price            INT          NULL COMMENT '표시용 정상가. 미입력 시 products.price',
  live_price              INT          NULL COMMENT '라이브가. NULL 이면 상품 원가로 판매',
  discount_rate           INT          NULL,

  min_order_quantity      INT          NOT NULL DEFAULT 1,
  max_order_quantity      INT          NULL,
  per_user_limit_quantity INT          NULL,

  purchase_enabled        TINYINT(1)   NOT NULL DEFAULT 1,
  visible                 TINYINT(1)   NOT NULL DEFAULT 1,

  created_at              DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_ls_product (live_show_id, product_id),
  KEY idx_ls_product_sort (live_show_id, role, sort_order),
  KEY idx_ls_product_product (product_id),
  CONSTRAINT fk_ls_product_show    FOREIGN KEY (live_show_id) REFERENCES live_show (id) ON DELETE CASCADE,
  CONSTRAINT fk_ls_product_product FOREIGN KEY (product_id)   REFERENCES products (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쇼핑라이브 판매 상품/가격';

-- ── 3. 연결 쿠폰 ────────────────────────────────────────────────────────────
-- 쿠폰 엔진(coupons·coupon_download·user_coupons)은 이미 있다. 라이브는 '연결'만 한다.
-- 다운로드는 기존 POST /coupon/:id/claim 을 그대로 쓴다.
CREATE TABLE IF NOT EXISTS live_show_coupon (
  id           BIGINT     NOT NULL AUTO_INCREMENT,
  live_show_id BIGINT     NOT NULL,
  coupon_id    INT        NOT NULL COMMENT 'coupons.id = int',
  is_primary   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '대표 쿠폰(가장 강조)',
  sort_order   INT        NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME   NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ls_coupon (live_show_id, coupon_id),
  KEY idx_ls_coupon_coupon (coupon_id),
  CONSTRAINT fk_ls_coupon_show   FOREIGN KEY (live_show_id) REFERENCES live_show (id) ON DELETE CASCADE,
  CONSTRAINT fk_ls_coupon_coupon FOREIGN KEY (coupon_id)    REFERENCES coupons (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쇼핑라이브 연결 쿠폰';

-- ── 4. 방송 공지 ────────────────────────────────────────────────────────────
-- 실시간 채팅이 없으므로 공지가 유일한 방송 중 커뮤니케이션 수단이다.
CREATE TABLE IF NOT EXISTS live_show_notice (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  live_show_id     BIGINT       NOT NULL,
  title            VARCHAR(200) NOT NULL,
  content          TEXT         NOT NULL,
  notice_level     VARCHAR(30)  NOT NULL DEFAULT 'NORMAL'     COMMENT 'NORMAL | IMPORTANT',
  display_location VARCHAR(30)  NOT NULL DEFAULT 'NOTICE_TAB' COMMENT 'NOTICE_TAB | UNDER_VIDEO | BUY_PANEL',
  visible_start_at DATETIME     NULL,
  visible_end_at   DATETIME     NULL,
  sort_order       INT          NOT NULL DEFAULT 0,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ls_notice_show (live_show_id, is_active, sort_order),
  CONSTRAINT fk_ls_notice_show FOREIGN KEY (live_show_id) REFERENCES live_show (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쇼핑라이브 공지';


-- ============================================================================
-- ⬇⬇⬇ 아래는 배포 확인 후 수동 실행 ⬇⬇⬇
--
-- parent_id 31 = '페이지/전시 관리' 그룹 — 기획전(3)·공동구매(4)가 있는 곳이다.
-- (프로모션 그룹 33 은 쿠폰·포인트·이벤트. 라이브는 전시/판매 채널이므로 31 이 맞다)
--
-- requireMenuAccess('/admin/lives') 의 인자와 path 값이 문자 단위로 일치해야 한다
-- (middleware/adminRoleGuard.js). 안 맞으면 content_admin 이 403 을 맞는다.
--
-- INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
-- VALUES ('쇼핑라이브 관리', '/admin/lives', 'bi bi-broadcast', 5, 31, 1, 'super_admin,admin,content_admin');
-- ============================================================================
