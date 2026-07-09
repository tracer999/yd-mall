-- =============================================================================
-- system_settings 시드: .env 에서 이관한 설정값
-- (DB/Redis 이외의 설정은 system_settings 에서 관리한다)
--
-- 실행:
--   mysql -h <host> -u <user> -p dev_mall < scripts/seed_system_settings.sql
--
-- 값은 관리자 UI 로 수정 가능하며, DB 접근이 통제되므로 평문으로 저장한다.
-- (커밋되는 .env 파일의 DB_PASS/REDIS_PASSWORD 만 ENC: 로 암호화)
-- ON DUPLICATE KEY UPDATE 로 재실행해도 안전하다.
-- =============================================================================

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `description`) VALUES
  ('session_secret',              'maill-NEWtec4075@@',                              'Express 세션 서명 시크릿'),
  ('tinymce_key',                 '1neehujsf6um7v6edzkl2qeszfdq13ampalt18wdaqvyp285', 'TinyMCE 에디터 API 키'),
  ('shopify_sync_enabled',        '1',                                              'Shopify 동기화 사용 여부 (1=사용, 0=미사용)'),
  ('shopify_store_domain',        'ydatasvcmall.myshopify.com',                     'Shopify 스토어 도메인'),
  ('shopify_client_id',           'f7badd5cf5c2a434ab177ac8970b2f17',               'Shopify 앱 Client ID'),
  ('shopify_client_secret',       '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',         'Shopify 앱 Client Secret'),
  ('shopify_storefront_api_token','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',         'Shopify Storefront API 토큰'),
  ('shopify_api_version',         '2026-04',                                        'Shopify API 버전'),
  ('shopify_location_id',         'gid://shopify/Location/114139463962',            'Shopify 재고 Location ID'),
  ('shopify_webhook_base_url',    'https://dev-mall.ydata.co.kr',                   'Shopify 웹훅 콜백 베이스 URL')
ON DUPLICATE KEY UPDATE
  `setting_value` = VALUES(`setting_value`),
  `description`   = VALUES(`description`);
