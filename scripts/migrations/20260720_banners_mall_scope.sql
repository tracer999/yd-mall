-- banners 몰 스코프 (테마2 '일반 배너 슬라이드쇼' 복구용)
--
-- 배경: banners 는 mall_id 가 없어 전 몰 공용이었다. 그래서 theme_hero 는 이 테이블을 의도적으로
--       피하고 hero_slide 만 읽었고(theme_hero.js 주석), 그 결과 테마2(layout='banner')가
--       '상품 배너'와 같은 소스를 쓰게 되어 테마1과 구분이 사라졌다.
--       mall_id 를 붙여 몰별로 분리하면 theme_hero 의 banner 레이아웃이 banners 를 읽을 수 있다.
--
-- CATEGORY/BRAND 는 이미 category_id 또는 group_key='common:{TYPE}:{mallId}' 로 간접 스코핑돼
-- 있었다. mall_id 는 그 규칙을 대체하지 않고 **추가 조건**으로 얹는다(기존 폴백 동작 보존).
--
-- 백필: 기존 행은 전 몰에 노출되던 것이므로, 몰마다 복제해 마이그레이션 전후 화면을 동일하게 둔다.
--       이후 편집은 몰별로 갈라진다(= 의도한 최종 상태).
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p yd_mall < scripts/migrations/20260720_banners_mall_scope.sql

-- 1) 컬럼 추가 (재실행 안전 — 이미 있으면 건너뛴다)
SET @has_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banners' AND COLUMN_NAME = 'mall_id'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE banners ADD COLUMN mall_id BIGINT NOT NULL DEFAULT 1 COMMENT ''몰 ID(멀티몰 스코프)'' AFTER id',
  'SELECT ''banners.mall_id 이미 존재 — 건너뜀''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banners' AND INDEX_NAME = 'idx_banners_mall_type'
);
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE banners ADD INDEX idx_banners_mall_type (mall_id, banner_type, display_order)',
  'SELECT ''idx_banners_mall_type 이미 존재 — 건너뜀''');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) 백필 — 마이그레이션 이전 행(아직 복제 안 된 것)을 기본몰에 귀속시킨 뒤 나머지 몰로 복제한다.
--    @seed 를 먼저 고정해야 복제 도중 늘어난 행을 다시 복제하는 일이 없다.
SET @default_mall := (SELECT id FROM mall WHERE is_default = 1 ORDER BY id ASC LIMIT 1);
SET @default_mall := IFNULL(@default_mall, 1);

-- group_key='common:{TYPE}:{mallId}' 는 키 자체에 몰이 박혀 있다. 이건 복제하지 않고
-- 키가 가리키는 몰로 귀속시킨다(복제하면 mall_id=2 인데 키는 common:BRAND:1 인 모순이 생긴다).
CREATE TEMPORARY TABLE _banner_seed AS
  SELECT id FROM banners WHERE group_key IS NULL OR group_key NOT LIKE 'common:%';

UPDATE banners
   SET mall_id = CAST(SUBSTRING_INDEX(group_key, ':', -1) AS UNSIGNED)
 WHERE group_key LIKE 'common:%'
   AND SUBSTRING_INDEX(group_key, ':', -1) REGEXP '^[0-9]+$';

UPDATE banners SET mall_id = @default_mall WHERE id IN (SELECT id FROM _banner_seed);

INSERT INTO banners
  (mall_id, banner_type, group_key, category_id, title,
   overlay_title, overlay_subtitle, overlay_button_text, overlay_button_color, overlay_align,
   image_url, mobile_image_url, link_url, display_order, is_active, start_date, end_date)
SELECT m.id, b.banner_type, b.group_key, b.category_id, b.title,
       b.overlay_title, b.overlay_subtitle, b.overlay_button_text, b.overlay_button_color, b.overlay_align,
       b.image_url, b.mobile_image_url, b.link_url, b.display_order, b.is_active, b.start_date, b.end_date
  FROM banners b
  CROSS JOIN mall m
 WHERE b.id IN (SELECT id FROM _banner_seed)
   AND m.id <> @default_mall;

DROP TEMPORARY TABLE _banner_seed;

-- 3) 확인
SELECT mall_id, banner_type, COUNT(*) AS n FROM banners GROUP BY mall_id, banner_type ORDER BY mall_id, banner_type;
