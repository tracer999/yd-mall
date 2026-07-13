-- 베스트/랭킹 1차 스키마 — 산출 테이블 + 그룹 정의 + 가중치
-- 설계: docs/사이트개선/best_ranking_design_and_development.md
--
-- ⚠️ products.id · users.id 는 int 다. 이들을 참조하는 컬럼은 반드시 int.
--    bigint 로 두면 FK 생성이 실패한다(세션 A 규칙 3). best_* 의 자체 id 만 bigint.
-- ⚠️ mall_id 에 FK 를 걸지 않는다 — product_group·page 어디에도 mall FK 가 없다.
-- ⚠️ 점수는 저장한다(파생 아님). 배치가 산출한 시점의 값이 정본이고,
--    화면은 계산하지 않고 읽기만 한다. calculated_at 이 "N월 N일 N시 기준"의 근거다.

-- ---------------------------------------------------------------------------
-- 1) best_group — 랭킹 그룹(탭) 정의
--
--    group_type 은 분류 라벨이 아니라 **집계 대상 상품을 고르는 방식**이다.
--      ALL      몰 전체 상품
--      CATEGORY ref_id 카테고리 (include_descendants=1 이면 하위 트리 포함)
--      BRAND    ref_id 브랜드 카테고리(categories.type='BRAND')
--      CUSTOM   condition_json 조건 (뱃지·가격대 등. 2차)
--
--    카테고리 1,719 · 브랜드 1,354(mall2) 전부를 그룹으로 만들지 않는다.
--    운영자가 노출할 탭만 고른다 — 안 그러면 빈 랭킹 탭이 수천 개 생긴다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS best_group (
  id                  bigint       NOT NULL AUTO_INCREMENT,
  mall_id             bigint       NOT NULL DEFAULT 1 COMMENT '몰 ID',

  name                varchar(100) NOT NULL COMMENT '탭에 노출되는 이름',
  group_type          varchar(20)  NOT NULL DEFAULT 'CATEGORY' COMMENT 'ALL/CATEGORY/BRAND/CUSTOM',
  ref_id              int          DEFAULT NULL COMMENT 'CATEGORY·BRAND 일 때 categories.id',
  condition_json      json         DEFAULT NULL COMMENT 'CUSTOM 조건(2차)',
  include_descendants tinyint(1)   NOT NULL DEFAULT 1 COMMENT 'CATEGORY 일 때 하위 트리 포함',

  sort_order          int          NOT NULL DEFAULT 0 COMMENT '탭 순서',
  is_active           tinyint(1)   NOT NULL DEFAULT 1,

  created_at          datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at          datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_bg_mall (mall_id, is_active, sort_order),
  KEY idx_bg_ref  (ref_id),
  CONSTRAINT fk_bg_category FOREIGN KEY (ref_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='베스트/랭킹 그룹(탭) 정의';

-- ---------------------------------------------------------------------------
-- 2) best_score_config — 점수 가중치 (몰별 1행)
--
--    확정 산식: 판매 5점 · 좋아요 3점 · 조회 0점.
--    조회 가중치가 0 이어도 컬럼을 둔다 — 운영자가 켤 수 있어야 한다.
--
--    ⚠️ 조회수는 **누적값**(products.view_count)이다. 기간별 조회 로그가 없어서
--       기간 창을 적용할 수 없다. 가중치를 0 보다 크게 올리면 일간/월간 랭킹에
--       누적 조회수가 그대로 섞인다. 기간별 조회를 쓰려면 product_view_daily 선행.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS best_score_config (
  mall_id       bigint    NOT NULL COMMENT '몰 ID',
  weight_sales  int       NOT NULL DEFAULT 5 COMMENT '판매 1건당 점수',
  weight_like   int       NOT NULL DEFAULT 3 COMMENT '좋아요 1건당 점수',
  weight_view   int       NOT NULL DEFAULT 0 COMMENT '조회 1건당 점수(누적 조회수 — 주석 참고)',
  rank_limit    int       NOT NULL DEFAULT 100 COMMENT '그룹·기간별 저장할 최대 순위',
  updated_at    datetime  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='베스트/랭킹 점수 가중치';

-- ---------------------------------------------------------------------------
-- 3) best_ranking — 산출 스냅샷 (배치가 채운다. 화면은 읽기만)
--
--    gender·age_band 는 **구조만** 먼저 만든다. users 에 성별이 없어서
--    현재 배치는 ('ALL','ALL') 한 조합만 채운다. 세그먼트 데이터가 쌓이면
--    배치만 확장하면 되고 스키마·화면은 그대로다.
--
--    ⚠️ 전조합(그룹×기간×성별×나이)을 미리 채우지 않는다. 빈 셀만 폭증한다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS best_ranking (
  id             bigint        NOT NULL AUTO_INCREMENT,
  mall_id        bigint        NOT NULL COMMENT '몰 ID(조회 최적화용 비정규화)',
  group_id       bigint        NOT NULL COMMENT 'best_group.id',

  period         varchar(20)   NOT NULL COMMENT 'REALTIME/DAILY/WEEKLY/MONTHLY',
  gender         varchar(10)   NOT NULL DEFAULT 'ALL' COMMENT 'ALL/M/F/UNKNOWN',
  age_band       varchar(10)   NOT NULL DEFAULT 'ALL' COMMENT 'ALL/10/20/30/40/50/60/UNKNOWN',

  product_id     int           NOT NULL COMMENT 'products.id (int — FK 타입 함정)',
  rank_no        int           NOT NULL COMMENT '1부터',
  prev_rank_no   int           DEFAULT NULL COMMENT '직전 산출의 순위(급상승 표시용). 신규 진입은 NULL',

  score          decimal(12,2) NOT NULL DEFAULT 0 COMMENT '가중합 점수',
  sales_count    int           NOT NULL DEFAULT 0 COMMENT '기간 내 판매 수량',
  like_count     int           NOT NULL DEFAULT 0 COMMENT '기간 내 좋아요 수',
  view_count     int           NOT NULL DEFAULT 0 COMMENT '누적 조회수(기간 창 미적용)',

  calculated_at  datetime      NOT NULL COMMENT '이 행을 산출한 시각 = 화면의 "N시 기준"',

  PRIMARY KEY (id),
  UNIQUE KEY uk_br_slot (group_id, period, gender, age_band, product_id),
  KEY idx_br_lookup (mall_id, group_id, period, gender, age_band, rank_no),
  KEY idx_br_product (product_id),
  CONSTRAINT fk_br_group   FOREIGN KEY (group_id)   REFERENCES best_group(id) ON DELETE CASCADE,
  CONSTRAINT fk_br_product FOREIGN KEY (product_id) REFERENCES products(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='베스트/랭킹 산출 스냅샷';

-- ---------------------------------------------------------------------------
-- 4) best_ranking_run — 집계 실행 이력
--    관리자 화면이 "마지막 집계: N분 전 / 실패" 를 보여주는 근거.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS best_ranking_run (
  id            bigint       NOT NULL AUTO_INCREMENT,
  mall_id       bigint       NOT NULL,
  period        varchar(20)  NOT NULL,
  status        varchar(20)  NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING/SUCCESS/FAILED',
  group_count   int          NOT NULL DEFAULT 0 COMMENT '산출한 그룹 수',
  row_count     int          NOT NULL DEFAULT 0 COMMENT '기록한 순위 행 수',
  message       varchar(500) DEFAULT NULL COMMENT '실패 사유',
  started_at    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   datetime     DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_brr_lookup (mall_id, period, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='베스트/랭킹 집계 실행 이력';

-- ---------------------------------------------------------------------------
-- 5) best_pin — 관리자 수동 고정(MD 픽)
--
--    베스트는 기본이 자동 산정이지만, MD 가 미는 상품을 임의로 올릴 수 있어야 한다.
--
--    ⚠️ 핀은 **배치 스냅샷(best_ranking)에 굽지 않는다. 조회 시점에 얹는다.**
--       스냅샷에 구우면 MD 가 상품을 밀어도 다음 배치가 돌 때까지 안 보인다.
--       핀은 즉시 반영돼야 하는 운영 행위다.
--
--    pin_rank  지정하면 그 순위에 꽂는다(1 이면 1위). NULL 이면 자동 1위 앞에 sort_order 순으로.
--    같은 상품이 자동 랭킹에도 있으면 자동 쪽을 제거한다(중복 노출 방지).
--    노출 기간(start_at·end_at)을 벗어난 핀은 무시한다 — 끄는 걸 잊어도 알아서 빠진다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS best_pin (
  id          bigint       NOT NULL AUTO_INCREMENT,
  mall_id     bigint       NOT NULL COMMENT '몰 ID',
  group_id    bigint       NOT NULL COMMENT '어느 탭에 고정할지. best_group.id',
  product_id  int          NOT NULL COMMENT 'products.id (int — FK 타입 함정)',

  pin_rank    int          DEFAULT NULL COMMENT '고정 순위(1=1위). NULL 이면 상단에 sort_order 순으로',
  sort_order  int          NOT NULL DEFAULT 0 COMMENT 'pin_rank 가 없는 핀들 사이의 순서',

  start_at    datetime     DEFAULT NULL COMMENT '노출 시작(NULL=제한 없음)',
  end_at      datetime     DEFAULT NULL COMMENT '노출 종료(NULL=제한 없음)',
  is_active   tinyint(1)   NOT NULL DEFAULT 1,
  memo        varchar(200) DEFAULT NULL COMMENT '왜 밀었는지(운영 메모)',

  created_at  datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at  datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_bp_slot (group_id, product_id),
  KEY idx_bp_lookup (mall_id, group_id, is_active, sort_order),
  CONSTRAINT fk_bp_group   FOREIGN KEY (group_id)   REFERENCES best_group(id) ON DELETE CASCADE,
  CONSTRAINT fk_bp_product FOREIGN KEY (product_id) REFERENCES products(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='베스트/랭킹 관리자 수동 고정(MD 픽)';

-- ---------------------------------------------------------------------------
-- 6) users.gender — 성별 세그먼트의 소스 (구조만. 수집은 별도 결정)
--    카카오/구글 OAuth 는 동의항목을 추가해야 성별을 준다. 지금은 전부 UNKNOWN.
--    나이대는 birthdate 에서 파생하므로 컬럼을 새로 두지 않는다.
-- ---------------------------------------------------------------------------
SET @has_gender := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'gender'
);
SET @sql := IF(@has_gender = 0,
  "ALTER TABLE users ADD COLUMN gender varchar(10) NOT NULL DEFAULT 'UNKNOWN' COMMENT 'M/F/UNKNOWN — OAuth 동의항목 추가 시 채워진다'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 7) 시드 — 몰별 가중치 + 기본 그룹(전체 + 1뎁스 카테고리)
--
--    브랜드 그룹은 시드하지 않는다(mall2 에 1,354개). 운영자가 골라 추가한다.
-- ---------------------------------------------------------------------------
INSERT INTO best_score_config (mall_id, weight_sales, weight_like, weight_view, rank_limit)
SELECT m.id, 5, 3, 0, 100 FROM mall m
ON DUPLICATE KEY UPDATE mall_id = VALUES(mall_id);

-- 전체 그룹 (탭 맨 앞)
INSERT INTO best_group (mall_id, name, group_type, ref_id, sort_order, is_active)
SELECT m.id, '전체', 'ALL', NULL, 0, 1
  FROM mall m
 WHERE NOT EXISTS (
   SELECT 1 FROM best_group g WHERE g.mall_id = m.id AND g.group_type = 'ALL'
 );

-- 1뎁스 NORMAL 카테고리 → 그룹
INSERT INTO best_group (mall_id, name, group_type, ref_id, include_descendants, sort_order, is_active)
SELECT c.mall_id, c.name, 'CATEGORY', c.id, 1, c.id, 1
  FROM categories c
 WHERE c.type = 'NORMAL' AND c.depth = 1
   AND NOT EXISTS (
     SELECT 1 FROM best_group g WHERE g.group_type = 'CATEGORY' AND g.ref_id = c.id
   );

-- ---------------------------------------------------------------------------
-- 8) 관리자 메뉴 — is_active=0 으로 넣는다.
--    라우트가 배포된 뒤 수동으로 켠다(dev = prod DB. 먼저 켜면 운영에 404 링크).
--      UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/best-groups';
-- ---------------------------------------------------------------------------
INSERT INTO admin_menus (parent_id, name, path, icon_class, display_order, is_active, visible_roles)
SELECT p.id, '베스트/랭킹 관리', '/admin/best-groups', 'bi-trophy',
       COALESCE((SELECT MAX(m2.display_order) + 1
                   FROM (SELECT * FROM admin_menus) m2 WHERE m2.parent_id = p.id), 1),
       0, 'super_admin,admin,content_admin'
  FROM admin_menus p
 WHERE p.parent_id IS NULL AND p.name = '상품 관리'
   AND NOT EXISTS (SELECT 1 FROM admin_menus x WHERE x.path = '/admin/best-groups')
 LIMIT 1;
