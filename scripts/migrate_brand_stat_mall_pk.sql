-- ─────────────────────────────────────────────────────────
-- brand_stat PK 를 (mall_id, category_id) 로 교정
--
-- 최초 정의(migrate_brand_hub.sql)가 PK 를 category_id 단독으로 잡았다.
-- 인덱스는 전부 (mall_id, ...) 복합인데 PK 만 mall_id 가 빠져,
-- **인스턴스 전체에서 브랜드 1개당 1행**만 존재할 수 있었다.
--
-- 결과: 두 번째 몰에서 recalcMall() 이 ER_DUP_ENTRY 로 통째로 실패하고
--       brand_stat 이 비어 → /brands 가 "해당하는 브랜드가 없습니다" 를 띄웠다.
--       몰 빌더로 몰을 찍어낼수록 반드시 재현되는 구조적 결함.
--
-- 안전성: category_id 는 auto_increment 가 아니라 PK 를 잠시 drop 해도 되고,
--         기존 데이터는 한 몰(mall 2)뿐이라 (mall_id, category_id) 쌍에 중복이 없다.
-- ─────────────────────────────────────────────────────────

ALTER TABLE brand_stat
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (mall_id, category_id);
