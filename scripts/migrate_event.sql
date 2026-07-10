-- 이벤트&혜택 1차 스키마 — 테이블 3종
-- 설계: docs/사이트개선/gnb_menu_design.md §2-7
--
-- ⚠️ users.id 와 coupons.id 는 int 다. 이들을 참조하는 컬럼은 반드시 int.
--    bigint 로 두면 FK 생성이 실패한다. event.id 계열만 신세대 관례대로 bigint.
-- ⚠️ mall_id 에 FK 를 걸지 않는다 — page/product_group/custom_menu 어디에도 mall FK 가 없다.
-- ⚠️ 예정/진행중/종료는 저장하지 않는다. start_at·end_at 에서 파생한다.
--    status 는 운영자가 정하는 상태(DRAFT/PUBLISHED/HIDDEN)만 담는다.

CREATE TABLE IF NOT EXISTS event (
  id                 bigint       NOT NULL AUTO_INCREMENT,
  mall_id            bigint       NOT NULL DEFAULT 1 COMMENT '몰 ID',

  title              varchar(200) NOT NULL COMMENT '이벤트명',
  slug               varchar(200) NOT NULL COMMENT 'SEO URL 슬러그(몰 스코프 유니크)',
  summary            varchar(500) DEFAULT NULL COMMENT '목록 카드 한 줄 요약',
  content            text         COMMENT '상세 본문(HTML 허용 → 렌더 시 새니타이즈)',
  notice             text         COMMENT '유의사항',

  event_type         varchar(30)  NOT NULL DEFAULT 'NOTICE' COMMENT 'NOTICE(공지형)/APPLY(응모)/COUPON_PACK(쿠폰팩)/ATTENDANCE(출석)/PURCHASE(구매인증)',

  thumbnail_url      varchar(500) DEFAULT NULL COMMENT '목록 카드 썸네일',
  pc_hero_url        varchar(500) DEFAULT NULL COMMENT '상세 PC 대표 이미지',
  mobile_hero_url    varchar(500) DEFAULT NULL COMMENT '상세 모바일 대표 이미지',

  status             varchar(30)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/HIDDEN. 예정·진행중·종료는 기간에서 파생',
  start_at           datetime     NOT NULL COMMENT '노출·참여 시작',
  end_at             datetime     DEFAULT NULL COMMENT '종료(NULL=상시)',
  winner_announce_at datetime     DEFAULT NULL COMMENT '당첨자 발표 일시',

  login_required     tinyint(1)   NOT NULL DEFAULT 1 COMMENT '참여에 로그인 필요',
  issue_limit        int          DEFAULT NULL COMMENT '선착순 인원(NULL=무제한)',
  issued_count       int          NOT NULL DEFAULT 0 COMMENT '현재 참여 수. 선착순 판정에 쓴다',

  list_visible       tinyint(1)   NOT NULL DEFAULT 1 COMMENT '이벤트 목록 노출',
  view_count         int          NOT NULL DEFAULT 0 COMMENT '상세 조회수',

  created_at         datetime     DEFAULT CURRENT_TIMESTAMP,
  updated_at         datetime     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_event_mall_slug (mall_id, slug),
  KEY idx_event_mall_status (mall_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='이벤트';

-- 중복 참여는 애플리케이션이 아니라 DB 제약으로 막는다(경쟁 조건).
CREATE TABLE IF NOT EXISTS event_participant (
  id         bigint      NOT NULL AUTO_INCREMENT,
  event_id   bigint      NOT NULL,
  user_id    int         NOT NULL COMMENT 'users.id 가 int 다. bigint 로 두면 FK 실패',

  status     varchar(30) NOT NULL DEFAULT 'APPLIED' COMMENT 'APPLIED/WON/LOST',
  memo       varchar(255) DEFAULT NULL COMMENT '참여 시 입력값(구매인증 주문번호 등)',

  created_at datetime    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_event_participant (event_id, user_id),
  KEY idx_event_participant_user (user_id),
  CONSTRAINT fk_event_participant_event FOREIGN KEY (event_id) REFERENCES event (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_participant_user  FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='이벤트 참여자';

CREATE TABLE IF NOT EXISTS event_coupon (
  id         bigint   NOT NULL AUTO_INCREMENT,
  event_id   bigint   NOT NULL,
  coupon_id  int      NOT NULL COMMENT 'coupons.id 가 int 다. bigint 로 두면 FK 실패',

  sort_order int      NOT NULL DEFAULT 0,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_event_coupon (event_id, coupon_id),
  KEY idx_event_coupon_coupon (coupon_id),
  CONSTRAINT fk_event_coupon_event  FOREIGN KEY (event_id)  REFERENCES event (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_coupon_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='이벤트 연결 쿠폰(쿠폰팩)';

-- ─────────────────────────────────────────────────────────────
-- 관리자 메뉴 ('페이지/전시 관리' 그룹 id=31 아래. 기획전이 5 이므로 6)
--
-- ⚠️ is_active=0 으로 넣는다. dev·prod 가 같은 DB 라, 라우트가 배포되기 전에
--    메뉴부터 뜨면 운영 관리자가 클릭했을 때 404 가 난다.
--    routes/admin/events.js 가 응답한 뒤에 아래 UPDATE 로 켠다.
-- ─────────────────────────────────────────────────────────────
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '이벤트 관리', '/admin/events', 'bi bi-gift', 6, 31, 0, 'super_admin,admin,content_admin'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM admin_menus WHERE path = '/admin/events') x);

-- 배포 완료 후 실행
-- UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/events';
