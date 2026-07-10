-- 공동구매(Group Buy) 1차 스키마 — 테이블 3종 + order_items 출처 컬럼
-- 설계: docs/사이트개선/group_buy_design_and_development.md §6, §9
--
-- ⚠️ 설계서 §6 의 DDL 을 이 저장소 스키마에 맞춰 조정했다:
--    · products.id / users.id / orders.id / order_items.id 는 전부 int 다.
--      이들을 참조하는 컬럼을 BIGINT 로 두면 FK 생성이 실패한다.
--    · 금액은 DECIMAL(12,2) 가 아니라 int 다(products.price, orders.total_amount 가 int).
--      원 단위 정수 통화라 소수점이 필요 없고, 섞으면 합계 계산에서 타입이 갈린다.
--    · mall_id 에 FK 를 걸지 않는다 — exhibition/event/page 어디에도 mall FK 가 없다.
--
-- ⚠️ 예정/진행중/마감임박/종료는 저장하지 않는다. start_at·end_at 에서 파생한다.
--    status 는 운영자가 정하는 상태(DRAFT/PUBLISHED/HIDDEN)만 담는다.
--    (설계서 §3 의 SUCCESS/FAILED/CANCELLED 는 목표달성형 = 2차 이후)

CREATE TABLE IF NOT EXISTS group_buy (
  id                        bigint       NOT NULL AUTO_INCREMENT,
  mall_id                   bigint       NOT NULL DEFAULT 1 COMMENT '몰 ID',

  title                     varchar(200) NOT NULL COMMENT '공동구매명(캠페인명)',
  slug                      varchar(200) NOT NULL COMMENT 'SEO URL 슬러그(몰 스코프 유니크)',
  summary                   varchar(500) DEFAULT NULL COMMENT '목록 카드 한 줄 요약',
  description               text         COMMENT '상세 본문(HTML 허용 → 저장·렌더 양쪽에서 새니타이즈)',
  notice                    text         COMMENT '공동구매 유의사항(HTML)',

  list_thumbnail_url        varchar(500) DEFAULT NULL COMMENT '목록 카드 썸네일',
  pc_hero_image_url         varchar(500) DEFAULT NULL COMMENT '상세 PC 대표 이미지',
  mobile_hero_image_url     varchar(500) DEFAULT NULL COMMENT '상세 모바일 대표 이미지',

  status                    varchar(30)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/HIDDEN. 예정·진행중·마감임박·종료는 기간에서 파생',
  start_at                  datetime     NOT NULL COMMENT '판매 시작',
  end_at                    datetime     NOT NULL COMMENT '판매 종료. 공동구매는 기간이 본질이라 NULL 을 허용하지 않는다',
  closing_hours             int          NOT NULL DEFAULT 24 COMMENT '종료 N시간 전부터 마감임박(CLOSING) 배지',

  list_visible              tinyint(1)   NOT NULL DEFAULT 1 COMMENT '공동구매 목록 노출',
  search_visible            tinyint(1)   NOT NULL DEFAULT 1 COMMENT '검색엔진 색인 허용',

  target_enabled            tinyint(1)   NOT NULL DEFAULT 0 COMMENT '목표 수량 사용',
  target_quantity           int          DEFAULT NULL COMMENT '목표 수량(target_enabled=1 일 때)',

  participant_count_visible tinyint(1)   NOT NULL DEFAULT 1 COMMENT '참여자 수 표시',
  quantity_count_visible    tinyint(1)   NOT NULL DEFAULT 1 COMMENT '참여 수량 표시',
  progress_visible          tinyint(1)   NOT NULL DEFAULT 1 COMMENT '달성률 progress bar 표시',

  -- 참여 현황 비정규화. group_buy_participation 을 COUNT 하지 않고 결제 확정 시점에 누적한다.
  -- (목록 카드마다 서브쿼리를 돌리면 카드 수만큼 집계가 붙는다. event.issued_count 와 같은 방식)
  current_quantity          int          NOT NULL DEFAULT 0 COMMENT '현재 참여 수량 합계',
  participant_count         int          NOT NULL DEFAULT 0 COMMENT '현재 참여자 수(주문 건수)',

  ended_purchase_policy     varchar(30)  NOT NULL DEFAULT 'DISALLOW' COMMENT '종료 후 구매: ALLOW/DISALLOW',
  delivery_note             varchar(200) DEFAULT NULL COMMENT '배송 예정 안내(예: 마감 후 3영업일 내 순차 발송)',

  view_count                int          NOT NULL DEFAULT 0 COMMENT '상세 조회수',
  created_at                datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at                datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_group_buy_mall_slug (mall_id, slug),
  KEY idx_group_buy_mall_status (mall_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공동구매 캠페인';

-- 1차는 대표 상품 1개(role='MAIN')만 쓴다. 테이블은 다중 상품을 견디도록 둔다.
CREATE TABLE IF NOT EXISTS group_buy_product (
  id                      bigint      NOT NULL AUTO_INCREMENT,
  group_buy_id            bigint      NOT NULL,
  product_id              int         NOT NULL COMMENT 'products.id 가 int 다. bigint 로 두면 FK 실패',

  role                    varchar(30) NOT NULL DEFAULT 'MAIN' COMMENT 'MAIN(대표)/SUB',
  sort_order              int         NOT NULL DEFAULT 0,

  normal_price            int         DEFAULT NULL COMMENT '비교 표시용 정상가. 비우면 products.price 를 쓴다',
  group_buy_price         int         NOT NULL COMMENT '실제 판매가. 결제 금액은 항상 이 값으로 서버가 재계산한다',
  discount_rate           int         DEFAULT NULL COMMENT '할인율(%). 저장 시 자동 계산',

  min_order_quantity      int         NOT NULL DEFAULT 1 COMMENT '1회 최소 구매 수량',
  max_order_quantity      int         DEFAULT NULL COMMENT '1회 최대 구매 수량(NULL=재고까지)',
  per_user_limit_quantity int         DEFAULT NULL COMMENT '1인 누적 구매 제한(2차)',

  purchase_enabled        tinyint(1)  NOT NULL DEFAULT 1,
  visible                 tinyint(1)  NOT NULL DEFAULT 1,

  created_at              datetime    DEFAULT CURRENT_TIMESTAMP,
  updated_at              datetime    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_gb_product (group_buy_id, product_id),
  KEY idx_gb_product_sort (group_buy_id, sort_order),
  KEY idx_gb_product_product (product_id),
  CONSTRAINT fk_gb_product_group_buy FOREIGN KEY (group_buy_id) REFERENCES group_buy (id) ON DELETE CASCADE,
  CONSTRAINT fk_gb_product_product   FOREIGN KEY (product_id)   REFERENCES products (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공동구매 대상 상품/가격';

-- 결제 확정(PAID) 시점에 order_item 당 1행. 재실행돼도 중복되지 않도록 order_item_id 가 유니크다.
--
-- user_id 가 NULL 을 허용하는 이유: 이 몰은 비회원 주문(guest=1)을 받는다.
-- orders.user_id 도 NULL 허용이다. 회원 전용으로 좁히면 비회원 결제가 500 으로 죽는다.
CREATE TABLE IF NOT EXISTS group_buy_participation (
  id            bigint      NOT NULL AUTO_INCREMENT,
  group_buy_id  bigint      NOT NULL,
  user_id       int         DEFAULT NULL COMMENT 'users.id 가 int. 비회원 주문이면 NULL',
  order_id      int         DEFAULT NULL COMMENT 'orders.id 가 int',
  order_item_id int         DEFAULT NULL COMMENT 'order_items.id 가 int. 멱등성 키',

  product_id    int         NOT NULL,
  quantity      int         NOT NULL,
  unit_price    int         NOT NULL COMMENT '결제 시점의 공동구매가(가격 변경 이력 보존)',

  status        varchar(30) NOT NULL DEFAULT 'PAID' COMMENT 'PAID/CONFIRMED/CANCELLED/REFUNDED',

  created_at    datetime    DEFAULT CURRENT_TIMESTAMP,
  updated_at    datetime    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_gb_participation_order_item (order_item_id),
  KEY idx_gb_participation_group_buy (group_buy_id, status),
  KEY idx_gb_participation_user (user_id),
  CONSTRAINT fk_gb_participation_group_buy FOREIGN KEY (group_buy_id) REFERENCES group_buy (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공동구매 참여(결제 확정) 기록';

-- ─────────────────────────────────────────────────────────────
-- 주문 출처 기록 (§4-1, §9-1)
--
-- nullable 이라 기존 주문 행·기존 INSERT 문에 영향이 없다.
-- 공동구매 외의 출처(기획전·이벤트)도 같은 컬럼을 재사용할 수 있게 타입을 열어 둔다.
-- ⚠️ 이 저장소의 MySQL 8.4 는 ADD COLUMN IF NOT EXISTS 를 지원하지 않는다.
--    재실행하면 ER_DUP_FIELDNAME(1060)이 난다 — 이미 적용됐다는 뜻이니 무시해도 된다.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN source_type varchar(30) DEFAULT NULL COMMENT 'GROUP_BUY 등 주문 출처',
  ADD COLUMN source_id   bigint      DEFAULT NULL COMMENT '출처 엔티티 id (group_buy.id)',
  ADD KEY idx_order_items_source (source_type, source_id);

-- ─────────────────────────────────────────────────────────────
-- 관리자 메뉴 ('페이지/전시 관리' 그룹 id=31 아래. 이벤트가 6 이므로 7)
--
-- ⚠️ 컬럼명은 sort_order 가 아니라 display_order 다.
-- ⚠️ is_active=0 으로 넣는다. dev·prod 가 같은 DB 라, 라우트가 배포되기 전에
--    메뉴부터 뜨면 운영 관리자가 클릭했을 때 404 가 난다.
--    routes/admin/group-buys.js 가 응답한 뒤에 아래 UPDATE 로 켠다.
-- ─────────────────────────────────────────────────────────────
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '공동구매 관리', '/admin/group-buys', 'bi bi-people-fill', 7, 31, 0, 'super_admin,admin,content_admin'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM admin_menus WHERE path = '/admin/group-buys') x);

-- 배포 완료 후 실행
-- UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/group-buys';
--
-- feature_menu 는 건드리지 않는다 — GROUP_BUY(id=12, default_path='/group-buy', module_ready=1)가
-- 이미 있고 GNB 에 떠 있다. 발행된 공동구매가 0건이면 groupBuyController 가 준비중 랜딩으로 되돌린다.
