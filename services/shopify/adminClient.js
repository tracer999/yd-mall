/**
 * Shopify Admin API GraphQL 클라이언트
 * Client Credentials Grant 방식 — 서버 사이드 전용
 * 토큰은 24시간 유효, 만료 1분 전 자동 갱신
 */

let _cachedToken = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpiresAt - 60_000) {
        return _cachedToken;
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');
    }

    const shop = process.env.SHOPIFY_STORE_DOMAIN;
    if (!shop) throw new Error('SHOPIFY_STORE_DOMAIN 환경변수가 설정되지 않았습니다.');

    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify 토큰 발급 실패: ${res.status} ${text}`);
    }

    const data = await res.json();
    _cachedToken = data.access_token;
    _tokenExpiresAt = now + (data.expires_in ?? 86400) * 1000;

    return _cachedToken;
}

function getAdminEndpoint() {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const version = process.env.SHOPIFY_API_VERSION || '2025-01';
    if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN 환경변수가 설정되지 않았습니다.');
    return `https://${domain}/admin/api/${version}/graphql.json`;
}

async function adminQuery(query, variables = {}) {
    const token = await getAccessToken();

    const response = await fetch(getAdminEndpoint(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Admin API 요청 실패: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors && json.errors.length > 0) {
        throw new Error(`Admin API GraphQL 오류: ${json.errors.map(e => e.message).join(', ')}`);
    }

    return json.data;
}

module.exports = { adminQuery };
