-- 히어로 layout 값 재정의 — 배치 축과 콘텐츠 축 분리
--
-- 예전 layout 은 배치와 데이터 소스를 함께 정했다(showcase=2단+상품, banner=전체폭+배너,
-- editorial=풀블리드+상품). 그래서 테마를 바꾸면 등록해 둔 배너·상품이 통째로 안 보였다.
-- 이제 layout 은 **배치만** 뜻하고, 콘텐츠 종류는 site_settings.hero_variant 가 정한다.
--
--   showcase  → split_feature (좌 히어로 + 우 상품 카드)
--   banner    → full_width    (전체폭)
--   editorial → full_bleed    (풀블리드 + 오버레이 헤더)
--
-- 코드(theme_hero.js / theme_hero.ejs)는 옛 값도 계속 받아 주므로 이 마이그레이션 없이도
-- 화면은 깨지지 않는다. 데이터를 새 어휘로 맞춰 관리자 화면 표시와 일치시키는 것이 목적이다.
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p yd_mall < scripts/migrations/20260720_hero_layout_axis_split.sql

-- 1) 라이브 섹션
UPDATE page_section
   SET config_json = JSON_SET(config_json, '$.layout', 'split_feature')
 WHERE section_type = 'theme_hero' AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.layout')) = 'showcase';

UPDATE page_section
   SET config_json = JSON_SET(config_json, '$.layout', 'full_width')
 WHERE section_type = 'theme_hero' AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.layout')) = 'banner';

UPDATE page_section
   SET config_json = JSON_SET(config_json, '$.layout', 'full_bleed')
 WHERE section_type = 'theme_hero' AND JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.layout')) = 'editorial';

-- 2) 발행 스냅샷 — 프론트가 우선 읽는 쪽이라 여기까지 바꿔야 화면에 반영된다.
--    snapshot_json 은 섹션 배열이라 JSON 경로로 집기 어렵다. 문자열 치환으로 처리한다
--    ("layout": "..." 형태는 이 컬럼에서 theme_hero 의 배치값에만 쓰인다).
UPDATE page_revision
   SET snapshot_json = REPLACE(snapshot_json, '"layout": "showcase"',  '"layout": "split_feature"')
 WHERE snapshot_json LIKE '%"layout": "showcase"%';

UPDATE page_revision
   SET snapshot_json = REPLACE(snapshot_json, '"layout": "banner"',    '"layout": "full_width"')
 WHERE snapshot_json LIKE '%"layout": "banner"%';

UPDATE page_revision
   SET snapshot_json = REPLACE(snapshot_json, '"layout": "editorial"', '"layout": "full_bleed"')
 WHERE snapshot_json LIKE '%"layout": "editorial"%';

-- 공백 없는 표기(JSON_SET 결과 등)도 함께 정리한다.
UPDATE page_revision SET snapshot_json = REPLACE(snapshot_json, '"layout":"showcase"',  '"layout":"split_feature"') WHERE snapshot_json LIKE '%"layout":"showcase"%';
UPDATE page_revision SET snapshot_json = REPLACE(snapshot_json, '"layout":"banner"',    '"layout":"full_width"')    WHERE snapshot_json LIKE '%"layout":"banner"%';
UPDATE page_revision SET snapshot_json = REPLACE(snapshot_json, '"layout":"editorial"', '"layout":"full_bleed"')    WHERE snapshot_json LIKE '%"layout":"editorial"%';

-- 3) 확인
SELECT p.mall_id,
       JSON_UNQUOTE(JSON_EXTRACT(ps.config_json, '$.layout')) AS live_layout,
       (SELECT ss.hero_variant FROM site_settings ss WHERE ss.mall_id = p.mall_id LIMIT 1) AS hero_variant
  FROM page_section ps JOIN page p ON p.id = ps.page_id
 WHERE ps.section_type = 'theme_hero'
 ORDER BY p.mall_id;
