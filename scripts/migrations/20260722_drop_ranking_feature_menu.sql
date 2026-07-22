-- 랭킹(RANKING) 기능 메뉴 폐기
--
-- 배경
--   '랭킹'은 2026-07 에 '베스트/랭킹'(BEST)에 흡수됐다. 같은 랭킹 엔진(best_ranking 스냅샷)을
--   두 메뉴로 태우는 셈이라 /ranking 은 이미 /best 로 301 한다(routes/feature.js).
--   그런데 카탈로그(feature_menu)에 행이 남아 있어 관리자 [메뉴 관리]·[메뉴 미리보기]에는
--   여전히 '랭킹'이 뜨고, 새로 찍어내는 몰마다 켤 수 있는 죽은 메뉴가 하나씩 생겼다.
--
-- 처리
--   몰별 오버라이드(mall_feature_menu) → 카탈로그(feature_menu) 순으로 지운다.
--   ⚠ 순서를 뒤집으면 오버라이드가 고아로 남는다(FK 없음 — 애플리케이션이 코드로 조인한다).
--
-- 라우트 /ranking → /best 301 은 **지우지 않는다**. 북마크·외부 링크가 죽는다.
--
-- 멱등: 두 번 돌려도 안전하다.

DELETE FROM mall_feature_menu WHERE feature_code = 'RANKING';
DELETE FROM feature_menu      WHERE feature_code = 'RANKING';
