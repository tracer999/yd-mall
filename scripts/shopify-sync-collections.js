/**
 * Shopify Smart Collection 동기화 스크립트
 *
 * dev-mall의 카테고리를 Shopify Smart Collection으로 생성한다.
 *   - NORMAL 카테고리 → ruleSet: product_type = '영양제' 등
 *   - BRAND  카테고리 → ruleSet: vendor = '백세식품' 등
 *
 * Smart Collection은 조건에 맞는 상품을 Shopify가 자동으로 포함시키므로,
 * 한 번 생성 후 상품에 productType / vendor 값만 맞게 동기화하면 된다.
 *
 * 사용:
 *   node scripts/shopify-sync-collections.js              # 전체 생성
 *   node scripts/shopify-sync-collections.js --list       # 현재 Shopify 컬렉션 목록
 *   node scripts/shopify-sync-collections.js --dry-run    # 생성 대상 출력만 (API 호출 없음)
 *   node scripts/shopify-sync-collections.js --delete-all # 모든 커스텀/스마트 컬렉션 삭제
 */
require('../config/env');
const pool = require('../config/db');
const { adminQuery } = require('../services/shopify/adminClient');

// ── GraphQL ──────────────────────────────────────────────────────────────────

const LIST_COLLECTIONS = `
  query ($cursor: String) {
    collections(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title handle
          ruleSet {
            rules { column relation condition }
          }
        }
      }
    }
  }
`;

const CREATE_COLLECTION = `
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
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

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

async function fetchAllCollections() {
    const all = [];
    let cursor = null;
    while (true) {
        const data = await adminQuery(LIST_COLLECTIONS, { cursor });
        const { edges, pageInfo } = data.collections;
        edges.forEach(e => all.push(e.node));
        if (!pageInfo.hasNextPage) break;
        cursor = pageInfo.endCursor;
    }
    return all;
}

async function createCollection(title, column, condition) {
    const data = await adminQuery(CREATE_COLLECTION, {
        input: {
            title,
            ruleSet: {
                appliedDisjunctively: false,
                rules: [{ column, relation: 'EQUALS', condition }],
            },
            sortOrder: 'BEST_SELLING',
        },
    });
    const { collection, userErrors } = data.collectionCreate;
    if (userErrors?.length) throw new Error(userErrors.map(e => `${e.field}: ${e.message}`).join(', '));
    return collection;
}

async function deleteCollection(id) {
    const data = await adminQuery(DELETE_COLLECTION, { input: { id } });
    const { userErrors } = data.collectionDelete;
    if (userErrors?.length) throw new Error(userErrors.map(e => e.message).join(', '));
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function listCollections() {
    const cols = await fetchAllCollections();
    console.log(`\n현재 Shopify 컬렉션 (${cols.length}개):\n`);
    cols.forEach(c => {
        const rules = c.ruleSet?.rules?.map(r => `${r.column}=${r.condition}`).join(', ') || '(수동)';
        console.log(`  ${c.title} (${c.handle})  [${rules}]`);
    });
    return cols;
}

async function deleteAll() {
    const cols = await fetchAllCollections();
    if (cols.length === 0) { console.log('삭제할 컬렉션 없음'); return; }
    console.log(`\n${cols.length}개 컬렉션 삭제 중...\n`);
    for (const c of cols) {
        try {
            await deleteCollection(c.id);
            console.log(`  [OK] 삭제: ${c.title}`);
        } catch (err) {
            console.error(`  [FAIL] ${c.title}: ${err.message}`);
        }
    }
}

async function syncCollections(dryRun) {
    // 1. dev-mall에서 카테고리 목록 조회 (상품이 있는 것만)
    const [normalRows] = await pool.query(`
        SELECT c.name
        FROM categories c
        JOIN products p ON p.category_id = c.id
        WHERE c.type = 'NORMAL'
        GROUP BY c.id, c.name
        ORDER BY c.display_order
    `);

    const [brandRows] = await pool.query(`
        SELECT c.name
        FROM categories c
        JOIN products p ON p.brand_category_id = c.id
        WHERE c.type = 'BRAND'
        GROUP BY c.id, c.name
        ORDER BY c.display_order
    `);

    // 2. 생성할 컬렉션 목록 구성
    // { title, column: 'PRODUCT_TYPE'|'VENDOR', condition }
    const targets = [
        ...normalRows.map(r => ({ title: r.name, column: 'TYPE', condition: r.name })),
        ...brandRows.map(r => ({ title: `[브랜드] ${r.name}`, column: 'VENDOR', condition: r.name })),
    ];

    console.log(`\n생성 대상 컬렉션 (${targets.length}개):\n`);
    targets.forEach(t => console.log(`  [${t.column === 'TYPE' ? '카테고리' : '브랜드  '}] ${t.title}`));

    if (dryRun) { console.log('\n(dry-run: API 호출 없음)'); return; }

    // 3. 기존 Shopify 컬렉션 조회 → 이미 있는 건 건너뜀
    console.log('\n기존 컬렉션 조회 중...');
    const existing = await fetchAllCollections();
    const existingTitles = new Set(existing.map(c => c.title));

    console.log(`\n동기화 시작...\n`);
    let created = 0, skipped = 0, failed = 0;

    for (const t of targets) {
        if (existingTitles.has(t.title)) {
            console.log(`  [SKIP] ${t.title} (이미 존재)`);
            skipped++;
            continue;
        }
        try {
            const col = await createCollection(t.title, t.column, t.condition);
            console.log(`  [OK]   ${col.title} → ${col.handle} (id: ${col.id})`);
            created++;
        } catch (err) {
            console.error(`  [FAIL] ${t.title}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n완료: ${created}개 생성, ${skipped}개 건너뜀, ${failed}개 실패`);
    console.log('\n--- 최종 컬렉션 목록 ---');
    await listCollections();
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--list')) {
        await listCollections();
    } else if (args.includes('--delete-all')) {
        await deleteAll();
    } else {
        await syncCollections(args.includes('--dry-run'));
    }
}

main()
    .catch(err => { console.error('오류:', err.message); process.exit(1); })
    .finally(() => pool.end());
