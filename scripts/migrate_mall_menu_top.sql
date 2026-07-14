-- 몰 관리 메뉴를 대메뉴(최상위) 최상단으로 승격
--
-- 왜: 몰이 모든 설정(카테고리·상품·헤더·테마·홈)의 스코프 축인데,
--     '운영/시스템 관리'(display_order=80) 그룹 맨 아래 묻혀 있어 찾을 수 없었다.
--     이제 사이드바 최상단 단독 항목으로 노출한다.
--
-- adminMenu.js 는 `path IS NOT NULL` 인 최상위 행을 "최상위 잎"으로 렌더한다(대시보드와 동일).
-- 권한(visible_roles)은 잎에만 적용되므로 super_admin,admin 을 그대로 유지한다.
--
-- 되돌리려면:
--   UPDATE admin_menus SET parent_id = 35, display_order = 1 WHERE path = '/admin/malls';

UPDATE admin_menus
   SET parent_id     = NULL,   -- 그룹(운영/시스템 관리) 밖으로 꺼낸다
       display_order = -10,    -- 대시보드(0)보다 위 → 사이드바 최상단
       icon_class    = 'bi bi-shop',
       is_active     = 1
 WHERE path = '/admin/malls';

-- 대시보드 메뉴는 일단 숨긴다(사용자 요청).
--
-- 안전한가: 대시보드 라우트(routes/admin.js:18 `router.get('/')`)에는 requireMenuAccess 가드가
-- 없다. 따라서 메뉴만 사라지고 `/admin` 페이지 자체는 계속 열린다. 로그인 후 리다이렉트
-- 대상도 `/admin` 이므로 로그인 흐름도 그대로다.
--
-- 되돌리려면:
--   UPDATE admin_menus SET is_active = 1 WHERE path = '/admin';
UPDATE admin_menus
   SET is_active = 0
 WHERE path = '/admin' AND parent_id IS NULL;
