-- 외부몰 연동(도매꾹·온채널 → 빌더 → 스마트스토어) — 관리자 골격 스키마
-- 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md (§5 자격증명, §21 대메뉴)
-- 개발계획: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_개발계획서.md (Phase 1)
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sourcing_01_admin.sql
--
-- 범위(1차 골격): 몰별 사용여부 설정 + 외부 계정 자격증명(암호화) + 관리자 독립 대메뉴.
-- 원칙: 멱등(IF NOT EXISTS / WHERE NOT EXISTS), mall_id 스코프, utf8mb4.

-- ---------------------------------------------------------------------------
-- 1. mall_channel_setting — 몰별 연동 사용여부(유료 게이팅)
--    outlet_setting(mall_id PK) 선례와 동일한 '몰별 설정 테이블' 패턴.
--    sourcing_enabled=0 이면 대메뉴·기능·워커가 전부 비활성(납품 시 추가 계약 대상).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mall_channel_setting (
    mall_id          BIGINT      NOT NULL,
    sourcing_enabled TINYINT(1)  NOT NULL DEFAULT 0
        COMMENT '외부몰 연동 사용여부. 0=미사용(기본). 유료 기능 — 계약 시 1로.',
    default_margin_rate   DECIMAL(5,2) NULL COMMENT '기본 목표 마진율(%) — 가격 정책 기본값',
    default_channel_fee_rate DECIMAL(5,2) NULL COMMENT '기본 판매채널 수수료율(%)',
    note             VARCHAR(255) NULL COMMENT '운영 메모',
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='몰별 외부몰 연동 설정(사용여부·기본 정책)';

-- 기존 몰 전체를 미사용(0)으로 시딩 — 켜는 건 관리자가 계약 후 수동.
INSERT INTO mall_channel_setting (mall_id, sourcing_enabled)
SELECT m.id, 0 FROM mall m
WHERE NOT EXISTS (SELECT 1 FROM mall_channel_setting s WHERE s.mall_id = m.id);

-- ---------------------------------------------------------------------------
-- 2. mall_channel_credential — 외부 계정 자격증명(몰 스코프, 암호화)
--    secret_enc 는 'ENC:' + AES-256-GCM(shared/crypto). 평문 저장 금지.
--    액세스 토큰은 저장하지 않는다(프로세스 메모리 캐시).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mall_channel_credential (
    id             BIGINT      NOT NULL AUTO_INCREMENT,
    mall_id        BIGINT      NOT NULL,
    channel ENUM('DOMEGGOOK','DOMEME','ONCHANNEL','NAVER_SMARTSTORE') NOT NULL,
    account_label  VARCHAR(100) NOT NULL DEFAULT '기본' COMMENT '표시용 계정 이름',
    client_id      VARCHAR(255) NULL COMMENT '평문 식별자(API Key/앱ID 등)',
    secret_enc     TEXT         NULL COMMENT "ENC: + AES-256-GCM. client_secret/시크릿 키",
    extra_json     JSON         NULL COMMENT '스토어채널ID·반품지코드 등 채널별 부가',
    status ENUM('ACTIVE','INVALID','EXPIRED','DISABLED') NOT NULL DEFAULT 'ACTIVE',
    last_verified_at DATETIME   NULL COMMENT 'validateConnection 마지막 성공 시각',
    last_error     VARCHAR(500) NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mall_channel_label (mall_id, channel, account_label),
    KEY idx_mcc_mall (mall_id, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='몰별 외부 채널 자격증명(암호화 저장)';

-- ---------------------------------------------------------------------------
-- 3. 관리자 독립 대메뉴 — "외부몰 연동"
--    최상위 그룹은 parent_id IS NULL + path IS NULL (기존 그룹들과 동일 구조).
--    admin_menus 에 행이 없으면 requireMenuAccess 가 라우트를 막는다.
--    UNIQUE 제약이 없으므로 WHERE NOT EXISTS 로 재실행 가드.
--    display_order=66 : 멤버십(65)과 주문/회원(70) 사이. (원하면 조정)
-- ---------------------------------------------------------------------------
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '외부몰 연동' AS name, NULL AS path, 'bi bi-box-arrow-in-down-right' AS icon_class,
    66 AS display_order, NULL AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM admin_menus m WHERE m.name = '외부몰 연동' AND m.parent_id IS NULL AND m.path IS NULL
);

-- 그룹 id 확보(세션 변수) — 자식 parent_id 로 사용
SELECT id INTO @sourcing_gid
FROM admin_menus
WHERE name = '외부몰 연동' AND parent_id IS NULL AND path IS NULL
LIMIT 1;

-- 하위 메뉴(1차). 각 행은 path 로 재실행 가드.
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '공급처/채널 연결' AS name, '/admin/sourcing/connections' AS path, 'bi bi-plugin' AS icon_class,
    1 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/connections');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '상품 가져오기' AS name, '/admin/sourcing/import' AS path, 'bi bi-cloud-download' AS icon_class,
    2 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/import');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '가져온 상품(중간)' AS name, '/admin/sourcing/staging' AS path, 'bi bi-inboxes' AS icon_class,
    3 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/staging');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '스마트스토어 등록' AS name, '/admin/sourcing/publish' AS path, 'bi bi-shop' AS icon_class,
    4 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/publish');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '스토어 상품 가져오기' AS name, '/admin/sourcing/channel-import' AS path, 'bi bi-arrow-down-left-square' AS icon_class,
    5 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/channel-import');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '재고·주문 가져오기' AS name, '/admin/sourcing/sync' AS path, 'bi bi-arrow-repeat' AS icon_class,
    6 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/sync');
