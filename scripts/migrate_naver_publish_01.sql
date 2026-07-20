-- 네이버 스마트스토어 상품 등록 — 매핑·프로필·로그 스키마 (Phase 3)
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_naver_publish_01.sql
-- 설계: docs/사이트개선/네이버_스마트스토어_연동.md
--
-- ⚠ migrate_sourcing_03_publish.sql 과 혼동 금지.
--   03_publish  = 공급처 상품 → **우리 몰** products 등록 (supplier_product.mall_product_id)
--   이 파일     = 우리 몰 products → **네이버 스마트스토어** 등록 (channel_product_mapping)
--
-- 멱등: 전부 CREATE TABLE IF NOT EXISTS / INSERT ... WHERE NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1) 몰별 네이버 등록 프로필
--
-- 네이버 상품등록은 상품 하나를 올리는 데에도 "판매자 레벨" 정보를 매 요청 함께 보내야 한다
-- (A/S 안내, 원산지, 반품·교환 배송비, 출고지·반품지 주소록 번호 등).
-- 이 값들은 우리 몰 products 에 없는 개념이라 몰마다 한 벌 저장해 두고 매 등록에 주입한다.
-- 상품별로 달라야 하는 값은 channel_product_mapping.override_json 으로 덮는다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS naver_publish_profile (
  mall_id BIGINT NOT NULL COMMENT '몰 ID (몰당 1행 — 스마트스토어는 몰당 1:1 연동)',

  -- 주소록: 네이버 판매자센터에 등록된 출고지/반품지의 "주소록 번호". API 로 조회해 고른다.
  release_address_no   VARCHAR(32) NULL COMMENT '출고지 주소록 번호(outboundLocationId 계열)',
  refund_address_no    VARCHAR(32) NULL COMMENT '반품/교환지 주소록 번호',

  -- 배송
  delivery_fee_type    VARCHAR(32)  NOT NULL DEFAULT 'PAID' COMMENT '배송비 유형 FREE/PAID/CONDITIONAL_FREE 등',
  delivery_fee         INT          NULL COMMENT '기본 배송비(원). shipping_policy.base_fee 를 기본값으로 씀',
  free_threshold       INT          NULL COMMENT '조건부 무료 기준금액(원)',
  return_delivery_fee  INT          NULL COMMENT '반품 배송비(원) — 네이버 필수',
  exchange_delivery_fee INT         NULL COMMENT '교환 배송비(원) — 네이버 필수',
  delivery_company     VARCHAR(32)  NULL COMMENT '기본 택배사 코드(예: CJGLS)',

  -- A/S
  as_telephone         VARCHAR(50)  NULL COMMENT 'A/S 전화번호 — 네이버 필수',
  as_guide_content     VARCHAR(500) NULL COMMENT 'A/S 안내 문구 — 네이버 필수',

  -- 원산지
  origin_area_code     VARCHAR(32)  NULL COMMENT '원산지 코드(기본값)',
  origin_area_content  VARCHAR(100) NULL COMMENT '원산지 상세(기본값)',

  -- 판매 정책 기본값
  minor_purchasable    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '미성년자 구매 가능 여부',
  naver_shopping_registration TINYINT(1) NOT NULL DEFAULT 1 COMMENT '네이버쇼핑 노출 신청 여부',
  channel_display_status VARCHAR(32) NOT NULL DEFAULT 'ON' COMMENT '채널상품 전시상태 ON/SUSPENSION',

  -- 상품정보제공고시 기본 템플릿 — 카테고리별 항목이 다르므로 JSON 으로 유연하게 둔다.
  notice_type          VARCHAR(64)  NULL COMMENT '고시정보 유형(예: WEAR, FOOD, ETC)',
  notice_defaults_json JSON         NULL COMMENT '고시정보 기본값 {키:값} — 상품에 값이 없으면 이걸로 채움',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='몰별 네이버 상품등록 기본값(판매자 레벨 필수정보)';

-- ---------------------------------------------------------------------------
-- 2) 상품 매핑 — 우리 products ↔ 네이버 원상품/채널상품
--
-- 네이버는 "원상품(originProduct)" 1건에 채널상품(channelProduct)이 붙는 구조다.
-- 재등록·수정·재고동기화·주문매칭이 전부 이 번호로 이뤄지므로 반드시 보관한다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_product_mapping (
  id BIGINT NOT NULL AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'NAVER_SMARTSTORE',
  product_id INT NOT NULL COMMENT '우리 몰 products.id',

  origin_product_no  VARCHAR(64) NULL COMMENT '네이버 원상품 번호',
  channel_product_no VARCHAR(64) NULL COMMENT '네이버 채널상품 번호(스마트스토어 노출 단위)',
  channel_product_name VARCHAR(255) NULL COMMENT '채널에 올라간 상품명(우리 name 과 다를 수 있음)',

  -- DRAFT: 아직 안 보냄 / PUBLISHING: 전송 중 / PUBLISHED: 성공 / FAILED: 실패 / SUSPENDED: 판매중지
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '등록 상태',
  sale_status VARCHAR(32) NULL COMMENT '네이버 판매상태(SALE/SUSPENSION/OUTOFSTOCK 등)',

  -- 역방향 수집(§10)으로 들어온 건지 우리가 올린 건지 구분.
  source_type VARCHAR(20) NOT NULL DEFAULT 'BUILDER' COMMENT 'BUILDER=우리가 등록 / CHANNEL_IMPORT=역수집',

  -- 같은 내용을 반복 전송하지 않기 위한 지문. 페이로드 해시가 같으면 수정 호출을 건너뛴다.
  payload_hash CHAR(64) NULL COMMENT '마지막 전송 페이로드 SHA-256',
  override_json JSON NULL COMMENT '이 상품만 프로필 기본값을 덮을 값',

  last_published_at DATETIME NULL,
  last_error TEXT NULL COMMENT '마지막 실패 사유(성공 시 NULL 로 지움)',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- 한 몰의 한 상품은 한 채널에 한 번만 매핑된다(중복 등록 방지의 최종 방어선).
  UNIQUE KEY uk_cpm_mall_channel_product (mall_id, channel, product_id),
  KEY idx_cpm_origin (origin_product_no),
  KEY idx_cpm_channel_no (channel_product_no),
  KEY idx_cpm_status (mall_id, channel, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='우리 몰 상품 ↔ 네이버 원상품/채널상품 매핑';

-- ---------------------------------------------------------------------------
-- 3) SKU 매핑 — 우리 product_sku ↔ 네이버 옵션조합
--
-- 재고 동기화(2차)는 옵션 단위로 이뤄진다. 어떤 SKU 가 네이버의 어느 옵션인지
-- 모르면 옵션상품의 재고를 갱신할 수 없다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_sku_mapping (
  id BIGINT NOT NULL AUTO_INCREMENT,
  mapping_id BIGINT NOT NULL COMMENT 'channel_product_mapping.id',
  sku_id INT NOT NULL COMMENT '우리 product_sku.id',

  naver_option_id VARCHAR(64) NULL COMMENT '네이버 옵션조합 ID(등록 응답/조회로 확보)',
  option_manage_code VARCHAR(100) NULL COMMENT '판매자 관리코드 — 옵션 매칭의 1차 키',
  option_name1 VARCHAR(100) NULL,
  option_name2 VARCHAR(100) NULL,
  option_name3 VARCHAR(100) NULL,
  last_sent_stock INT NULL COMMENT '마지막으로 네이버에 보낸 재고(중복 전송 방지)',
  last_sent_price INT NULL COMMENT '마지막으로 보낸 옵션가',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_csm_mapping_sku (mapping_id, sku_id),
  KEY idx_csm_sku (sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='우리 SKU ↔ 네이버 옵션조합 매핑(재고 동기화용)';

-- ---------------------------------------------------------------------------
-- 4) 전송 로그 — 실패 원인 추적용
--
-- 네이버 등록은 검수·필수값 때문에 실패가 잦다. 요청/응답을 남겨 두지 않으면
-- "왜 반려됐는지"를 재현할 수 없다. 개발 단계에서 특히 중요.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_publish_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'NAVER_SMARTSTORE',
  product_id INT NULL,
  mapping_id BIGINT NULL,

  action VARCHAR(20) NOT NULL COMMENT 'CREATE/UPDATE/DELETE/STOCK/IMAGE/FETCH',
  ok TINYINT(1) NOT NULL DEFAULT 0,
  http_status INT NULL,
  message TEXT NULL,
  request_json  JSON NULL COMMENT '보낸 페이로드(시크릿 없음)',
  response_json JSON NULL COMMENT '받은 응답 원본',
  duration_ms INT NULL,
  actor VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_cpl_mall_created (mall_id, created_at),
  KEY idx_cpl_product (product_id),
  KEY idx_cpl_mapping (mapping_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='채널 전송 로그(요청/응답 원본)';

-- ---------------------------------------------------------------------------
-- 5) 이미지 업로드 캐시
--
-- 네이버는 외부 URL 을 그대로 쓰지 못하고 자사 이미지 서버에 업로드한 URL 을 요구한다.
-- 같은 이미지를 상품마다 다시 올리면 시간도 한도도 낭비라 로컬경로 → 네이버URL 을 캐시한다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_image_cache (
  id BIGINT NOT NULL AUTO_INCREMENT,
  mall_id BIGINT NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'NAVER_SMARTSTORE',
  local_path VARCHAR(255) NOT NULL COMMENT '우리 웹경로(/uploads/products/xxx.webp)',
  file_hash CHAR(64) NULL COMMENT '파일 내용 SHA-256(경로가 바뀌어도 재사용)',
  remote_url VARCHAR(500) NOT NULL COMMENT '네이버가 돌려준 이미지 URL',
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_cic_mall_channel_path (mall_id, channel, local_path),
  KEY idx_cic_hash (file_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='로컬 이미지 → 채널 업로드 URL 캐시';
