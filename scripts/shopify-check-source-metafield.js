/**
 * 원본(dev-mall) 연결 metafield(devmall.source) 현황 점검 — 읽기 전용
 *
 * shopifyApp 의 "동기화 현황" 대시보드가 실행하는 것과 동일한 GraphQL 쿼리를
 * CLI 로 돌려 총계/원본연결/미연결/최근동기화를 출력한다. (아무것도 쓰지 않음)
 *
 * 사용: node scripts/shopify-check-source-metafield.js
 */
const bootstrap = require('./_bootstrap');
const pool = require('../config/db');
const { adminQuery } = require('../services/shopify/adminClient');

const QUERY = `
  query SyncStatus($cursor: String) {
    products(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          status
          source: metafield(namespace: "devmall", key: "source") { jsonValue }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function main() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    const products = [];
    let cursor = null;
    let hasNext = true;

    for (let page = 0; page < 20 && hasNext; page++) {
        const data = await adminQuery(QUERY, { cursor });
        const conn = data.products;
        for (const e of conn.edges) {
            products.push({
                title: e.node.title,
                status: e.node.status,
                source: e.node.source?.jsonValue ?? null,
            });
        }
        hasNext = conn.pageInfo.hasNextPage;
        cursor = conn.pageInfo.endCursor;
    }

    const linked = products.filter(p => p.source && p.source.productId != null);
    const unlinked = products.filter(p => !(p.source && p.source.productId != null));
    const recent = linked
        .filter(p => p.source.syncedAt)
        .sort((a, b) => new Date(b.source.syncedAt) - new Date(a.source.syncedAt))
        .slice(0, 10);

    console.log('─'.repeat(40));
    console.log('동기화 현황 (dashboard 와 동일 쿼리)');
    console.log('─'.repeat(40));
    console.log(`총 상품     : ${products.length}`);
    console.log(`원본 연결 ✅ : ${linked.length}`);
    console.log(`미연결 ⚠    : ${unlinked.length}`);
    console.log('\n미연결 상품:');
    if (unlinked.length === 0) {
        console.log('  (없음)');
    } else {
        for (const u of unlinked) console.log(`  - ${u.title}  (${u.status})`);
    }

    console.log('\n최근 동기화 (상위 10):');
    if (recent.length === 0) {
        console.log('  (없음)');
    } else {
        for (const r of recent) {
            console.log(`  #${r.source.productId}  ${r.title}  ·  ${r.source.syncedAt.slice(0, 16).replace('T', ' ')}`);
        }
    }
    console.log('');
    process.exit(0);
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
