const pool = require('./db');

async function loadSystemSettingsAndApplyEnv() {
    try {
        const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
        const settings = {};
        for (const row of rows) {
            settings[row.setting_key] = row.setting_value;
        }

        global.systemSettings = settings;

        const envMap = {
            // 세션
            session_secret: 'SESSION_SECRET',
            // 에디터
            tinymce_key: 'TINYMCE_KEY',
            // Shopify Headless 연동
            shopify_sync_enabled: 'SHOPIFY_SYNC_ENABLED',
            shopify_store_domain: 'SHOPIFY_STORE_DOMAIN',
            shopify_client_id: 'SHOPIFY_CLIENT_ID',
            shopify_client_secret: 'SHOPIFY_CLIENT_SECRET',
            shopify_storefront_api_token: 'SHOPIFY_STOREFRONT_API_TOKEN',
            shopify_api_version: 'SHOPIFY_API_VERSION',
            shopify_location_id: 'SHOPIFY_LOCATION_ID',
            shopify_webhook_base_url: 'SHOPIFY_WEBHOOK_BASE_URL',
            openai_api_key: 'OPENAI_API_KEY',
            openai_timeout_ms: 'OPENAI_TIMEOUT_MS',
            openai_model: 'OPENAI_MODEL',
            google_client_id: 'GOOGLE_CLIENT_ID',
            google_client_secret: 'GOOGLE_CLIENT_SECRET',
            google_callback_url_dev: 'GOOGLE_CALLBACK_URL_DEV',
            google_callback_url_prod: 'GOOGLE_CALLBACK_URL_PROD',
            google_callback_url: 'CALLBACK_URL',
            kakao_client_id: 'KAKAO_CLIENT_ID',
            kakao_client_secret: 'KAKAO_CLIENT_SECRET',
            kakao_callback_url_dev: 'KAKAO_CALLBACK_URL_DEV',
            kakao_callback_url_prod: 'KAKAO_CALLBACK_URL_PROD',
            kakao_js_key: 'KAKAO_JS_KEY',
            naver_client_id: 'NAVER_CLIENT_ID',
            naver_client_secret: 'NAVER_CLIENT_SECRET',
            naver_callback_url_dev: 'NAVER_CALLBACK_URL_DEV',
            naver_callback_url_prod: 'NAVER_CALLBACK_URL_PROD',
            smtp_host: 'SMTP_HOST',
            smtp_port: 'SMTP_PORT',
            smtp_is_gmail: 'SMTP_IS_GMAIL',
            smtp_app_password: 'SMTP_APP_PASSWORD',
            smtp_password: 'SMTP_PASSWORD',
            smtp_sender_email: 'SMTP_SENDER_EMAIL',
            tosspayments_client_key: 'TOSSPAYMENTS_CLIENT_KEY',
            tosspayments_secret_key: 'TOSSPAYMENTS_SECRET_KEY'
        };

        for (const [key, envName] of Object.entries(envMap)) {
            if (Object.prototype.hasOwnProperty.call(settings, key) && settings[key] != null && settings[key] !== '') {
                process.env[envName] = settings[key];
            }
        }

        // console.log('Loaded system_settings:', settings);
    } catch (err) {
        console.error('Failed to load system_settings, falling back to .env only:', err);
        global.systemSettings = {};
    }
}

module.exports = {
    loadSystemSettingsAndApplyEnv,
};
