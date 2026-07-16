-- 샘플 히어로 슬라이드 멀티미디어 확장 — 몰 생성 시 영상 배너까지 복제되게 한다.
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_sample_hero_media.sql
--
-- 배경:
--   scripts/migrate_hero_slide_media.sql 가 hero_slide(몰 스코프)에 영상 컬럼을 넣었지만,
--   샘플 리소스 테이블(sample_hero_slide)은 image_path 한 칸뿐이라 sampleSeeder 가 영상을
--   나를 수 없었다. 그래서 새 몰은 영원히 이미지 배너만 갖는다. 여기서 대칭을 맞춘다.
--
-- 컬럼명 규약: hero_slide 는 *_url, 샘플 리소스는 *_path 다(기존 image_path 를 따른다).
--              sampleSeeder 가 path → url 로 옮겨 담는다.
--
-- 원칙은 hero_slide 와 동일하다(migrate_hero_slide_media.sql 참고):
--   1) 멀티미디어는 MAIN 슬롯 전용 → CHECK
--   2) autoplay 는 muted 필수 → CHECK
--   3) WebM 우선 + MP4 폴백
--   4) 모바일은 이미지로 폴백 가능(데이터·배터리)
--   5) 경로는 /images/... 만(= git 에 커밋돼 납품본에 실리는 경로). /uploads/ 는 배포에 안 실린다.

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 컬럼 추가 (멱등 — information_schema 가드)
-- ---------------------------------------------------------------------------

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='media_type');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN media_type ENUM('IMAGE','VIDEO','YOUTUBE','VIMEO') NOT NULL DEFAULT 'IMAGE' COMMENT '표현 방식. IMAGE 외에는 slot=MAIN 에서만 허용' AFTER slot",
    "SELECT 'media_type 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='mobile_image_path');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN mobile_image_path VARCHAR(255) NULL COMMENT '모바일 전용 이미지. 비디오여도 모바일은 이걸로 폴백(데이터·배터리)' AFTER image_path",
    "SELECT 'mobile_image_path 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='video_webm_path');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN video_webm_path VARCHAR(255) NULL COMMENT 'VP9/AV1 WebM. 먼저 시도된다' AFTER mobile_image_path",
    "SELECT 'video_webm_path 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='video_mp4_path');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN video_mp4_path VARCHAR(255) NULL COMMENT 'H.264 MP4 — 호환성 폴백. WebM 미지원 브라우저용' AFTER video_webm_path",
    "SELECT 'video_mp4_path 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='embed_id');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN embed_id VARCHAR(64) NULL COMMENT 'YouTube 영상ID / Vimeo 숫자ID. 전체 URL 이 아니라 ID 만' AFTER video_mp4_path",
    "SELECT 'embed_id 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='poster_path');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN poster_path VARCHAR(255) NULL COMMENT '비디오 poster. 비면 image_path 로 폴백. 영상 로드 전 화면을 채워 LCP·CLS 를 지킨다' AFTER embed_id",
    "SELECT 'poster_path 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='autoplay');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN autoplay TINYINT(1) NOT NULL DEFAULT 1 COMMENT '자동재생. 1이면 muted 도 1이어야 한다(브라우저 정책)' AFTER poster_path",
    "SELECT 'autoplay 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='muted');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN muted TINYINT(1) NOT NULL DEFAULT 1 COMMENT '음소거. autoplay=1 이면 반드시 1' AFTER autoplay",
    "SELECT 'muted 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='loop_play');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN loop_play TINYINT(1) NOT NULL DEFAULT 1 COMMENT '반복 재생. (loop 는 MySQL 예약어라 loop_play)' AFTER muted",
    "SELECT 'loop_play 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND COLUMN_NAME='preload');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD COLUMN preload ENUM('none','metadata') NOT NULL DEFAULT 'metadata' COMMENT '비디오 preload. auto 는 두지 않는다(LCP 보호)' AFTER loop_play",
    "SELECT 'preload 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 무결성 제약 — hero_slide 와 동일하게 DB 가 막는다
-- ---------------------------------------------------------------------------

SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND CONSTRAINT_NAME='chk_shs_media_main_only');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD CONSTRAINT chk_shs_media_main_only CHECK (media_type = 'IMAGE' OR slot = 'MAIN')",
    "SELECT 'chk_shs_media_main_only 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sample_hero_slide' AND CONSTRAINT_NAME='chk_shs_autoplay_muted');
SET @sql := IF(@has=0,
    "ALTER TABLE sample_hero_slide ADD CONSTRAINT chk_shs_autoplay_muted CHECK (autoplay = 0 OR muted = 1)",
    "SELECT 'chk_shs_autoplay_muted 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 기본 샘플 배너 적용
--
-- 지금까지 MAIN 슬라이드는 800×600 **상품 사진**을 1920×600 배너 자리에 그대로 써서
-- 배너 레이아웃(기본 테마 theme_banner)에서 심하게 잘려 보였다. public/images/sample/banners/
-- 의 배너 자산으로 교체한다. 상품 연결(product_key)은 유지 — 클릭하면 그 상품으로 간다.
--
-- image_path 는 "이 슬라이드의 정지 이미지"다. 영상 슬라이드에서는 포스터와 같은 값을 두어
-- ① 영상 로드 전 화면(poster) ② 쇼케이스/에디토리얼의 정지 표현 ③ 모바일 폴백을 한 번에 만족시킨다.
-- ---------------------------------------------------------------------------

-- sample1 — 이미지 배너 (webp 사용. 같은 그림의 jpg 는 폴백용으로 파일만 둔다)
UPDATE sample_hero_slide SET
    media_type        = 'IMAGE',
    image_path        = '/images/sample/banners/sample1.webp',
    mobile_image_path = '/images/sample/banners/sample1.webp',
    video_webm_path   = NULL, video_mp4_path = NULL, poster_path = NULL
  WHERE slot = 'MAIN' AND product_key = 'p1';

-- sample2 — 영상 배너 (webm + mp4 + poster 3종 완비)
UPDATE sample_hero_slide SET
    media_type        = 'VIDEO',
    image_path        = '/images/sample/banners/sample2-poster.webp',
    mobile_image_path = '/images/sample/banners/sample2-poster.webp',
    video_webm_path   = '/images/sample/banners/sample2.webm',
    video_mp4_path    = '/images/sample/banners/sample2.mp4',
    poster_path       = '/images/sample/banners/sample2-poster.webp',
    autoplay = 1, muted = 1, loop_play = 1, preload = 'metadata'
  WHERE slot = 'MAIN' AND product_key = 'p2';

-- sample3 — 영상 배너 (mp4·poster 는 scripts 로 webm 에서 생성)
UPDATE sample_hero_slide SET
    media_type        = 'VIDEO',
    image_path        = '/images/sample/banners/sample3-poster.webp',
    mobile_image_path = '/images/sample/banners/sample3-poster.webp',
    video_webm_path   = '/images/sample/banners/sample3.webm',
    video_mp4_path    = '/images/sample/banners/sample3.mp4',
    poster_path       = '/images/sample/banners/sample3-poster.webp',
    autoplay = 1, muted = 1, loop_play = 1, preload = 'metadata'
  WHERE slot = 'MAIN' AND product_key = 'p3';
