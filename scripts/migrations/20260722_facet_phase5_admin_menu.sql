-- =============================================================================
-- 상품 필터(facet) Phase 5 — 관리자 메뉴 등록
-- 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §10(Phase 5)
--
-- 관리자 메뉴는 제품 카탈로그다(운영 데이터가 아니다). 새 몰을 찍어도 같은 메뉴가 있어야 하므로
-- 마이그레이션으로 배포에 싣는다. CLAUDE.md 「모든 기능은 관리자 화면에서 끝나야 한다」.
--
-- 라우트 보호: /admin/products 전체가 requireMenuAccess('/admin/products') 로 막히고
-- (routes/admin.js:55), 하위 경로인 /admin/products/facets 는 그 보호를 그대로 받는다.
-- 따라서 이 메뉴 행은 **사이드바 노출용**이며 접근 권한은 상품 관리와 동일하다.
--
-- 멱등하다. 적용: mysql ... yd_mall < 20260722_facet_phase5_admin_menu.sql
-- =============================================================================

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '상품 필터 설정', '/admin/products/facets', 'bi bi-funnel', 10, m.id, 1, 'super_admin,admin,content_admin'
  FROM admin_menus m
 WHERE m.name = '상품 관리' AND m.parent_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) x WHERE x.path = '/admin/products/facets')
 LIMIT 1;

-- 속성 추출·검수 화면(Phase 8). 자동 추출값은 여기서 승인해야 고객 필터에 걸린다.
INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '상품 속성 추출·검수', '/admin/products/facet-extract', 'bi bi-magic', 11, m.id, 1, 'super_admin,admin,content_admin'
  FROM admin_menus m
 WHERE m.name = '상품 관리' AND m.parent_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) x WHERE x.path = '/admin/products/facet-extract')
 LIMIT 1;


-- 검증
--   SELECT id, parent_id, name, path, display_order FROM admin_menus WHERE path LIKE '/admin/products/facet%';
