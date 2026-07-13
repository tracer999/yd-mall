const pool = require('../../config/db');
const { loadSystemSettingsAndApplyEnv } = require('../../config/systemSettings');
const { sendEmail } = require('../../services/emailService');
const { generateIcoFromImage } = require('../../services/faviconService');

const BRAND_COLOR_DEFAULTS = {
    main: '#76A764',
    dark: '#5A824B',
    light: '#F0F7EE'
};

function normalizeHexColor(value, fallback) {
    if (!value) return fallback;
    const trimmed = String(value).trim();
    const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
        return normalized.toUpperCase();
    }
    return fallback;
}

function adjustChannel(channel, percent) {
    const amt = Math.round((percent / 100) * 255);
    return Math.min(255, Math.max(0, channel + amt));
}

function adjustHexColor(hex, percent) {
    const sanitized = normalizeHexColor(hex, BRAND_COLOR_DEFAULTS.main).replace('#', '');
    const num = parseInt(sanitized, 16);
    const r = adjustChannel((num >> 16) & 0xff, percent);
    const g = adjustChannel((num >> 8) & 0xff, percent);
    const b = adjustChannel(num & 0xff, percent);
    return `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()}`;
}

function buildBrandPalette({ main, dark, light }) {
    const normalizedMain = normalizeHexColor(main, BRAND_COLOR_DEFAULTS.main);
    const normalizedDark = normalizeHexColor(dark, null) || adjustHexColor(normalizedMain, -20);
    const normalizedLight = normalizeHexColor(light, null) || adjustHexColor(normalizedMain, 30);
    return {
        main: normalizedMain,
        dark: normalizedDark,
        light: normalizedLight
    };
}

async function loadSettingsData(mallId = 1) {
    // P5: 편집 중인 몰의 브랜딩. 없으면 기본몰 행을 보여준다(새 몰 초기값).
    let [rows] = await pool.query('SELECT * FROM site_settings WHERE mall_id = ? LIMIT 1', [mallId]);
    if (!rows.length) {
        [rows] = await pool.query('SELECT * FROM site_settings ORDER BY (mall_id = 1) DESC, id ASC LIMIT 1');
    }
    const settings = rows[0] || {};

    // system_settings 는 전역(OAuth·SMTP·결제 키). 몰별로 나누지 않는다.
    const [systemRows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const systemSettings = {};
    for (const row of systemRows) {
        systemSettings[row.setting_key] = row.setting_value;
    }

    return { settings, systemSettings };
}

function renderSettingsPage(res, { pageTitle, activeTab, basePath, showTabs, settings, systemSettings }) {
    return res.render('admin/settings/form', {
        layout: 'layouts/admin_layout',
        title: pageTitle,
        pageTitle,
        settings,
        systemSettings,
        activeTab,
        basePath,
        showTabs
    });
}

exports.getSettings = async (req, res) => {
    const activeTab = req.query.tab === 'system' ? 'system' : 'company';
    try {
        const { settings, systemSettings } = await loadSettingsData(req.adminMallId || 1);
        return renderSettingsPage(res, {
            pageTitle: '환경 설정',
            activeTab,
            basePath: '/admin/settings',
            showTabs: true,
            settings,
            systemSettings
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Server Error');
    }
};

exports.getSiteSettings = async (req, res) => {
    try {
        const { settings, systemSettings } = await loadSettingsData(req.adminMallId || 1);
        return renderSettingsPage(res, {
            pageTitle: '사이트 설정',
            activeTab: 'company',
            basePath: '/admin/site-settings',
            showTabs: false,
            settings,
            systemSettings
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Server Error');
    }
};

exports.getSysSettings = async (req, res) => {
    try {
        const { settings, systemSettings } = await loadSettingsData(req.adminMallId || 1);
        return renderSettingsPage(res, {
            pageTitle: '시스템 설정',
            activeTab: 'system',
            basePath: '/admin/sys-settings',
            showTabs: false,
            settings,
            systemSettings
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Server Error');
    }
};

exports.updateSettings = async (req, res) => {
    const {
        company_name,
        business_number,
        address,
        contact_email,
        contact_phone,
        header_slogan,
        slogan,
        company_intro,
        instagram_enabled,
        instagram_url,
        facebook_enabled,
        facebook_url,
        youtube_enabled,
        youtube_url,
        kakao_channel_enabled,
        kakao_channel_url,
        ga4_measurement_id,
        brand_main_color,
        brand_dark_color,
        brand_light_color
    } = req.body;
    let logo_url = req.body.existing_logo_url;
    let favicon_url = req.body.existing_favicon_url;
    let kakao_share_image_url = req.body.existing_kakao_share_image_url;

    const getUploadedFile = (fieldName) => {
        if (req.files && Array.isArray(req.files[fieldName]) && req.files[fieldName].length > 0) {
            return req.files[fieldName][0];
        }
        if (req.file && req.file.fieldname === fieldName) {
            return req.file;
        }
        return null;
    };

    const normalizedGa4Id = (value) => {
        if (!value) return null;
        const trimmed = String(value).trim().toUpperCase();
        return trimmed.length > 0 ? trimmed : null;
    };

    const brandPalette = buildBrandPalette({
        main: brand_main_color,
        dark: brand_dark_color,
        light: brand_light_color
    });

    const logoFile = getUploadedFile('logo');
    if (logoFile) {
        logo_url = '/uploads/logo/' + logoFile.filename;
    }

    const kakaoShareImageFile = getUploadedFile('kakao_share_image');
    if (kakaoShareImageFile) {
        kakao_share_image_url = '/uploads/og/' + kakaoShareImageFile.filename;
    }

    const faviconFile = getUploadedFile('favicon');
    if (faviconFile) {
        try {
            favicon_url = await generateIcoFromImage(faviconFile.path);
        } catch (faviconErr) {
            console.error('favicon conversion failed, using original file:', faviconErr.message);
            favicon_url = '/uploads/favicon/' + faviconFile.filename;
        }
    }

    const MALL_ID = req.adminMallId || 1; // P5: 편집 중인 몰의 브랜딩
    try {
        // 이 몰의 행이 없으면(새 몰) 만들고, 있으면 갱신한다(mall_id 유니크).
        await pool.query(`
            INSERT INTO site_settings
                (mall_id, company_name, logo_url, favicon_url, business_number, address, contact_email, contact_phone,
                 header_slogan, slogan, company_intro,
                 instagram_enabled, instagram_url, facebook_enabled, facebook_url,
                 youtube_enabled, youtube_url, kakao_channel_enabled, kakao_channel_url,
                 ga4_measurement_id, brand_main_color, brand_dark_color, brand_light_color, kakao_share_image_url)
            VALUES (?,?,?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                company_name=VALUES(company_name), logo_url=VALUES(logo_url), favicon_url=VALUES(favicon_url),
                business_number=VALUES(business_number), address=VALUES(address), contact_email=VALUES(contact_email),
                contact_phone=VALUES(contact_phone), header_slogan=VALUES(header_slogan), slogan=VALUES(slogan),
                company_intro=VALUES(company_intro), instagram_enabled=VALUES(instagram_enabled), instagram_url=VALUES(instagram_url),
                facebook_enabled=VALUES(facebook_enabled), facebook_url=VALUES(facebook_url),
                youtube_enabled=VALUES(youtube_enabled), youtube_url=VALUES(youtube_url),
                kakao_channel_enabled=VALUES(kakao_channel_enabled), kakao_channel_url=VALUES(kakao_channel_url),
                ga4_measurement_id=VALUES(ga4_measurement_id), brand_main_color=VALUES(brand_main_color),
                brand_dark_color=VALUES(brand_dark_color), brand_light_color=VALUES(brand_light_color),
                kakao_share_image_url=VALUES(kakao_share_image_url)
        `, [
            MALL_ID,
            company_name,
            logo_url,
            favicon_url,
            business_number,
            address,
            contact_email,
            contact_phone,
            header_slogan,
            slogan,
            company_intro,
            instagram_enabled ? 1 : 0,
            instagram_url,
            facebook_enabled ? 1 : 0,
            facebook_url,
            youtube_enabled ? 1 : 0,
            youtube_url,
            kakao_channel_enabled ? 1 : 0,
            kakao_channel_url,
            normalizedGa4Id(ga4_measurement_id),
            brandPalette.main,
            brandPalette.dark,
            brandPalette.light,
            kakao_share_image_url
        ]);
        const baseUrl = req.baseUrl || '/admin/settings';
        const redirectUrl = baseUrl === '/admin/settings' ? `${baseUrl}?tab=company` : baseUrl;
        res.redirect(redirectUrl);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.updateSystemSettings = async (req, res) => {
    const entries = [
        ['tinymce_key', req.body.tinymce_key, 'TinyMCE API Key'],
        ['shopify_sync_enabled', req.body.shopify_sync_enabled, 'Shopify 동기화 사용 여부 (1=사용, 0=미사용)'],
        ['openai_api_key', req.body.openai_api_key, 'OpenAI API Key'],
        ['openai_timeout_ms', req.body.openai_timeout_ms, 'OpenAI 요청 타임아웃(ms)'],
        ['openai_model', req.body.openai_model, '기본 OpenAI 모델'],
        ['domain', req.body.domain, '프론트 Canonical/OG용 기본 도메인 (예: https://dev-mall.ydata.co.kr)'],
        ['google_client_id', req.body.google_client_id, 'Google OAuth Client ID'],
        ['google_client_secret', req.body.google_client_secret, 'Google OAuth Client Secret'],
        ['google_callback_url_dev', req.body.google_callback_url_dev, 'Google Dev Callback URL'],
        ['google_callback_url_prod', req.body.google_callback_url_prod, 'Google Prod Callback URL'],
        ['google_callback_url', req.body.google_callback_url, 'Google 공통 Callback URL'],
        ['kakao_client_id', req.body.kakao_client_id, 'Kakao OAuth Client ID'],
        ['kakao_client_secret', req.body.kakao_client_secret, 'Kakao OAuth Client Secret'],
        ['kakao_callback_url_dev', req.body.kakao_callback_url_dev, 'Kakao Dev Callback URL'],
        ['kakao_callback_url_prod', req.body.kakao_callback_url_prod, 'Kakao Prod Callback URL'],
        ['kakao_js_key', req.body.kakao_js_key, 'Kakao JavaScript Key (카카오톡 공유용)'],
        ['smtp_host', req.body.smtp_host, 'SMTP 메일 서버 주소'],
        ['smtp_port', req.body.smtp_port, 'SMTP 포트'],
        ['smtp_is_gmail', req.body.smtp_is_gmail, '지메일 사용 여부 (1=지메일, 0=기타)'],
        ['smtp_app_password', req.body.smtp_app_password, '지메일 앱 비밀번호'],
        ['smtp_password', req.body.smtp_password, 'SMTP 비밀번호 (지메일이 아닐 때)'],
        ['smtp_sender_email', req.body.smtp_sender_email, '발송자 이메일 주소'],
        ['tosspayments_client_key', req.body.tosspayments_client_key, '토스페이먼츠 클라이언트 키 (결제창용)'],
        ['tosspayments_secret_key', req.body.tosspayments_secret_key, '토스페이먼츠 시크릿 키 (서버 결제 승인용)'],
        ['point_accumulate_rate', req.body.point_accumulate_rate, '구매 적립률 (%)'],
        ['point_min_use', req.body.point_min_use, '포인트 최소 사용 단위 (원)'],
        ['new_product_days', req.body.new_product_days, '신상품 노출 기간(일) — 판매 시작일 기준'],
        ['new_brand_days', req.body.new_brand_days, '신규 입점 브랜드 노출 기간(일) — 입점일 기준'],
    ];

    const sql = `
        INSERT INTO system_settings (setting_key, setting_value, description)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            setting_value = VALUES(setting_value),
            description = VALUES(description);
    `;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const [key, value, desc] of entries) {
            if (typeof value === 'undefined') continue;
            await connection.query(sql, [key, value, desc]);
        }

        await connection.commit();

        // DB 값 변경 후 현재 프로세스 설정도 다시 반영
        await loadSystemSettingsAndApplyEnv();

        const baseUrl = req.baseUrl || '/admin/settings';
        const redirectUrl = baseUrl === '/admin/settings' ? `${baseUrl}?tab=system` : baseUrl;
        res.redirect(redirectUrl);
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        connection.release();
    }
};

// 시스템 재시작 기능은 현재 UI에서 사용하지 않으므로 컨트롤러에서 제거되었습니다.

/**
 * 테스트 이메일 발송 (저장된 SMTP 설정 사용)
 */
exports.sendTestEmail = async (req, res) => {
    const { test_email_to } = req.body;
    if (!test_email_to || !String(test_email_to).trim()) {
        return res.status(400).json({ success: false, error: '수신자 이메일을 입력하세요.' });
    }

    const to = String(test_email_to).trim();
    const subject = '[테스트] 이메일 발송 설정 확인';
    const html = `
        <p>이 메일은 쇼핑몰 관리자 SMTP 설정 테스트용으로 발송되었습니다.</p>
        <p>수신 시각: ${new Date().toLocaleString('ko-KR')}</p>
        <p>설정이 정상적으로 동작하고 있습니다.</p>
    `;

    try {
        const result = await sendEmail({ to, subject, html });
        if (result.success) {
            return res.json({ success: true, message: '테스트 메일이 발송되었습니다.' });
        }
        return res.status(500).json({ success: false, error: result.error });
    } catch (err) {
        console.error('sendTestEmail error:', err);
        return res.status(500).json({
            success: false,
            error: err.message || '이메일 발송 중 오류가 발생했습니다.'
        });
    }
};
