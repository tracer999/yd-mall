-- 아울렛(Outlet) 모듈 스키마
-- 설계: docs/사이트개선/outlet_design_and_development.md
--
-- 핵심 원칙 — 아울렛은 진열(merchandising) 모듈이다.
--   · 가격 컬럼을 두지 않는다. products.original_price / price / discount_rate 를 그대로 쓴다.
--     outlet_price 를 만드는 순간 장바구니·주문·결제 검증 경로가 전부 열린다.
--   · 아울렛의 존재 이유는 '할인 사유(outlet_type)' 다. 할인율이 아니다.
--     할인율로 상품을 긁어오는 방식은 2026-07-11 구현했다가 되돌렸다(설계서 §3-1).
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_outlet.sql

-- ---------------------------------------------------------------------------
-- 1. 아울렛 카테고리 — categories.type 에 'OUTLET' 추가
--    별도 테이블을 만들지 않고 기존 트리를 재사용한다(depthGuard 의 뎁스·순환 가드를 그대로 씀).
--    대신 일반 카테고리 조회에 섞이지 않도록 모든 쿼리가 type 을 스코프해야 한다(BRAND 가 이미 그렇게 한다).
-- ---------------------------------------------------------------------------
ALTER TABLE categories
    MODIFY COLUMN type ENUM('NORMAL','THEME','BRAND','OUTLET') NOT NULL DEFAULT 'NORMAL';

-- ---------------------------------------------------------------------------
-- 2. outlet_product — 아울렛 상품 매핑 + 할인 사유
--    exhibition_product 패턴을 클론하되, mall_id 를 직접 갖는다(아울렛엔 상위 헤더 엔티티가 없다).
--    product_id 는 INT 다 — products.id 가 INT 이므로 BIGINT 로 두면 FK 가 깨진다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlet_product (
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    mall_id            BIGINT       NOT NULL DEFAULT 1,
    product_id         INT          NOT NULL,
    outlet_category_id INT          NULL COMMENT 'categories.id (type=OUTLET). NULL=미분류',

    outlet_type ENUM(
        'SEASON_OFF',       -- 시즌 이월
        'DISCONTINUED',     -- 단종·구형 모델
        'OVERSTOCK',        -- 재고 과다
        'DISPLAY',          -- 전시상품
        'REFURBISHED',      -- 리퍼브
        'PACKAGE_DAMAGE',   -- 포장 훼손
        'EXPIRY_SOON'       -- 유통기한 임박
    ) NOT NULL COMMENT '할인 사유. 아울렛의 존재 이유이자 유일한 필수 분류축',

    outlet_reason      VARCHAR(255) NULL COMMENT '고객 노출 문구 (예: 25FW 시즌 이월)',
    condition_grade    ENUM('A','B','C') NULL COMMENT 'A=미개봉 B=경미한 하자 C=하자 있음. 리퍼브·전시·훼손만',
    defect_description TEXT         NULL COMMENT '하자 고지. grade B/C 면 필수 — 없으면 교환·반품 분쟁이 난다',

    expiry_at          DATE         NULL COMMENT 'EXPIRY_SOON 전용 유통기한',
    started_at         DATETIME     NULL COMMENT 'NULL=즉시 시작',
    ended_at           DATETIME     NULL COMMENT 'NULL=무기한(재고 소진까지)',

    sort_order         INT          NOT NULL DEFAULT 0,
    is_visible         TINYINT(1)   NOT NULL DEFAULT 1,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    -- 한 상품은 한 몰의 아울렛에 한 번만 들어간다(사유가 둘일 수 없다)
    UNIQUE KEY uk_outlet_product (mall_id, product_id),
    KEY idx_outlet_mall_type (mall_id, outlet_type, is_visible),
    KEY idx_outlet_mall_cat  (mall_id, outlet_category_id, is_visible),
    KEY idx_outlet_product   (product_id),
    KEY idx_outlet_category  (outlet_category_id),

    CONSTRAINT fk_outlet_product_product
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_outlet_product_category
        FOREIGN KEY (outlet_category_id) REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='아울렛 상품 매핑. 가격은 products 를 그대로 쓴다(이중 가격 없음)';

-- ---------------------------------------------------------------------------
-- 3. outlet_setting — 몰 단위 운영 설정
--    메뉴 on/off·메뉴명은 mall_feature_menu 가 이미 담당한다. 여기 중복해서 두지 않는다.
--    여기 있는 건 '아울렛 운영 규칙' 뿐이다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlet_setting (
    mall_id             BIGINT      NOT NULL,
    allowed_types       VARCHAR(255) NOT NULL
        DEFAULT 'SEASON_OFF,DISCONTINUED,OVERSTOCK,DISPLAY,REFURBISHED,PACKAGE_DAMAGE,EXPIRY_SOON'
        COMMENT '이 몰이 쓰는 할인 사유(CSV). 건강식품몰이면 EXPIRY_SOON 만 쓰는 식',
    min_discount_rate   INT         NOT NULL DEFAULT 20
        COMMENT '아울렛 등록 최소 할인율. 허위 할인 방지 — 미달 상품은 등록을 막는다',
    min_product_count   INT         NOT NULL DEFAULT 30
        COMMENT 'GNB 노출 임계치. 판매중 아울렛 상품이 이 수 미만이면 GNB 에서 자동으로 숨는다(빈 메뉴 방지)',
    show_in_normal_list TINYINT(1)  NOT NULL DEFAULT 1
        COMMENT '아울렛 상품을 일반 상품 목록에도 함께 노출할지',
    notice_html         TEXT        NULL COMMENT '아울렛 공통 고지(교환·반품 조건 차이 등)',
    created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='몰별 아울렛 운영 규칙';

-- 기본 설정 시딩 — mall1 은 건강식품관이라 EXPIRY_SOON 만 의미가 있다(설계서 §1-2).
INSERT INTO outlet_setting (mall_id, allowed_types, min_discount_rate, min_product_count)
VALUES (1, 'EXPIRY_SOON,OVERSTOCK,PACKAGE_DAMAGE', 20, 30)
ON DUPLICATE KEY UPDATE mall_id = mall_id;

INSERT INTO outlet_setting (mall_id, allowed_types, min_discount_rate, min_product_count)
VALUES (2, 'SEASON_OFF,DISCONTINUED,OVERSTOCK,DISPLAY,REFURBISHED,PACKAGE_DAMAGE,EXPIRY_SOON', 20, 30)
ON DUPLICATE KEY UPDATE mall_id = mall_id;

-- ---------------------------------------------------------------------------
-- 4. 관리자 메뉴 — admin_menus 에 행이 없으면 requireMenuAccess 가 라우트를 막는다.
--    parent_id=32 = '상품 관리' 그룹(쇼핑특가·특가 카테고리가 있는 곳). 아울렛도 상품 진열이다.
--    UNIQUE 제약이 없으므로 재실행 시 중복되지 않도록 SELECT ... WHERE NOT EXISTS 로 가드한다.
-- ---------------------------------------------------------------------------
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '아울렛 관리' AS name, '/admin/outlet' AS path, 'bi bi-tags' AS icon_class,
    7 AS display_order, 32 AS parent_id, 1 AS is_active,
    'super_admin,admin,content_admin' AS visible_roles
) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/outlet');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '아울렛 카테고리' AS name, '/admin/outlet/categories' AS path, 'bi bi-diagram-3' AS icon_class,
    8 AS display_order, 32 AS parent_id, 1 AS is_active,
    'super_admin,admin,content_admin' AS visible_roles
) AS t
WHERE NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/outlet/categories');
