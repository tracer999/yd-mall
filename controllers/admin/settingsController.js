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

/*
 * 리뷰 적립 구간.
 *
 * 적립을 비율이 아니라 **금액**으로 준다 — 리뷰는 상품값에 비례해 수고가 커지지 않기 때문이다.
 * 대신 "얼마짜리를 샀는가"로 구간을 나눈다. 구간은 운영자가 자유롭게 추가·삭제한다.
 * 행이 하나도 없으면 리뷰 적립은 없다(기본 시드를 넣지 않는 이유 — 몰마다 정책이 다르다).
 */
async function loadReviewTiers(mallId) {
    const [rows] = await pool.query(
        'SELECT * FROM review_point_policy WHERE mall_id = ? ORDER BY min_amount ASC', [mallId]);
    return rows;
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

    const reviewTiers = await loadReviewTiers(mallId);
    return { settings, systemSettings, reviewTiers };
}

function renderSettingsPage(res, { pageTitle, activeTab, basePath, showTabs, settings, systemSettings, reviewTiers, query }) {
    return res.render('admin/settings/form', {
        query: query || {},
        layout: 'layouts/admin_layout',
        title: pageTitle,
        pageTitle,
        settings,
        systemSettings,
        reviewTiers: reviewTiers || [],
        activeTab,
        basePath,
        showTabs
    });
}

exports.getSettings = async (req, res) => {
    const activeTab = req.query.tab === 'system' ? 'system' : 'company';
    try {
        const { settings, systemSettings, reviewTiers } = await loadSettingsData(req.adminMallId || 1);
        return renderSettingsPage(res, {
            pageTitle: '환경 설정',
            activeTab,
            basePath: '/admin/settings',
            showTabs: true,
            query: req.query,
            settings,
            systemSettings,
            reviewTiers
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Server Error');
    }
};

exports.getSiteSettings = async (req, res) => {
    try {
        const { settings, systemSettings, reviewTiers } = await loadSettingsData(req.adminMallId || 1);
        return renderSettingsPage(res, {
            pageTitle: '사이트 설정',
            activeTab: 'company',
            basePath: '/admin/site-settings',
            showTabs: false,
            query: req.query,
            settings,
            systemSettings,
            reviewTiers
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Server Error');
    }
};

exports.getSysSettings = async (req, res) => {
    try {
        const { settings, systemSettings, reviewTiers } = await loadSettingsData(req.adminMallId || 1);
        return renderSettingsPage(res, {
            pageTitle: '시스템 설정',
            activeTab: 'system',
            basePath: '/admin/sys-settings',
            showTabs: false,
            query: req.query,
            settings,
            systemSettings,
            reviewTiers
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send('Server Error');
    }
};

exports.updateSettings = async (req, res) => {
    const {
        company_name,
        ceo_name,
        business_number,
        mail_order_number,
        address,
        contact_email,
        contact_phone,
        cs_hours,
        privacy_officer_name,
        privacy_officer_email,
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
                (mall_id, company_name, ceo_name, logo_url, favicon_url, business_number, mail_order_number,
                 address, contact_email, contact_phone, cs_hours, privacy_officer_name, privacy_officer_email,
                 header_slogan, slogan, company_intro,
                 instagram_enabled, instagram_url, facebook_enabled, facebook_url,
                 youtube_enabled, youtube_url, kakao_channel_enabled, kakao_channel_url,
                 ga4_measurement_id, brand_main_color, brand_dark_color, brand_light_color, kakao_share_image_url)
            VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                company_name=VALUES(company_name), ceo_name=VALUES(ceo_name), logo_url=VALUES(logo_url), favicon_url=VALUES(favicon_url),
                business_number=VALUES(business_number), mail_order_number=VALUES(mail_order_number),
                address=VALUES(address), contact_email=VALUES(contact_email),
                contact_phone=VALUES(contact_phone), cs_hours=VALUES(cs_hours),
                privacy_officer_name=VALUES(privacy_officer_name), privacy_officer_email=VALUES(privacy_officer_email),
                header_slogan=VALUES(header_slogan), slogan=VALUES(slogan),
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
            ceo_name,
            logo_url,
            favicon_url,
            business_number,
            mail_order_number,
            address,
            contact_email,
            contact_phone,
            cs_hours,
            privacy_officer_name,
            privacy_officer_email,
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
        ['ai_enabled', req.body.ai_enabled, 'AI(OpenAI) 기능 사용 여부 (Y=사용, N=미사용)'],
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
        ['naver_client_id', req.body.naver_client_id, 'Naver OAuth Client ID'],
        ['naver_client_secret', req.body.naver_client_secret, 'Naver OAuth Client Secret'],
        ['naver_callback_url_dev', req.body.naver_callback_url_dev, 'Naver Dev Callback URL'],
        ['naver_callback_url_prod', req.body.naver_callback_url_prod, 'Naver Prod Callback URL'],
        // 체크박스는 꺼져 있으면 아예 전송되지 않는다 → 값이 없으면 '0' 으로 저장한다.
        ['email_enabled', req.body.email_enabled ? '1' : '0', '이메일 발송 사용 여부 (0=모든 발송 차단)'],
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
        ['point_expiry_months', req.body.point_expiry_months, '포인트 유효기간(개월). 0 = 소멸 없음'],
        ['auto_deliver_days', req.body.auto_deliver_days, '발송 후 자동 배송완료 처리 일수. 0 = 자동 처리 안 함'],
        ['auto_confirm_days', req.body.auto_confirm_days, '배송완료 후 자동 구매확정 일수(적립금 지급 시점). 0 = 자동 확정 안 함'],
        // 문자·알림톡 — 체크박스는 꺼져 있으면 전송되지 않으므로 '0' 으로 저장한다.
        ['sms_enabled', req.body.sms_enabled ? '1' : '0', '문자·알림톡 발송 사용 여부 (0=발송 안 함)'],
        ['sms_provider', req.body.sms_provider, '문자 중계사 (aligo | solapi)'],
        ['sms_api_key', req.body.sms_api_key, '문자 중계사 API 키'],
        ['sms_api_secret', req.body.sms_api_secret, '문자 중계사 API 시크릿 (솔라피)'],
        ['sms_user_id', req.body.sms_user_id, '문자 중계사 계정 ID (알리고)'],
        ['sms_sender', req.body.sms_sender, '발신번호 (통신사 사전등록 완료된 번호)'],
        ['alimtalk_sender_key', req.body.alimtalk_sender_key, '카카오 알림톡 발신 채널 키'],
        ['alimtalk_tpl_claim_requested', req.body.alimtalk_tpl_claim_requested, '알림톡 템플릿 코드 — 클레임 접수'],
        ['alimtalk_tpl_claim_processed', req.body.alimtalk_tpl_claim_processed, '알림톡 템플릿 코드 — 클레임 처리결과'],
        ['alimtalk_tpl_return_pickup', req.body.alimtalk_tpl_return_pickup, '알림톡 템플릿 코드 — 회수 접수'],
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

/*
 * 리뷰 적립 구간 저장 (사이트 설정 안의 별도 폼)
 *
 * 구간 전체를 통째로 다시 쓴다(지운 행을 따로 추적하지 않기 위해).
 * 화면에서 행을 지우고 저장하면 그 구간이 사라진다.
 */
exports.updateReviewTiers = async (req, res) => {
    const mallId = req.adminMallId || 1;

    /*
     * 저장 후에는 **눌렀던 그 화면으로** 되돌린다.
     * 이 폼은 환경설정·사이트설정·시스템설정 세 화면에 모두 있고, 구간 표는 시스템 탭에 있다.
     * 예전엔 무조건 `/admin/settings` 로 보내 회사정보 탭이 열렸고, 구간이 보이지 않아
     * "저장이 안 됐다"고 읽혔다.
     */
    const BASES = ['/admin/settings', '/admin/site-settings', '/admin/sys-settings'];
    const base = BASES.includes(req.body.base_path) ? req.body.base_path : '/admin/settings';
    // 탭이 있는 화면(/admin/settings)만 시스템 탭을 지정한다. 나머지는 탭이 없다.
    const tab = base === '/admin/settings' ? 'tab=system&' : '';
    const back = (msg, isError) =>
        res.redirect(`${base}?${tab}` + (isError ? 'tier_error=' : 'tier_saved=') + encodeURIComponent(msg) + '#reviewTiers');

    // 폼은 min_amount[] / text_point[] / photo_point[] 세 배열로 온다.
    const toArr = (v) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]));
    const mins = toArr(req.body.min_amount);
    const texts = toArr(req.body.text_point);
    const photos = toArr(req.body.photo_point);

    const rows = [];
    const seen = new Set();
    for (let i = 0; i < mins.length; i++) {
        const raw = String(mins[i] == null ? '' : mins[i]).replace(/[,\s원]/g, '');
        if (raw === '') continue;                       // 빈 줄은 건너뛴다(화면에서 지운 행)
        const min = Number.parseInt(raw, 10);
        if (!Number.isFinite(min) || min < 0) return back('구매금액은 0 이상의 숫자여야 합니다.', true);
        if (seen.has(min)) return back(`구매금액 ${min.toLocaleString()}원 구간이 중복됩니다.`, true);
        seen.add(min);

        const tp = Math.max(0, Number.parseInt(String(texts[i] || '0').replace(/[,\s원P]/g, ''), 10) || 0);
        const pp = Math.max(0, Number.parseInt(String(photos[i] || '0').replace(/[,\s원P]/g, ''), 10) || 0);
        rows.push([mallId, min, tp, pp]);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM review_point_policy WHERE mall_id = ?', [mallId]);
        if (rows.length) {
            await conn.query(
                'INSERT INTO review_point_policy (mall_id, min_amount, text_point, photo_point) VALUES ?',
                [rows]
            );
        }
        await conn.commit();
        back(rows.length ? `리뷰 적립 구간 ${rows.length}개를 저장했습니다.` : '리뷰 적립 구간을 모두 지웠습니다. 리뷰 적립이 지급되지 않습니다.');
    } catch (err) {
        await conn.rollback();
        console.error('[settings] updateReviewTiers:', err.message);
        back('저장 중 오류가 발생했습니다: ' + err.message, true);
    } finally {
        conn.release();
    }
};
