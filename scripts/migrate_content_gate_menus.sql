-- 콘텐츠 게이트가 걸린 GNB 메뉴를 켠다 (아울렛 · 공동구매 · 쇼핑라이브)
--
-- 설계: docs/사이트개선/outlet_design_and_development.md §4-5, §6
--
-- 세 메뉴는 모듈이 모두 구현됐다(services/outlet · services/groupBuy · services/live).
-- 그래서 "모듈이 없으니 GNB 에서 내린다"(§6 안 B)는 더 이상 성립하지 않는다.
--
-- 켜도 빈 메뉴가 되지 않는 이유: navigationService.CONTENT_GATES 가 콘텐츠를 세고,
-- 채울 게 없으면 GNB 에서 조용히 뺀다. 즉 is_enabled 는 "이 몰이 이 채널을 쓰는가"만 뜻하고,
-- "지금 보여줄 게 있는가"는 게이트가 판단한다. 운영자가 켜둔 채 방치해도 죽은 링크가 생기지 않는다.
--
--   OUTLET     판매중 아울렛 상품 >= outlet_setting.min_product_count (기본 30)
--   GROUP_BUY  공개 공동구매 1건 이상
--   LIVE       공개 라이브 1건 이상
--
-- 되돌리기:
--   UPDATE mall_feature_menu SET is_enabled = 0
--    WHERE mall_id IN (1, 2) AND feature_code IN ('OUTLET', 'GROUP_BUY', 'LIVE');

UPDATE mall_feature_menu
   SET is_enabled = 1
 WHERE mall_id IN (1, 2)
   AND feature_code IN ('OUTLET', 'GROUP_BUY', 'LIVE');
