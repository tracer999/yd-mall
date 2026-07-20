-- 리소스 관리 통합 — "몰 관리 → 리소스 관리"(/admin/resources) 제거 +
-- "외부몰 연동 → 네이버 카테고리 리소스" 를 "네이버 리소스 관리" 로 개칭.
--
-- 배경: 두 화면이 네이버 카테고리 현황·수동수집·검색을 중복 제공했다.
--       수집된 네이버 리소스(카테고리·브랜드)를 보는 곳은 sourcing 화면 하나로 통합한다.
-- 관련: scripts/migrate_resource_menu.sql (되돌림 대상),
--       scripts/migrate_sourcing_02_naver_taxonomy.sql (개칭 대상)
--
-- path 기준이라 재실행해도 안전하다(idempotent).

-- 1) 몰 관리 하위 "리소스 관리" 메뉴 제거.
--    경로가 사라졌으므로 남겨두면 requireMenuAccess 가 404 로 이어진다.
DELETE FROM admin_menus WHERE path = '/admin/resources';

-- 2) 네이버 화면 개칭 — 카테고리 전용이 아니라 브랜드까지 함께 보는 화면이 되었다.
--    경로는 유지한다(상품 등록 폼의 autocomplete 가
--    /admin/sourcing/naver-taxonomy/search 를 호출하고 있다).
UPDATE admin_menus
   SET name = '네이버 리소스 관리',
       icon_class = 'bi bi-collection'
 WHERE path = '/admin/sourcing/naver-taxonomy';
