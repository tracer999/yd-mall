/**
 * Shopify 상품 삭제 스크립트
 * shopify_product_mappings에 등록된 상품을 Shopify에서 삭제하고 매핑도 제거
 *
 * 사용:
 *   node scripts/shopify-delete-products.js --dry-run        # 삭제 대상 목록만 출력
 *   node scripts/shopify-delete-products.js --all            # 매핑된 전체 삭제
 *   node scripts/shopify-delete-products.js --product-id=27  # 특정 dev-mall product_id 삭제
 */
require('../config/env');
const pool = require('../config/db');
const { adminQuery } = require('../services/shopify/adminClient');

const DELETE_MUTATION = `
  mutation ProductDelete($id: ID!) {
    productDelete(input: { id: $id }) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

async function deleteProduct(shopifyProductId, dryRun) {
    if (dryRun) return { deleted: false, dry: true };

    const data = await adminQuery(DELETE_MUTATION, { id: shopifyProductId });
    const result = data.productDelete;
    const errors = result?.userErrors || [];
    if (errors.length > 0) throw new Error(errors.map(e => e.message).join(', '));
    return { deleted: true, id: result?.deletedProductId };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const all = args.includes('--all');
    const productIdArg = args.find(a => a.startsWith('--product-id='));
    const targetProductId = productIdArg ? parseInt(productIdArg.split('=')[1]) : null;

    if (!all && !targetProductId && !dryRun) {
        console.error('옵션을 지정하세요: --dry-run | --all | --product-id=N');
        console.error('  --dry-run       삭제 대상 목록만 출력 (실제 삭제 안 함)');
        console.error('  --all           매핑된 전체 상품 삭제');
        console.error('  --product-id=N  특정 dev-mall product_id 삭제');
        process.exit(1);
    }

    let query = `
        SELECT spm.id AS mapping_id, spm.product_id, spm.shopify_product_id,
               spm.shopify_handle, p.name AS product_name
        FROM shopify_product_mappings spm
        JOIN products p ON p.id = spm.product_id
    `;
    const params = [];

    if (targetProductId) {
        query += ' WHERE spm.product_id = ?';
        params.push(targetProductId);
    }

    const [rows] = await pool.query(query, params);

    if (rows.length === 0) {
        console.log('삭제할 매핑 없음');
        process.exit(0);
    }

    console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}삭제 대상: ${rows.length}개\n`);
    rows.forEach(r =>
        console.log(`  [${r.product_id}] ${r.product_name} — ${r.shopify_product_id}`)
    );

    if (dryRun) {
        console.log('\n--dry-run 모드: 실제 삭제 없음');
        process.exit(0);
    }

    console.log('\n삭제 중...\n');
    let deleted = 0, failed = 0;

    for (const row of rows) {
        try {
            await deleteProduct(row.shopify_product_id, false);
            await pool.query('DELETE FROM shopify_product_mappings WHERE id = ?', [row.mapping_id]);
            console.log(`  [OK]   [${row.product_id}] ${row.product_name}`);
            deleted++;
        } catch (err) {
            console.error(`  [FAIL] [${row.product_id}] ${row.product_name}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n완료: ${deleted}개 삭제, ${failed}개 실패`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('오류:', err.message);
    process.exit(1);
});
