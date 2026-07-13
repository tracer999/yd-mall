-- 페이지 빌더 드리프트 정리 (③)
--
-- 베스트 → 랭킹 엔진, 오늘특가 → 특가 모듈로 옮겨가면서 남은 것들을 정리한다.
-- 🔴 코드(ranking_tabs 의 period 전환)를 **배포한 뒤에** 실행한다.

-- ---------------------------------------------------------------------------
-- 1) 고아 상품그룹 — 비활성화 (⚠️ 삭제하지 않는다)
--
--    참조가 0 이다:
--      id 1 '베스트'(mall1, 상품 4건)      → 홈 베스트가 랭킹 엔진으로 바뀌며 안 쓰임
--      id 9 '종합관 베스트'(mall2, 50건)   → 위와 같음
--      id 4 'CT 오늘특가'(mall1, 3건)      → 오늘특가가 특가 모듈(/deals)로 이관되며 안 쓰임
--
--    ⚠️ DELETE 하면 product_group_item 이 FK CASCADE 로 함께 지워진다.
--       담긴 상품 57건은 운영자가 손으로 고른 큐레이션이다 — 되돌릴 수 없다.
--       비활성화는 되돌릴 수 있다(getById 가 is_active=1 만 읽으므로 노출도 확실히 끊긴다).
--       한동안 지켜본 뒤 정말 필요 없으면 그때 지운다.
--
--    밀고 싶은 상품은 이제 상품그룹이 아니라 **MD 픽**(best_pin)으로 고정한다.
-- ---------------------------------------------------------------------------
UPDATE product_group SET is_active = 0 WHERE id IN (1, 4, 9);

-- ---------------------------------------------------------------------------
-- 2) 고아 발행 리비전 — 삭제
--
--    page_revision 3건이 **존재하지 않는 page 3** 을 가리킨다(page 는 1·4·5·6 뿐).
--    page_revision 에 FK 가 없어서 페이지가 지워질 때 함께 안 지워졌다.
--
--    ⚠️ 이걸 지운다고 "발행" 흐름이 살아나는 것은 아니다. 지금도 **어떤 페이지에도
--       발행 스냅샷이 없어서** displayService 가 라이브 page_section 으로 폴백한다.
--       = 페이지 빌더에서 섹션을 고치는 순간 운영에 반영된다. 그건 별도 과제다.
-- ---------------------------------------------------------------------------
DELETE FROM page_revision WHERE page_id NOT IN (SELECT id FROM page);

-- ---------------------------------------------------------------------------
-- 3) 섹션 16 — 죽은 data_source_type 제거
--    deal_carousel 의 dataSource 는 null 이다(dealService 가 읽는다). product_group 을
--    가리키는 흔적만 남아 있었다(data_source_id 는 이미 NULL).
-- ---------------------------------------------------------------------------
UPDATE page_section SET data_source_type = NULL
 WHERE id = 16 AND section_type = 'deal_carousel';

-- ---------------------------------------------------------------------------
-- 4) 섹션 18 (랭킹 탭) — 죽은 sort 옵션을 period 로 교체
--
--    옛 sort='views' 는 이제 읽히지 않는다. 남겨두면 다음 사람이 "랭킹 기준이 조회수구나"
--    로 잘못 읽는다. 순위 기준은 best_score_config 에 단일 정의된다.
--
--    제목도 고친다 — 탭이 카테고리만이 아니라 **랭킹 그룹**(전체·카테고리·브랜드)이다.
-- ---------------------------------------------------------------------------
UPDATE page_section
   SET title = '인기 랭킹',
       config_json = JSON_SET(
                       JSON_REMOVE(CAST(config_json AS JSON), '$.sort'),
                       '$.period', 'DAILY'
                     )
 WHERE id = 18 AND section_type = 'ranking_tabs';

-- ---------------------------------------------------------------------------
-- 5) 섹션 67 (종합관 홈 쇼핑특가) — 빈 config 채우기
--    페이지 빌더에서 추가만 하고 설정을 안 채워 배경색·뱃지·더보기 링크가 없었다.
--    같은 성격인 mall1 섹션 16 과 같은 값으로 맞춘다.
-- ---------------------------------------------------------------------------
UPDATE page_section
   SET config_json = JSON_OBJECT(
         'maxCount', 12,
         'moreLink', '/deals',
         'badgeText', '특가',
         'sectionClass', 'py-12 bg-[var(--gh-secondary)]',
         'columnsPerView', 4,
         'dealCategoryCode', ''
       )
 WHERE id = 67 AND section_type = 'deal_carousel' AND config_json IS NULL;

-- 확인
SELECT id, mall_id, name, is_active FROM product_group ORDER BY id;
SELECT COUNT(*) AS orphan_revisions FROM page_revision WHERE page_id NOT IN (SELECT id FROM page);
SELECT id, page_id, section_type, title, data_source_type, config_json
  FROM page_section WHERE id IN (16, 18, 67)\G
