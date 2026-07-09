/**
 * Shopify Markets 추가 스크립트
 * Admin API marketCreate mutation으로 KR, JP 등 국가 Market 추가
 *
 * 사용:
 *   node scripts/shopify-add-markets.js              # KR, JP 추가
 *   node scripts/shopify-add-markets.js --list       # 현재 Markets 목록 조회
 */
require('../config/env');
const { adminQuery } = require('../services/shopify/adminClient');

const LIST_QUERY = `
  query {
    markets(first: 20) {
      edges {
        node {
          id
          name
          handle
          enabled
          regions(first: 10) {
            edges {
              node {
                ... on MarketRegionCountry {
                  code
                  name
                }
              }
            }
          }
          currencySettings {
            baseCurrency { currencyCode }
          }
        }
      }
    }
  }
`;

const CREATE_MUTATION = `
  mutation marketCreate($input: MarketCreateInput!) {
    marketCreate(input: $input) {
      market {
        id
        name
        handle
        enabled
        regions(first: 10) {
          edges {
            node {
              ... on MarketRegionCountry {
                code
                name
              }
            }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const MARKETS_TO_ADD = [
  {
    name: 'South Korea',
    handle: 'south-korea',
    regions: [{ countryCode: 'KR' }],
  },
  {
    name: 'Japan',
    handle: 'japan',
    regions: [{ countryCode: 'JP' }],
  },
];

async function listMarkets() {
  const data = await adminQuery(LIST_QUERY);
  const markets = data.markets.edges.map(e => e.node);
  console.log(`\n현재 Markets (${markets.length}개):\n`);
  markets.forEach(m => {
    const countries = m.regions.edges.map(e => `${e.node.name}(${e.node.code})`).join(', ');
    const currency = m.currencySettings?.baseCurrency?.currencyCode || '?';
    console.log(`  [${m.enabled ? 'ON ' : 'OFF'}] ${m.name} (${m.handle}) — ${countries} — ${currency}`);
  });
  return markets;
}

async function addMarket(market) {
  const data = await adminQuery(CREATE_MUTATION, { input: market });
  const result = data.marketCreate;
  const errors = result?.userErrors || [];
  if (errors.length > 0) throw new Error(errors.map(e => `${e.field}: ${e.message}`).join('; '));
  return result.market;
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');

  await listMarkets();
  if (listOnly) return;

  console.log('\n추가할 Markets:');
  MARKETS_TO_ADD.forEach(m => console.log(`  - ${m.name} (${m.regions.map(r => r.countryCode).join(', ')})`));
  console.log();

  let added = 0, failed = 0;
  for (const market of MARKETS_TO_ADD) {
    try {
      const created = await addMarket(market);
      const countries = created.regions.edges.map(e => `${e.node.name}(${e.node.code})`).join(', ');
      console.log(`  [OK]   ${created.name} — ${countries} (id: ${created.id})`);
      added++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('taken') || err.message.includes('duplicate')) {
        console.log(`  [SKIP] ${market.name} — 이미 존재함`);
      } else {
        console.error(`  [FAIL] ${market.name}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n완료: ${added}개 추가, ${failed}개 실패`);

  console.log('\n--- 최종 Markets 목록 ---');
  await listMarkets();
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
