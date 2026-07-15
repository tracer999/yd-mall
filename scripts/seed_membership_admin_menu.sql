-- 멤버십 관리 관리자 메뉴 시드 (admin_menus). 멱등 — 이미 있으면 건너뛴다.
-- 그룹(멤버십 관리, path NULL) + 리프 5개. display_order 65 = 프로모션(60)과 주문/회원(70) 사이.

INSERT INTO `admin_menus` (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '멤버십 관리', NULL, 'bi bi-award', 65, NULL, 1, NULL
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM `admin_menus` WHERE name = '멤버십 관리' AND path IS NULL);

SET @grp := (SELECT id FROM `admin_menus` WHERE name = '멤버십 관리' AND path IS NULL LIMIT 1);

INSERT INTO `admin_menus` (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (
        SELECT '멤버십 대시보드' AS name, '/admin/membership' AS path, 'bi bi-speedometer2' AS icon_class, 1 AS display_order, @grp AS parent_id, 1 AS is_active, 'super_admin,admin,customer_admin' AS visible_roles
  UNION ALL SELECT '등급 관리', '/admin/membership/grades', 'bi bi-star', 2, @grp, 1, 'super_admin,admin,customer_admin'
  UNION ALL SELECT '등급 평가 정책', '/admin/membership/policy', 'bi bi-sliders', 3, @grp, 1, 'super_admin,admin'
  UNION ALL SELECT '회원 등급 현황', '/admin/membership/customers', 'bi bi-people', 4, @grp, 1, 'super_admin,admin,customer_admin'
  UNION ALL SELECT '등급 변경·평가 이력', '/admin/membership/history', 'bi bi-clock-history', 5, @grp, 1, 'super_admin,admin,customer_admin'
) t
WHERE NOT EXISTS (SELECT 1 FROM `admin_menus` a WHERE a.path = t.path);
