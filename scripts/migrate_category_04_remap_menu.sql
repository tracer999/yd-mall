-- 네이버 기반 글로벌 카테고리 재구성 — Phase 4: 관리자 메뉴 "카테고리 재매핑 검토"
-- 설계: docs/사이트개선/네이버_기반_글로벌_카테고리_재구성_설계.md §9
--
-- 실행:
--   mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_category_04_remap_menu.sql
--
-- "외부몰 연동" 그룹 아래에 추가(멱등). 그룹 id 는 migrate_sourcing_01 에서 생성됨.

SELECT id INTO @sourcing_gid
FROM admin_menus
WHERE name = '외부몰 연동' AND parent_id IS NULL AND path IS NULL
LIMIT 1;

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT * FROM (SELECT
    '카테고리 재매핑 검토' AS name, '/admin/sourcing/category-remap' AS path, 'bi bi-shuffle' AS icon_class,
    8 AS display_order, @sourcing_gid AS parent_id, 1 AS is_active,
    'super_admin,admin' AS visible_roles) AS t
WHERE @sourcing_gid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_menus m WHERE m.path = '/admin/sourcing/category-remap');

SELECT 'Phase4 메뉴 완료' AS status,
    (SELECT COUNT(*) FROM admin_menus WHERE path='/admin/sourcing/category-remap') AS menu_rows;
