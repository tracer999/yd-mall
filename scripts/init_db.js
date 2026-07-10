/**
 * DB 초기 셋업 스크립트
 * - tables.sql로 테이블 생성
 * - 기본 관리자 계정 생성 (admin / dev-mall)
 * - admin_menus 기본 메뉴 데이터
 * - admin_verification_codes 기본 데이터
 * - categories 기본 카테고리 데이터
 * - site_settings 기본 설정 (가상의 회사 정보)
 * - system_settings 기본 설정 (가상의 API 키 등)
 *
 * 실행: npm run init:db  또는  node scripts/init_db.js
 *
 * 필요 환경변수: DB_HOST, DB_USER, DB_PASS, DB_NAME (.env)
 */
const path = require('path');
require('../config/env');
const mysql = require('mysql2/promise');
const fs = require('fs');
const bcrypt = require('bcrypt');

const DB_NAME = process.env.DB_NAME || 'dev_mall';
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;

function logMissingEnv() {
    const missing = [];
    if (!DB_HOST) missing.push('DB_HOST');
    if (!DB_USER) missing.push('DB_USER');
    if (DB_PASS === undefined) missing.push('DB_PASS');
    if (missing.length) {
        console.warn(`⚠️  Missing env vars: ${missing.join(', ')} (check .env)`);
    }
}

async function createConnectionSafe() {
    try {
        return await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS,
            multipleStatements: true,
            connectTimeout: 10000,
        });
    } catch (err) {
        console.error('❌ DB connection failed');
        console.error(`  host=${DB_HOST || '(empty)'} user=${DB_USER || '(empty)'} db=${DB_NAME}`);
        if (err.code) console.error(`  code=${err.code} errno=${err.errno}`);
        console.error(`  message=${err.message}`);
        console.error('  Hints: MySQL 서버가 실행 중인지, 호스트/포트 방화벽, 사용자/비밀번호, 로컬이면 127.0.0.1 사용 여부를 확인하세요.');
        throw err;
    }
}

async function initDB() {
    logMissingEnv();
    console.log(`Connecting to Database... (host=${DB_HOST || 'N/A'}, user=${DB_USER || 'N/A'}, db=${DB_NAME})`);
    const connection = await createConnectionSafe();

    try {
        console.log('Creating database if not exists...');
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        await connection.query(`USE \`${DB_NAME}\``);
        console.log(`Using database: ${DB_NAME}`);

        const sqlPath = path.join(__dirname, '..', 'tables.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`tables.sql not found at ${sqlPath}`);
        }
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing tables.sql...');
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query(sql);
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('Tables created successfully.');

        // Migration: admins.use_2fa 컬럼 추가 (기존 DB 대응)
        try {
            await connection.query(
                `ALTER TABLE admins ADD COLUMN use_2fa TINYINT(1) NOT NULL DEFAULT 1 COMMENT '이중인증 사용 여부 (1=사용, 0=미사용)' AFTER email`
            );
            console.log('Added use_2fa column to admins.');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }

        // Migration: site_settings 카카오채널 컬럼 추가 (기존 DB 대응)
        try {
            await connection.query(
                `ALTER TABLE site_settings ADD COLUMN kakao_channel_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '카카오채널 링크 사용 여부' AFTER youtube_url`
            );
            console.log('Added kakao_channel_enabled column to site_settings.');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await connection.query(
                `ALTER TABLE site_settings ADD COLUMN kakao_channel_url VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '카카오채널 URL' AFTER kakao_channel_enabled`
            );
            console.log('Added kakao_channel_url column to site_settings.');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }

        // 기본 관리자 계정 (없을 경우)
        const [admins] = await connection.query('SELECT id FROM admins WHERE username = ?', ['admin']);
        if (admins.length === 0) {
            console.log('Creating default admin account...');
            const hashedPassword = await bcrypt.hash('dev-mall', 10);
            await connection.query(
                'INSERT INTO admins (username, email, use_2fa, password, role) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'test@test.co.kr', 0, hashedPassword, 'super_admin']
            );
            console.log('Default admin created: admin / dev-mall (이중인증 미사용, role=super_admin, test@test.co.kr)');
        } else {
            console.log('Admin account already exists.');
        }

        // admin_menus 기본 메뉴 (없을 경우)
        const [menus] = await connection.query('SELECT id FROM admin_menus LIMIT 1');
        if (menus.length === 0) {
            console.log('Inserting default admin menus...');
            await connection.query(`
                INSERT INTO admin_menus (id, name, path, icon_class, display_order, parent_id, is_active, visible_roles) VALUES
                (1, '대시보드', '/admin', 'bi bi-grid-1x2-fill', 1, NULL, 1, 'super_admin,admin,content_admin'),
                (4, '배너 관리', '/admin/banners', 'bi bi-images', 2, NULL, 1, 'super_admin,admin,content_admin'),
                (2, '카테고리', '/admin/categories', 'bi bi-tags-fill', 3, NULL, 1, 'super_admin,admin,content_admin'),
                (3, '상품 관리', '/admin/products', 'bi bi-box-seam-fill', 4, NULL, 1, 'super_admin,admin,content_admin'),
                (5, '판매 관리', '/admin/sales', 'bi bi-receipt', 5, NULL, 1, 'super_admin,admin,customer_admin'),
                (6, '배송 관리', '/admin/shipping', 'bi bi-truck', 6, NULL, 1, 'super_admin,customer_admin'),
                (7, '회원 관리', '/admin/users', 'bi bi-people-fill', 7, NULL, 1, 'super_admin,admin,customer_admin'),
                (8, '문의 관리', '/admin/inquiries', 'bi bi-chat-square-text-fill', 8, NULL, 1, 'super_admin,admin,customer_admin'),
                (14, '포인트 관리', '/admin/points', 'bi bi-coin', 9, NULL, 1, NULL),
                (13, '쿠폰 관리', '/admin/coupons', 'bi bi-ticket-perforated-fill', 10, NULL, 1, NULL),
                (10, '약관/정책 관리', '/admin/policies', 'bi bi-file-text-fill', 11, NULL, 1, 'super_admin,admin'),
                (12, '관리자 메뉴 관리', '/admin/menus', 'bi-ui-checks', 12, NULL, 1, 'super_admin,admin'),
                (11, '운영자 관리', '/admin/operators', 'bi bi-shield-lock-fill', 13, NULL, 1, 'super_admin'),
                (15, '사이트 설정', '/admin/site-settings', 'bi bi-building', 14, NULL, 1, 'super_admin,admin'),
                (16, '시스템 설정', '/admin/sys-settings', 'bi bi-gear-fill', 15, NULL, 1, 'super_admin,admin')
            `);
            console.log('Default admin menus inserted.');
        } else {
            console.log('Admin menus already exist.');
        }

        // Ensure notices menu exists for admin notice CRUD pages.
        await connection.query(`
            INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
            SELECT ?, ?, ?, ?, NULL, 1, ?
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_menus WHERE path = ?
            )
        `, [
            '공지사항 관리',
            '/admin/notices',
            'bi bi-megaphone-fill',
            9,
            'super_admin,admin,content_admin',
            '/admin/notices'
        ]);

        // admin_verification_codes 기본 데이터 (없을 경우)
        const [codes] = await connection.query('SELECT id FROM admin_verification_codes LIMIT 1');
        if (codes.length === 0) {
            console.log('Inserting default admin_verification_codes...');
            const [[adminRow]] = await connection.query('SELECT id FROM admins WHERE username = ?', ['admin']);
            const adminId = adminRow?.id || 1;
            await connection.query(`
                INSERT INTO admin_verification_codes (id, admin_id, code, expires_at, used_at, created_at) VALUES
                (1, ?, '854250', '2026-02-07 03:44:28', '2026-02-07 03:39:54', '2026-02-07 03:39:27'),
                (2, ?, '324651', '2026-02-07 03:45:12', '2026-02-07 03:42:22', '2026-02-07 03:40:11'),
                (3, ?, '408862', '2026-02-07 03:47:28', '2026-02-07 03:42:44', '2026-02-07 03:42:27'),
                (4, ?, '297999', '2026-02-07 04:03:43', '2026-02-07 03:59:26', '2026-02-07 03:58:42')
            `, [adminId, adminId, adminId, adminId]);
            console.log('Default admin_verification_codes inserted.');
        } else {
            console.log('Admin_verification_codes already exist.');
        }

        // categories 기본 카테고리 (없을 경우)
        const [cats] = await connection.query('SELECT id FROM categories LIMIT 1');
        if (cats.length === 0) {
            console.log('Inserting default categories...');
            await connection.query(`
                INSERT INTO categories (id, name, display_order, parent_id, type) VALUES
                (1, '피로회복/활력', 1, NULL, 'NORMAL'),
                (2, '면역력', 2, NULL, 'NORMAL'),
                (3, '눈 건강', 3, NULL, 'NORMAL'),
                (4, '수면/스트레스', 4, NULL, 'NORMAL'),
                (5, '베스트 상품', 1, NULL, 'THEME'),
                (6, '신규 상품', 2, NULL, 'THEME'),
                (7, '할인 / 이벤트', 3, NULL, 'THEME'),
                (8, 'MD 추천', 4, NULL, 'THEME'),
                (9, '선물 세트', 5, NULL, 'THEME'),
                (10, '정기배송 상품', 6, NULL, 'THEME')
            `);
            console.log('Default categories inserted.');
        } else {
            console.log('Categories already exist.');
        }

        // site_settings 기본 설정 (가상 정보, 없을 경우)
        const [siteRows] = await connection.query('SELECT id FROM site_settings WHERE id = 1');
        if (siteRows.length === 0) {
            console.log('Inserting default site_settings...');
            const siteDefaults = {
                company_name: 'Dev Mall',
                logo_url: '',
                favicon_url: '',
                business_number: '000-00-00000',
                address: '서울시 강남구 테헤란로 123',
                contact_email: 'info@example.com',
                contact_phone: '02-000-0000',
                header_slogan: '샘플 쇼핑몰입니다',
                slogan: '<p>관리자 &gt; 설정에서 회사 정보를 수정해 주세요.</p>',
                company_intro: '<p>회사 소개를 입력해 주세요.</p>',
                instagram_enabled: 0,
                instagram_url: '',
                facebook_enabled: 0,
                facebook_url: '',
                youtube_enabled: 0,
                youtube_url: '',
                kakao_channel_enabled: 0,
                kakao_channel_url: '',
                kakao_share_image_url: '',
                brand_main_color: '#76A764',
                brand_dark_color: '#5A824B',
                brand_light_color: '#F0F7EE',
                terms_of_service: '<h1>Dev Mall(주) 이용약관 (샘플)</h1><p>관리자 &gt; 약관/정책 관리에서 실제 이용약관으로 수정해 주세요.</p>',
                privacy_policy: '<h1>Dev Mall(주) 개인정보처리방침 (샘플)</h1><p>관리자 &gt; 약관/정책 관리에서 실제 개인정보처리방침으로 수정해 주세요.</p>'
            };
            await connection.query(
                `INSERT INTO site_settings (id, company_name, logo_url, favicon_url, business_number, address, contact_email, contact_phone,
                    header_slogan, slogan, company_intro, instagram_enabled, instagram_url, facebook_enabled, facebook_url,
                    youtube_enabled, youtube_url, kakao_channel_enabled, kakao_channel_url, kakao_share_image_url, terms_of_service, privacy_policy, brand_main_color, brand_dark_color, brand_light_color)
                 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                [
                    siteDefaults.company_name, siteDefaults.logo_url, siteDefaults.favicon_url, siteDefaults.business_number, siteDefaults.address,
                    siteDefaults.contact_email, siteDefaults.contact_phone, siteDefaults.header_slogan, siteDefaults.slogan,
                    siteDefaults.company_intro, siteDefaults.instagram_enabled, siteDefaults.instagram_url,
                    siteDefaults.facebook_enabled, siteDefaults.facebook_url, siteDefaults.youtube_enabled, siteDefaults.youtube_url,
                    siteDefaults.kakao_channel_enabled, siteDefaults.kakao_channel_url, siteDefaults.kakao_share_image_url,
                    siteDefaults.terms_of_service, siteDefaults.privacy_policy,
                    siteDefaults.brand_main_color, siteDefaults.brand_dark_color, siteDefaults.brand_light_color
                ]
            );
            console.log('Default site_settings inserted (가상 회사 정보).');
        } else {
            console.log('Site_settings already exists.');
        }

        // system_settings 기본값 (INSERT IGNORE, 민감 정보는 빈값/플레이스홀더)
        const SYSTEM_SETTINGS_DEFAULTS = [
            ['tinymce_key', '', 'TinyMCE API Key'],
            ['openai_api_key', '', 'OpenAI API Key'],
            ['openai_timeout_ms', '90000', 'OpenAI 요청 타임아웃(ms)'],
            ['openai_model', 'gpt-4o-mini', '기본 OpenAI 모델'],
            ['google_client_id', '', 'Google OAuth Client ID'],
            ['google_client_secret', '', 'Google OAuth Client Secret'],
            ['google_callback_url_dev', 'http://localhost:3000/auth/google/callback', 'Google Dev Callback URL'],
            ['google_callback_url_prod', 'https://your-domain.com/auth/google/callback', 'Google Prod Callback URL'],
            ['google_callback_url', 'http://localhost:3000/auth/google/callback', 'Google 공통 Callback URL'],
            ['kakao_client_id', '', 'Kakao OAuth Client ID'],
            ['kakao_client_secret', '', 'Kakao OAuth Client Secret'],
            ['kakao_callback_url_dev', 'http://localhost:3000/auth/kakao/callback', 'Kakao Dev Callback URL'],
            ['kakao_callback_url_prod', 'https://your-domain.com/auth/kakao/callback', 'Kakao Prod Callback URL'],
            ['kakao_js_key', '', 'Kakao JavaScript Key (카카오톡 공유용)'],
            ['domain', 'http://localhost:3000', '프론트 Canonical/OG용 기본 도메인'],
            ['smtp_host', 'smtp.gmail.com', 'SMTP 메일 서버 주소'],
            ['smtp_port', '587', 'SMTP 포트'],
            ['smtp_is_gmail', '1', '지메일 사용 여부 (1=지메일, 0=기타)'],
            ['smtp_app_password', '', '지메일 앱 비밀번호'],
            ['smtp_password', '', 'SMTP 비밀번호 (지메일이 아닐 때)'],
            ['smtp_sender_email', 'noreply@example.com', '발송자 이메일 주소'],
            ['tosspayments_client_key', '', '토스페이먼츠 클라이언트 키'],
            ['tosspayments_secret_key', '', '토스페이먼츠 시크릿 키']
        ];
        for (const [key, value, desc] of SYSTEM_SETTINGS_DEFAULTS) {
            await connection.query(
                'INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
                [key, value, desc]
            );
        }
        console.log('system_settings defaults inserted (민감 정보는 빈값).');

        console.log('\n✓ DB initialization complete.');
    } catch (err) {
        console.error('Error initializing DB:', err.message);
        throw err;
    } finally {
        await connection.end();
    }
}

initDB().catch(() => process.exit(1));
