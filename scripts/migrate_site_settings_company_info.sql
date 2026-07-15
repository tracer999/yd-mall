-- 회사정보: 전자상거래법·개인정보보호법 필수 표시사항 컬럼 추가.
-- 추가·nullable 이라 무해 · 기존 동작 불변. (2026-07-15 개발 DB 적용)
--
-- 대표자 성명, 통신판매업 신고번호, 고객센터 상담시간(멀티라인),
-- 개인정보 보호책임자 성명/이메일. (사업자정보확인 링크는 사업자번호로 생성 → 컬럼 불필요)
ALTER TABLE site_settings
  ADD COLUMN ceo_name              VARCHAR(100) NULL COMMENT '대표자 성명'                    AFTER company_name,
  ADD COLUMN mail_order_number     VARCHAR(100) NULL COMMENT '통신판매업 신고번호'            AFTER business_number,
  ADD COLUMN cs_hours              VARCHAR(500) NULL COMMENT '고객센터 상담시간 안내(멀티라인)' AFTER contact_phone,
  ADD COLUMN privacy_officer_name  VARCHAR(100) NULL COMMENT '개인정보 보호책임자 성명'        AFTER cs_hours,
  ADD COLUMN privacy_officer_email VARCHAR(255) NULL COMMENT '개인정보 보호책임자 이메일'      AFTER privacy_officer_name;
