
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
  `path` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '클릭 시 이동 URL (예: /admin/products)',
  `icon_class` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '아이콘 클래스 (Bootstrap Icons 등)',
  `display_order` int NOT NULL DEFAULT '0' COMMENT '표시 순서 (오름차순)',
  `parent_id` int DEFAULT NULL COMMENT '부모 메뉴 ID (NULL이면 1차 메뉴)',
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
  `banner_type` enum('MAIN','CATEGORY','POPUP') COLLATE utf8mb4_general_ci DEFAULT 'MAIN' COMMENT '배너 타입 (메인/카테고리/팝업)',
  `category_id` int DEFAULT NULL COMMENT '카테고리 ID (CATEGORY 타입일 경우)',
  `title` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '배너 제목',
  `image_url` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '배너 이미지 URL',
  `link_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '클릭 시 이동 URL',
  `display_order` int DEFAULT '0' COMMENT '정렬 순서',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '활성 여부',
  `start_date` date DEFAULT NULL COMMENT '노출 시작일',
  `end_date` date DEFAULT NULL COMMENT '노출 종료일',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  KEY `fk_banners_category` (`category_id`),
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
  `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '카테고리명',
  `display_order` int DEFAULT '0' COMMENT '노출 순서',
  `parent_id` int DEFAULT NULL COMMENT '상위 카테고리 ID (Self FK)',
  `type` enum('NORMAL','THEME','BRAND') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'NORMAL' COMMENT '카테고리 타입 (일반, 테마)',
  PRIMARY KEY (`id`),
  KEY `parent_id` (`parent_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='상품 카테고리 (계층 구조 지원)';


-- =============================================================================
-- 문의: 1:1 고객 문의 및 관리자 답변
-- =============================================================================
CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '문의 ID (PK)',
  `user_id` int NOT NULL COMMENT '사용자 ID (FK)',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '문의 제목',
  `content` text COLLATE utf8mb4_general_ci NOT NULL COMMENT '문의 내용',
  `answer` text COLLATE utf8mb4_general_ci COMMENT '관리자 답변',
  `is_answered` tinyint(1) DEFAULT '0' COMMENT '답변 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
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
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '공지 제목',
  `content` text COLLATE utf8mb4_general_ci NOT NULL COMMENT '공지 내용',
  `importance` int DEFAULT '0' COMMENT '중요도 (0:일반,1:중요)',
  `type` varchar(50) DEFAULT 'NOTICE' COMMENT '공지 타입',
  `view_count` int DEFAULT '0' COMMENT '조회수',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성일시',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='공지사항';


-- =============================================================================
-- 주문: 주문 정보 (토스페이먼츠 연동, 회원/비회원 주문)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '주문 ID (PK)',
  `user_id` int DEFAULT NULL COMMENT '사용자 ID (FK, 비회원 주문 시 NULL)',
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
  `category_id` int DEFAULT NULL COMMENT '카테고리 ID (FK)',
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '상품명',
  `product_code` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '상품코드 (관리자 입력)',
  `provider` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '공급 업체',
  `description` text COLLATE utf8mb4_general_ci COMMENT '상품 상세 설명',
  `short_description` text COLLATE utf8mb4_general_ci COMMENT '상품 기본 설명 (3-4줄 요약)',
  `main_image` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '대표 이미지 URL',
  `thumbnail_image` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `video_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '동영상 URL (파일 또는 유튜브)',
  `video_type` enum('FILE','YOUTUBE') COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '동영상 타입',
  `purchase_price` int DEFAULT '0' COMMENT '매입가',
  `original_price` int DEFAULT '0' COMMENT '정가',
  `price` int NOT NULL COMMENT '판매가',
  `discount_rate` int DEFAULT '0' COMMENT '할인율 (%)',
  `stock` int DEFAULT '0' COMMENT '재고 수량',
  `status` enum('ON','OFF','SOLD_OUT','COMING_SOON') COLLATE utf8mb4_general_ci DEFAULT 'ON' COMMENT '판매 상태',
  `view_count` int DEFAULT '0' COMMENT '조회수',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  `theme_category_id` int DEFAULT NULL COMMENT '테마 카테고리 ID (FK)',
  `is_ai_recommendation` tinyint(1) DEFAULT '0' COMMENT 'AI 추천 사용 여부',
  `ai_recommendation_content` text COLLATE utf8mb4_general_ci COMMENT 'AI 추천 내용',
  `slug` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'SEO URL 슬러그 (예: greenherb-lutein-plus 또는 마그네슘-l-테아닌-120정)',
  `distribution_badge` enum('ONLINE_ONLY','OFFLINE_ONLY') COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '유통채널 구분 뱃지',
  `product_badge` enum('BEST','NEW','RECOMMEND') COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '상품구분 뱃지',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_products_slug` (`slug`),
  KEY `category_id` (`category_id`),
  KEY `products_ibfk_2` (`theme_category_id`),
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
  `company_name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '회사명',
  `logo_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '로고 URL',
  `favicon_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '파비콘 URL',
  `business_number` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '사업자 번호',
  `address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '주소',
  `contact_email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '대표 이메일',
  `contact_phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '대표 전화번호',
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
  `points_balance` int NOT NULL DEFAULT '0' COMMENT '보유 포인트',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `kakao_id` (`kakao_id`),
  KEY `fk_users_agreed_terms` (`agreed_terms_id`),
  KEY `fk_users_agreed_privacy` (`agreed_privacy_id`),
  CONSTRAINT `fk_users_agreed_privacy` FOREIGN KEY (`agreed_privacy_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_agreed_terms` FOREIGN KEY (`agreed_terms_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 사용자 정보 (Google/Kakao 로그인 기반)';


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
  `points_balance` int NOT NULL DEFAULT '0' COMMENT '보유 포인트',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `kakao_id` (`kakao_id`),
  KEY `fk_users_agreed_terms` (`agreed_terms_id`),
  KEY `fk_users_agreed_privacy` (`agreed_privacy_id`),
  CONSTRAINT `fk_users_agreed_privacy` FOREIGN KEY (`agreed_privacy_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_agreed_terms` FOREIGN KEY (`agreed_terms_id`) REFERENCES `policy_versions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='회원 사용자 정보 (Google/Kakao 로그인 기반)';


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

-- 스토어프론트 GNB 메뉴(P1.5): 카테고리와 분리된 몰별 상단 메뉴. 골격 고정 + 항목 데이터화(최대 3뎁스)
CREATE TABLE IF NOT EXISTS `storefront_menu` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `mall_id` BIGINT NOT NULL DEFAULT 1,
  `parent_id` BIGINT NULL,
  `depth` INT NOT NULL DEFAULT 1,            -- 1~3, 최상위=1 (앱 레이어 강제)
  `name` VARCHAR(100) NOT NULL,             -- 몰별 가변 명칭
  `menu_type` VARCHAR(50) NOT NULL,         -- category / page / promotion / brand / external_url / custom
  `target_type` VARCHAR(50) NULL,
  `target_id` BIGINT NULL,
  `url` VARCHAR(500) NULL,
  `is_fixed` TINYINT(1) DEFAULT 0,          -- 1 = 카테고리 버튼 등 고정 항목(삭제 금지)
  `sort_order` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_menu_mall` (`mall_id`, `parent_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='스토어프론트 GNB 메뉴(카테고리와 분리)';


/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=IFNULL(@OLD_CHARACTER_SET_CLIENT,'utf8mb4') */;

/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
