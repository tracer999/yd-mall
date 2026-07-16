-- 공지사항 몰 스코핑 — notices 에 mall_id 를 추가한다.
--
-- 배경: notices 만 mall_id 가 없어서 **한 몰에 쓴 공지가 모든 몰 고객에게 노출**됐다.
--       멀티몰 빌더에서는 납품한 A 몰의 공지가 B 몰에 뜨는 셈이라 치명적이다.
--       같은 성격의 faq · inquiries · custom_menu · theme 는 전부
--       `mall_id BIGINT NOT NULL DEFAULT 1` + 인덱스 형태이므로 그 관례를 그대로 따른다.
--
-- 기존 행: DEFAULT 1 로 채워져 **1번 몰(와이디몰 건강식품관)** 소유가 된다.
--          지금까지 쓰인 공지가 1번 몰 기준으로 작성된 것들이라 이게 가장 사실에 가깝다.
--          다른 몰로 옮기려면 관리자에서 해당 몰을 편집 몰로 고른 뒤 다시 등록하거나,
--          아래 UPDATE 로 직접 재배정한다.
--
-- 실행: mysql -h ydata.co.kr -u ydatasvc -p'...' yd_mall < scripts/migrate_notices_mall_id.sql
-- 재실행 안전: 컬럼·인덱스 존재 여부를 확인하고 없을 때만 만든다.

-- 1) mall_id 컬럼 (없을 때만)
SET @has_col = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notices' AND COLUMN_NAME = 'mall_id'
);
SET @sql = IF(@has_col = 0,
    'ALTER TABLE notices ADD COLUMN mall_id BIGINT NOT NULL DEFAULT 1 AFTER id',
    'SELECT "notices.mall_id 이미 존재 — 건너뜀"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 조회 인덱스 (없을 때만) — 고객 화면이 mall_id + type 으로 목록을 뽑는다.
SET @has_idx = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notices' AND INDEX_NAME = 'idx_notices_mall_type'
);
SET @sql = IF(@has_idx = 0,
    'ALTER TABLE notices ADD INDEX idx_notices_mall_type (mall_id, type)',
    'SELECT "idx_notices_mall_type 이미 존재 — 건너뜀"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 확인
SELECT mall_id, type, COUNT(*) AS cnt FROM notices GROUP BY mall_id, type ORDER BY mall_id, type;
