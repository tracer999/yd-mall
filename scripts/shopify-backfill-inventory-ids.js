/**
 * shopify_product_mappings.shopify_inventory_item_id 백필
 * Admin API로 각 variant의 inventoryItem.id를 조회해서 DB에 저장
 * 사용: node scripts/shopify-backfill-inventory-ids.js
 */
const bootstrap = require('./_bootstrap');
const pool = require('../config/db');
const { adminQuery } = require('../services/shopify/adminClient');

const QUERY = `
  query GetInventoryItems($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem { id }
      }
    }
  }
`;

async function main() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    const [rows] = await pool.query(
        'SELECT product_id, shopify_variant_id FROM shopify_product_mappings WHERE shopify_inventory_item_id IS NULL'
    );

    if (rows.length === 0) {
        console.log('백필할 항목 없음 (이미 모두 채워짐)');
        process.exit(0);
    }

    console.log(`백필 대상: ${rows.length}개`);

    const variantIds = rows.map(r => r.shopify_variant_id);
    const data = await adminQuery(QUERY, { ids: variantIds });
    const nodes = data.nodes || [];

    let updated = 0;
    for (const node of nodes) {
        if (!node || !node.inventoryItem) continue;
        const variantId = node.id;
        const inventoryItemId = node.inventoryItem.id;

        const [result] = await pool.query(
            'UPDATE shopify_product_mappings SET shopify_inventory_item_id = ? WHERE shopify_variant_id = ?',
            [inventoryItemId, variantId]
        );
        if (result.affectedRows > 0) {
            console.log(`  variant: ${variantId.split('/').pop()} → inventoryItem: ${inventoryItemId.split('/').pop()}`);
            updated++;
        }
    }

    console.log(`\n완료: ${updated}개 업데이트`);
    process.exit(0);
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
