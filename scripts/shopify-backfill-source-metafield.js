/**
 * Shopify 상품에 원본(yd-mall) 연결 metafield(devmall.source) 백필
 *
 * shopify_product_mappings 의 각 매핑을 읽어, 대응하는 Shopify 상품에
 * metafield `devmall.source` = { productId, handle, syncedAt } 를 기록한다.
 * (신규/수정 동기화는 syncService 가 자동으로 심으므로, 이 스크립트는 기존 상품 소급용)
 *
 * 사용:
 *   node scripts/shopify-backfill-source-metafield.js            # 전체
 *   node scripts/shopify-backfill-source-metafield.js --limit 5  # 앞에서 5개만 (테스트용)
 */
const bootstrap = require('./_bootstrap');
const pool = require('../config/db');
const { adminQuery } = require('../services/shopify/adminClient');

const METAFIELDS_SET = `
  mutation SetSourceMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message code }
    }
  }
`;

// metafieldsSet 는 호출당 최대 25개
const CHUNK = 25;

async function main() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    const limitArg = process.argv.indexOf('--limit');
    const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : null;

    let [rows] = await pool.query(
        `SELECT product_id, shopify_product_id, shopify_handle, synced_at
         FROM shopify_product_mappings
         ORDER BY product_id`
    );

    if (rows.length === 0) {
        console.log('백필 대상 없음 (매핑 테이블이 비어 있음)');
        process.exit(0);
    }

    if (limit && limit > 0) {
        rows = rows.slice(0, limit);
        console.log(`⚠ --limit ${limit} 적용: 앞에서 ${rows.length}개만 처리`);
    }

    console.log(`백필 대상: ${rows.length}개 상품`);

    let ok = 0, failed = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const metafields = chunk.map(r => ({
            ownerId: r.shopify_product_id,
            namespace: 'devmall',
            key: 'source',
            type: 'json',
            value: JSON.stringify({
                productId: r.product_id,
                handle: r.shopify_handle || null,
                syncedAt: (r.synced_at ? new Date(r.synced_at) : new Date()).toISOString(),
            }),
        }));

        try {
            const data = await adminQuery(METAFIELDS_SET, { metafields });
            const errs = data.metafieldsSet.userErrors || [];
            if (errs.length) {
                console.error(`  [${i + 1}~${i + chunk.length}] userErrors:`, errs.map(e => `${e.field}: ${e.message}`).join('; '));
                failed += chunk.length;
            } else {
                ok += data.metafieldsSet.metafields.length;
                console.log(`  [${i + 1}~${i + chunk.length}] ${data.metafieldsSet.metafields.length}개 기록`);
            }
        } catch (err) {
            console.error(`  [${i + 1}~${i + chunk.length}] 실패:`, err.message);
            failed += chunk.length;
        }
    }

    console.log(`\n완료: 성공 ${ok}개 / 실패 ${failed}개`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
