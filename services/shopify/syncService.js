/**
 * Shopify 상품 동기화 서비스
 * - 신규 상품: Shopify에 생성 + 매핑 INSERT
 * - 기존 상품: Shopify 정보 업데이트 + 재고 동기화
 */
const pool = require('../../config/db');
const { adminQuery } = require('./adminClient');
const { processDescriptionImages } = require('./imageUploader');

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;

/**
 * Shopify 동기화 사용 여부.
 * system_settings.shopify_sync_enabled → process.env.SHOPIFY_SYNC_ENABLED 로 주입된다.
 * 미설정/빈값이면 기본 활성(true). '0','false','off','no' 이면 비활성.
 * @returns {boolean}
 */
function isShopifySyncEnabled() {
    const raw = process.env.SHOPIFY_SYNC_ENABLED;
    if (raw == null || String(raw).trim() === '') return true;
    return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

async function getAdminToken() {
    const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.SHOPIFY_CLIENT_ID,
            client_secret: process.env.SHOPIFY_CLIENT_SECRET,
            grant_type: 'client_credentials',
        }),
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

// ── GraphQL mutations ──────────────────────────────────────────────────────

const PRODUCT_SET = `
  mutation productSet($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product {
        id handle
        media(first: 20) { edges { node { id } } }
        variants(first: 1) { edges { node { id inventoryItem { id } } } }
      }
      userErrors { field message }
    }
  }
`;

const INVENTORY_ACTIVATE = `
  mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
      inventoryLevel { id }
      userErrors { field message }
    }
  }
`;

const SET_INVENTORY = `
  mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
    inventorySetOnHandQuantities(input: $input) {
      inventoryAdjustmentGroup { id }
      userErrors { field message }
    }
  }
`;

const DELETE_MEDIA = `
  mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage { id image { url } }
      }
      mediaUserErrors { code field message }
    }
  }
`;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

// yd-mall 상대 경로(/uploads/...) → 절대 URL
function toAbsoluteUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const base = (process.env.SHOPIFY_WEBHOOK_BASE_URL || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');
    return `${base}${path}`;
}

// 설명 HTML 안의 루트-상대 이미지 경로(src="/uploads/...")를 절대 URL로 치환.
// Shopify는 호스트 없는 상대경로를 자기 도메인 기준으로 해석해 이미지가 깨지므로 필요.
// 이미 절대 URL(http...)이거나 프로토콜-상대(//host/...)인 경우는 건드리지 않는다.
function rewriteRelativeImageUrls(html) {
    if (!html) return html;
    const base = (process.env.SHOPIFY_WEBHOOK_BASE_URL || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');
    return html.replace(
        /(\bsrc\s*=\s*)(["'])(\/(?!\/)[^"']*)\2/gi,
        (_m, prefix, quote, path) => `${prefix}${quote}${base}${path}${quote}`
    );
}

// yd-mall status → Shopify status
// SOLD_OUT / RESTOCK 는 상품 노출 유지, 재고만 0으로 표시
function toShopifyStatus(status) {
    if (status === 'ON' || status === 'SOLD_OUT' || status === 'RESTOCK') return 'ACTIVE';
    return 'DRAFT'; // COMING_SOON, OFF, NULL 등
}

// media input 배열 생성 (중복 URL 제거)
function buildMediaInput(product) {
    const media = [];
    const seen = new Set();

    const add = (path, altSuffix) => {
        const url = toAbsoluteUrl(path);
        if (url && !seen.has(url)) {
            seen.add(url);
            media.push({ originalSource: url, mediaContentType: 'IMAGE', alt: product.name + (altSuffix || '') });
        }
    };

    add(product.main_image, '');
    add(product.thumbnail_image, ' 썸네일');

    return media;
}

/**
 * 단일 상품 동기화 (신규 생성 또는 업데이트)
 * @param {number} productId  yd-mall products.id
 * @returns {{ action: 'created'|'updated', shopifyProductId: string }}
 */
async function syncProductById(productId) {
    if (!isShopifySyncEnabled()) {
        console.log(`[Shopify Sync] 비활성화 상태 — 동기화 건너뜀 (product_id=${productId})`);
        return { action: 'skipped', reason: 'shopify_sync_disabled' };
    }

    const locationId = process.env.SHOPIFY_LOCATION_ID;
    if (!locationId) throw new Error('SHOPIFY_LOCATION_ID 환경변수가 필요합니다.');

    const [[product]] = await pool.query(`
        SELECT p.id, p.name, p.price, p.description,
               p.short_description, p.slug, p.stock, p.status,
               p.main_image, p.thumbnail_image, p.product_code,
               cn.name AS normal_cat,
               cb.name AS brand_cat
        FROM products p
        LEFT JOIN categories cn ON p.category_id = cn.id
        LEFT JOIN categories cb ON p.brand_category_id = cb.id
        WHERE p.id = ?
    `, [productId]);

    if (!product) throw new Error(`상품을 찾을 수 없습니다: id=${productId}`);

    const [existing] = await pool.query(
        'SELECT * FROM shopify_product_mappings WHERE product_id = ?',
        [productId]
    );

    const price = String(product.price || 0);
    const status = toShopifyStatus(product.status);
    const media = buildMediaInput(product);

    // 설명 본문 이미지를 Shopify CDN으로 업로드하고 src를 치환 (해외 로딩 속도/외부 의존성 개선)
    const descriptionHtml = await processDescriptionImages(product.description, product.name);

    const input = {
        title: product.name,
        descriptionHtml: descriptionHtml || '',
        productType: product.normal_cat || '',
        vendor: product.brand_cat || '',
        handle: product.slug || undefined,
        status,
        productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
        variants: [{
            price,
            sku: product.product_code || undefined,
            optionValues: [{ optionName: 'Title', name: 'Default Title' }],
            inventoryItem: { tracked: true }, // 재고 추적 활성화 (yd-mall 재고로 관리)
        }],
    };

    // 원본(yd-mall) 연결정보를 Shopify 상품 metafield 로 심는다.
    // shopifyApp(동기화 현황 대시보드)이 Shopify Admin API 만으로 원본 연결/미연결·
    // 마지막 동기화 시각을 읽을 수 있게 하기 위함. productSet 에 함께 실어 별도 호출이 없다.
    input.metafields = [{
        namespace: 'devmall',
        key: 'source',
        type: 'json',
        value: JSON.stringify({
            productId: product.id,
            handle: product.slug || null,
            syncedAt: new Date().toISOString(),
        }),
    }];

    if (existing.length > 0) {
        input.id = existing[0].shopify_product_id;
    }

    let data = await adminQuery(PRODUCT_SET, { input });
    let { product: sp, userErrors } = data.productSet;

    // Shopify에서 상품이 삭제됐지만 매핑은 남아있는 경우 → 매핑 삭제 후 신규 생성으로 재시도
    if (userErrors?.some(e => e.message.includes('does not exist')) && existing.length > 0) {
        console.warn(`[Shopify Sync] 상품이 Shopify에 없음, 매핑 초기화 후 재생성 (product_id=${productId})`);
        await pool.query('DELETE FROM shopify_product_mappings WHERE product_id = ?', [productId]);
        delete input.id;
        data = await adminQuery(PRODUCT_SET, { input });
        ({ product: sp, userErrors } = data.productSet);
        existing.length = 0; // 신규 생성 분기로 처리
    }

    if (userErrors?.length) {
        throw new Error(userErrors.map(e => `${e.field}: ${e.message}`).join(', '));
    }

    const variantId = sp.variants.edges[0].node.id;
    const inventoryItemId = sp.variants.edges[0].node.inventoryItem.id;

    // 이미지 동기화: 기존 미디어 교체
    if (media.length > 0) {
        try {
            // 기존 미디어 삭제 (업데이트 시 또는 신규이지만 이미 미디어가 있을 경우)
            const currentMedia = sp.media?.edges?.map(e => e.node.id) || [];
            if (currentMedia.length > 0) {
                await adminQuery(DELETE_MEDIA, { productId: sp.id, mediaIds: currentMedia });
            }
            // 새 이미지 추가
            await adminQuery(CREATE_MEDIA, { productId: sp.id, media });
        } catch (err) {
            console.warn(`[Shopify Sync] 이미지 동기화 경고 (product_id=${productId}): ${err.message}`);
        }
    }

    if (existing.length === 0) {
        // 신규: inventory 활성화 → 재고 설정 → 매핑 INSERT
        await adminQuery2025(INVENTORY_ACTIVATE, { inventoryItemId, locationId });

        if (product.stock > 0) {
            await adminQuery2025(SET_INVENTORY, {
                input: {
                    reason: 'correction',
                    setQuantities: [{ inventoryItemId, locationId, quantity: product.stock }],
                },
            });
        }

        await pool.query(
            `INSERT INTO shopify_product_mappings
                (product_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_handle)
             VALUES (?, ?, ?, ?, ?)`,
            [productId, sp.id, variantId, inventoryItemId, sp.handle]
        );

        return { action: 'created', shopifyProductId: sp.id };
    } else {
        // 업데이트: 재고 갱신 → 매핑 UPDATE
        const invItemId = existing[0].shopify_inventory_item_id || inventoryItemId;
        await adminQuery2025(SET_INVENTORY, {
            input: {
                reason: 'correction',
                setQuantities: [{ inventoryItemId: invItemId, locationId, quantity: product.stock }],
            },
        });

        await pool.query(
            `UPDATE shopify_product_mappings
             SET shopify_variant_id = ?, shopify_inventory_item_id = ?, shopify_handle = ?, synced_at = NOW()
             WHERE product_id = ?`,
            [variantId, inventoryItemId, sp.handle, productId]
        );

        return { action: 'updated', shopifyProductId: sp.id };
    }
}

/**
 * 여러 상품 일괄 동기화
 * @param {number[]} productIds
 * @returns {{ results: Array, created: number, updated: number, failed: number }}
 */
async function syncProductsByIds(productIds) {
    if (!isShopifySyncEnabled()) {
        console.log('[Shopify Sync] 비활성화 상태 — 일괄 동기화 건너뜀');
        return { results: [], created: 0, updated: 0, failed: 0, skipped: productIds.length, disabled: true };
    }

    const results = [];
    let created = 0, updated = 0, failed = 0;

    for (const id of productIds) {
        try {
            const r = await syncProductById(id);
            results.push({ productId: id, ...r });
            if (r.action === 'created') created++;
            else if (r.action === 'skipped') { /* 비활성화 등으로 건너뜀 */ }
            else updated++;
        } catch (err) {
            results.push({ productId: id, action: 'failed', error: err.message });
            failed++;
        }
    }

    return { results, created, updated, failed };
}

const PRODUCT_DELETE = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

/**
 * 상품 삭제 동기화
 * DB에서 상품이 삭제되기 전 또는 후에 호출 가능.
 * 매핑이 없으면 조용히 종료한다.
 * @param {number} productId
 */
async function deleteProductById(productId) {
    if (!isShopifySyncEnabled()) {
        console.log(`[Shopify Sync] 비활성화 상태 — 삭제 동기화 건너뜀 (product_id=${productId})`);
        return { action: 'skipped', reason: 'shopify_sync_disabled' };
    }

    const [rows] = await pool.query(
        'SELECT shopify_product_id FROM shopify_product_mappings WHERE product_id = ?',
        [productId]
    );
    if (rows.length === 0) return; // Shopify에 등록된 적 없음

    const shopifyProductId = rows[0].shopify_product_id;
    const data = await adminQuery(PRODUCT_DELETE, { input: { id: shopifyProductId } });
    const { userErrors } = data.productDelete;

    if (userErrors?.length && !userErrors.some(e => e.message.includes('does not exist'))) {
        throw new Error(userErrors.map(e => e.message).join(', '));
    }

    await pool.query('DELETE FROM shopify_product_mappings WHERE product_id = ?', [productId]);
}

module.exports = { syncProductById, syncProductsByIds, deleteProductById, rewriteRelativeImageUrls, isShopifySyncEnabled };
