#!/usr/bin/env node
/**
 * 테스트 카테고리 트리 + 테스트 상품 시드 (멱등)
 *
 * 실행:  node scripts/seed_test_catalog.js
 * 제거:  node scripts/seed_test_catalog.js --remove
 *
 * 목적
 *   현재 카테고리 37개가 전부 depth 1 이라 GNB 드롭다운의 조건부 메가메뉴(§12)가
 *   세로 리스트로만 보인다. 2·3뎁스 데이터를 넣어 메가메뉴가 실제로 펼쳐지는 것을 확인하고,
 *   카테고리 페이지가 빈 화면이 되지 않도록 각 노드에 상품을 붙인다.
 *
 * 설계 근거 (코드 확인 결과)
 *   - `navigationService.getCategoryTree` 는 `type='NORMAL' AND is_active=1 AND depth <= max` 만 올린다.
 *     → 테스트 카테고리는 반드시 **NORMAL** 이어야 GNB 에 뜬다.
 *   - `productController.getList` 는 `AND category_id = ?` 로 **직접 매칭**한다(자식 상품을 끌어오지 않는다).
 *     → 부모 노드에도 상품을 붙여야 부모를 눌렀을 때 빈 목록이 아니다.
 *   - `navigation_config.category_max_depth = 3` 이므로 3뎁스까지 노출된다.
 *
 * 이 데이터는 **삭제하지 않고 남긴다**(데모용). 이름에 `[테스트]` 를 달아 실제 카탈로그와 구분하고,
 * `--remove` 로 언제든 한 번에 걷어낼 수 있다.
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 1;
const TAG = '[테스트]';

/** 이미지가 없으면 카드가 깨져 보이므로 기존 상품 이미지를 재사용한다. */
const FALLBACK_IMAGE = '/uploads/products/1774247998233-779996617.jpg';

/**
 * 트리 정의. products 는 그 노드에 **직접** 붙는다(부모 포함).
 * getList 가 category_id 직접 매칭이라, 상품 없는 노드를 누르면 빈 목록이 된다.
 */
const TREE = {
    name: `${TAG} 데모 카테고리`,
    slug: 'test-demo',
    products: [
        { name: `${TAG} 종합 데모 상품 A`, price: 19000, badge: 'NEW' },
        { name: `${TAG} 종합 데모 상품 B`, price: 24000, badge: null },
    ],
    children: [
        {
            name: `${TAG} 비타민`,
            slug: 'test-vitamin',
            products: [
                { name: `${TAG} 비타민C 1000mg 90정`, price: 12000, badge: 'BEST' },
                { name: `${TAG} 비타민D 2000IU 60캡슐`, price: 15000, badge: null },
                { name: `${TAG} 멀티비타민 30포`, price: 28000, badge: 'RECOMMEND' },
            ],
            children: [
                {
                    // 3뎁스 — category_max_depth = 3 이므로 여기까지 노출된다.
                    name: `${TAG} 어린이 비타민`,
                    slug: 'test-vitamin-kids',
                    products: [
                        { name: `${TAG} 키즈 츄어블 비타민 60정`, price: 18000, badge: 'NEW' },
                    ],
                    children: [],
                },
            ],
        },
        {
            name: `${TAG} 오메가3`,
            slug: 'test-omega3',
            products: [
                { name: `${TAG} rTG 오메가3 60캡슐`, price: 32000, badge: 'BEST' },
                { name: `${TAG} 알티지 오메가3 180캡슐`, price: 55000, badge: null },
            ],
            children: [],
        },
        {
            name: `${TAG} 유산균`,
            slug: 'test-probiotics',
            products: [
                { name: `${TAG} 생유산균 100억 30포`, price: 29000, badge: 'RECOMMEND' },
                { name: `${TAG} 김치유산균 60캡슐`, price: 21000, badge: null },
            ],
            children: [],
        },
    ],
};

const isRemove = process.argv.includes('--remove');

async function removeAll(conn) {
    // 상품 먼저 (categories 에 FK 는 없지만 고아 category_id 를 남기지 않는다)
    const [p] = await conn.query('DELETE FROM products WHERE name LIKE ?', [`${TAG}%`]);
    // 자식부터 지워야 parent_id 참조가 남지 않는다 (ON DELETE SET NULL 이라 조용히 승격되는 것 방지)
    const [c3] = await conn.query('DELETE FROM categories WHERE name LIKE ? AND depth = 3', [`${TAG}%`]);
    const [c2] = await conn.query('DELETE FROM categories WHERE name LIKE ? AND depth = 2', [`${TAG}%`]);
    const [c1] = await conn.query('DELETE FROM categories WHERE name LIKE ? AND depth = 1', [`${TAG}%`]);
    console.log(`  - 상품 ${p.affectedRows} / 카테고리 ${c1.affectedRows + c2.affectedRows + c3.affectedRows} 삭제`);
}

/** 카테고리 upsert (name 기준). 반환: id */
async function upsertCategory(conn, node, parentId, depth, order) {
    const [rows] = await conn.query(
        'SELECT id FROM categories WHERE name = ? AND mall_id = ? LIMIT 1', [node.name, MALL_ID]
    );
    if (rows.length) {
        await conn.query(
            `UPDATE categories SET parent_id = ?, depth = ?, type = 'NORMAL', slug = ?,
                    display_order = ?, is_active = 1, pc_visible = 1, mobile_visible = 1
              WHERE id = ?`,
            [parentId, depth, node.slug, order, rows[0].id]
        );
        console.log(`  = ${'  '.repeat(depth - 1)}${node.name} (id=${rows[0].id}, depth=${depth})`);
        return rows[0].id;
    }
    const [r] = await conn.query(
        `INSERT INTO categories (mall_id, name, slug, parent_id, depth, type, display_order, is_active, pc_visible, mobile_visible)
         VALUES (?, ?, ?, ?, ?, 'NORMAL', ?, 1, 1, 1)`,
        [MALL_ID, node.name, node.slug, parentId, depth, order]
    );
    console.log(`  + ${'  '.repeat(depth - 1)}${node.name} (id=${r.insertId}, depth=${depth})`);
    return r.insertId;
}

/** 상품 upsert (name 기준) */
async function upsertProduct(conn, p, categoryId, idx) {
    const slug = `test-${categoryId}-${idx}`;
    const [rows] = await conn.query('SELECT id FROM products WHERE name = ? LIMIT 1', [p.name]);
    if (rows.length) {
        await conn.query(
            `UPDATE products SET category_id = ?, price = ?, original_price = ?, stock = 100,
                    status = 'ON', visibility = 'PUBLIC', product_badge = ?, main_image = ?, thumbnail_image = ?
              WHERE id = ?`,
            [categoryId, p.price, p.price, p.badge, FALLBACK_IMAGE, FALLBACK_IMAGE, rows[0].id]
        );
        return 'updated';
    }
    await conn.query(
        `INSERT INTO products
            (category_id, name, product_code, provider, short_description, price, original_price,
             discount_rate, stock, status, visibility, main_image, thumbnail_image, slug, product_badge)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 100, 'ON', 'PUBLIC', ?, ?, ?, ?)`,
        [
            categoryId, p.name, slug.toUpperCase(), '테스트공급사',
            '카테고리 트리 데모용 테스트 상품입니다.',
            p.price, p.price, FALLBACK_IMAGE, FALLBACK_IMAGE, slug, p.badge,
        ]
    );
    return 'created';
}

async function walk(conn, node, parentId, depth, order, stats) {
    const id = await upsertCategory(conn, node, parentId, depth, order);
    for (let i = 0; i < (node.products || []).length; i++) {
        const r = await upsertProduct(conn, node.products[i], id, i + 1);
        stats[r] += 1;
    }
    for (let i = 0; i < (node.children || []).length; i++) {
        await walk(conn, node.children[i], id, depth + 1, i + 1, stats);
    }
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (isRemove) {
            console.log('테스트 카탈로그 제거');
            await removeAll(conn);
            console.log('\n✅ 완료');
            return;
        }

        console.log('테스트 카탈로그 시드 (NORMAL 카테고리 · 최대 3뎁스)');
        const [[maxRow]] = await conn.query(
            "SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM categories WHERE type = 'NORMAL' AND parent_id IS NULL AND mall_id = ?",
            [MALL_ID]
        );

        const stats = { created: 0, updated: 0 };
        await walk(conn, TREE, null, 1, maxRow.next_order, stats);

        console.log(`\n  상품: 생성 ${stats.created} / 갱신 ${stats.updated}`);

        // 무결성 확인 — 상품 없는 노드가 있으면 그 카테고리 페이지가 빈 화면이 된다.
        const [empty] = await conn.query(
            `SELECT c.id, c.name FROM categories c
              WHERE c.name LIKE ? AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)`,
            [`${TAG}%`]
        );
        if (empty.length) {
            console.log('\n  ⚠️ 상품이 없는 노드 (클릭 시 빈 목록):');
            empty.forEach(e => console.log(`     #${e.id} ${e.name}`));
        } else {
            console.log('  ✓ 모든 노드에 상품이 있다 (빈 카테고리 페이지 없음)');
        }

        const [[depthRow]] = await conn.query('SELECT MAX(depth) d FROM categories WHERE mall_id = ?', [MALL_ID]);
        console.log(`  현재 카테고리 최대 depth: ${depthRow.d}`);

        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
