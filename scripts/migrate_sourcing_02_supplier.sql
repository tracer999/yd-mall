-- 외부몰 연동 — 공급처 상품 중간 테이블(Phase 2)
-- 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §4.2, §6
-- 개발계획: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_개발계획서.md Phase 2
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sourcing_02_supplier.sql
--
-- 범위: 공급처에서 "가져온" 상품 원본 스냅샷 + 옵션(SKU) + 가져오기 이력.
-- 원칙:
--   - 멱등(IF NOT EXISTS), mall_id 스코프, utf8mb4.
--   - 이 테이블은 **공급처 원본의 스냅샷**이다. 편집 결과는 여기 쓰지 않는다
--     (편집은 Phase 3 builder_product 로 분리 — 재수집 시 덮어써도 안전해야 하므로).
--   - 기존 products 와 별도 네임스페이스(계획서 §2 주석).
--
-- 도매꾹/도매매는 같은 아이템 번호를 양쪽 마켓에 노출하되 가격이 다를 수 있다.
-- 그래서 supplier(DOMEGGOOK=도매꾹 dome / DOMEME=도매매 supply)를 유니크 키에 포함한다.

-- ---------------------------------------------------------------------------
-- 1. supplier_product — 공급처 상품 원본 스냅샷
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_product (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    mall_id           BIGINT       NOT NULL,
    supplier ENUM('DOMEGGOOK','DOMEME','ONCHANNEL') NOT NULL
        COMMENT 'DOMEGGOOK=도매꾹(dome), DOMEME=도매매(supply). 자격증명은 공용이나 마켓·가격이 다름.',
    supplier_item_no  VARCHAR(64)  NOT NULL COMMENT '공급처 상품번호(도매꾹 basis.no)',

    -- 기본 정보
    title             VARCHAR(500) NOT NULL,
    status_text       VARCHAR(50)  NULL COMMENT '공급처 원문 상태(판매중/품절 등)',
    thumb_url         VARCHAR(1000) NULL,
    source_url        VARCHAR(500) NULL COMMENT '공급처 상품 페이지 URL',

    -- 가격/수량 (공급처 기준. 판매가 산정은 Phase 3 pricing_policy)
    supply_price      DECIMAL(12,2) NULL COMMENT '공급가(도매꾹 price.dome / 도매매 price.supply)',
    currency          VARCHAR(8)   NOT NULL DEFAULT 'KRW',
    moq               INT          NULL COMMENT '최소구매수량(qty.domeMoq)',
    unit_qty          INT          NULL COMMENT '구매단위(qty.domeUnit)',
    inventory_qty     INT          NULL COMMENT '재고(qty.inventory)',

    -- 배송
    deli_method       VARCHAR(50)  NULL COMMENT '택배/화물 등',
    deli_pay          VARCHAR(100) NULL COMMENT '선불/착불 정책 원문',
    deli_fee_type     VARCHAR(50)  NULL COMMENT '수량별비례/무료 등',
    deli_fee_table    VARCHAR(255) NULL COMMENT '원문 요금표(예: 5+4500|5+4500)',
    deli_fee_jeju     INT          NULL,
    deli_fee_islands  INT          NULL,
    from_oversea      TINYINT(1)   NOT NULL DEFAULT 0,

    -- 판매자
    seller_id         VARCHAR(100) NULL,
    seller_nick       VARCHAR(200) NULL,
    seller_company    VARCHAR(200) NULL,

    -- 공급처 카테고리(빌더 카테고리 매핑은 Phase 3 category_mapping)
    category_code     VARCHAR(64)  NULL COMMENT '도매꾹 코드(예: 12_03_13_00_00)',
    category_name     VARCHAR(255) NULL,
    category_depth    TINYINT      NULL,

    -- 상품 상세 속성
    country           VARCHAR(100) NULL COMMENT '원산지',
    manufacturer      VARCHAR(200) NULL,
    model_name        VARCHAR(200) NULL,
    weight_g          VARCHAR(50)  NULL COMMENT '원문 유지(단위 표기가 제각각)',
    size_text         VARCHAR(100) NULL,
    tax_type          VARCHAR(50)  NULL COMMENT '과세상품/면세상품',
    info_duty_type    VARCHAR(100) NULL COMMENT '상품정보제공고시 유형(건강기능식품 등)',
    adult_only        TINYINT(1)   NOT NULL DEFAULT 0,

    -- 재판매 가능 여부 — 오픈마켓 재판매 금지 상품을 스마트스토어에 올리면 안 되므로 필수 노출.
    resale_allowed    TINYINT(1)   NULL COMMENT '1=재판매 가능, 0=금지, NULL=미확인(desc.license.usable)',
    resale_msg        VARCHAR(500) NULL COMMENT '금지 사유 원문',

    -- 상세 콘텐츠
    detail_html       MEDIUMTEXT   NULL COMMENT '상세설명 HTML 원본(desc.contents.item)',
    notice_html       MEDIUMTEXT   NULL COMMENT '공지/안내 HTML(desc.notice)',
    images_json       JSON         NULL COMMENT '상세에서 추출한 이미지 URL 배열',

    -- 옵션
    option_type       VARCHAR(30)  NULL COMMENT 'none/combination/single 등 원문 type',

    -- 원본 보존 + 이력
    raw_json          JSON         NULL COMMENT 'getItemView 원본(디버깅·재정규화용)',
    import_status ENUM('LISTED','DETAILED','FAILED') NOT NULL DEFAULT 'LISTED'
        COMMENT 'LISTED=목록만, DETAILED=상세까지 수집, FAILED=상세 수집 실패',
    last_error        VARCHAR(500) NULL,
    imported_by       VARCHAR(100) NULL COMMENT '가져오기 실행 관리자 아이디',
    imported_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    detail_fetched_at DATETIME     NULL,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_sp_mall_supplier_item (mall_id, supplier, supplier_item_no),
    KEY idx_sp_mall_imported (mall_id, imported_at),
    KEY idx_sp_mall_status (mall_id, import_status),
    KEY idx_sp_category (mall_id, category_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='공급처 상품 원본 스냅샷(중간 테이블). 편집 결과는 여기 쓰지 않는다.';

-- ---------------------------------------------------------------------------
-- 2. supplier_variant — 공급처 옵션(SKU)
--    도매꾹 selectOpt.data 의 각 조합이 1행. extra_price 는 기본가에 "더해지는" 금액.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_variant (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    supplier_product_id BIGINT       NOT NULL,
    opt_code            VARCHAR(64)  NOT NULL COMMENT '조합 코드(도매꾹 selectOpt.data 키: "00","01"…)',
    opt_hash            VARCHAR(100) NULL COMMENT '공급처 옵션 해시(주문 시 식별자)',
    opt_name            VARCHAR(500) NOT NULL COMMENT '옵션 표시명(축 값 조합)',
    extra_price         DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '기본가 대비 추가금(domPrice/supPrice)',
    qty                 INT          NULL COMMENT '옵션별 재고',
    is_hidden           TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '공급처에서 숨김 처리된 옵션',
    available           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '해당 마켓(dome/supply)에서 판매 가능',
    raw_json            JSON         NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_sv_product_opt (supplier_product_id, opt_code),
    KEY idx_sv_product (supplier_product_id),
    CONSTRAINT fk_sv_product FOREIGN KEY (supplier_product_id)
        REFERENCES supplier_product (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='공급처 상품 옵션(SKU) 스냅샷';

-- ---------------------------------------------------------------------------
-- 3. supplier_import_log — 가져오기 실행 이력
--    "언제 누가 무슨 조건으로 몇 건 가져왔나" — 1차는 배치가 없으므로 수동 실행 기록.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_import_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    mall_id       BIGINT       NOT NULL,
    supplier ENUM('DOMEGGOOK','DOMEME','ONCHANNEL') NOT NULL,
    action        VARCHAR(30)  NOT NULL COMMENT 'SEARCH / IMPORT / REFRESH',
    keyword       VARCHAR(255) NULL,
    category_code VARCHAR(64)  NULL,
    requested_cnt INT          NOT NULL DEFAULT 0,
    success_cnt   INT          NOT NULL DEFAULT 0,
    failed_cnt    INT          NOT NULL DEFAULT 0,
    message       VARCHAR(1000) NULL,
    actor         VARCHAR(100) NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sil_mall_created (mall_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='공급처 가져오기 실행 이력';

-- ---------------------------------------------------------------------------
-- 4. 관리자 메뉴 — 01_admin.sql 에서 이미 INSERT 됨(/admin/sourcing/import, /staging).
--    여기서는 재실행 안전을 위해 누락된 경우만 보정한다.
-- ---------------------------------------------------------------------------
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '상품 가져오기' AS name, '/admin/sourcing/import' AS path, 'bi bi-download' AS icon_class,
    20 AS display_order,
    (SELECT id FROM (SELECT id FROM admin_menus WHERE name = '외부몰 연동' AND path IS NULL LIMIT 1) AS g) AS parent_id,
    1 AS is_active, 'super_admin,admin' AS visible_roles
) AS t
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM admin_menus WHERE path = '/admin/sourcing/import') AS e);
