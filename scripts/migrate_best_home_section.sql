-- 홈 베스트 섹션 → 랭킹 엔진으로 전환
--
-- 🔴 이 파일은 **코드를 배포한 뒤에** 실행한다. 먼저 실행하면 운영이 깨진다.
--
--    page 1·4 에는 발행 스냅샷(page_revision)이 없다. displayService.getHomeSections 가
--    스냅샷이 없으면 **라이브 page_section 으로 폴백**하므로, 이 UPDATE 는 운영 홈에
--    즉시 반영된다. 운영이 아직 옛 코드를 돌고 있으면 sectionRegistry 에 'best_ranking'
--    이 없어 섹션이 깨진다(dev DB = prod DB).
--
--    실행 순서:
--      1) git push (배포 완료 · /best 정상 확인)
--      2) node scripts/calc_best_ranking.js   ← 스냅샷이 비어 있으면 섹션이 통째로 스킵된다
--      3) 이 파일 실행
--
-- 무엇이 바뀌는가:
--   홈 '베스트 상품' 그리드가 관리자 수동 상품그룹(product_group)이 아니라
--   랭킹 스냅샷(best_ranking)을 읽는다. → 홈과 GNB /best 가 항상 같은 상품을 보여준다.
--   (세션 E 에서 둘이 갈라져 있던 것을 수동 그룹으로 통일했는데, 이제 자동 랭킹으로 통일한다)
--
--   MD 가 밀고 싶은 상품은 /admin/best-groups 의 **MD 픽**으로 고정한다 —
--   홈·GNB 양쪽에 함께 반영된다. 수동 상품그룹(id 1·9)은 더 이상 홈 베스트를 좌우하지 않는다.

-- mall 1 — '베스트 상품'
UPDATE page_section
   SET section_type     = 'best_ranking',
       data_source_type = NULL,
       data_source_id   = NULL,
       config_json      = JSON_SET(
                            CAST(config_json AS JSON),
                            '$.groupId', 0,          -- 0 = 몰의 '전체' 랭킹 탭 자동 선택
                            '$.period',  'DAILY',
                            '$.moreHref', '/best'
                          )
 WHERE id = 10 AND section_type = 'product_grid';

-- mall 2 — '종합관 베스트'
UPDATE page_section
   SET section_type     = 'best_ranking',
       data_source_type = NULL,
       data_source_id   = NULL,
       config_json      = JSON_SET(
                            CAST(config_json AS JSON),
                            '$.groupId', 0,
                            '$.period',  'DAILY',
                            '$.moreHref', '/best'
                          )
 WHERE id = 39 AND section_type = 'product_grid';

-- 확인
SELECT id, page_id, section_type, title,
       JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.period'))   AS period,
       JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.moreHref')) AS more_href
  FROM page_section
 WHERE id IN (10, 39);

-- 되돌리기 (문제가 생기면)
--   UPDATE page_section SET section_type='product_grid', data_source_type='product_group',
--          data_source_id = CASE id WHEN 10 THEN 1 WHEN 39 THEN 9 END
--    WHERE id IN (10, 39);
