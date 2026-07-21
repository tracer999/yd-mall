-- 기획전 상세 상단 '추천 상품' 영역
--
-- 기획전에 담긴 상품 중 운영자가 고른 것을 상세 최상단에 크게 보여준다.
-- (예전에 PC 대표 이미지 배너가 있던 자리다 — 이미지 한 장 대신 살 수 있는 상품을 먼저 보여준다.)
--
-- ⚠️ is_fixed 를 재활용하지 않는다. is_fixed 는 "그 섹션 목록 안에서 위로 고정"이라는
--    다른 뜻으로 이미 쓰이고 있다(exhibitionService.getProducts 의 ORDER BY ep.is_fixed DESC).
--    한 컬럼에 두 의미를 얹으면 '목록 상단 고정'과 '추천 영역 노출'을 따로 끌 수 없다.
--
-- ⚠️ 기존 행은 전부 0(추천 아님)이다. 켜기 전까지 화면은 그대로다.
--    NOT NULL DEFAULT 0 이라 이 컬럼을 모르는 기존 INSERT(postAddProduct)도 그대로 동작한다.

ALTER TABLE exhibition_product
  ADD COLUMN is_recommended tinyint(1) NOT NULL DEFAULT 0
  COMMENT '상세 상단 추천 영역 노출' AFTER is_fixed;

-- 추천 상품은 기획전당 몇 개뿐이라 (exhibition_id, is_recommended) 로 좁히면 충분하다.
CREATE INDEX idx_exh_product_recommend ON exhibition_product (exhibition_id, is_recommended);
