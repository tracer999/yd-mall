-- 관리자 메뉴 '배송비 정책' 등록 (배송비 문서 §5-4, S8)
--
-- ⚠️ is_active = 0 으로 넣는다. dev 와 prod 가 같은 DB 이므로, 라우트가 배포되기 전에 메뉴를
--    켜면 운영 관리자에게 404 링크가 노출된다. 코드 배포를 확인한 뒤 아래 UPDATE 로 켠다.
--
--    UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/shipping-policy';
--
-- 부모: 34 = '주문/회원 관리' (기존 '배송 관리'(/admin/shipping, display_order 2) 바로 뒤)

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '배송비 정책', '/admin/shipping-policy', 'bi-truck', 3, 34, 0, 'super_admin,admin'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM admin_menus WHERE path = '/admin/shipping-policy');

-- 같은 부모의 뒤 항목들을 한 칸씩 민다. 절대값으로 써서 재실행해도 결과가 같다.
UPDATE admin_menus SET display_order = 4 WHERE parent_id = 34 AND path = '/admin/shopify-orders';
UPDATE admin_menus SET display_order = 5 WHERE parent_id = 34 AND path = '/admin/users';
UPDATE admin_menus SET display_order = 6 WHERE parent_id = 34 AND path = '/admin/inquiries';
