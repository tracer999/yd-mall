/**
 * yd-mall 상품 → Shopify Product 동기화 스크립트
 *
 * 실행: node scripts/shopify-sync-products.js [--dry-run] [--limit=10]
 *   --dry-run   실제 API 호출 없이 처리 대상만 출력
 *   --limit=N   최대 N개만 처리 (기본: 전체)
 *
 * 필수 환경변수: SHOPIFY_LOCATION_ID
 * API 버전 혼용:
 *   - 상품 생성: 2026-04 (productSet)
 *   - 재고 설정: 2025-01 (inventoryActivate + inventorySetOnHandQuantities)
 *     → 2026-04에서 inventory mutation에 @idempotent 디렉티브 필수 요건으로 변경됨
 */

const bootstrap = require('./_bootstrap');
const pool = require('../config/db');
const { adminQuery } = require('../services/shopify/adminClient');
const { processDescriptionImages } = require('../services/shopify/imageUploader');

const isDryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

// SHOPIFY_* 는 system_settings 에서 로드되므로 bootstrap() 이후에 채운다.
let SHOP, CLIENT_ID, CLIENT_SECRET;

async function getAdminToken() {
    const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
    });
    return (await r.json()).access_token;
}

async function adminQuery2025(query, variables) {
    const token = await getAdminToken();
    const r = await fetch(`https://${SHOP}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
    });
    const json = await r.json();
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(', '));
    return json.data;
}

// API 2026-04: product + variant 생성
const PRODUCT_SET = `
  mutation productSet($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product {
        id handle
        variants(first: 1) { edges { node { id inventoryItem { id } } } }
      }
      userErrors { field message }
    }
  }
`;

// API 2025-01: inventory item을 location에 활성화
const INVENTORY_ACTIVATE = `
  mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
      inventoryLevel { id }
      userErrors { field message }
    }
  }
`;

// API 2025-01: 재고 수량 설정
const SET_INVENTORY = `
  mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
    inventorySetOnHandQuantities(input: $input) {
      inventoryAdjustmentGroup { id }
      userErrors { field message }
    }
  }
`;

async function syncProducts() {
    await bootstrap(); // system_settings → process.env (SHOPIFY_* 주입)
    SHOP = process.env.SHOPIFY_STORE_DOMAIN;
    CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
    CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

    if (isDryRun) console.log('[DRY RUN 모드] 실제 API 호출 없음\n');

    const locationId = process.env.SHOPIFY_LOCATION_ID;
    if (!isDryRun && !locationId) {
        throw new Error('SHOPIFY_LOCATION_ID 환경변수가 필요합니다. node scripts/shopify-get-locations.js 로 확인하세요.');
    }

    let query = `
        SELECT p.id, p.name, p.price, p.description,
               p.short_description, p.slug, p.stock, p.status,
               p.main_image, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.status IN ('ON', 'SOLD_OUT')
        ORDER BY p.id
    `;
    if (limit) query += ` LIMIT ${limit}`;

    const [products] = await pool.query(query);
    console.log(`대상 상품 ${products.length}개\n`);

    let created = 0, skipped = 0, failed = 0;

    for (const product of products) {
        const [existing] = await pool.query(
            'SELECT id, shopify_product_id FROM shopify_product_mappings WHERE product_id = ?',
            [product.id]
        );

        if (existing.length > 0) {
            console.log(`[SKIP] ID:${product.id} — ${product.name} (이미 동기화됨: ${existing[0].shopify_product_id})`);
            skipped++;
            continue;
        }

        const price = String(product.price);
        const status = product.status === 'ON' ? 'ACTIVE' : 'DRAFT';

        if (isDryRun) {
            console.log(`[DRY] ID:${product.id} — ${product.name} | 가격: ${price} | 재고: ${product.stock}`);
            created++;
            continue;
        }

        try {
            // 설명 본문 이미지를 Shopify CDN으로 업로드 후 src 치환
            const descriptionHtml = await processDescriptionImages(product.description, product.name);

            // 1단계: product + variant 생성 (2026-04)
            const data = await adminQuery(PRODUCT_SET, {
                input: {
                    title: product.name,
                    descriptionHtml: descriptionHtml || '',
                    vendor: product.category_name || '',
                    handle: product.slug || undefined,
                    status,
                    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
                    variants: [{
                        price,
                        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
                        inventoryItem: { tracked: true }, // 재고 추적 활성화
                    }],
                },
            });

            const { product: sp, userErrors } = data.productSet;
            if (userErrors?.length) {
                console.error(`[ERROR] ID:${product.id} — ${product.name}: ${userErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
                failed++;
                continue;
            }

            const variantId = sp.variants.edges[0].node.id;
            const inventoryItemId = sp.variants.edges[0].node.inventoryItem.id;

            // 2단계: inventory item을 location에 활성화 (2025-01)
            const act = await adminQuery2025(INVENTORY_ACTIVATE, { inventoryItemId, locationId });
            if (act.inventoryActivate.userErrors?.length) {
                console.warn(`[WARN] 활성화 실패 ID:${product.id}: ${act.inventoryActivate.userErrors.map(e => e.message).join(', ')}`);
            }

            // 3단계: 재고 설정 (2025-01)
            if (product.stock > 0) {
                const inv = await adminQuery2025(SET_INVENTORY, {
                    input: {
                        reason: 'correction',
                        setQuantities: [{ inventoryItemId, locationId, quantity: product.stock }],
                    },
                });
                if (inv.inventorySetOnHandQuantities.userErrors?.length) {
                    console.warn(`[WARN] 재고 설정 실패 ID:${product.id}: ${inv.inventorySetOnHandQuantities.userErrors.map(e => e.message).join(', ')}`);
                }
            }

            // 4단계: 매핑 저장
            await pool.query(
                `INSERT INTO shopify_product_mappings
                    (product_id, shopify_product_id, shopify_variant_id, shopify_handle)
                 VALUES (?, ?, ?, ?)`,
                [product.id, sp.id, variantId, sp.handle]
            );

            console.log(`[OK] ID:${product.id} — ${product.name} → ${sp.id}`);
            created++;
        } catch (e) {
            console.error(`[ERROR] ID:${product.id} — ${product.name}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n완료: 생성 ${created}, 스킵 ${skipped}, 실패 ${failed}`);
}

syncProducts()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('스크립트 오류:', err.message);
        process.exit(1);
    });
