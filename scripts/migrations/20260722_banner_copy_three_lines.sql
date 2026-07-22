-- 배너 문구(overlay_subtitle) 를 메인 슬라이더 외 배너에서도 쓴다.
--
-- 카테고리·브랜드·메뉴별·프로모션 배너에 "제목(작게) + 배너 문구(크게, 최대 3줄)" 를 얹기 위해
-- 기존 컬럼을 그대로 재사용한다. 3줄이 되면서 200자로는 빠듯해 300자로 넓힌다(축소가 아니라 확장이라 무손실).
--
-- 적용:
--   mysql -h ydata.co.kr -u ydatasvc -p yd_mall < scripts/migrations/20260722_banner_copy_three_lines.sql

ALTER TABLE `banners`
    MODIFY COLUMN `overlay_subtitle` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL
        COMMENT '배너 문구(줄바꿈 구분. 메인 슬라이더 최대 2줄 / 그 외 배너 최대 3줄)';
