-- 샘플 카테고리를 "새로 만드는 것"에서 "공용 카테고리를 가리키는 것"으로 전환
--
-- 배경: services/mall/sampleSeeder.js 가 몰 생성 때마다 categories 에
--       mall_id = <새 몰> 인 NORMAL/BRAND 행을 새로 INSERT 했다. 그런데 이 저장소는
--       NORMAL·BRAND 를 글로벌 한 벌(mall_id=0)로 이미 전환했다
--       (categoryController.js:271, categoryScope.js:12,
--        20260720_categories_mall_id_comment.sql).
--       그래서 몰을 만들 때마다 공용 트리와 무관한 최상위 카테고리가 중복 생성됐다.
--
-- 이후: sample_category.global_category_id 가 가리키는 **기존 공용 카테고리**를
--       상품에 그대로 물린다. 시더는 categories 에 INSERT 하지 않는다.
--
-- 값은 이름으로 역인용한다(설치본마다 id 가 다를 수 있어 하드코딩하지 않는다).
-- 매칭되는 공용 카테고리가 없으면 NULL 로 남고, 시더가 '미분류'로 폴백한다.

ALTER TABLE sample_category
    ADD COLUMN global_category_id INT NULL
        COMMENT '이 샘플이 가리키는 공용 카테고리(categories.id, mall_id=0). NULL 이면 시더가 이름으로 재탐색 후 미분류 폴백'
        AFTER type;

-- ── NORMAL ──────────────────────────────────────────────────────────────────
-- 지갑 → 패션잡화 > 지갑
UPDATE sample_category SET global_category_id = (
    SELECT MIN(c.id) FROM categories c
     WHERE c.mall_id = 0 AND c.type = 'NORMAL' AND c.name = '지갑'
       AND c.parent_id = (SELECT MIN(p.id) FROM (SELECT * FROM categories) p
                           WHERE p.mall_id = 0 AND p.type = 'NORMAL' AND p.name = '패션잡화')
) WHERE sample_key = 'cat1' AND type = 'NORMAL';

-- 신발 → 패션잡화 > 여성신발 (공용 트리에 성별 무관 '신발' 2뎁스가 없다)
UPDATE sample_category SET global_category_id = (
    SELECT MIN(c.id) FROM categories c
     WHERE c.mall_id = 0 AND c.type = 'NORMAL' AND c.name = '여성신발'
) WHERE sample_key = 'cat2' AND type = 'NORMAL';

-- 골프 → 스포츠/레저 > 골프
UPDATE sample_category SET global_category_id = (
    SELECT MIN(c.id) FROM categories c
     WHERE c.mall_id = 0 AND c.type = 'NORMAL' AND c.name = '골프'
       AND c.parent_id = (SELECT MIN(p.id) FROM (SELECT * FROM categories) p
                           WHERE p.mall_id = 0 AND p.type = 'NORMAL' AND p.name = '스포츠/레저')
) WHERE sample_key = 'cat3' AND type = 'NORMAL';

-- ── BRAND ───────────────────────────────────────────────────────────────────
-- 이름이 그대로 공용 브랜드에 있다. 동명이인 방지로 MIN(id).
-- ⚠️ sample_category.name 은 utf8mb4_general_ci, categories.name 은 utf8mb4_unicode_ci 라
--    COLLATE 를 명시하지 않으면 ERROR 1267 (Illegal mix of collations) 이 난다.
UPDATE sample_category s
   SET s.global_category_id = (
        SELECT MIN(c.id) FROM (SELECT * FROM categories) c
         WHERE c.mall_id = 0 AND c.type = 'BRAND'
           AND c.name COLLATE utf8mb4_unicode_ci = s.name COLLATE utf8mb4_unicode_ci)
 WHERE s.type = 'BRAND';

-- 확인용
-- SELECT s.sample_key, s.type, s.name, s.global_category_id, c.name AS global_name
--   FROM sample_category s LEFT JOIN categories c ON c.id = s.global_category_id
--  ORDER BY s.type, s.display_order;
