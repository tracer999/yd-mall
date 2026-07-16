-- 샘플 히어로 — 모바일 전용 세로 영상 컬럼 + 기본 모바일 배너 적용
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sample_hero_mobile_video.sql
--
-- 배경:
--   migrate_sample_hero_media.sql 가 샘플 리소스에 영상 컬럼을 넣을 때 모바일 이미지 폴백만 두고
--   모바일 전용 영상(hero_slide.mobile_video_*_url)은 뺐다 — 그때는 세로 자산이 없었다.
--   sample_mo.webm(1080×1920 세로)이 들어오면서 나를 칸이 필요해졌다.
--
-- 왜 모바일 전용 세로 영상이 따로 필요한가:
--   가로(1920×1080) 영상을 모바일에 그대로 쓰면 좌우가 잘리거나 레터박스가 생긴다.
--   hero_media 의 모바일 폴백 순서: 모바일 영상 → 모바일 이미지 → 데스크톱 영상 → 이미지.

SET @db := DATABASE();

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='mobile_video_webm_path');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN mobile_video_webm_path VARCHAR(255) NULL COMMENT '모바일 전용 세로 WebM(1080x1920). 먼저 시도된다' AFTER video_mp4_path",
    "SELECT 'mobile_video_webm_path 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='mobile_video_mp4_path');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN mobile_video_mp4_path VARCHAR(255) NULL COMMENT '모바일 전용 세로 MP4(1080x1920). 없으면 mobile_image_path → 데스크톱 영상 순 폴백' AFTER mobile_video_webm_path",
    "SELECT 'mobile_video_mp4_path 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 모바일 배너 적용 — 테마 구분 없이 공통(sample_hero_slide 는 전역 리소스다).
--
-- 세로 자산이 sample_mo 하나뿐이라, 데스크톱이 영상인 슬라이드 중 **첫 번째(p2)에만** 건다.
-- 3개 슬라이드에 같은 영상을 걸면 모바일 캐러셀이 같은 화면을 세 번 돌린다.
-- 나머지 슬라이드는 모바일 이미지(포스터) 폴백을 그대로 쓴다.
-- 슬라이드별로 바꾸려면: 서비스 관리 → 샘플 데이터 관리.
-- ---------------------------------------------------------------------------

UPDATE sample_hero_slide SET
    mobile_video_webm_path = '/images/sample/banners/sample_mo.webm',
    mobile_video_mp4_path  = '/images/sample/banners/sample_mo.mp4',
    mobile_image_path      = '/images/sample/banners/sample_mo-poster.webp'
  WHERE slot = 'MAIN' AND product_key = 'p2';
