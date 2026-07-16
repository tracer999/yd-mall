-- 리소스 관리 메뉴 — "몰 관리"(id 70) 대메뉴 아래 마지막 항목.
-- 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md §5
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_resource_menu.sql
--
-- '몰 관리' 하위 형제(몰 리스트/운영자/메뉴/시스템설정)는 전부 super_admin 전용,
-- display_order 10·20·30·40 → 리소스 관리는 50(마지막). path 로 재실행 가드.

SELECT id INTO @mall_gid
FROM admin_menus
WHERE name = '몰 관리' AND parent_id IS NULL AND path IS NULL
LIMIT 1;

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '리소스 관리' AS name, '/admin/resources' AS path, 'bi bi-collection' AS icon_class,
    50 AS display_order, @mall_gid AS parent_id, 1 AS is_active,
    'super_admin' AS visible_roles) AS t
WHERE @mall_gid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/resources');
