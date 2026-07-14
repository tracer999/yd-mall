-- 회원가입 개편: 소셜 3종(Google/Kakao/Naver) + 자체 가입폼 + 주문·배송용 상세정보
-- 적용: mysql -h ydata.co.kr -u ydatasvc -p'****' yd_mall < scripts/migrate_signup_v2.sql

-- 1) 소셜 provider 확장 + 자체 가입(비밀번호) 지원
ALTER TABLE users
  ADD COLUMN naver_id VARCHAR(255) NULL COMMENT '네이버 OAuth 고유 ID' AFTER kakao_id,
  ADD COLUMN password_hash VARCHAR(255) NULL COMMENT '자체 가입 비밀번호 해시 (bcrypt). 소셜 전용 계정은 NULL' AFTER naver_id,
  ADD COLUMN signup_provider VARCHAR(10) NULL COMMENT '최초 가입 경로 (LOCAL/GOOGLE/KAKAO/NAVER)' AFTER password_hash;

ALTER TABLE users ADD UNIQUE KEY naver_id (naver_id);

-- 2) 주문·배송용 상세정보
ALTER TABLE users
  ADD COLUMN receiver_name VARCHAR(50) NULL COMMENT '기본 배송지 수령인명' AFTER zipcode,
  ADD COLUMN phone_sub VARCHAR(20) NULL COMMENT '보조 연락처' AFTER receiver_name,
  ADD COLUMN delivery_request VARCHAR(255) NULL COMMENT '기본 배송 요청사항' AFTER phone_sub;

-- 3) 휴대폰 중복 가입 차단 (애플리케이션 체크만으로는 동시 요청 시 레이스가 남는다)
UPDATE users SET phone = NULL WHERE phone = '';
ALTER TABLE users ADD UNIQUE KEY phone (phone);

-- 4) 기존 회원 가입 경로 백필
UPDATE users SET signup_provider = 'KAKAO'  WHERE signup_provider IS NULL AND kakao_id  IS NOT NULL;
UPDATE users SET signup_provider = 'GOOGLE' WHERE signup_provider IS NULL AND google_id IS NOT NULL;

-- 5) 기존 회원 기본 배송지 수령인명 백필 (이름 = 수령인)
UPDATE users SET receiver_name = name WHERE receiver_name IS NULL AND phone IS NOT NULL;

-- 6) 네이버 로그인 시스템 설정 자리 (값은 관리자 > 시스템 설정에서 입력)
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('naver_client_id',        '', 'Naver OAuth Client ID'),
  ('naver_client_secret',    '', 'Naver OAuth Client Secret'),
  ('naver_callback_url_dev',  'http://localhost:3006/auth/naver/callback', 'Naver Dev Callback URL'),
  ('naver_callback_url_prod', 'https://dev-mall.ydata.co.kr/auth/naver/callback', 'Naver Prod Callback URL')
ON DUPLICATE KEY UPDATE description = VALUES(description);
