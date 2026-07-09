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
            tinymce_key: 'TINYMCE_KEY',
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
