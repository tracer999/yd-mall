/**
 * Shopify Markets 조회 헬퍼
 * 현재 스토어에 설정된 국가/통화/언어 목록 출력
 * 사용: node scripts/shopify-get-markets.js
 */
require('../config/env');

const QUERY = `{
  localization {
    country { isoCode name currency { isoCode symbol } }
    availableCountries { isoCode name currency { isoCode symbol } }
    availableLanguages { isoCode name }
  }
}`;

async function main() {
    const domain  = process.env.SHOPIFY_STORE_DOMAIN;
    const token   = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2026-04';

    if (!domain || !token) {
        console.error('SHOPIFY_STORE_DOMAIN / SHOPIFY_STOREFRONT_API_TOKEN 환경변수가 필요합니다.');
        process.exit(1);
    }

    const url = `https://${domain}/api/${version}/graphql.json`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Shopify-Storefront-Private-Token': token,
        },
        body: JSON.stringify({ query: QUERY }),
    });

    if (!res.ok) {
        console.error(`API 오류: ${res.status} ${res.statusText}`);
        process.exit(1);
    }

    const json = await res.json();
    const loc  = json.data && json.data.localization;

    if (!loc) {
        console.error('응답 파싱 실패:', JSON.stringify(json, null, 2));
        process.exit(1);
    }

    console.log('\n=== 현재 스토어 기본 국가 ===');
    console.log(`  ${loc.country.isoCode} — ${loc.country.name} (${loc.country.currency.isoCode} ${loc.country.currency.symbol})`);

    console.log('\n=== Markets 설정 국가 목록 ===');
    loc.availableCountries.forEach(c =>
        console.log(`  ${c.isoCode} — ${c.name} (${c.currency.isoCode} ${c.currency.symbol})`)
    );

    console.log('\n=== 지원 언어 목록 ===');
    loc.availableLanguages.forEach(l =>
        console.log(`  ${l.isoCode} — ${l.name}`)
    );

    console.log('');
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
