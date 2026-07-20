-- [선택] 이미 찍어낸 몰에 남아 있는 "몰 전용 샘플 카테고리" 정리
--
-- 20260720_sample_category_global_ref.sql + sampleSeeder 수정으로 **앞으로 만드는 몰**은
-- 공용 카테고리를 가리킨다. 하지만 그 전에 만든 몰에는 mall_id=<몰> 인 NORMAL/BRAND 행이
-- 남아 있다. resolvers/_shared.js 가 `mall_id IN (0, ?)` 로 읽어 화면은 정상이지만,
-- 공용 트리와 이원화된 상태라 관리가 헷갈린다.
--
-- 그 몰을 어차피 지웠다 다시 만들 거면 **이 파일은 돌릴 필요 없다.**
--
-- 하는 일: 몰 전용 샘플 카테고리를 가리키던 상품을 같은 이름의 공용 카테고리로 옮기고,
--          아무도 안 쓰게 된 몰 전용 행을 지운다. 이름이 안 맞으면 그 행은 그냥 남는다
--          (임의로 지워 상품을 미아로 만들지 않는다 — 수동 확인 후 처리).
--
-- 대상 한정: slug 가 'sm{mall_id}-' 로 시작하는 것 = 시더가 만든 것만. 운영자가 직접 만든
--          몰 전용 카테고리가 있다면 건드리지 않는다.

-- 1) NORMAL: 상품의 category_id 를 공용으로 재지정
UPDATE products p
  JOIN categories old ON old.id = p.category_id
                     AND old.mall_id <> 0
                     AND old.type = 'NORMAL'
                     AND old.slug LIKE CONCAT('sm', old.mall_id, '-%')
  JOIN categories g ON g.mall_id = 0
                   AND g.type = 'NORMAL'
                   AND g.name COLLATE utf8mb4_unicode_ci = old.name COLLATE utf8mb4_unicode_ci
   SET p.category_id = g.id;

-- 2) BRAND: brand_category_id 도 동일하게
UPDATE products p
  JOIN categories old ON old.id = p.brand_category_id
                     AND old.mall_id <> 0
                     AND old.type = 'BRAND'
                     AND old.slug LIKE CONCAT('sm', old.mall_id, '-brand-%')
  JOIN categories g ON g.mall_id = 0
                   AND g.type = 'BRAND'
                   AND g.name COLLATE utf8mb4_unicode_ci = old.name COLLATE utf8mb4_unicode_ci
   SET p.brand_category_id = g.id;

-- 3) 이제 아무 상품도 가리키지 않는 몰 전용 샘플 카테고리 삭제
--    (자식이 있으면 parent_id 는 ON DELETE SET NULL 이지만, 시더 생성분은 전부 depth 1 단독이다)
DELETE c FROM categories c
 WHERE c.mall_id <> 0
   AND c.type IN ('NORMAL', 'BRAND')
   AND (c.slug LIKE CONCAT('sm', c.mall_id, '-%') OR c.slug LIKE CONCAT('sm', c.mall_id, '-brand-%'))
   AND NOT EXISTS (SELECT 1 FROM (SELECT category_id, brand_category_id FROM products) p
                    WHERE p.category_id = c.id OR p.brand_category_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM (SELECT parent_id FROM categories) k WHERE k.parent_id = c.id);

-- 확인용 — 0행이어야 정리 완료
-- SELECT id, mall_id, type, name, slug FROM categories
--  WHERE mall_id <> 0 AND type IN ('NORMAL','BRAND');
