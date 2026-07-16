/*
 * 네이버 커머스 API 클라이언트 (스마트스토어).
 * 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
 *
 * 인증: 전자서명 OAuth2 (client_credentials).
 *   client_secret_sign = base64( bcrypt( `${clientId}_${timestamp}`, clientSecret ) )
 *   - clientSecret 은 네이버가 주는 bcrypt salt 문자열($2a$…)이며 그대로 salt 로 쓴다.
 *   - timestamp 는 ms. 서명·요청의 timestamp 가 같아야 한다.
 *
 * Shopify adminClient.js 와 달리 env 가 아니라 **자격증명 객체를 주입**받는다
 * (자격증명이 몰별 mall_channel_credential 에 있기 때문). 액세스 토큰은 DB 에
 * 저장하지 않고 clientId 기준 메모리 캐시만 한다(credential.js §7 원칙).
 *
 * 실 호출은 발급된 client_id/secret 이 있어야 동작한다. 없으면 명확히 throw 한다
 * (가짜 성공 금지 — adapters.validateConnection 규칙과 동일).
 */

const bcrypt = require('bcrypt');

const BASE_URL = 'https://api.commerce.naver.com/external';

// clientId → { token, expiresAt(ms) }
const _tokenCache = new Map();

/** 전자서명 생성: base64(bcrypt(`${clientId}_${timestamp}`, clientSecret)). */
function sign(clientId, clientSecret, timestamp) {
    const password = `${clientId}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, clientSecret);
    return Buffer.from(hashed, 'utf-8').toString('base64');
}

/**
 * 액세스 토큰 발급(+캐시). 만료 1분 전이면 재사용.
 * @param {{clientId:string, secret:string}} cred
 * @returns {Promise<string>}
 */
async function getAccessToken(cred) {
    const clientId = cred && cred.clientId;
    const clientSecret = cred && cred.secret;
    if (!clientId || !clientSecret) {
        throw new Error('네이버 자격증명(client_id/client_secret) 이 없습니다 — 커머스 API 센터에서 발급 후 등록하세요.');
    }

    const cached = _tokenCache.get(clientId);
    const now = Date.now();
    if (cached && now < cached.expiresAt - 60_000) {
        return cached.token;
    }

    const timestamp = now;
    const body = new URLSearchParams({
        client_id: clientId,
        timestamp: String(timestamp),
        grant_type: 'client_credentials',
        client_secret_sign: sign(clientId, clientSecret, timestamp),
        type: 'SELF',
    });

    const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`네이버 토큰 발급 실패: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (!data.access_token) {
        throw new Error('네이버 토큰 발급 응답에 access_token 이 없습니다.');
    }
    _tokenCache.set(clientId, {
        token: data.access_token,
        expiresAt: now + (Number(data.expires_in) || 10800) * 1000, // 기본 3h
    });
    return data.access_token;
}

/** 인증된 GET 요청. */
async function apiGet(cred, path) {
    const token = await getAccessToken(cred);
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`네이버 API GET ${path} 실패: ${res.status} ${text}`);
    }
    return res.json();
}

/**
 * 전체 카테고리 조회 — GET /v1/categories.
 * 응답은 전체 트리 배열. 항목 형태(네이버 스펙):
 *   { id, name, wholeCategoryName, wholeCategoryId?, last, categoryLevel? }
 * 필드명이 버전에 따라 다를 수 있어 sync 계층에서 방어적으로 매핑한다.
 * @param {{clientId:string, secret:string}} cred
 * @returns {Promise<Array<object>>}
 */
async function getCategories(cred) {
    const data = await apiGet(cred, '/v1/categories');
    // 응답이 배열이거나 { ... , contents:[] } 형태일 수 있어 둘 다 수용.
    if (Array.isArray(data)) return data;
    if (Array.isArray(data && data.contents)) return data.contents;
    if (Array.isArray(data && data.data)) return data.data;
    throw new Error('네이버 카테고리 응답 형식을 해석할 수 없습니다.');
}

/** 연결 검증용 — 토큰만 실제로 발급해 본다(카테고리 조회까지 하지 않음). */
async function verify(cred) {
    await getAccessToken(cred);
    return true;
}

/** 테스트/운영에서 캐시 비우기. */
function clearTokenCache() {
    _tokenCache.clear();
}

module.exports = { getAccessToken, getCategories, verify, sign, clearTokenCache, BASE_URL };
