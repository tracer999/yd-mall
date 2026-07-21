-- B2B 관리자 메뉴 등록 (설계 §11.1)
--
-- admin_menus 는 몰별 운영 데이터가 아니라 **관리자 화면의 구조**다. 그래서 배포에 싣는다
-- (CLAUDE.md 「사용자 전제」 — 스키마·카탈로그를 배포에 싣는 것은 예외).
--
-- 재실행해도 중복이 생기지 않도록 path 로 존재 여부를 보고 넣는다.
-- 그룹 행은 path 가 NULL 이라 name 으로 식별한다.

-- ── 대메뉴: B2B 관리 (멤버십 관리 65 와 주문/회원 관리 70 사이) ──
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT 'B2B 관리', NULL, 'bi bi-building', 68, NULL, 1, NULL
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.name = 'B2B 관리' AND m.parent_id IS NULL);

SET @b2b_group := (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name = 'B2B 관리' AND m.parent_id IS NULL LIMIT 1);

-- ── 하위 메뉴 ──
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '기업회원 승인', '/admin/b2b/members', 'bi bi-person-check', 1, @b2b_group, 1, NULL
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/members');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '거래처 등급', '/admin/b2b/tiers', 'bi bi-award', 2, @b2b_group, 1, NULL
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/tiers');

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT 'B2B 설정', '/admin/b2b/settings', 'bi bi-sliders', 9, @b2b_group, 1, NULL
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/settings');

SELECT id, name, path, display_order, parent_id
  FROM admin_menus
 WHERE id = @b2b_group OR parent_id = @b2b_group
 ORDER BY parent_id IS NOT NULL, display_order;
SET @b2b_group := (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name = 'B2B 관리' AND m.parent_id IS NULL LIMIT 1);
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT 'B2B 주문', '/admin/b2b/orders', 'bi bi-receipt', 3, @b2b_group, 1, NULL FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/orders');
SELECT id,name,path,display_order FROM admin_menus WHERE parent_id = @b2b_group ORDER BY display_order;
SET @b2b_group := (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name = 'B2B 관리' AND m.parent_id IS NULL LIMIT 1);
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '견적 관리', '/admin/b2b/quotes', 'bi bi-file-earmark-text', 4, @b2b_group, 1, NULL FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/quotes');
SELECT id,name,path,display_order FROM admin_menus WHERE parent_id=@b2b_group ORDER BY display_order;
SET @g := (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name='B2B 관리' AND m.parent_id IS NULL LIMIT 1);
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '가격 정책', '/admin/b2b/price-policies', 'bi bi-tags', 5, @g, 1, NULL FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path='/admin/b2b/price-policies');
SELECT id,name,path,display_order FROM admin_menus WHERE parent_id=@g ORDER BY display_order;
