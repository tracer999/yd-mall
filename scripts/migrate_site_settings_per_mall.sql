-- P5: site_settings 를 몰별 행으로 (브랜딩 몰별 분리). 무해 · 기존 동작 불변.
-- (2026-07-10 운영 적용 완료)
--
-- 1) 싱글턴 강제 CHECK 제약 제거 (id=1 만 허용하던 것)
ALTER TABLE site_settings DROP CHECK site_settings_chk_1;
-- 2) id 를 auto_increment 로 (새 몰 행이 새 id 를 받도록)
ALTER TABLE site_settings MODIFY id INT NOT NULL AUTO_INCREMENT;
-- 3) mall_id 추가 (기존 행 → 1 백필) + 몰당 1행 유니크
ALTER TABLE site_settings ADD COLUMN mall_id BIGINT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE site_settings ADD UNIQUE KEY uk_sitesettings_mall (mall_id);
