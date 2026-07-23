-- 이메일 템플릿 관리 (쇼핑몰 관리 > 이메일 템플릿 관리)
--
-- 이 테이블에는 **관리자가 고친 것만** 들어간다. 행이 하나도 없어도 메일은 정상 발송된다
-- (기본 제목·본문은 코드의 services/email/emailTemplateRegistry.js 가 갖는다).
-- 그래서 마이그레이션에 기본 템플릿을 INSERT 하지 않는다 — 납품되는 몰마다 시드가 필요해지면
-- "여기선 되는데 고객 몰에선 안 되는" 기능이 된다.

CREATE TABLE IF NOT EXISTS email_template (
    id           INT NOT NULL AUTO_INCREMENT COMMENT 'PK',
    mall_id      BIGINT NOT NULL DEFAULT 1 COMMENT '몰 ID (몰마다 다른 문구를 쓸 수 있다)',
    template_key VARCHAR(60) NOT NULL COMMENT '템플릿 키 (emailTemplateRegistry 의 key)',
    subject      VARCHAR(255) DEFAULT NULL COMMENT '제목 오버라이드. NULL = 코드 기본값 사용',
    body         TEXT COMMENT '본문(HTML) 오버라이드. NULL = 코드 기본값 사용',
    is_enabled   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 이면 이 메일을 보내지 않는다',
    updated_by   INT DEFAULT NULL COMMENT '마지막 수정 관리자 admins.id',
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_email_template_mall_key (mall_id, template_key),
    KEY idx_email_template_mall (mall_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='주문·배송 안내 메일 템플릿 (코드 기본값에 대한 몰별 오버라이드)';

-- 관리자 메뉴: 부모 29 = '쇼핑몰 관리' (기존 자식 display_order 1~5)
--
-- ⚠️ is_active = 0 으로 넣는다. dev 서버와 로컬이 같은 DB 를 보므로, 라우트가 배포되기 전에
--    메뉴를 켜면 서버 관리자 화면에 404 링크가 뜬다. 코드를 푸시한 뒤 아래로 켠다.
--
--    UPDATE admin_menus SET is_active = 1 WHERE path = '/admin/email-templates';

INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
SELECT '이메일 템플릿 관리', '/admin/email-templates', 'bi-envelope-paper', 6, 29, 0, 'super_admin,admin'
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM admin_menus WHERE path = '/admin/email-templates');
