/**
 * shopify_product_mappings의 stale shopify_product_id / shopify_variant_id 재매핑
 * - handle(shopify_handle) 기준으로 현재 Shopify 상품을 조회해 product_id / variant_id를 갱신한다.
 * - 상품 재생성 등으로 gid가 바뀌어 "merchandise does not exist"(해외 구매하기 에러)가 나는 경우를 바로잡는다.
 * - Shopify 데이터는 변경하지 않고, DB 매핑 테이블만 갱신한다(읽기 전용 조회 + mapping UPDATE).
 * - variant가 바뀌면 shopify_inventory_item_id는 NULL로 초기화(옛 variant 소속) → 이후 백필 스크립트로 재채움.
 *
 * 사용:
 *   node scripts/shopify-remap-variants.js --dry-run --limit=5   # 미리보기
 *   node scripts/shopify-remap-variants.js                       # 전체 적용
 */
require('../config/env');
const pool = require('../config/db');
const { getProductByHandle } = require('../services/shopify/productService');

const DRY = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const tail = (gid) => (gid ? String(gid).split('/').pop() : '(없음)');

async function main() {
    let sql =
        'SELECT product_id, shopify_product_id, shopify_variant_id, shopify_handle ' +
        'FROM shopify_product_mappings WHERE shopify_handle IS NOT NULL AND shopify_handle <> "" ORDER BY product_id';
    if (LIMIT) sql += ` LIMIT ${LIMIT}`;

    const [rows] = await pool.query(sql);
    console.log(`대상 매핑: ${rows.length}개${DRY ? ' (dry-run)' : ''}`);

    let changed = 0, same = 0, missing = 0, failed = 0;

    for (const r of rows) {
        let product;
        try {
            product = await getProductByHandle(r.shopify_handle);
        } catch (e) {
            failed++;
            console.log(`  [FAIL] ${r.shopify_handle}: ${e.message}`);
            continue;
        }
        if (!product) {
            missing++;
            console.log(`  [MISS] handle으로 상품 못 찾음: ${r.shopify_handle}`);
            continue;
        }

        const newProductId = product.id;
        const newVariantId = product.variants?.edges?.[0]?.node?.id;
        if (!newVariantId) {
            missing++;
            console.log(`  [MISS] variant 없음: ${r.shopify_handle}`);
            continue;
        }

        if (newVariantId === r.shopify_variant_id && newProductId === r.shopify_product_id) {
            same++;
            continue;
        }

        console.log(
            `  [FIX] ${r.shopify_handle}: variant ${tail(r.shopify_variant_id)} → ${tail(newVariantId)}`
        );

        if (!DRY) {
            await pool.query(
                'UPDATE shopify_product_mappings SET shopify_product_id = ?, shopify_variant_id = ?, shopify_inventory_item_id = NULL WHERE product_id = ?',
                [newProductId, newVariantId, r.product_id]
            );
        }
        changed++;
    }

    console.log(`\n요약: 변경 ${changed} / 동일 ${same} / 누락 ${missing} / 실패 ${failed}`);
    if (!DRY && changed > 0) {
        console.log('※ 변경분의 shopify_inventory_item_id는 NULL로 초기화됨 → node scripts/shopify-backfill-inventory-ids.js 로 재백필 권장');
    }
    process.exit(0);
}

main().catch((err) => {
    console.error('오류:', err.message);
    process.exit(1);
});
