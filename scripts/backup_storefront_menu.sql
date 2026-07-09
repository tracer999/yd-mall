-- storefront_menu 백업 (M7 제거 직전 자동 생성)
-- 행 수: 7
-- 복구: 아래 DDL 실행 후 INSERT 실행

CREATE TABLE `storefront_menu` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mall_id` bigint NOT NULL DEFAULT '1',
  `parent_id` bigint DEFAULT NULL,
  `depth` int NOT NULL DEFAULT '1',
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `menu_type` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `target_type` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `target_id` bigint DEFAULT NULL,
  `url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_fixed` tinyint(1) DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_menu_mall` (`mall_id`,`parent_id`,`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (7, 1, NULL, 1, '카테고리', 'category', NULL, NULL, NULL, 1, 1, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (8, 1, NULL, 1, '쇼핑라이브', 'custom', NULL, NULL, '#', 0, 2, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (9, 1, NULL, 1, 'TV편성표', 'custom', NULL, NULL, '#', 0, 3, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (10, 1, NULL, 1, '오늘특가', 'promotion', NULL, NULL, '/products', 0, 4, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (11, 1, NULL, 1, '공동구매', 'custom', NULL, NULL, '#', 0, 5, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (12, 1, NULL, 1, '베스트', 'custom', NULL, NULL, '/products', 0, 6, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
INSERT INTO `storefront_menu` (`id`, `mall_id`, `parent_id`, `depth`, `name`, `menu_type`, `target_type`, `target_id`, `url`, `is_fixed`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES (13, 1, NULL, 1, '이벤트&혜택', 'page', NULL, NULL, '/boards/notice', 0, 7, 1, '2026-07-08 08:58:19', '2026-07-08 08:58:19');
