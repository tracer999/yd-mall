/**
 * Shopify Storefront API GraphQL 클라이언트
 * 비공개 토큰(Shopify-Storefront-Private-Token) 사용 — 서버 사이드 전용
 */

function getStorefrontEndpoint() {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const version = process.env.SHOPIFY_API_VERSION || '2026-04';
    if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN 환경변수가 설정되지 않았습니다.');
    return `https://${domain}/api/${version}/graphql.json`;
}

/**
 * @param {string} query  GraphQL 쿼리 문자열
 * @param {Object} variables  GraphQL 변수
 * @param {Object} [context]  Markets 컨텍스트 { country?: string, language?: string }
 *   country: ISO 3166-1 alpha-2 (예: 'US', 'CA', 'KR')
 *   language: ISO 639-1  (예: 'EN', 'JA', 'KO')
 *   설정 시 Shopify Buyer-IP 기반 자동감지 대신 명시적 Markets 컨텍스트가 적용됨
 */
async function storefrontQuery(query, variables = {}, context = {}) {
    const token = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    if (!token) throw new Error('SHOPIFY_STOREFRONT_API_TOKEN 환경변수가 설정되지 않았습니다.');

    const headers = {
        'Content-Type': 'application/json',
        'Shopify-Storefront-Private-Token': token,
    };

    // Shopify Markets: 국가/언어 컨텍스트 헤더
    if (context.country) headers['Shopify-Storefront-Buyer-Country'] = context.country;
    if (context.language) headers['Accept-Language'] = context.language.toLowerCase();

    const response = await fetch(getStorefrontEndpoint(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Storefront API 요청 실패: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors && json.errors.length > 0) {
        throw new Error(`Storefront API GraphQL 오류: ${json.errors.map(e => e.message).join(', ')}`);
    }

    return json.data;
}

module.exports = { storefrontQuery };
