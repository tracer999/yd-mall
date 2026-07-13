-- 베스트/랭킹 — 브랜드 탭 기본 시드
--
-- 브랜드는 전량 시드하지 않는다(mall2 에 1,354개 — 빈 탭이 수천 개 생긴다).
-- **몰별로 상품 수 상위 5개 브랜드만** 탭으로 만든다. 나머지는 운영자가
-- /admin/best-groups 에서 필요할 때 추가한다.
--
-- 순서: 카테고리 탭 뒤에 오도록 sort_order 를 1000 부터 준다
--       (기존 최대값은 mall1 66 · mall2 232).
--
-- 재실행 안전: 이미 그룹이 있는 브랜드는 건너뛴다(NOT EXISTS).

INSERT INTO best_group (mall_id, name, group_type, ref_id, include_descendants, sort_order, is_active)
SELECT t.mall_id, t.name, 'BRAND', t.id, 0, 1000 + t.rn, 1
  FROM (
        SELECT p.mall_id,
               c.id,
               c.name,
               ROW_NUMBER() OVER (PARTITION BY p.mall_id ORDER BY COUNT(*) DESC, c.id) AS rn
          FROM products p
          JOIN categories c ON c.id = p.brand_category_id
         WHERE c.type = 'BRAND'
           AND p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK')
         GROUP BY p.mall_id, c.id, c.name
       ) t
 WHERE t.rn <= 5
   AND NOT EXISTS (
        SELECT 1 FROM best_group g
         WHERE g.group_type = 'BRAND' AND g.ref_id = t.id
       );

SELECT mall_id, sort_order, name, group_type, ref_id
  FROM best_group
 WHERE group_type = 'BRAND'
 ORDER BY mall_id, sort_order;
