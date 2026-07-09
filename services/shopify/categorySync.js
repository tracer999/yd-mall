/**
 * Shopify 컬렉션 ↔ dev-mall 카테고리 동기화 서비스
 *
 * - NORMAL 카테고리 → Smart Collection (ruleSet: TYPE = 카테고리명)
 * - BRAND  카테고리 → Smart Collection (ruleSet: VENDOR = 브랜드명)
 * - THEME  카테고리 → 동기화 대상 아님 (Shopify에서 수동 관리)
 *
 * categories.shopify_collection_id 컬럼으로 매핑을 유지한다.
 */
const pool = require('../../config/db');
const { adminQuery } = require('./adminClient');
const { isShopifySyncEnabled } = require('./syncService');

// ── GraphQL ───────────────────────────────────────────────────────────────

const CREATE_COLLECTION = `
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id title handle }
      userErrors { field message }
    }
  }
`;

const UPDATE_COLLECTION = `
  mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id title handle }
      userErrors { field message }
    }
  }
`;

const DELETE_COLLECTION = `
  mutation collectionDelete($input: CollectionDeleteInput!) {
    collectionDelete(input: $input) {
      deletedCollectionId
      userErrors { field message }
    }
  }
`;

const LIST_COLLECTIONS = `
  query ($cursor: String) {
    collections(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title
          ruleSet { rules { column condition } }
        }
      }
    }
  }
`;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

function buildCollectionInput(category) {
    const isNormal = category.type === 'NORMAL';
    const isBrand  = category.type === 'BRAND';

    const title = isBrand ? `[브랜드] ${category.name}` : category.name;
    const column    = isNormal ? 'TYPE' : 'VENDOR';
    const condition = category.name;

    return {
        title,
        ruleSet: {
            appliedDisjunctively: false,
            rules: [{ column, relation: 'EQUALS', condition }],
        },
        sortOrder: 'BEST_SELLING',
    };
}

// ── 공개 API ──────────────────────────────────────────────────────────────

/**
 * 카테고리 → Shopify 컬렉션 동기화 (신규 생성 or 이름 업데이트 자동 판별)
 * THEME 카테고리는 무시한다.
 * @param {number} categoryId
 * @returns {{ action: 'created'|'updated'|'skipped', collectionId?: string }}
 */
async function syncCategoryById(categoryId) {
    const [[cat]] = await pool.query('SELECT * FROM categories WHERE id = ?', [categoryId]);
    if (!cat) throw new Error(`카테고리를 찾을 수 없습니다: id=${categoryId}`);

    if (cat.type === 'THEME') return { action: 'skipped', reason: 'THEME 카테고리는 동기화 대상 아님' };

    const input = buildCollectionInput(cat);

    if (cat.shopify_collection_id) {
        // 업데이트
        const data = await adminQuery(UPDATE_COLLECTION, { input: { ...input, id: cat.shopify_collection_id } });
        const { collection, userErrors } = data.collectionUpdate;

        // Shopify에서 컬렉션이 삭제된 경우 → 신규 생성으로 재시도
        if (userErrors?.some(e => e.message.includes('does not exist') || e.message.includes('not found'))) {
            await pool.query('UPDATE categories SET shopify_collection_id = NULL WHERE id = ?', [categoryId]);
            return syncCategoryById(categoryId);
        }

        if (userErrors?.length) throw new Error(userErrors.map(e => `${e.field}: ${e.message}`).join(', '));

        await pool.query('UPDATE categories SET shopify_collection_id = ? WHERE id = ?', [collection.id, categoryId]);
        return { action: 'updated', collectionId: collection.id };
    } else {
        // 신규 생성
        const data = await adminQuery(CREATE_COLLECTION, { input });
        const { collection, userErrors } = data.collectionCreate;
        if (userErrors?.length) throw new Error(userErrors.map(e => `${e.field}: ${e.message}`).join(', '));

        await pool.query('UPDATE categories SET shopify_collection_id = ? WHERE id = ?', [collection.id, categoryId]);
        return { action: 'created', collectionId: collection.id };
    }
}

/**
 * 카테고리 삭제 시 Shopify 컬렉션도 삭제
 * DB 삭제 전에 호출해야 shopify_collection_id를 읽을 수 있다.
 * @param {number} categoryId
 */
async function deleteCategoryFromShopify(categoryId) {
    const [[cat]] = await pool.query('SELECT shopify_collection_id FROM categories WHERE id = ?', [categoryId]);
    if (!cat?.shopify_collection_id) return;

    const data = await adminQuery(DELETE_COLLECTION, { input: { id: cat.shopify_collection_id } });
    const { userErrors } = data.collectionDelete;
    if (userErrors?.length) throw new Error(userErrors.map(e => e.message).join(', '));
}

/**
 * 기존 컬렉션과 카테고리 매핑 백필
 * 이미 Shopify에 컬렉션이 존재하지만 shopify_collection_id 가 비어있을 때 실행
 */
async function backfillCollectionIds() {
    // Shopify 컬렉션 전체 조회
    const shopifyCollections = [];
    let cursor = null;
    while (true) {
        const data = await adminQuery(LIST_COLLECTIONS, { cursor });
        data.collections.edges.forEach(e => shopifyCollections.push(e.node));
        if (!data.collections.pageInfo.hasNextPage) break;
        cursor = data.collections.pageInfo.endCursor;
    }

    // 카테고리 목록 조회 (THEME 제외)
    const [categories] = await pool.query("SELECT * FROM categories WHERE type != 'THEME'");

    let matched = 0;
    for (const cat of categories) {
        if (cat.shopify_collection_id) continue;

        const expectedTitle = cat.type === 'BRAND' ? `[브랜드] ${cat.name}` : cat.name;
        const found = shopifyCollections.find(c => c.title === expectedTitle);
        if (found) {
            await pool.query('UPDATE categories SET shopify_collection_id = ? WHERE id = ?', [found.id, cat.id]);
            console.log(`  [백필] ${cat.name} → ${found.id}`);
            matched++;
        }
    }
    return matched;
}

/*
 * Shopify 미사용 시 컬렉션 동기화를 건너뛴다.
 *
 * 이 가드가 없으면 카테고리를 추가/수정/삭제할 때마다 Shopify Admin API 를 호출한다.
 * 미사용 상태에서는 매번 인증 실패로 배경 에러가 쌓이고, 삭제는 await 이므로 응답까지 느려진다.
 * (services/shopify/syncService.js 의 상품 동기화 가드와 같은 원칙)
 */
function withSyncGuard(fn, label) {
    return async (...args) => {
        if (!isShopifySyncEnabled()) {
            console.log(`[Shopify] 비활성화 상태 — ${label} 건너뜀`);
            return { skipped: true, reason: 'shopify_sync_disabled' };
        }
        return fn(...args);
    };
}

module.exports = {
    syncCategoryById: withSyncGuard(syncCategoryById, '카테고리 컬렉션 동기화'),
    deleteCategoryFromShopify: withSyncGuard(deleteCategoryFromShopify, '카테고리 컬렉션 삭제'),
    backfillCollectionIds, // CLI 스크립트 전용 — 명시적으로 실행하므로 가드하지 않는다
};
