
-- =============================================================================
-- 관리자: 관리자 로그인 계정 (bcrypt 비밀번호, 이중인증 지원)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `admins` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '관리자 ID (PK)',
  `username` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '관리자 로그인 아이디',
  `email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '운영자 이메일 (이중인증용)',
  `use_2fa` tinyint(1) NOT NULL DEFAULT '1' COMMENT '이중인증 사용 여부 (1=사용, 0=미사용)',
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'bcrypt 암호화 비밀번호',
  `role` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'admin' COMMENT '권한 역할 (admin 등)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `username_2` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='관리자 계정 정보';


-- =============================================================================
-- 관리자: 관리자 사이드바 메뉴 (계층 구조, 역할별 노출)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `admin_menus` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '메뉴 ID (PK)',
  `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '메뉴명',
  `path` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '클릭 시 이동 URL (예: /admin/products). NULL = 그룹 행(링크 없음)',
  `icon_class` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '아이콘 클래스 (Bootstrap Icons 등)',
  `display_order` int NOT NULL DEFAULT '0' COMMENT '표시 순서 (그룹 내 오름차순)',
  `parent_id` int DEFAULT NULL COMMENT '부모 그룹 ID (NULL이면 최상위). 적용: scripts/migrate_admin_menu_groups.js',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '활성 여부',
  `visible_roles` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '표시할 관리자 역할 목록 (콤마구분: super_admin,admin 등, NULL=전체)',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_admin_menus_parent` (`parent_id`) USING BTREE,
  CONSTRAINT `fk_admin_menus_parent` FOREIGN KEY (`parent_id`) REFERENCES `admin_menus` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='관리자 사이드바 메뉴 관리';


-- =============================================================================
-- 관리자: 로그인 이중인증(2FA) 인증 코드 (유효기간 5분)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `admin_verification_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int NOT NULL,
  `code` varchar(6) COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_verification_admin_expires` (`admin_id`,`expires_at`),
  CONSTRAINT `fk_admin_verification_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='관리자 로그인 이중인증 코드 (유효기간 5분)';


-- =============================================================================
-- 배너: 메인/카테고리/팝업 배너 (이미지, 링크, 노출 기간)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `banners` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '배너 ID (PK)',
  `mall_id` bigint NOT NULL DEFAULT '1' COMMENT '몰 ID(멀티몰 스코프). 적용: scripts/migrations/20260720_banners_mall_scope.sql',
  `banner_type` enum('MAIN','CATEGORY','POPUP','BRAND') COLLATE utf8mb4_general_ci DEFAULT 'MAIN' COMMENT '배너 타입 (메인/카테고리/팝업/브랜드)',
  `group_key` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배너 그룹 키(promotion_banner 등 섹션 데이터소스). 적용: scripts/migrate_banner_group_key.js',
  `category_id` int DEFAULT NULL COMMENT '카테고리 ID (CATEGORY 타입일 경우)',
  `title` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배너 제목(관리용)',
  `overlay_title` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배너 내 큰 제목(메인 슬라이더 이미지 배너 전용)',
  `overlay_subtitle` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배너 문구(줄바꿈 구분. 메인 슬라이더 최대 2줄 / 그 외 배너 최대 3줄)',
  `overlay_button_text` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배너 내 이동 버튼 문구(비면 버튼 미노출)',
  `overlay_button_color` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '버튼 배경색 #RRGGBB (글자색은 밝기로 자동)',
  `overlay_align` enum('LEFT','CENTER','RIGHT') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'LEFT' COMMENT '배너 내 문구 정렬',
  `image_url` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '배너 이미지 URL',
  `mobile_image_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '모바일 배너 이미지 URL (없으면 PC 이미지 사용)',
  `link_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '클릭 시 이동 URL (배너 내 버튼도 이 링크)',
  `display_order` int DEFAULT '0' COMMENT '정렬 순서',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '활성 여부',
  `start_date` date DEFAULT NULL COMMENT '노출 시작일',
  `end_date` date DEFAULT NULL COMMENT '노출 종료일',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `fk_banners_category` (`category_id`),
  KEY `idx_banners_mall_type` (`mall_id`,`banner_type`,`display_order`),
  CONSTRAINT `fk_banners_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='메인 및 카테고리 배너';


-- =============================================================================
-- 장바구니: 회원별 담긴 상품 및 수량
-- =============================================================================
CREATE TABLE IF NOT EXISTS `carts` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '장바구니 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `product_id` int NOT NULL COMMENT '상품 ID (FK)',
  `quantity` int DEFAULT '1' COMMENT '수량',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '담은 시간',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `carts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `carts_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='장바구니';


-- =============================================================================
-- 카테고리: 상품 분류 (계층 구조, 일반/테마 타입)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `categories` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '카테고리 ID (PK)',
  `mall_id` bigint NOT NULL DEFAULT '1' COMMENT '소유 몰. 0=전 몰 공용(NORMAL/BRAND). THEME/OUTLET 만 몰별',
  `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '카테고리명',
  `slug` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'URL 슬러그',
  `display_order` int DEFAULT '0' COMMENT '노출 순서',
  `parent_id` int DEFAULT NULL COMMENT '상위 카테고리 ID (Self FK)',
  `depth` int NOT NULL DEFAULT '1' COMMENT '계층 뎁스(1~3, 최상위=1). 앱 레이어에서 최대 3 강제',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '노출 여부',
  `pc_visible` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'PC 노출',
  `mobile_visible` tinyint(1) NOT NULL DEFAULT '1' COMMENT '모바일 노출',
  `type` enum('NORMAL','THEME','BRAND','OUTLET') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'NORMAL' COMMENT '카테고리 타입 (일반/테마/브랜드/아울렛 — 뎁스가 아닌 병렬 분류축)',
  `origin` enum('naver','user') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'user' COMMENT '출처 — naver:네이버 표준시드 / user:사용자·상품등록 생성 (네이버 기반 재구성)',
  `logo_image_path` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '브랜드 로고 이미지 경로',
  `onboarded_at` date DEFAULT NULL COMMENT '브랜드 입점일 (type=BRAND 에서만 의미. 신규 입점 브랜드 판정 기준)',
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '카테고리/브랜드 설명',
  `shopify_collection_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Shopify 컬렉션 ID (연동용)',
  -- ⚠ collation 은 naver_category 계열(utf8mb4_unicode_ci)과 반드시 같아야 한다.
  --   다르면 JOIN 시 ERROR 1267 Illegal mix of collations 가 난다.
  --   설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §1.5 D-1
  `naver_category_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '대응 네이버 카테고리 ID (origin=naver 일 때. products.naver_category_id 와 축 다름)',
  PRIMARY KEY (`id`),
  KEY `parent_id` (`parent_id`),
  KEY `idx_shopify_col_id` (`shopify_collection_id`),
  KEY `idx_categories_onboarded` (`mall_id`,`type`,`onboarded_at`),
  KEY `idx_categories_naver` (`naver_category_id`),
  KEY `idx_categories_origin` (`type`,`origin`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 카테고리 (계층 구조 지원, 최대 3뎁스)';


-- =============================================================================
-- 문의: 1:1 고객 문의 및 관리자 답변
-- =============================================================================
CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '문의 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `mall_id` bigint NOT NULL DEFAULT '1' COMMENT '몰 ID (조회 필터용)',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '문의 제목',
  `content` text COLLATE utf8mb4_general_ci NOT NULL COMMENT '문의 내용',
  `answer` text COLLATE utf8mb4_general_ci COMMENT '관리자 답변',
  `is_answered` tinyint(1) DEFAULT '0' COMMENT '답변 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_inquiries_mall` (`mall_id`,`created_at`),
  CONSTRAINT `inquiries_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='1:1 문의';


-- =============================================================================
-- 찜: 회원별 위시리스트 (상품 찜하기)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `likes` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '찜 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `product_id` int NOT NULL COMMENT '상품 ID (FK)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '찜 등록 시간',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_like` (`user_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `likes_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='찜 / 위시리스트';


-- =============================================================================
-- 공지: 공지사항 (중요도, 조회수)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `notices` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '공지 ID (PK)',
  `mall_id` bigint NOT NULL DEFAULT '1' COMMENT '소속 몰 (몰마다 공지가 따로다)',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '공지 제목',
  `content` text COLLATE utf8mb4_general_ci NOT NULL COMMENT '공지 내용',
  `importance` int DEFAULT '0' COMMENT '중요도 (0:일반,1:중요)',
  `type` varchar(50) DEFAULT 'NOTICE' COMMENT '공지 타입',
  `view_count` int DEFAULT '0' COMMENT '조회수',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  PRIMARY KEY (`id`),
  KEY `idx_notices_mall_type` (`mall_id`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공지사항';


-- =============================================================================
-- 주문: 주문 정보 (토스페이먼츠 연동, 회원/비회원 주문)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '주문 ID (PK)',
  `user_id` int DEFAULT NULL COMMENT '사용자 ID (FK, 비회원 주문 시 NULL)',
  `mall_id` bigint DEFAULT NULL COMMENT '주문 발생 몰 ID (mall.id). 주문 시점의 req.mallId 기록. 과거 주문은 NULL 가능',
  `order_number` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '주문 번호',
  `status` enum('PENDING','PAID','PREPARING','SHIPPED','DELIVERED','CANCELLED','REFUNDED') COLLATE utf8mb4_general_ci DEFAULT 'PENDING' COMMENT '주문 상태',
  `subtotal_amount` int DEFAULT NULL COMMENT '쿠폰/포인트 적용 전 상품 총액',
  `total_amount` int NOT NULL COMMENT '최종 결제 금액',
  `coupon_discount` int NOT NULL DEFAULT '0' COMMENT '쿠폰 할인액',
  `point_used` int NOT NULL DEFAULT '0' COMMENT '사용 포인트',
  `user_coupon_id` int DEFAULT NULL COMMENT '사용한 user_coupons.id',
  `receiver_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '수령인 이름',
  `receiver_phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '수령인 연락처',
  `receiver_zipcode` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '수령인 우편번호',
  `receiver_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '수령인 기본주소',
  `receiver_detailed_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '수령인 상세주소',
  `shipping_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배송지 주소',
  `shipping_message` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배송 메시지',
  `buyer_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '주문자명 (비회원)',
  `buyer_email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '주문자 이메일 (비회원)',
  `buyer_phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '주문자 연락처 (비회원)',
  `payment_method` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '결제 수단',
  `payment_key` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '토스페이먼츠 결제키',
  `paid_at` timestamp NULL DEFAULT NULL COMMENT '결제일시',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '주문일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `orders_ibfk_1` (`user_id`),
  KEY `idx_orders_mall` (`mall_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='주문 정보';


-- =============================================================================
-- 주문: 주문별 상품 스냅샷 (주문 시점 상품명/가격 저장)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '주문 상품 ID (PK)',
  `order_id` int NOT NULL COMMENT '주문 ID (FK)',
  `product_id` int DEFAULT NULL COMMENT '상품 ID (삭제 대비)',
  `product_name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '주문 시점 상품명',
  `product_price` int NOT NULL COMMENT '주문 시점 상품 가격',
  `quantity` int NOT NULL COMMENT '수량',
  `total_price` int NOT NULL COMMENT '총 가격',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='주문 상품 스냅샷 정보';


-- =============================================================================
-- 약관: 이용약관/개인정보처리방침 버전 관리 (시행일, 활성 버전)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `policy_versions` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '약관 버전 ID (PK)',
  `type` enum('TERMS','PRIVACY') COLLATE utf8mb4_general_ci NOT NULL COMMENT '약관 종류 (이용약관/개인정보)',
  `version` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '버전 명 (예: 1.0, 2023-10-01 개정)',
  `content` mediumtext COLLATE utf8mb4_general_ci NOT NULL COMMENT '약관 내용',
  `is_active` tinyint(1) DEFAULT '0' COMMENT '활성화 여부 (현재 시행중)',
  `effective_date` date NOT NULL COMMENT '시행일',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `type_active` (`type`,`is_active`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- =============================================================================
-- 상품: 상품 기본 정보 (가격, 재고, 상태, AI 추천, SEO 슬러그)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '상품 ID (PK)',
  `mall_id` bigint NOT NULL DEFAULT '1' COMMENT '몰 ID(멀티몰)',
  `category_id` int DEFAULT NULL COMMENT '카테고리 ID (FK, type=NORMAL)',
  `brand_category_id` int DEFAULT NULL COMMENT '브랜드 카테고리 ID (FK, type=BRAND)',
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '상품명',
  `product_code` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '상품코드 (관리자 입력)',
  `provider` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '공급 업체',
  `description` text COLLATE utf8mb4_general_ci COMMENT '상품 상세 설명',
  `short_description` text COLLATE utf8mb4_general_ci COMMENT '상품 기본 설명 (3-4줄 요약)',
  `meta_description` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'SEO meta description',
  `main_image` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '대표 이미지 URL',
  `thumbnail_image` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `video_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '동영상 URL (파일 또는 유튜브)',
  `video_type` enum('FILE','YOUTUBE') COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '동영상 타입',
  `purchase_price` int DEFAULT '0' COMMENT '매입가',
  `original_price` int DEFAULT '0' COMMENT '정가',
  `price` int NOT NULL COMMENT '판매가',
  `tax_type` enum('TAXABLE','TAX_FREE','ZERO_RATED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'TAXABLE' COMMENT '과세구분 — 세금계산서 서식과 공급가 분해를 가른다 (설계 §4.7)',
  `discount_rate` int DEFAULT '0' COMMENT '할인율 (%)',
  `stock` int DEFAULT '0' COMMENT '재고 수량',
  `status` enum('ON','OFF','SOLD_OUT','COMING_SOON','RESTOCK') COLLATE utf8mb4_general_ci DEFAULT 'ON' COMMENT '판매 상태',
  `sale_start_date` date DEFAULT NULL COMMENT '판매 시작일 (신상품 판정 기준. NULL = 미지정 → 신상품 아님)',
  `visibility` enum('PUBLIC','HIDDEN','MEMBER_ONLY') COLLATE utf8mb4_general_ci DEFAULT 'PUBLIC' COMMENT '노출 범위',
  `view_count` int DEFAULT '0' COMMENT '조회수',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시(DB 적재 시각. 판매 시작일과 다르다)',
  `theme_category_id` int DEFAULT NULL COMMENT '[DEPRECATED] 테마 카테고리 ID — 전량 NULL, THEME 축 폐기됨',
  `is_ai_recommendation` tinyint(1) DEFAULT '0' COMMENT 'AI 추천 사용 여부',
  `ai_recommendation_content` text COLLATE utf8mb4_general_ci COMMENT 'AI 추천 내용',
  `slug` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'SEO URL 슬러그 (예: greenherb-lutein-plus 또는 마그네슘-l-테아닌-120정)',
  `distribution_badge` enum('ONLINE_ONLY','OFFLINE_ONLY') COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '유통채널 구분 뱃지',
  `product_badge` set('BEST','NEW','RECOMMEND','DEADLINE_SALE','GREENHUB_SPECIAL') COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '상품구분 뱃지(다중). NEW = 기간 무관 신상품 강제 노출',
  `badge_expire_date` date DEFAULT NULL COMMENT '뱃지 만료일 (DEADLINE_SALE 용)',
  -- ⚠ collation 은 naver_category / naver_brand 와 반드시 같아야 한다(§1.5 D-1).
  `naver_category_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '등록 근거 네이버 카테고리 ID(참조)',
  `naver_brand_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '등록 근거 네이버 브랜드 ID(참조)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_products_slug` (`slug`),
  KEY `category_id` (`category_id`),
  KEY `products_ibfk_2` (`theme_category_id`),
  KEY `idx_products_brand_category` (`brand_category_id`),
  KEY `idx_products_product_code` (`product_code`),
  KEY `idx_products_mall` (`mall_id`),
  KEY `idx_products_sale_start` (`mall_id`,`sale_start_date`),
  CONSTRAINT `fk_products_brand_category` FOREIGN KEY (`brand_category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_ibfk_2` FOREIGN KEY (`theme_category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 기본 정보';


-- =============================================================================
-- 상품: 상품별 상세 이미지 (다중 이미지, 정렬 순서)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `product_images` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '이미지 ID (PK)',
  `product_id` int NOT NULL COMMENT '상품 ID (FK)',
  `image_url` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '이미지 URL',
  `display_order` int DEFAULT '0' COMMENT '정렬 순서',
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_images_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 상세 이미지';


-- =============================================================================
-- 상품: 상품-테마 카테고리 다대다 연결 (한 상품이 여러 테마에 노출)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `product_themes` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'ID (PK)',
  `product_id` int NOT NULL COMMENT '상품 ID (FK)',
  `category_id` int NOT NULL COMMENT '테마 카테고리 ID (FK)',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_product_theme` (`product_id`,`category_id`) USING BTREE,
  KEY `fk_product_themes_category` (`category_id`),
  CONSTRAINT `fk_product_themes_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_product_themes_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품과 테마 카테고리 연결 테이블';


-- =============================================================================
-- 리뷰: 상품 리뷰 (평점 1~5, 회원 작성)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '리뷰 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `product_id` int NOT NULL COMMENT '상품 ID (FK)',
  `rating` int DEFAULT NULL COMMENT '평점 (1~5)',
  `content` text COLLATE utf8mb4_general_ci COMMENT '리뷰 내용',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 리뷰';


-- =============================================================================
-- 검색: 상품 검색 로그 (검색어, 결과 수, 비회원 검색 포함)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `search_logs` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '검색 로그 ID (PK)',
  `user_id` int DEFAULT NULL COMMENT '검색한 사용자 ID (FK, 비회원 NULL)',
  `keyword` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '검색어',
  `result_count` int NOT NULL DEFAULT '0' COMMENT '검색 결과 상품 개수',
  `created_at` timestamp NULL DEFAULT (now()) COMMENT '검색 일시',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_search_logs_user` (`user_id`) USING BTREE,
  KEY `idx_search_logs_created` (`created_at`) USING BTREE,
  CONSTRAINT `fk_search_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 검색 로그';


-- =============================================================================
-- 배송: 주문별 배송 정보 (운송장, 택배사, 배송 상태)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `shipments` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '배송 ID (PK)',
  `order_id` int NOT NULL COMMENT '주문 ID (FK)',
  `tracking_number` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '운송장 번호',
  `courier_company` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '택배사',
  `status` enum('READY','IN_TRANSIT','DELIVERED') COLLATE utf8mb4_general_ci DEFAULT 'READY' COMMENT '배송 상태',
  `shipped_at` timestamp NULL DEFAULT NULL COMMENT '출고일시',
  `delivered_at` timestamp NULL DEFAULT NULL COMMENT '배송완료일시',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `shipments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='배송 정보';


-- =============================================================================
-- 설정: 사이트 기본 설정 (회사 정보, SNS, 약관 - 단일 Row)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `site_settings` (
  `id` int NOT NULL DEFAULT '1' COMMENT '고정 ID (1)',
  `company_name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '회사명(상호)',
  `ceo_name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '대표자 성명 (전자상거래법 표시사항)',
  `logo_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '로고 URL',
  `favicon_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '파비콘 URL',
  `business_number` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사업자 등록번호',
  `mail_order_number` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '통신판매업 신고번호 (전자상거래법 표시사항)',
  `address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '주소(사업장 소재지)',
  `contact_email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '대표 이메일',
  `contact_phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '고객센터 전화번호',
  `cs_hours` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '고객센터 상담시간 안내(멀티라인)',
  `privacy_officer_name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '개인정보 보호책임자 성명 (개인정보보호법)',
  `privacy_officer_email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '개인정보 보호책임자 이메일 (개인정보보호법)',
  `header_slogan` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '헤더 슬로건',
  `slogan` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '회사 슬로건',
  `company_intro` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '회사 소개 문구',
  `instagram_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '인스타그램 링크 사용 여부',
  `instagram_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '인스타그램 URL',
  `facebook_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '페이스북 링크 사용 여부',
  `facebook_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '페이스북 URL',
  `youtube_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '유튜브 링크 사용 여부',
  `youtube_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '유튜브 URL',
  `kakao_channel_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '카카오채널 링크 사용 여부',
  `kakao_channel_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '카카오채널 URL',
  `kakao_share_image_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '카카오/OG 기본 공유 이미지 URL',
  `terms_of_service` mediumtext COLLATE utf8mb4_general_ci COMMENT '이용약관',
  `privacy_policy` mediumtext COLLATE utf8mb4_general_ci COMMENT '개인정보 처리방침',
  `brand_main_color` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#76A764' COMMENT '브랜드 기본 색상',
  `brand_dark_color` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#5A824B' COMMENT '브랜드 진한 색상',
  `brand_light_color` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#F0F7EE' COMMENT '브랜드 연한 배경색',
  `ga4_measurement_id` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Google Analytics 4 측정 ID (예: G-XXXXXXXXXX)',
  `marquee_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '에디토리얼 히어로 하단 흐름문구(마퀴) 표시 여부',
  `marquee_text` text COLLATE utf8mb4_general_ci COMMENT '마퀴 문구(줄바꿈으로 항목 구분). NULL/빈값이면 코드 기본값',
  `marquee_speed` smallint NOT NULL DEFAULT '28' COMMENT '마퀴 흐름 속도(초, 5~120)',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`),
  CONSTRAINT `site_settings_chk_1` CHECK ((`id` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='사이트 기본 설정 (단일 Row)';


-- =============================================================================
-- 설정: 전역 시스템/외부 연동 설정 (OpenAI, OAuth, SMTP, 토스페이먼츠 등)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '설정 ID (PK)',
  `setting_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '설정 키 (예: openai_api_key)',
  `setting_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '설정 값',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '설명',
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_system_settings_key` (`setting_key`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='전역 시스템/외부 연동 설정';


-- =============================================================================
-- 회원: 사용자 정보 (Google/Kakao OAuth 로그인, 약관 동의)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '사용자 ID (PK)',
  `google_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '구글 OAuth 고유 ID',
  `kakao_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '카카오 OAuth 고유 ID',
  `naver_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '네이버 OAuth 고유 ID',
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '자체 가입 비밀번호 해시 (bcrypt). 소셜 전용 계정은 NULL',
  `signup_provider` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '최초 가입 경로 (LOCAL/GOOGLE/KAKAO/NAVER)',
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '이메일 주소 (고유값)',
  `name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사용자 이름',
  `picture` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '프로필 이미지 URL',
  `marketing_agreed` tinyint(1) DEFAULT '0' COMMENT '마케팅 수신 동의 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '가입일시',
  `last_login` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '마지막 로그인 일시',
  `agreed_terms_id` int DEFAULT NULL COMMENT '동의한 이용약관 버전 ID (FK)',
  `agreed_privacy_id` int DEFAULT NULL COMMENT '동의한 개인정보방침 버전 ID (FK)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '계정 활성 여부 (1=활성,0=비활성)',
  `withdraw_reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '탈퇴 사유',
  `withdrawn_at` timestamp NULL DEFAULT NULL COMMENT '탈퇴 일시',
  `birthdate` date DEFAULT NULL COMMENT '생년월일',
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '전화번호',
  `address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '기본 주소',
  `detailed_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '상세 주소',
  `zipcode` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '우편번호',
  `receiver_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '기본 배송지 수령인명',
  `phone_sub` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '보조 연락처',
  `delivery_request` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '기본 배송 요청사항',
  `points_balance` int NOT NULL DEFAULT '0' COMMENT '보유 포인트',
  `gender` varchar(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'UNKNOWN' COMMENT 'M/F/UNKNOWN',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `kakao_id` (`kakao_id`),
  UNIQUE KEY `naver_id` (`naver_id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `fk_users_agreed_terms` (`agreed_terms_id`),
  KEY `fk_users_agreed_privacy` (`agreed_privacy_id`),
  CONSTRAINT `fk_users_agreed_privacy` FOREIGN KEY (`agreed_privacy_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_agreed_terms` FOREIGN KEY (`agreed_terms_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 사용자 정보 (자체 가입 + Google/Kakao/Naver 소셜 로그인)';


-- =============================================================================
-- 회원: 약관/개인정보 동의 이력 (버전별 동의 기록)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `user_policy_agreements` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '동의 이력 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `policy_version_id` int NOT NULL COMMENT '약관/개인정보 버전 ID (FK)',
  `agreed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '동의 일시',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_user_policy_version` (`user_id`,`policy_version_id`) USING BTREE,
  KEY `idx_user_policy_user` (`user_id`) USING BTREE,
  KEY `idx_user_policy_version` (`policy_version_id`) USING BTREE,
  CONSTRAINT `fk_user_policy_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_policy_version` FOREIGN KEY (`policy_version_id`) REFERENCES `policy_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원별 약관/개인정보 동의 이력';


-- =============================================================================
-- 방문자: 사이트 방문 로그 (IP, User-Agent, 방문 일시)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `visitor_logs` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '로그 ID (PK)',
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci NOT NULL COMMENT '방문자 IP 주소',
  `user_agent` text COLLATE utf8mb4_general_ci COMMENT '브라우저 정보',
  `visited_date` date NOT NULL COMMENT '방문 날짜 (YYYY-MM-DD)',
  `visited_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '방문 일시',
  `is_new` tinyint(1) NOT NULL DEFAULT 0 COMMENT '신규(1) vs 재방문(0)',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `visited_date` (`visited_date`) USING BTREE,
  KEY `ip_address` (`ip_address`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- =============================================================================
-- 페이지뷰: 모든 사용자 페이지 요청 로그 (PV, 체류시간, 유입경로)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `page_views` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'express session ID',
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci NOT NULL,
  `page_url` varchar(512) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'req.originalUrl',
  `referer` varchar(1024) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Referer 헤더 전체',
  `referer_host` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'referer에서 파싱한 호스트명',
  `device_type` enum('desktop','mobile','tablet') COLLATE utf8mb4_general_ci DEFAULT 'desktop',
  `user_agent` text COLLATE utf8mb4_general_ci,
  `duration` int DEFAULT NULL COMMENT '체류시간(초), 비콘으로 갱신',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pv_created` (`created_at`),
  KEY `idx_pv_session` (`session_id`),
  KEY `idx_pv_page_url` (`page_url`(191)),
  KEY `idx_pv_referer_host` (`referer_host`(100)),
  KEY `idx_pv_device` (`device_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='페이지뷰 로그';


-- =============================================================================
-- 카카오톡 문의: 상품 상세 카카오톡 문의 버튼 클릭 로그
-- =============================================================================
CREATE TABLE IF NOT EXISTS `kakao_click_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL COMMENT '클릭한 상품 ID (FK)',
  `user_id` int DEFAULT NULL COMMENT '로그인 사용자 ID (비회원 NULL)',
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kakao_product` (`product_id`),
  KEY `idx_kakao_created` (`created_at`),
  CONSTRAINT `fk_kakao_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='카카오톡 문의 버튼 클릭 로그';


-- =============================================================================
-- 쿠폰: 쿠폰 마스터 (할인 금액, 유효기간, 타입)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '쿠폰 ID (PK)',
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '쿠폰명',
  `code` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '쿠폰 코드 (SPECIAL 타입용, NULL이면 자동지급형)',
  `coupon_type` enum('NEW_SIGNUP','EVENT','SEASON','SPECIAL') COLLATE utf8mb4_general_ci NOT NULL COMMENT '쿠폰 타입',
  `discount_amount` int NOT NULL COMMENT '할인 금액 (원)',
  `min_order_amount` int NOT NULL DEFAULT '0' COMMENT '최소 주문 금액',
  `valid_from` datetime NOT NULL COMMENT '유효 시작일',
  `valid_to` datetime NOT NULL COMMENT '유효 종료일',
  `max_total_uses` int DEFAULT NULL COMMENT '총 발급/사용 한도 (NULL=무제한)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '활성 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쿠폰 마스터';


-- =============================================================================
-- 쿠폰: 사용자별 보유 쿠폰
-- =============================================================================
CREATE TABLE IF NOT EXISTS `user_coupons` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `coupon_id` int NOT NULL COMMENT '쿠폰 ID (FK)',
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '지급일시',
  `used_at` timestamp NULL DEFAULT NULL COMMENT '사용일시 (미사용 시 NULL)',
  `order_id` int DEFAULT NULL COMMENT '사용한 주문 ID (FK)',
  `issued_by` enum('AUTO','ADMIN','CODE') COLLATE utf8mb4_general_ci NOT NULL COMMENT '지급 유형',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `idx_user_coupons_user` (`user_id`),
  KEY `idx_user_coupons_coupon` (`coupon_id`),
  KEY `idx_user_coupons_order` (`order_id`),
  CONSTRAINT `fk_user_coupons_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_coupons_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_coupons_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='사용자별 보유 쿠폰';


-- =============================================================================
-- 포인트: 포인트 거래 이력
-- =============================================================================
CREATE TABLE IF NOT EXISTS `point_transactions` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `amount` int NOT NULL COMMENT '+/- 포인트 (적립 +, 사용/차감 -)',
  `transaction_type` enum('PURCHASE_ACCUMULATE','PURCHASE_USE','ADMIN_GRANT','ADMIN_DEDUCT') COLLATE utf8mb4_general_ci NOT NULL COMMENT '거래 유형',
  `order_id` int DEFAULT NULL COMMENT '주문 연관 시 (FK)',
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사유/메모',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `idx_point_transactions_user` (`user_id`),
  KEY `idx_point_transactions_order` (`order_id`),
  `brand_main_color` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#76A764' COMMENT '브랜드 기본 색상',
  `brand_dark_color` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#5A824B' COMMENT '브랜드 진한 색상',
  `brand_light_color` varchar(7) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '#F0F7EE' COMMENT '브랜드 연한 배경색',
  `ga4_measurement_id` varchar(32) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Google Analytics 4 측정 ID (예: G-XXXXXXXXXX)',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`),
  CONSTRAINT `site_settings_chk_1` CHECK ((`id` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='사이트 기본 설정 (단일 Row)';


-- =============================================================================
-- 설정: 전역 시스템/외부 연동 설정 (OpenAI, OAuth, SMTP, 토스페이먼츠 등)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '설정 ID (PK)',
  `setting_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '설정 키 (예: openai_api_key)',
  `setting_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '설정 값',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '설명',
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_system_settings_key` (`setting_key`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='전역 시스템/외부 연동 설정';


-- =============================================================================
-- 회원: 사용자 정보 (Google/Kakao OAuth 로그인, 약관 동의)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '사용자 ID (PK)',
  `google_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '구글 OAuth 고유 ID',
  `kakao_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '카카오 OAuth 고유 ID',
  `naver_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '네이버 OAuth 고유 ID',
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '자체 가입 비밀번호 해시 (bcrypt). 소셜 전용 계정은 NULL',
  `signup_provider` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '최초 가입 경로 (LOCAL/GOOGLE/KAKAO/NAVER)',
  `email` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '이메일 주소 (고유값)',
  `name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사용자 이름',
  `picture` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '프로필 이미지 URL',
  `marketing_agreed` tinyint(1) DEFAULT '0' COMMENT '마케팅 수신 동의 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '가입일시',
  `last_login` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '마지막 로그인 일시',
  `agreed_terms_id` int DEFAULT NULL COMMENT '동의한 이용약관 버전 ID (FK)',
  `agreed_privacy_id` int DEFAULT NULL COMMENT '동의한 개인정보방침 버전 ID (FK)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '계정 활성 여부 (1=활성,0=비활성)',
  `withdraw_reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '탈퇴 사유',
  `withdrawn_at` timestamp NULL DEFAULT NULL COMMENT '탈퇴 일시',
  `birthdate` date DEFAULT NULL COMMENT '생년월일',
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '전화번호',
  `address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '기본 주소',
  `detailed_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '상세 주소',
  `zipcode` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '우편번호',
  `receiver_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '기본 배송지 수령인명',
  `phone_sub` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '보조 연락처',
  `delivery_request` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '기본 배송 요청사항',
  `points_balance` int NOT NULL DEFAULT '0' COMMENT '보유 포인트',
  `gender` varchar(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'UNKNOWN' COMMENT 'M/F/UNKNOWN',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `kakao_id` (`kakao_id`),
  UNIQUE KEY `naver_id` (`naver_id`),
  UNIQUE KEY `phone` (`phone`),
  KEY `fk_users_agreed_terms` (`agreed_terms_id`),
  KEY `fk_users_agreed_privacy` (`agreed_privacy_id`),
  CONSTRAINT `fk_users_agreed_privacy` FOREIGN KEY (`agreed_privacy_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_agreed_terms` FOREIGN KEY (`agreed_terms_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 사용자 정보 (자체 가입 + Google/Kakao/Naver 소셜 로그인)';


-- =============================================================================
-- 회원: 약관/개인정보 동의 이력 (버전별 동의 기록)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `user_policy_agreements` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '동의 이력 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `policy_version_id` int NOT NULL COMMENT '약관/개인정보 버전 ID (FK)',
  `agreed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '동의 일시',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_user_policy_version` (`user_id`,`policy_version_id`) USING BTREE,
  KEY `idx_user_policy_user` (`user_id`) USING BTREE,
  KEY `idx_user_policy_version` (`policy_version_id`) USING BTREE,
  CONSTRAINT `fk_user_policy_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_policy_version` FOREIGN KEY (`policy_version_id`) REFERENCES `policy_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원별 약관/개인정보 동의 이력';


-- =============================================================================
-- 방문자: 사이트 방문 로그 (IP, User-Agent, 방문 일시)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `visitor_logs` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '로그 ID (PK)',
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci NOT NULL COMMENT '방문자 IP 주소',
  `user_agent` text COLLATE utf8mb4_general_ci COMMENT '브라우저 정보',
  `visited_date` date NOT NULL COMMENT '방문 날짜 (YYYY-MM-DD)',
  `visited_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '방문 일시',
  `is_new` tinyint(1) NOT NULL DEFAULT 0 COMMENT '신규(1) vs 재방문(0)',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `visited_date` (`visited_date`) USING BTREE,
  KEY `ip_address` (`ip_address`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- =============================================================================
-- 페이지뷰: 모든 사용자 페이지 요청 로그 (PV, 체류시간, 유입경로)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `page_views` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'express session ID',
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci NOT NULL,
  `page_url` varchar(512) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'req.originalUrl',
  `referer` varchar(1024) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Referer 헤더 전체',
  `referer_host` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'referer에서 파싱한 호스트명',
  `device_type` enum('desktop','mobile','tablet') COLLATE utf8mb4_general_ci DEFAULT 'desktop',
  `user_agent` text COLLATE utf8mb4_general_ci,
  `duration` int DEFAULT NULL COMMENT '체류시간(초), 비콘으로 갱신',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pv_created` (`created_at`),
  KEY `idx_pv_session` (`session_id`),
  KEY `idx_pv_page_url` (`page_url`(191)),
  KEY `idx_pv_referer_host` (`referer_host`(100)),
  KEY `idx_pv_device` (`device_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='페이지뷰 로그';


-- =============================================================================
-- 카카오톡 문의: 상품 상세 카카오톡 문의 버튼 클릭 로그
-- =============================================================================
CREATE TABLE IF NOT EXISTS `kakao_click_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL COMMENT '클릭한 상품 ID (FK)',
  `user_id` int DEFAULT NULL COMMENT '로그인 사용자 ID (비회원 NULL)',
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kakao_product` (`product_id`),
  KEY `idx_kakao_created` (`created_at`),
  CONSTRAINT `fk_kakao_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='카카오톡 문의 버튼 클릭 로그';


-- =============================================================================
-- 쿠폰: 쿠폰 마스터 (할인 금액, 유효기간, 타입)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '쿠폰 ID (PK)',
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '쿠폰명',
  `code` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '쿠폰 코드 (SPECIAL 타입용, NULL이면 자동지급형)',
  `coupon_type` enum('NEW_SIGNUP','EVENT','SEASON','SPECIAL') COLLATE utf8mb4_general_ci NOT NULL COMMENT '쿠폰 타입',
  `discount_amount` int NOT NULL COMMENT '할인 금액 (원)',
  `min_order_amount` int NOT NULL DEFAULT '0' COMMENT '최소 주문 금액',
  `valid_from` datetime NOT NULL COMMENT '유효 시작일',
  `valid_to` datetime NOT NULL COMMENT '유효 종료일',
  `max_total_uses` int DEFAULT NULL COMMENT '총 발급/사용 한도 (NULL=무제한)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '활성 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='쿠폰 마스터';


-- =============================================================================
-- 쿠폰: 사용자별 보유 쿠폰
-- =============================================================================
CREATE TABLE IF NOT EXISTS `user_coupons` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `coupon_id` int NOT NULL COMMENT '쿠폰 ID (FK)',
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '지급일시',
  `used_at` timestamp NULL DEFAULT NULL COMMENT '사용일시 (미사용 시 NULL)',
  `order_id` int DEFAULT NULL COMMENT '사용한 주문 ID (FK)',
  `issued_by` enum('AUTO','ADMIN','CODE') COLLATE utf8mb4_general_ci NOT NULL COMMENT '지급 유형',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `idx_user_coupons_user` (`user_id`),
  KEY `idx_user_coupons_coupon` (`coupon_id`),
  KEY `idx_user_coupons_order` (`order_id`),
  CONSTRAINT `fk_user_coupons_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_coupons_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_coupons_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='사용자별 보유 쿠폰';


-- =============================================================================
-- 포인트: 포인트 거래 이력
-- =============================================================================
CREATE TABLE IF NOT EXISTS `point_transactions` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `amount` int NOT NULL COMMENT '+/- 포인트 (적립 +, 사용/차감 -)',
  `transaction_type` enum('PURCHASE_ACCUMULATE','PURCHASE_USE','ADMIN_GRANT','ADMIN_DEDUCT') COLLATE utf8mb4_general_ci NOT NULL COMMENT '거래 유형',
  `order_id` int DEFAULT NULL COMMENT '주문 연관 시 (FK)',
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사유/메모',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `idx_point_transactions_user` (`user_id`),
  KEY `idx_point_transactions_order` (`order_id`),
  CONSTRAINT `fk_point_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_point_transactions_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='포인트 거래 이력';


-- =============================================================================
-- 히어로 상품 쇼케이스 (섹션 기반 빌더 — hero_variant='product_showcase')
--   각 슬라이드가 상품과 연결(연결형). slot=MAIN(중앙 슬라이더), FEATURE(우측 카드)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `hero_slide` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1 COMMENT '멀티몰 대비(현재 1 고정)',
  `slot` ENUM('MAIN','FEATURE') NOT NULL DEFAULT 'MAIN' COMMENT 'MAIN=중앙 슬라이더, FEATURE=우측 카드',
  `product_id` INT DEFAULT NULL COMMENT '연결 상품(FK products)',
  `label` VARCHAR(50) DEFAULT NULL COMMENT '수동 라벨 (예: [TV상품])',
  `headline` VARCHAR(200) DEFAULT NULL COMMENT '커스텀 헤드라인(없으면 상품명)',
  `image_url` VARCHAR(255) DEFAULT NULL COMMENT '프로모션/원형 이미지(없으면 상품 대표이미지)',
  `link_url` VARCHAR(500) DEFAULT NULL COMMENT '커스텀 링크(없으면 상품 상세)',
  `sort_order` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hero_mall_slot` (`mall_id`, `slot`, `sort_order`),
  KEY `fk_hero_product` (`product_id`),
  CONSTRAINT `fk_hero_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='히어로 상품 쇼케이스 슬라이드';

-- site_settings: 히어로 변형 토글 (full_banner | product_showcase)
-- ALTER TABLE `site_settings` ADD COLUMN `hero_variant` VARCHAR(30) NOT NULL DEFAULT 'full_banner'
--   COMMENT '히어로 변형: full_banner | product_showcase' AFTER `header_slogan`;


-- =============================================================================
-- 섹션 기반 페이지 빌더 (P1 렌더 엔진) — page / page_section / product_group(_item)
--   홈은 page(page_type='home')의 page_section을 sort_order대로 렌더(SDUI).
-- =============================================================================
CREATE TABLE IF NOT EXISTS `page` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `page_type` VARCHAR(50) NOT NULL COMMENT 'home / category / event / custom',
  `slug` VARCHAR(255) NULL,
  `title` VARCHAR(200) NULL,
  `layout_type` VARCHAR(100) DEFAULT 'main_basic',
  `status` VARCHAR(30) DEFAULT 'published' COMMENT 'draft / published',
  `published_at` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_page_mall_type` (`mall_id`, `page_type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='페이지(화면 단위)';

CREATE TABLE IF NOT EXISTS `page_section` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `page_id` BIGINT NOT NULL,
  `section_type` VARCHAR(100) NOT NULL COMMENT 'sectionRegistry 키',
  `position` VARCHAR(100) DEFAULT 'main_content',
  `title` VARCHAR(200) NULL,
  `sort_order` INT DEFAULT 0,
  `data_source_type` VARCHAR(100) NULL COMMENT 'product_group / banner_group / category',
  `data_source_id` BIGINT NULL,
  `config_json` JSON NULL,
  `visible_start_at` DATETIME NULL,
  `visible_end_at` DATETIME NULL,
  `visible_on_pc` TINYINT(1) DEFAULT 1,
  `visible_on_mobile` TINYINT(1) DEFAULT 1,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_section_page` (`page_id`, `sort_order`),
  CONSTRAINT `fk_section_page` FOREIGN KEY (`page_id`) REFERENCES `page` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='페이지 섹션(전시 블록 인스턴스)';

CREATE TABLE IF NOT EXISTS `product_group` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `name` VARCHAR(200) NOT NULL,
  `group_type` VARCHAR(50) DEFAULT 'manual' COMMENT 'manual / condition',
  `sort_type` VARCHAR(50) DEFAULT 'manual' COMMENT 'manual / newest / discount / price_asc / price_desc / views',
  `filter_condition_json` JSON NULL COMMENT '조건 자동형: badge/category_id/min_discount/in_stock',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='전시용 상품 그룹';

CREATE TABLE IF NOT EXISTS `product_group_item` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `product_group_id` BIGINT NOT NULL,
  `product_id` INT NOT NULL,
  `sort_order` INT DEFAULT 0,
  `is_fixed` TINYINT(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pgi_group` (`product_group_id`, `sort_order`),
  CONSTRAINT `fk_pgi_group` FOREIGN KEY (`product_group_id`) REFERENCES `product_group` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 그룹 아이템(수동 선택형)';

-- 페이지 발행 이력(P2 관리자 빌더): 발행 시점 섹션 구성 전체 스냅샷 + 롤백
CREATE TABLE IF NOT EXISTS `page_revision` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `page_id` BIGINT NOT NULL,
  `revision_no` INT NOT NULL,
  `snapshot_json` JSON NOT NULL,
  `status` VARCHAR(30) DEFAULT 'published',
  `created_by` VARCHAR(100) NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `published_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rev_page` (`page_id`, `revision_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='페이지 발행 이력(스냅샷/롤백)';

-- storefront_menu 는 M7에서 제거됨 (feature_menu/mall_feature_menu/custom_menu 가 대체).
-- 복구가 필요하면 scripts/backup_storefront_menu.sql 참조.


/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=IFNULL(@OLD_CHARACTER_SET_CLIENT,'utf8mb4') */;

/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;

-- =============================================================================
-- 통제된 동적 메뉴 아키텍처 (M1)
-- docs/사이트개선/frontend_dev_plan.md 반영
--   · 카테고리 = 동적 관리(최대 3뎁스)
--   · 일반 기능 메뉴 = 사전정의 카탈로그 + 몰별 ON/OFF (위치 고정)
--   · 커스텀 메뉴 = 위치 선택 가능, 슬롯 제한
--   · 시스템 메뉴 = 고정(노출 여부만)
-- 적용 스크립트: scripts/migrate_menu_architecture.js (멱등)
-- =============================================================================

-- 기능/시스템 메뉴 카탈로그. position 은 고정이며 운영자가 변경할 수 없다.
-- module_ready=0 이면 몰에서 켜더라도 렌더에서 제외한다(죽은 링크 방지).
CREATE TABLE IF NOT EXISTS `feature_menu` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `feature_code` varchar(50) NOT NULL COMMENT '기능 코드(고정 식별자)',
  `default_name` varchar(100) NOT NULL COMMENT '기본 메뉴명',
  `default_path` varchar(255) DEFAULT NULL COMMENT '표준 URL(운영자 변경 불가). null=클라이언트 동작',
  `position` varchar(30) NOT NULL COMMENT '고정 위치: gnb/right_rail/header_util/footer/mobile_quick',
  `required_module` varchar(50) DEFAULT NULL COMMENT '필요 기능 모듈',
  `module_ready` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=모듈 구현됨(렌더 허용)',
  `default_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '새 몰/신규 카탈로그 메뉴의 기본 ON/OFF. 몰별 행이 없을 때 백필이 이 값을 쓴다',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=시스템 메뉴(삭제 불가)',
  `is_required` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=항상 노출(끌 수 없음)',
  `default_sort_order` int NOT NULL DEFAULT '0',
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_feature_code` (`feature_code`),
  KEY `idx_feature_position` (`position`,`default_sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='기능/시스템 메뉴 카탈로그(위치 고정)';

-- 몰별 기능 메뉴 ON/OFF. 표시명·순서·노출조건만 관리(URL/위치는 불가).
CREATE TABLE IF NOT EXISTS `mall_feature_menu` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `feature_code` varchar(50) NOT NULL,
  `display_name` varchar(100) DEFAULT NULL COMMENT 'null이면 feature_menu.default_name 사용',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '같은 position 내 순서',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `pc_visible` tinyint(1) NOT NULL DEFAULT '1',
  `mobile_visible` tinyint(1) NOT NULL DEFAULT '1',
  `login_required` tinyint(1) NOT NULL DEFAULT '0',
  `badge_type` varchar(20) DEFAULT NULL COMMENT '강조 배지: NEW / HOT / SALE (없으면 미표시)',
  `visible_start_at` datetime DEFAULT NULL,
  `visible_end_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mall_feature` (`mall_id`,`feature_code`),
  CONSTRAINT `fk_mfm_feature` FOREIGN KEY (`feature_code`) REFERENCES `feature_menu` (`feature_code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 기능 메뉴 ON/OFF';

-- 몰별 커스텀 메뉴. 유일하게 위치(location)를 선택할 수 있으며 슬롯 수 제한을 받는다.
CREATE TABLE IF NOT EXISTS `custom_menu` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `display_name` varchar(100) NOT NULL,
  `link_type` varchar(30) NOT NULL DEFAULT 'INTERNAL_PAGE' COMMENT 'INTERNAL_PAGE / EXTERNAL_URL / CATEGORY / BRAND / EXHIBITION / PRODUCT_GROUP',
  `link_target` bigint DEFAULT NULL COMMENT '내부 리소스 id (CATEGORY/BRAND=categories.id 등)',
  `link_url` varchar(500) DEFAULT NULL COMMENT 'INTERNAL_PAGE/EXTERNAL_URL 일 때만 사용. 나머지는 link_target 으로 파생',
  `location` varchar(30) NOT NULL DEFAULT 'gnb',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `pc_visible` tinyint(1) NOT NULL DEFAULT '1',
  `mobile_visible` tinyint(1) NOT NULL DEFAULT '1',
  `login_required` tinyint(1) NOT NULL DEFAULT '0',
  `badge_type` varchar(20) DEFAULT NULL COMMENT '강조 배지: NEW / HOT / SALE',
  `new_window` tinyint(1) NOT NULL DEFAULT '0',
  `visible_start_at` datetime DEFAULT NULL,
  `visible_end_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_custom_mall_loc` (`mall_id`,`location`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 커스텀 메뉴(슬롯 제한)';

-- 몰별 내비게이션 정책(헤더 레이아웃, 카테고리 뎁스 상한, 커스텀 슬롯 수 등)
CREATE TABLE IF NOT EXISTS `navigation_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `header_layout_type` varchar(50) NOT NULL DEFAULT 'main_right_utility_v1',
  `nav_mode` varchar(20) NOT NULL DEFAULT 'split' COMMENT 'split=카테고리버튼+평면메뉴(대형) / unified=카테고리가 GNB로(소형)',
  `category_display_type` varchar(50) NOT NULL DEFAULT 'dropdown' COMMENT 'dropdown / mega',
  `max_gnb_items` int NOT NULL DEFAULT '8' COMMENT 'GNB 최대 노출 수(카테고리 버튼 제외)',
  `max_custom_items` int NOT NULL DEFAULT '3' COMMENT 'GNB 커스텀 메뉴 슬롯 수',
  `category_max_depth` int NOT NULL DEFAULT '3' COMMENT '카테고리 최대 뎁스(앱 레이어 강제)',
  `use_mega_menu` tinyint(1) NOT NULL DEFAULT '0',
  `use_search_bar` tinyint(1) NOT NULL DEFAULT '1',
  `config_json` json DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_navconfig_mall` (`mall_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 내비게이션 정책';

-- 찜한 브랜드 (우측 유틸 레일 RAIL_BRAND_WISHLIST)
CREATE TABLE IF NOT EXISTS `brand_likes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `category_id` int NOT NULL COMMENT 'categories.id (type=BRAND)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_brand_like` (`user_id`,`category_id`),
  KEY `idx_bl_user` (`user_id`),
  CONSTRAINT `fk_bl_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='찜한 브랜드';

-- =============================================================================
-- 고객센터 FAQ 모듈 (M8)
-- 적용 스크립트: scripts/migrate_faq.js (멱등)
-- answer 는 HTML — 저장/렌더 시 services/display/htmlSanitizer.js 로 새니타이즈한다.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `faq_category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `code` varchar(50) NOT NULL COMMENT '분류 코드(고정 식별자)',
  `name` varchar(100) NOT NULL COMMENT '분류명(운영자 변경 가능)',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_faq_category_code` (`mall_id`,`code`),
  KEY `idx_faq_category_sort` (`mall_id`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='FAQ 분류';

CREATE TABLE IF NOT EXISTS `faq` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `category_id` bigint DEFAULT NULL,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL COMMENT 'HTML. 저장/렌더 시 새니타이즈',
  `is_best` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=자주묻는질문 BEST 노출',
  `view_count` int NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_faq_category` (`mall_id`,`category_id`,`sort_order`),
  KEY `idx_faq_best` (`mall_id`,`is_best`,`view_count`),
  CONSTRAINT `fk_faq_category` FOREIGN KEY (`category_id`) REFERENCES `faq_category` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='FAQ';

-- =============================================================================
-- 테마 시스템 (P4)
-- 적용 스크립트: scripts/migrate_theme.js (멱등)
--
-- 경계: site_settings = 브랜드 색상/로고 (기존 유지)
--       theme.config_json = 버튼/카드 반경, 폰트, 카드 스타일 등 빌더 전용 스타일 토큰
-- 값은 CSS 에 직접 삽입되므로 services/theme/themeService.js 가 화이트리스트+정규식으로 검증한다.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `theme` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `name` varchar(100) NOT NULL DEFAULT '기본 테마',
  `config_json` json DEFAULT NULL COMMENT '스타일 토큰(버튼/카드 반경, 폰트, 카드 스타일 등)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_theme_mall_active` (`mall_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 테마(스타일 토큰)';

-- =============================================================================
-- 기획전 (Exhibition) 1차
-- 적용 스크립트: scripts/migrate_exhibition.sql
-- 설계: docs/사이트개선/exhibition_design_and_development.md §7
--
-- products.id 는 int 다. 이를 참조하는 exhibition_product.product_id 도 int 여야
-- FK 가 생성된다. exhibition.id 계열은 신세대 테이블 관례대로 bigint.
-- =============================================================================
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

-- ============================================================
-- 쇼핑특가 (docs/사이트개선/shopping_deal_design.md)
--
-- 특가는 어떤 테이블에도 가격을 write 하지 않는다. 읽는 시점에 활성 여부를 계산하고
-- 가격을 덮어쓰는 read-time 리졸버다(services/deal/dealService.js). 스케줄러가 없다.
-- ============================================================

CREATE TABLE deal_category (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  mall_id       INT NOT NULL DEFAULT 1,
  code          VARCHAR(40) NOT NULL COMMENT 'TODAY / TIME / SEASON — 관리자 입력',
  name          VARCHAR(60) NOT NULL,
  description   VARCHAR(200) NULL,
  schedule_type ENUM('PERIOD','TIME') NOT NULL DEFAULT 'PERIOD' COMMENT '관리자 폼 UX 용. 활성 판정은 deal 행의 실제 값만 본다',
  badge_text    VARCHAR(20) NULL,
  badge_color   VARCHAR(20) NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deal_category_code (mall_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='특가 카테고리 (오늘의특가/타임특가/시즌특가…)';

CREATE TABLE deal (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  mall_id          INT NOT NULL DEFAULT 1,
  deal_category_id INT NOT NULL,
  title            VARCHAR(100) NOT NULL,
  subtitle         VARCHAR(200) NULL,
  starts_at        DATETIME NOT NULL,
  ends_at          DATETIME NOT NULL,
  daily_start_time TIME NULL COMMENT '타임특가: 매일 반복 시작 시각. NULL 이면 기간 내 상시',
  daily_end_time   TIME NULL COMMENT '타임특가: 매일 반복 종료 시각. 자정 넘김 미지원(> start 강제)',
  weekdays         VARCHAR(20) NULL COMMENT "'1,5,6' (1=월 … 7=일). NULL = 매일",
  priority         INT NOT NULL DEFAULT 0 COMMENT '동일 상품 중복 특가 시 큰 값이 이긴다',
  sort_order       INT NOT NULL DEFAULT 0,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deal_category FOREIGN KEY (deal_category_id) REFERENCES deal_category (id) ON DELETE RESTRICT,
  KEY idx_deal_active (mall_id, is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='특가 캠페인';

CREATE TABLE deal_item (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  deal_id    INT NOT NULL,
  product_id INT NOT NULL,
  deal_price INT NOT NULL COMMENT '특가 판매가(원). 실제 결제 금액에 반영된다',
  qty_limit  INT NULL COMMENT '선착순 한정 수량. NULL = 무제한',
  sold_qty   INT NOT NULL DEFAULT 0 COMMENT '결제 확정 트랜잭션에서 원자적으로 증가',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deal_item (deal_id, product_id),
  CONSTRAINT fk_deal_item_deal    FOREIGN KEY (deal_id)    REFERENCES deal (id) ON DELETE CASCADE,
  CONSTRAINT fk_deal_item_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  KEY idx_deal_item_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='특가 대상 상품 + 특가가 + 선착순 수량';

-- ============================================================
-- 추천 그룹 (상품 추천관리) — /recommend 랜딩의 큐레이션 섹션
-- 그룹 1개 = 섹션 1개. name 이 섹션 제목, description 이 근거 문구.
-- ============================================================
CREATE TABLE IF NOT EXISTS recommend_group (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  mall_id     BIGINT       NOT NULL DEFAULT 1,
  name        VARCHAR(100) NOT NULL COMMENT '섹션 제목으로 그대로 노출된다',
  description VARCHAR(200) NULL     COMMENT '제목 아래 근거 문구(선택)',
  sort_order  INT          NOT NULL DEFAULT 0 COMMENT '추천 화면에서의 섹션 노출 순서',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rg_mall_active (mall_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='추천 그룹 — 관리자가 이름을 붙여 손으로 담는 큐레이션';

CREATE TABLE IF NOT EXISTS recommend_group_item (
  id                 BIGINT NOT NULL AUTO_INCREMENT,
  recommend_group_id BIGINT NOT NULL,
  product_id         INT    NOT NULL,
  sort_order         INT    NOT NULL DEFAULT 0,
  created_at         DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rgi_group_product (recommend_group_id, product_id),
  KEY idx_rgi_group_order (recommend_group_id, sort_order),
  CONSTRAINT fk_rgi_group FOREIGN KEY (recommend_group_id) REFERENCES recommend_group (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='추천 그룹에 담긴 상품 + 순서';

-- ---------------------------------------------------------------------------
-- 아울렛(Outlet) — 이월·리퍼브·전시·임박 등 '할인 사유'가 있는 상품의 상시 재고 소진 채널
-- 설계: docs/사이트개선/outlet_design_and_development.md
--
-- 가격 컬럼이 없는 것은 의도다. products.original_price/price/discount_rate 를 그대로 쓴다.
-- 아울렛 전용 가격을 두면 장바구니·주문·결제 검증 경로가 전부 열린다(이중 가격 금지).
-- ---------------------------------------------------------------------------
CREATE TABLE `outlet_product` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `product_id` int NOT NULL,
  `outlet_category_id` int DEFAULT NULL COMMENT 'categories.id (type=OUTLET). NULL=미분류',
  `outlet_type` enum('SEASON_OFF','DISCONTINUED','OVERSTOCK','DISPLAY','REFURBISHED','PACKAGE_DAMAGE','EXPIRY_SOON') NOT NULL COMMENT '할인 사유. 아울렛의 존재 이유이자 유일한 필수 분류축',
  `outlet_reason` varchar(255) DEFAULT NULL COMMENT '고객 노출 문구',
  `condition_grade` enum('A','B','C') DEFAULT NULL COMMENT '리퍼브·전시·훼손만. B/C 는 하자 고지 필수',
  `defect_description` text COMMENT '하자 고지. 없으면 교환·반품 분쟁이 난다',
  `expiry_at` date DEFAULT NULL COMMENT 'EXPIRY_SOON 전용',
  `started_at` datetime DEFAULT NULL COMMENT 'NULL=즉시 시작',
  `ended_at` datetime DEFAULT NULL COMMENT 'NULL=무기한(재고 소진까지)',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_outlet_product` (`mall_id`,`product_id`),
  KEY `idx_outlet_mall_type` (`mall_id`,`outlet_type`,`is_visible`),
  KEY `idx_outlet_mall_cat` (`mall_id`,`outlet_category_id`,`is_visible`),
  KEY `idx_outlet_product` (`product_id`),
  KEY `idx_outlet_category` (`outlet_category_id`),
  CONSTRAINT `fk_outlet_product_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_outlet_product_category` FOREIGN KEY (`outlet_category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='아울렛 상품 매핑. 가격은 products 를 그대로 쓴다';

CREATE TABLE `outlet_setting` (
  `mall_id` bigint NOT NULL,
  `allowed_types` varchar(255) NOT NULL DEFAULT 'SEASON_OFF,DISCONTINUED,OVERSTOCK,DISPLAY,REFURBISHED,PACKAGE_DAMAGE,EXPIRY_SOON' COMMENT '이 몰이 쓰는 할인 사유(CSV)',
  `min_discount_rate` int NOT NULL DEFAULT '20' COMMENT '등록 최소 할인율. 허위 할인 방지',
  `min_product_count` int NOT NULL DEFAULT '30' COMMENT 'GNB 노출 임계치. 미달이면 메뉴가 자동으로 숨는다(빈 메뉴 방지)',
  `show_in_normal_list` tinyint(1) NOT NULL DEFAULT '1' COMMENT '아울렛 상품을 일반 목록에도 노출할지',
  `notice_html` text COMMENT '아울렛 공통 고지(교환·반품 조건 차이 등)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`mall_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='몰별 아울렛 운영 규칙';

-- ============================================================================
-- 멤버십 등급 시스템 (2026-07 추가). 정본 DDL: scripts/migrate_membership.sql
-- 시드: scripts/seed_membership.sql / 관리자 메뉴: scripts/seed_membership_admin_menu.sql
-- ============================================================================

ALTER TABLE `orders` ADD COLUMN `grade_discount` int NOT NULL DEFAULT 0 COMMENT '멤버십 등급 정률 할인액' AFTER `coupon_discount`;


-- 1) 등급 정의 -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '등급 ID (PK)',
  `mall_id` bigint NOT NULL COMMENT '몰 ID (몰별 등급 분리)',
  `grade_code` varchar(30) NOT NULL COMMENT 'API·연계용 불변 코드 (BASIC/SILVER/...)',
  `grade_name` varchar(50) NOT NULL COMMENT '사용자 노출 등급명',
  `rank_order` int NOT NULL DEFAULT '100' COMMENT '순위. 1이 최상위 (작을수록 상위)',
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT '기본 가입 등급 (몰당 1개만 1)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '사용 여부',
  `is_auto_evaluation` tinyint(1) NOT NULL DEFAULT '1' COMMENT '자동 평가 대상 여부 (0=수동 전용 등급)',
  `color` varchar(20) DEFAULT NULL COMMENT '사용자 노출 색상 (#hex)',
  `badge_icon` varchar(100) DEFAULT NULL COMMENT '배지 아이콘 클래스',
  `description` varchar(255) DEFAULT NULL COMMENT '설명',
  `mypage_note` varchar(255) DEFAULT NULL COMMENT '마이페이지 안내 문구',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grade_mall_code` (`mall_id`, `grade_code`),
  KEY `idx_grade_mall_rank` (`mall_id`, `rank_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='멤버십 등급 정의 (몰별)';

-- 2) 등급별 혜택 (등급당 1행, MVP 단순화) ----------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade_benefit` (
  `grade_id` int NOT NULL COMMENT '등급 ID (PK, FK membership_grade)',
  `discount_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '정률 할인 혜택 사용 여부',
  `discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '주문 상품금액 정률 할인 (%)',
  `max_discount_amount` int DEFAULT NULL COMMENT '등급 할인 최대액 (NULL=무제한)',
  `point_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '등급 적립 혜택 사용 여부',
  `min_order_amount` int NOT NULL DEFAULT '0' COMMENT '등급 할인 최소 주문금액',
  `point_rate` decimal(5,2) DEFAULT NULL COMMENT '등급 적립률 (%). NULL=등급 적립 없음(기본률만)',
  `point_rate_mode` enum('REPLACE','ADD') NOT NULL DEFAULT 'ADD' COMMENT 'REPLACE=기본 적립률 대체 / ADD=기본률에 가산',
  `shipping_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '배송 혜택(무료배송/문턱) 사용 여부',
  `free_shipping` tinyint(1) NOT NULL DEFAULT '0' COMMENT '무조건 무료배송 (지역할증 제외)',
  `free_ship_threshold` int DEFAULT NULL COMMENT '등급별 무료배송 문턱 override (NULL=몰 기본 정책 사용)',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`grade_id`),
  CONSTRAINT `fk_grade_benefit_grade` FOREIGN KEY (`grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급별 혜택 (정률할인·추가적립·무료배송)';

-- 3) 평가 정책 (몰별, 버전 관리) -------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_evaluation_policy` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '정책 ID (PK)',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `policy_name` varchar(100) NOT NULL COMMENT '정책명',
  `version` int NOT NULL DEFAULT '1' COMMENT '버전',
  `status` enum('DRAFT','SCHEDULED','ACTIVE','ENDED') NOT NULL DEFAULT 'DRAFT' COMMENT '작성중/예약/적용중/종료',
  `performance_period_months` int NOT NULL DEFAULT '12' COMMENT '실적 인정 기간(개월). 최근 N개월 이동 구간',
  `evaluation_cycle` enum('MONTHLY','DAILY','MANUAL') NOT NULL DEFAULT 'MONTHLY' COMMENT '정기 평가 주기',
  `amount_basis` enum('A_GROSS','B_NET','C_PAID','D_NET_PLUS_SHIP') NOT NULL DEFAULT 'B_NET' COMMENT '인정 구매금액 산식 (설계 §6.2)',
  `condition_operator` enum('AMOUNT_ONLY','AND','OR') NOT NULL DEFAULT 'OR' COMMENT '금액/건수 조건 결합',
  `upgrade_mode` enum('IMMEDIATE','SCHEDULED') NOT NULL DEFAULT 'SCHEDULED' COMMENT '승급 반영: 즉시/정기평가',
  `downgrade_mode` enum('SCHEDULED','IMMEDIATE','NONE') NOT NULL DEFAULT 'SCHEDULED' COMMENT '강등 반영: 정기/즉시/안함',
  `new_member_protect_days` int NOT NULL DEFAULT '0' COMMENT '신규 회원 보호기간(일)',
  `min_holding_days` int NOT NULL DEFAULT '0' COMMENT '승급 후 최소 유지기간(일)',
  `effective_from` date DEFAULT NULL COMMENT '적용 시작일',
  `effective_to` date DEFAULT NULL COMMENT '적용 종료일',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eval_policy_mall_status` (`mall_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='멤버십 등급 평가 정책 (몰별·버전)';

-- 4) 등급별 진입/유지 기준 (정책 × 등급) ----------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade_criterion` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `policy_id` int NOT NULL COMMENT '평가 정책 ID (FK)',
  `grade_id` int NOT NULL COMMENT '등급 ID (FK)',
  `entry_amount_min` bigint NOT NULL DEFAULT '0' COMMENT '승급 진입 최소 인정금액',
  `entry_order_count_min` int NOT NULL DEFAULT '0' COMMENT '승급 진입 최소 인정 주문건수',
  `retention_amount_min` bigint DEFAULT NULL COMMENT '유지 최소 인정금액 (NULL=진입 기준과 동일)',
  `retention_order_count_min` int DEFAULT NULL COMMENT '유지 최소 주문건수 (NULL=진입과 동일)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_criterion_policy_grade` (`policy_id`, `grade_id`),
  CONSTRAINT `fk_criterion_policy` FOREIGN KEY (`policy_id`) REFERENCES `membership_evaluation_policy` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_criterion_grade` FOREIGN KEY (`grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급별 진입·유지 기준';

-- 5) 회원 등급 상태 (회원 × 몰) --------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_membership` (
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `current_grade_id` int DEFAULT NULL COMMENT '현재 등급 ID (FK)',
  `grade_started_at` timestamp NULL DEFAULT NULL COMMENT '현재 등급 적용 시작',
  `grade_expires_at` timestamp NULL DEFAULT NULL COMMENT '등급 만료(수동/기간제)',
  `is_locked` tinyint(1) NOT NULL DEFAULT '0' COMMENT '자동 평가 제외(고정)',
  `lock_reason` varchar(255) DEFAULT NULL COMMENT '고정 사유',
  `lock_expires_at` timestamp NULL DEFAULT NULL COMMENT '고정 만료(NULL=무기한)',
  `recognized_amount` bigint NOT NULL DEFAULT '0' COMMENT '최근 평가 시점 인정금액(캐시)',
  `recognized_order_count` int NOT NULL DEFAULT '0' COMMENT '최근 평가 시점 인정 주문건수(캐시)',
  `last_evaluated_at` timestamp NULL DEFAULT NULL COMMENT '마지막 평가 일시',
  `next_evaluation_at` timestamp NULL DEFAULT NULL COMMENT '다음 평가 예정',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `mall_id`),
  KEY `idx_membership_grade` (`current_grade_id`),
  KEY `idx_membership_mall_grade` (`mall_id`, `current_grade_id`),
  CONSTRAINT `fk_membership_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_membership_grade` FOREIGN KEY (`current_grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 등급 상태 (회원×몰)';

-- 6) 실적 원장 (구매확정 적립 / 취소 역분개) -------------------------------
CREATE TABLE IF NOT EXISTS `customer_performance_ledger` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `source_type` varchar(30) NOT NULL DEFAULT 'ORDER' COMMENT '실적 출처',
  `source_id` bigint DEFAULT NULL COMMENT '출처 엔티티 ID (orders.id)',
  `event_type` enum('ORDER_CONFIRMED','ORDER_REVERSED','ADMIN_ADJUST') NOT NULL COMMENT '적립/역분개/수동조정',
  `recognized_amount` int NOT NULL DEFAULT '0' COMMENT '인정 금액 (역분개는 음수)',
  `recognized_order_count` int NOT NULL DEFAULT '0' COMMENT '인정 주문건수 (역분개는 음수)',
  `reversal_of_ledger_id` bigint DEFAULT NULL COMMENT '역분개 대상 원장 ID',
  `memo` varchar(255) DEFAULT NULL COMMENT '메모',
  `occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '실적 발생 시각(집계 기준일)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ledger_user_mall_time` (`user_id`, `mall_id`, `occurred_at`),
  KEY `idx_ledger_source` (`source_type`, `source_id`),
  CONSTRAINT `fk_ledger_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 인정 실적 원장';

-- 7) 등급 변경 이력 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_grade_history` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `user_id` int NOT NULL COMMENT '회원 ID',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `from_grade_id` int DEFAULT NULL COMMENT '이전 등급',
  `to_grade_id` int DEFAULT NULL COMMENT '변경 등급',
  `change_type` enum('SIGNUP','UPGRADE','DOWNGRADE','MAINTAIN','MANUAL','LOCK','UNLOCK') NOT NULL COMMENT '변경 유형',
  `reason_code` varchar(50) DEFAULT NULL COMMENT '사유 코드',
  `reason_text` varchar(255) DEFAULT NULL COMMENT '상세 사유',
  `policy_id` int DEFAULT NULL COMMENT '적용 정책 ID',
  `evaluation_run_id` bigint DEFAULT NULL COMMENT '평가 실행 ID',
  `recognized_amount` bigint DEFAULT NULL COMMENT '변경 시점 인정금액',
  `effective_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '적용 시각',
  `changed_by` varchar(50) NOT NULL DEFAULT 'SYSTEM' COMMENT '변경 주체 (SYSTEM 또는 admin id)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_user_mall` (`user_id`, `mall_id`),
  KEY `idx_history_run` (`evaluation_run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급 변경 이력';

-- 8) 평가 실행 이력 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `membership_evaluation_run` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `mall_id` bigint NOT NULL COMMENT '몰 ID',
  `policy_id` int DEFAULT NULL COMMENT '평가 정책 ID',
  `mode` enum('SCHEDULED','MANUAL','SIMULATE') NOT NULL DEFAULT 'MANUAL' COMMENT '실행 유형',
  `status` enum('RUNNING','SUCCESS','FAILED') NOT NULL DEFAULT 'RUNNING' COMMENT '상태',
  `target_count` int NOT NULL DEFAULT '0' COMMENT '평가 대상 수',
  `upgrade_count` int NOT NULL DEFAULT '0',
  `downgrade_count` int NOT NULL DEFAULT '0',
  `maintain_count` int NOT NULL DEFAULT '0',
  `failure_count` int NOT NULL DEFAULT '0',
  `message` varchar(500) DEFAULT NULL COMMENT '결과/오류 메시지',
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_eval_run_mall` (`mall_id`, `started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급 평가 실행 이력';

-- 9) 주문 등급혜택 스냅샷 (설계 §2.2) -------------------------------------
CREATE TABLE IF NOT EXISTS `order_membership_benefit_snapshot` (
  `order_id` int NOT NULL COMMENT '주문 ID (PK, FK)',
  `user_id` int DEFAULT NULL COMMENT '회원 ID',
  `mall_id` bigint DEFAULT NULL COMMENT '몰 ID',
  `grade_id` int DEFAULT NULL COMMENT '주문 당시 등급 ID',
  `grade_code_snapshot` varchar(30) DEFAULT NULL COMMENT '주문 당시 등급 코드',
  `grade_name_snapshot` varchar(50) DEFAULT NULL COMMENT '주문 당시 등급명',
  `grade_discount_amount` int NOT NULL DEFAULT '0' COMMENT '등급 할인 적용액',
  `grade_point_rate` decimal(5,2) DEFAULT NULL COMMENT '적용 등급 적립률(%)',
  `grade_point_expected` int NOT NULL DEFAULT '0' COMMENT '등급 기준 예상 적립액',
  `free_shipping_applied` tinyint(1) NOT NULL DEFAULT '0' COMMENT '등급 무료배송 적용 여부',
  `benefit_details_json` json DEFAULT NULL COMMENT '계산 근거 스냅샷',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `idx_snapshot_user` (`user_id`),
  CONSTRAINT `fk_snapshot_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='주문 등급혜택 스냅샷';

-- 멤버십 2차: 등급 진입 쿠폰(쿠폰팩). 정본: scripts/migrate_membership_grade_coupon.sql
CREATE TABLE IF NOT EXISTS `membership_grade_coupon` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'PK',
  `grade_id` int NOT NULL COMMENT '등급 ID (FK)',
  `coupon_id` int NOT NULL COMMENT '지급할 쿠폰 ID (FK)',
  `issue_on` enum('ENTRY','BIRTHDAY','PERIODIC') NOT NULL DEFAULT 'ENTRY' COMMENT '지급 시점 (ENTRY=진입 / BIRTHDAY=생일 / PERIODIC=정기 월)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '사용 여부',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grade_coupon` (`grade_id`, `coupon_id`, `issue_on`),
  KEY `idx_grade_coupon_grade` (`grade_id`),
  CONSTRAINT `fk_grade_coupon_grade` FOREIGN KEY (`grade_id`) REFERENCES `membership_grade` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_grade_coupon_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='등급 진입/생일/정기 지급 쿠폰(쿠폰팩)';

-- 멤버십 2차: 생일 쿠폰 연 1회 발급 로그 (정본: scripts/migrate_membership_birthday.sql)
CREATE TABLE IF NOT EXISTS `membership_birthday_issue_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `mall_id` bigint DEFAULT NULL,
  `coupon_id` int NOT NULL,
  `issue_year` smallint NOT NULL COMMENT '발급 연도 (연 1회 가드)',
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_birthday_issue` (`user_id`, `coupon_id`, `issue_year`),
  KEY `idx_birthday_log_user` (`user_id`),
  CONSTRAINT `fk_birthday_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='생일 쿠폰 연 1회 발급 로그';

-- 멤버십 2차: 정기 쿠폰 월 1회 발급 로그 (정본: scripts/migrate_membership_periodic.sql)
CREATE TABLE IF NOT EXISTS `membership_periodic_issue_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `mall_id` bigint DEFAULT NULL,
  `coupon_id` int NOT NULL,
  `period_ym` char(7) NOT NULL COMMENT '발급 대상 월 (YYYY-MM)',
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_periodic_issue` (`user_id`, `coupon_id`, `period_ym`),
  KEY `idx_periodic_log_user` (`user_id`),
  CONSTRAINT `fk_periodic_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='정기 쿠폰 월 1회 발급 로그';

-- 멤버십 2차: 강등 사전 안내 발송 로그 (정본: scripts/migrate_membership_demotion_notice.sql)
CREATE TABLE IF NOT EXISTS `membership_demotion_notice_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `mall_id` bigint DEFAULT NULL,
  `period_ym` char(7) NOT NULL COMMENT '안내 대상 월 (YYYY-MM)',
  `from_grade_id` int DEFAULT NULL,
  `to_grade_id` int DEFAULT NULL,
  `channel` varchar(20) NOT NULL DEFAULT 'EMAIL',
  `notified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_demotion_notice` (`user_id`, `mall_id`, `period_ym`),
  KEY `idx_demotion_user` (`user_id`),
  CONSTRAINT `fk_demotion_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='강등 사전 안내 발송 로그(월 1회 멱등)';

-- 멤버십 2차: 몰별 멤버십 운영 설정 (정본: scripts/migrate_membership_config.sql)
CREATE TABLE IF NOT EXISTS `membership_config` (
  `mall_id` bigint NOT NULL COMMENT '몰 ID (PK)',
  `discount_stacking_mode` enum('STACK','COUPON_PRIORITY') NOT NULL DEFAULT 'STACK' COMMENT '등급할인×쿠폰 중복 모드',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`mall_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 멤버십 운영 설정';

-- =============================================================================
-- 서비스 관리 (몰 빌더 제공자 전용) — scripts/migrate_service_management_tables.js
--   service_plan       판매 등급(플랜)별 기능 entitlement
--   delivery_customer  납품 고객(테넌트) 레지스트리
-- =============================================================================
CREATE TABLE IF NOT EXISTS `service_plan` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `plan_code` varchar(50) NOT NULL COMMENT '등급 코드(고정 식별자)',
  `name` varchar(100) NOT NULL COMMENT '등급명',
  `description` varchar(255) DEFAULT NULL,
  `max_submalls` int NOT NULL DEFAULT '1' COMMENT '서브몰 생성 가능 개수 (0=불가)',
  `feat_naver_store` tinyint(1) NOT NULL DEFAULT '0' COMMENT '네이버 스토어 연동 여부',
  `feat_wholesale` tinyint(1) NOT NULL DEFAULT '0' COMMENT '도매(도매꾹·온채널) 연동 여부',
  `feat_ai_generation` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'AI 자동생성 가능 여부',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_service_plan_code` (`plan_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='판매 등급(플랜)별 기능 entitlement';

CREATE TABLE IF NOT EXISTS `delivery_customer` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL COMMENT '납품 고객(업체)명',
  `contact_name` varchar(100) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `plan_id` bigint DEFAULT NULL COMMENT '배정 판매 등급(service_plan.id)',
  `delivered_at` date DEFAULT NULL COMMENT '납품일',
  `memo` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_delivery_customer_plan` (`plan_id`),
  CONSTRAINT `fk_delivery_customer_plan` FOREIGN KEY (`plan_id`) REFERENCES `service_plan` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='납품 고객(테넌트) 레지스트리';

-- =====================================================================
-- 상품·SKU·옵션·세트 (Phase 0, 2026-07-16)
-- 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §26
-- 적용: scripts/migrations/20260716_sku_phase0.sql
-- 부수 컬럼 추가(위 CREATE 문에는 미반영, ALTER 로 추가됨):
--   products.product_type ENUM('SINGLE','OPTION','BUNDLE','SET','GIFT_SET','BUILD_SET') DEFAULT 'SINGLE'
--   carts.sku_id INT (FK product_sku)
--   order_items.sku_id INT, order_items.option_snapshot VARCHAR(255)
-- =====================================================================

CREATE TABLE IF NOT EXISTS `product_sku` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `product_id` int NOT NULL COMMENT '소속 상품(products.id, INT)',
  `sku_code` varchar(100) DEFAULT NULL COMMENT '내부 SKU 코드',
  `barcode` varchar(100) DEFAULT NULL,
  `supplier_code` varchar(100) DEFAULT NULL COMMENT '공급처 상품코드',
  `purchase_price` int DEFAULT '0' COMMENT '원가',
  `price` int NOT NULL COMMENT '판매가',
  `stock` int NOT NULL DEFAULT '0',
  `stock_managed` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0=재고를 구성 SKU에서 파생(복합상품 대표 SKU)',
  `status` enum('ON','OFF') NOT NULL DEFAULT 'ON' COMMENT 'SKU on/off. 생명주기는 products.status',
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT '단일상품/대표 SKU 여부(상품당 1행)',
  `display_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sku_code` (`product_id`,`sku_code`),
  KEY `idx_sku_product` (`product_id`),
  KEY `idx_sku_mall` (`mall_id`),
  CONSTRAINT `fk_sku_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 SKU(재고·거래 단위)';

CREATE TABLE IF NOT EXISTS `option_definition` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `option_code` varchar(50) NOT NULL COMMENT 'COLOR, SIZE, CAPACITY ...',
  `option_name` varchar(50) NOT NULL COMMENT '기본 표시명(색상)',
  `input_type` enum('SELECT','TEXT') NOT NULL DEFAULT 'SELECT',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_option_def` (`mall_id`,`option_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='표준 옵션명 사전';

CREATE TABLE IF NOT EXISTS `option_value_definition` (
  `id` int NOT NULL AUTO_INCREMENT,
  `option_definition_id` int NOT NULL,
  `value_code` varchar(50) NOT NULL COMMENT 'BLACK',
  `display_name` varchar(100) NOT NULL COMMENT '블랙',
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_optval` (`option_definition_id`,`value_code`),
  CONSTRAINT `fk_optval_def` FOREIGN KEY (`option_definition_id`) REFERENCES `option_definition` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='표준 옵션값 사전(추천값)';

CREATE TABLE IF NOT EXISTS `category_option` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL,
  `option_definition_id` int NOT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT '0' COMMENT '빌더는 필수 최소화 권장',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '1',
  `allow_custom_value` tinyint(1) NOT NULL DEFAULT '1',
  `inherit_to_children` tinyint(1) NOT NULL DEFAULT '1' COMMENT '하위 상속',
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cat_opt` (`category_id`,`option_definition_id`),
  CONSTRAINT `fk_catopt_cat` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_catopt_def` FOREIGN KEY (`option_definition_id`) REFERENCES `option_definition` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='카테고리별 추천 옵션 템플릿';

CREATE TABLE IF NOT EXISTS `product_option` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `option_definition_id` int DEFAULT NULL COMMENT '표준 사전 참조(직접입력이면 NULL)',
  `option_name` varchar(50) NOT NULL COMMENT '확정 표시명 스냅샷',
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_prodopt_product` (`product_id`),
  CONSTRAINT `fk_prodopt_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 확정 옵션명';

CREATE TABLE IF NOT EXISTS `product_option_value` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_option_id` int NOT NULL,
  `value_name` varchar(100) NOT NULL,
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_prodoptval_opt` (`product_option_id`),
  CONSTRAINT `fk_prodoptval_opt` FOREIGN KEY (`product_option_id`) REFERENCES `product_option` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 확정 옵션값';

CREATE TABLE IF NOT EXISTS `sku_option_value` (
  `sku_id` int NOT NULL,
  `product_option_id` int NOT NULL,
  `product_option_value_id` int NOT NULL,
  PRIMARY KEY (`sku_id`,`product_option_id`),
  KEY `idx_sov_value` (`product_option_value_id`),
  CONSTRAINT `fk_sov_sku` FOREIGN KEY (`sku_id`) REFERENCES `product_sku` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sov_optval` FOREIGN KEY (`product_option_value_id`) REFERENCES `product_option_value` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='SKU-옵션값 조합';

CREATE TABLE IF NOT EXISTS `product_attribute` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `attr_name` varchar(50) NOT NULL COMMENT '제조사, 원산지, 재질 ...',
  `attr_value` varchar(255) NOT NULL,
  `is_searchable` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_attr_product` (`product_id`),
  CONSTRAINT `fk_attr_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 속성(검색/설명용, 구매 선택 아님)';

CREATE TABLE IF NOT EXISTS `composite_component` (
  `id` int NOT NULL AUTO_INCREMENT,
  `composite_product_id` int NOT NULL COMMENT '복합상품 products.id',
  `component_sku_id` int NOT NULL COMMENT '구성 SKU(product_sku.id)',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '세트당 필요 수량',
  `is_optional` tinyint(1) NOT NULL DEFAULT '0' COMMENT '선택형 세트(BUILD_SET)용',
  `display_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_comp` (`composite_product_id`,`component_sku_id`),
  KEY `idx_comp_sku` (`component_sku_id`),
  CONSTRAINT `fk_comp_product` FOREIGN KEY (`composite_product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_sku` FOREIGN KEY (`component_sku_id`) REFERENCES `product_sku` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='복합상품 구성(기존 SKU 참조)';

-- ── B2B(사업자몰) — docs/사이트개선/b2b_사업자몰_구현설계.md ──
-- (증분 적용은 scripts/migrate_b2b_*.sql. 단순화 반영: migrate_b2b_simplify.sql)

CREATE TABLE IF NOT EXISTS `business_profile` (
  `id`                  int NOT NULL AUTO_INCREMENT,
  `user_id`             int NOT NULL COMMENT 'users.id (1:1)',
  `company_name`        varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '상호',
  `business_number`     varchar(20) COLLATE utf8mb4_general_ci NOT NULL COMMENT '사업자등록번호(숫자 10자리)',
  `representative_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '대표자명',
  `business_type`       varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '업태',
  `business_category`   varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '종목',
  `company_zipcode`     varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `company_address`     varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `company_detailed_address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tax_invoice_email`   varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '세금계산서 수신 이메일',
  `tax_type`            enum('TAXABLE','TAX_FREE','ZERO_RATED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'TAXABLE' COMMENT '발행 증빙 구분. B2B 세액 계산의 기준',
  `manager_name`        varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `manager_phone`       varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `license_file`        varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사업자등록증(storage/ 하위, public 아님)',
  `license_original_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `extra_discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '거래처 추가 할인율(%). 상품 할인율에 단순 합산',
  `status`              enum('PENDING','UNDER_REVIEW','APPROVED','SUSPENDED','REJECTED') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'PENDING',
  `reject_reason`       varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `contract_valid_from` date DEFAULT NULL,
  `contract_valid_to`   date DEFAULT NULL,
  `sales_manager_id`    int DEFAULT NULL COMMENT '담당 영업 admins.id',
  `admin_note`          text COLLATE utf8mb4_general_ci,
  `applied_at`          timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_at`         datetime DEFAULT NULL,
  `approved_by`         int DEFAULT NULL,
  `created_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bp_user` (`user_id`),
  UNIQUE KEY `uk_bp_bizno` (`business_number`),
  KEY `idx_bp_status` (`status`),
  CONSTRAINT `fk_bp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='사업자 회원 프로필 (users 1:1, 몰 무관)';

CREATE TABLE IF NOT EXISTS `product_b2b_setting` (
  `product_id`    int NOT NULL COMMENT 'products.id (1:1). 행이 없으면 B2B 판매 안 함',
  `is_b2b_sale`   tinyint(1) NOT NULL DEFAULT '0',
  `discount_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'B2B 할인율(%). 판매가 대비',
  `min_order_qty` int NOT NULL DEFAULT '1' COMMENT '최소 주문수량. 1이면 1개부터',
  `updated_at`    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  KEY `idx_pbs_sale` (`is_b2b_sale`),
  CONSTRAINT `fk_pbs_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품별 B2B 판매 설정 (상품 등록/수정 화면에서 입력)';
