-- 상품 출처(source_channel) — 이 상품이 어디서 온 것인지.
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrations/20260723_product_source_channel.sql
--
-- 배경
--   관리자 상품 목록에서 "직접 등록한 몰 상품"과 "외부 공급처에서 가져온 상품"이 구분되지 않았다.
--   둘은 운영 방법이 다르다 — 공급처 상품은 원본 가격·재고가 외부에서 바뀌고, 카테고리·브랜드가
--   비어 있는 채로 들어오며, 재판매 금지 여부를 따져야 한다. 화면에서 섞여 보이면 그 판단을 못 한다.
--
-- 왜 컬럼인가
--   출처는 "상품을 만든 시점"에만 확실히 알 수 있다. 조회할 때 products.product_code =
--   supplier_product.supplier_item_no 로 매번 유도하는 방법은 product_code 가 관리자 편집 가능하고
--   NULL 도 되기 때문에 시간이 지나면 어긋난다. 생성 경로가 값을 박아 두는 게 맞다.
--
-- 토큰은 mall_channel_credential.channel / supplier_product.supplier 와 같은 이름을 쓴다.
--   MALL             = 관리자가 이 몰에서 직접 등록(기본값). 일괄 등록·파생상품·샘플 포함.
--   DOMEGGOOK/DOMEME = 도매꾹·도매매 (services/sourcing/publishService)
--   ONCHANNEL        = 온채널 (어댑터 준비됨)
--   NAVER_SMARTSTORE = 네이버 스마트스토어에서 **가져온** 상품.
--                      ⚠ 우리 몰 상품을 네이버에 **발행**한 것과 혼동하지 말 것.
--                      발행은 channel_product_mapping 이 관리하며, 발행해도 출처는 그대로다.
--                      (스토어 상품 가져오기 /admin/sourcing/channel-import 는 아직 미구현)

-- ---------------------------------------------------------------------------
-- 1. products.source_channel 추가
--    기존 행은 전부 기본값 MALL 로 채워진 뒤, 아래 2번이 공급처 상품만 되돌린다.
--    collation 은 products 의 기본(utf8mb4_general_ci)을 따른다 — 이 컬럼은
--    다른 테이블과 JOIN 되지 않으므로 naver_category_id 같은 제약이 없다.
-- ---------------------------------------------------------------------------
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'source_channel'
);
SET @sql := IF(@col_exists = 0,
    "ALTER TABLE products
        ADD COLUMN source_channel ENUM('MALL','DOMEGGOOK','DOMEME','ONCHANNEL','NAVER_SMARTSTORE')
            NOT NULL DEFAULT 'MALL'
            COMMENT '상품 출처. MALL=관리자 직접 등록, 나머지는 외부 공급처/채널에서 가져옴'
            AFTER product_type",
    "SELECT '[skip] products.source_channel already exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 목록 필터(WHERE mall_id = ? AND source_channel = ?)용 인덱스.
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_mall_source'
);
SET @sql := IF(@idx_exists = 0,
    "ALTER TABLE products ADD KEY idx_products_mall_source (mall_id, source_channel)",
    "SELECT '[skip] idx_products_mall_source already exists'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2. 기존 상품 백필 — 이미 발행된 공급처 상품을 되찾는다.
--    publishService 가 products.product_code 에 supplier_item_no 를 넣어 왔으므로 그것으로 잇는다.
--    (앞으로는 publishService 가 source_channel 을 직접 쓰므로 이 유도는 이번 한 번뿐이다.)
--
--    ⚠ collation 이 다르다 — supplier_product 는 utf8mb4_unicode_ci, products 는 general_ci.
--      명시하지 않으면 'Illegal mix of collations' 로 실패한다.
--
--    신규 몰에서는 두 테이블이 모두 비어 0행 갱신 — 아무 부작용 없다.
-- ---------------------------------------------------------------------------
UPDATE products p
  JOIN supplier_product sp
    ON sp.mall_id = p.mall_id
   AND sp.supplier_item_no COLLATE utf8mb4_general_ci = p.product_code
   SET p.source_channel = sp.supplier
 WHERE p.source_channel = 'MALL'
   AND p.product_code IS NOT NULL
   AND p.product_code <> '';

-- 결과 확인용.
SELECT source_channel, COUNT(*) AS cnt FROM products GROUP BY source_channel;
