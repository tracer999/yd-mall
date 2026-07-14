/**
 * 소셜 로그인 프로바이더 설정 해석.
 *
 * 키는 system_settings 가 process.env 로 주입한다(config/systemSettings.js).
 * 키가 비어 있으면 Passport 전략을 등록하지 않고, 로그인 화면에서도 버튼을 숨긴다 —
 * 두 판정이 어긋나면 "버튼은 있는데 500 나는" 상태가 되므로 판정은 이 파일 하나로 모은다.
 */

const PROVIDERS = ['google', 'kakao', 'naver'];

const LABELS = {
    google: '구글',
    kakao: '카카오',
    naver: '네이버'
};

function isProd() {
    return process.env.NODE_ENV === 'production';
}

/** 현재 환경(dev/prod)에 맞는 콜백 URL. 없으면 null. */
function getCallbackUrl(provider) {
    const suffix = isProd() ? 'PROD' : 'DEV';
    const value = process.env[`${provider.toUpperCase()}_CALLBACK_URL_${suffix}`];
    return value && value.trim() ? value.trim() : null;
}

/** 해당 프로바이더가 사용 가능한지 (Client ID + Callback URL 필수). */
function isProviderEnabled(provider) {
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
    return Boolean(clientId && clientId.trim() && getCallbackUrl(provider));
}

/** 로그인 화면 렌더용 — { google: true, kakao: true, naver: false } */
function getEnabledProviders() {
    return PROVIDERS.reduce((acc, provider) => ({
        ...acc,
        [provider]: isProviderEnabled(provider)
    }), {});
}

module.exports = {
    PROVIDERS,
    LABELS,
    getCallbackUrl,
    isProviderEnabled,
    getEnabledProviders
};
