-- 추천 · 전문관 GNB 활성화 + 랭킹 · 멤버십 하차 (2026-07-13 사용자 결정)
-- 설계: docs/사이트개선/recommend_specialty_design_and_development.md §7
--
-- ⚠️ 코드가 배포된 **뒤에** 실행한다. module_ready 를 먼저 올리면 운영 GNB 에 404 링크가 뜬다.
--
-- 슬롯 계산 (navigation_config.max_gnb_items = 12, 카테고리 제외):
--     현재 12개 (꽉 참)
--   − 랭킹    : 베스트가 랭킹 엔진을 흡수했다. 메뉴 이름도 이미 '베스트/랭킹'이고
--               /ranking 은 이제 /best 로 301 한다(routes/feature.js).
--   − 멤버십  : 이벤트&혜택(/event)의 하위 섹션으로 옮겼다. /membership 라우트는 유지한다.
--   + 추천, + 전문관
--   = 12개 → 슬롯을 늘리지 않고 정확히 맞는다.
--
-- 결과 GNB:
--   카테고리 · 쇼핑특가 · 베스트/랭킹 · [추천] · 기획전 · 이벤트&혜택 ·
--   브랜드 · 신상품 · [전문관] · 공동구매 · 아울렛 · 쇼핑라이브 · 쿠폰
--
-- 여러 번 실행해도 안전하다(idempotent).

-- 1. 추천 · 전문관 모듈 활성화 → GNB 노출 시작
UPDATE feature_menu
   SET module_ready = 1
 WHERE feature_code IN ('RECOMMEND', 'SPECIALTY');

-- 2. 랭킹 · 멤버십 GNB 하차 (전 몰)
--    feature_menu 행과 라우트는 남긴다 — 지우면 기존 링크·북마크가 죽는다.
--    끄는 것은 '몰별 노출'(mall_feature_menu.is_enabled)뿐이다.
UPDATE mall_feature_menu
   SET is_enabled = 0
 WHERE feature_code IN ('RANKING', 'MEMBERSHIP');


-- 확인용
-- SELECT COALESCE(NULLIF(m.display_name,''), f.default_name) AS 메뉴, m.feature_code, m.sort_order
--   FROM mall_feature_menu m JOIN feature_menu f ON f.feature_code = m.feature_code
--  WHERE m.mall_id = 1 AND f.position = 'gnb' AND m.is_enabled = 1 AND f.module_ready = 1
--  ORDER BY m.sort_order, f.default_sort_order;
