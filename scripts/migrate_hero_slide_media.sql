-- 히어로 슬라이드 멀티미디어 확장 — 메인 배너(slot='MAIN')에 이미지/비디오/YouTube/Vimeo
-- 설계: docs/사이트개선/히어로_멀티미디어_설계.md
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_hero_slide_media.sql
--
-- 왜 새 테이블(hero_banner)이 아니라 hero_slide 확장인가:
--   이미 배너 계열이 banners(전역·mall_id 없음) + hero_slide(몰 스코프) 로 이중이다.
--   여기 세 번째 테이블을 더하면 3중이 된다. theme_hero 리졸버가 hero_slide 로 수렴 중이고
--   hero_slide 는 mall_id 를 가진 유일한 히어로 테이블이므로 이쪽을 확장한다.
--
-- 원칙:
--   1) **멀티미디어는 MAIN 슬롯 전용**. FEATURE(우측 카드)는 이미지만. → CHECK 제약으로 강제.
--   2) **autoplay 는 muted 없이 브라우저가 막는다**(검은 화면). → CHECK 제약으로 강제.
--   3) WebM 우선 + MP4 폴백. 브라우저가 <source> 를 위에서부터 고른다.
--   4) 모바일은 비디오 대신 이미지로 폴백할 수 있어야 한다(데이터·배터리·저가 단말).
--   5) 모든 URL 은 **우리 사이트 경로**(/uploads/... 또는 /images/...)다. 외부 URL 을 그대로
--      박지 않는다 — services/media/urlIngest 가 내려받아 저장한 뒤 그 경로를 넣는다.

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 컬럼 추가 (멱등 — information_schema 가드)
-- ---------------------------------------------------------------------------

-- media_type: 이 슬라이드가 무엇으로 그려지는가
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='media_type');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN media_type ENUM('IMAGE','VIDEO','YOUTUBE','VIMEO') NOT NULL DEFAULT 'IMAGE' COMMENT '표현 방식. IMAGE 외에는 slot=MAIN 에서만 허용' AFTER slot",
    "SELECT 'media_type 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 모바일 폴백 이미지 (media_type 이 VIDEO 여도 모바일은 이 이미지를 쓸 수 있다)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='mobile_image_url');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN mobile_image_url VARCHAR(500) NULL COMMENT '모바일 전용 이미지. 비디오여도 모바일은 이걸로 폴백(데이터·배터리)' AFTER image_url",
    "SELECT 'mobile_image_url 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 비디오 소스 — WebM 우선, MP4 폴백
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='video_webm_url');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN video_webm_url VARCHAR(500) NULL COMMENT 'VP9/AV1 WebM. 같은 화질에서 MP4보다 20~40%% 작다. 먼저 시도된다' AFTER mobile_image_url",
    "SELECT 'video_webm_url 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='video_mp4_url');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN video_mp4_url VARCHAR(500) NULL COMMENT 'H.264 MP4 — 호환성 폴백. WebM 미지원 브라우저용' AFTER video_webm_url",
    "SELECT 'video_mp4_url 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 모바일 전용 세로 영상(720×1280). 가로 영상을 모바일에 그대로 쓰면 좌우가 잘리거나 레터박스가 생긴다.
-- 없으면 mobile_image_url → (그것도 없으면) 데스크톱 영상 순으로 폴백한다.
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='mobile_video_webm_url');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN mobile_video_webm_url VARCHAR(500) NULL COMMENT '모바일 전용 세로 WebM(720x1280). 선택' AFTER video_mp4_url",
    "SELECT 'mobile_video_webm_url 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='mobile_video_mp4_url');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN mobile_video_mp4_url VARCHAR(500) NULL COMMENT '모바일 전용 세로 MP4(720x1280). 없으면 mobile_image_url → 데스크톱 영상 순 폴백' AFTER mobile_video_webm_url",
    "SELECT 'mobile_video_mp4_url 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- YouTube/Vimeo 임베드
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='embed_id');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN embed_id VARCHAR(64) NULL COMMENT 'YouTube 영상ID / Vimeo 숫자ID. 전체 URL 이 아니라 ID 만 저장(임베드 파라미터는 렌더가 조립)' AFTER video_mp4_url",
    "SELECT 'embed_id 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- poster — 비디오 로드 전에 보여줄 이미지(LCP·CLS 방지). 비면 image_url 로 폴백.
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='poster_url');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN poster_url VARCHAR(500) NULL COMMENT '비디오 poster. 비면 image_url 로 폴백. 영상 로드 전 화면을 채워 LCP·CLS 를 지킨다' AFTER embed_id",
    "SELECT 'poster_url 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 재생 옵션
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='autoplay');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN autoplay TINYINT(1) NOT NULL DEFAULT 1 COMMENT '자동재생. 1이면 muted 도 1이어야 한다(브라우저 정책)' AFTER poster_url",
    "SELECT 'autoplay 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='muted');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN muted TINYINT(1) NOT NULL DEFAULT 1 COMMENT '음소거. autoplay=1 이면 반드시 1(아니면 브라우저가 재생을 거부해 검은 화면)' AFTER autoplay",
    "SELECT 'muted 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ⚠ `loop` 는 MySQL 예약어라 컬럼명으로 쓰면 매번 백틱이 필요하다 → loop_play 로 둔다.
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='loop_play');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN loop_play TINYINT(1) NOT NULL DEFAULT 1 COMMENT '반복 재생. (loop 는 MySQL 예약어라 loop_play)' AFTER muted",
    "SELECT 'loop_play 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- preload — 히어로는 화면 최상단이라 auto 로 두면 LCP 를 해친다. poster 가 화면을 채우므로
-- metadata(길이/치수만) 또는 none 이 정석. (미디어 스펙: preload metadata 또는 none)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND COLUMN_NAME='preload');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD COLUMN preload ENUM('none','metadata') NOT NULL DEFAULT 'metadata' COMMENT '비디오 preload. auto 는 두지 않는다(LCP 보호)' AFTER loop_play",
    "SELECT 'preload 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 무결성 제약 — 앱이 잊어도 DB 가 막는다
-- ---------------------------------------------------------------------------

-- 1) 멀티미디어는 MAIN 슬롯 전용 (FEATURE 우측 카드는 이미지만)
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND CONSTRAINT_NAME='chk_hero_media_main_only');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD CONSTRAINT chk_hero_media_main_only CHECK (media_type = 'IMAGE' OR slot = 'MAIN')",
    "SELECT 'chk_hero_media_main_only 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) 자동재생은 음소거 필수 (브라우저가 소리 있는 autoplay 를 차단 → 검은 화면 방지)
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='hero_slide' AND CONSTRAINT_NAME='chk_hero_autoplay_muted');
SET @sql := IF(@has=0,
    "ALTER TABLE hero_slide ADD CONSTRAINT chk_hero_autoplay_muted CHECK (autoplay = 0 OR muted = 1)",
    "SELECT 'chk_hero_autoplay_muted 이미 존재'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
