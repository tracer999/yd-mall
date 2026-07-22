-- B2B 클레임 메뉴 등록
--
-- 기업 주문의 취소·반품을 `/admin/b2b/claims` 로 옮기면서 사이드바에 항목을 추가한다.
-- admin_menus 는 몰별 운영 데이터가 아니라 **관리자 화면의 구조**라 배포에 싣는다
-- (CLAUDE.md 「사용자 전제」 — 스키마·카탈로그는 예외).
--
-- 재실행해도 중복되지 않도록 path 존재 여부를 보고 넣는다.

SET @g := (SELECT id FROM (SELECT * FROM admin_menus) m WHERE m.name = 'B2B 관리' AND m.parent_id IS NULL LIMIT 1);

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT 'B2B 클레임', '/admin/b2b/claims', 'bi bi-arrow-counterclockwise', 6, @g, 1, NULL
  FROM DUAL
 WHERE @g IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM admin_menus) m WHERE m.path = '/admin/b2b/claims');

SELECT id, name, path, display_order FROM admin_menus WHERE parent_id = @g ORDER BY display_order;
