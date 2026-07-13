/*
 * 메뉴 쇼케이스 시드 — 상품형 3종.
 *
 *   쇼핑특가(/deals) → '추천 특가'      : 진행 예정·진행 중인 특가 상품 중에서
 *   베스트(/best)    → '추천 베스트'    : best_ranking 스냅샷 상위에서
 *   신상품(/new)     → '주목할 신상품'  : 판매 시작일 기준 신상품에서
 *
 * 각 메뉴에 manual product_group 을 하나 만들고(product_group.menu_code), 그 풀에서 상품을 담는다.
 * 관리자 화면(/admin/product-groups)에서 상품을 바꾸면 그대로 반영된다.
 *
 * 실행: set -a; . /etc/environment; set +a; node scripts/seed_menu_showcase.js [mallId]
 */
const pool = require('../config/db');
const newArrival = require('../services/catalog/newArrival');

const ITEMS_PER_GROUP = 8;

const SHOWCASES = [
    { menuCode: 'SHOPPING_DEAL', title: '추천 특가', pool: 'deal' },
    { menuCode: 'BEST', title: '추천 베스트', pool: 'best' },
    { menuCode: 'NEW_PRODUCT', title: '주목할 신상품', pool: 'new' },
];

/** 풀별 후보 상품 — 관리자 피커(productGroupController.POOL_PREDICATES)와 같은 정의를 쓴다. */
async function pickProducts(poolKey, mallId, limit) {
    const base = `p.mall_id = ? AND p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND p.visibility = 'PUBLIC'`;

    if (poolKey === 'deal') {
        const [rows] = await pool.query(`
            SELECT DISTINCT p.id, p.name FROM products p
            JOIN deal_item di ON di.product_id = p.id
            JOIN deal d ON d.id = di.deal_id
            JOIN deal_category dc ON dc.id = d.deal_category_id
            WHERE ${base} AND d.is_active = 1 AND dc.is_active = 1 AND NOW() <= d.ends_at AND d.mall_id = ?
            ORDER BY d.priority DESC, di.sort_order ASC
            LIMIT ?`, [mallId, mallId, limit]);
        return rows;
    }

    if (poolKey === 'best') {
        // '전체' 탭 일간 랭킹 상위권 — 카테고리·브랜드 탭까지 합치면 사실상 전 상품이 된다.
        const [rows] = await pool.query(`
            SELECT p.id, p.name FROM best_ranking b
            JOIN best_group g ON g.id = b.group_id AND g.group_type = 'ALL'
            JOIN products p ON p.id = b.product_id
            WHERE ${base} AND b.mall_id = ? AND b.period = 'DAILY'
              AND b.gender = 'ALL' AND b.age_band = 'ALL'
            ORDER BY b.rank_no ASC
            LIMIT ?`, [mallId, mallId, limit]);
        return rows;
    }

    // new — 신상품 판정은 newArrival 이 단독 정의한다(sql/params 를 같은 위치에 끼워야 한다).
    const np = newArrival.newProductPredicate('p');
    const [rows] = await pool.query(`
        SELECT p.id, p.name FROM products p
        WHERE ${base} AND ${np.sql}
        ORDER BY ${newArrival.NEW_PRODUCT_ORDER.replace(/\bp\./g, 'p.')}
        LIMIT ?`, [mallId, ...np.params, limit]);
    return rows;
}

/** 메뉴에 걸린 그룹을 찾거나 만든다 (UNIQUE(mall_id, menu_code)). */
async function upsertGroup(mallId, menuCode, title) {
    const [[found]] = await pool.query(
        'SELECT * FROM product_group WHERE mall_id = ? AND menu_code = ?', [mallId, menuCode]
    );
    if (found) {
        await pool.query(
            "UPDATE product_group SET showcase_title = ?, group_type = 'manual', is_active = 1 WHERE id = ?",
            [title, found.id]
        );
        return { id: found.id, created: false };
    }
    const [r] = await pool.query(`
        INSERT INTO product_group (mall_id, name, menu_code, showcase_title, group_type, sort_type, is_active)
        VALUES (?, ?, ?, ?, 'manual', 'manual', 1)`,
        [mallId, title, menuCode, title]
    );
    return { id: r.insertId, created: true };
}

(async () => {
    const mallId = Number(process.argv[2]) || 1;
    console.log(`[seed] 메뉴 쇼케이스 — mall ${mallId}\n`);

    for (const sc of SHOWCASES) {
        const products = await pickProducts(sc.pool, mallId, ITEMS_PER_GROUP);
        if (!products.length) {
            console.log(`  ⚠ ${sc.title.padEnd(12)} — ${sc.pool} 풀에 상품이 없어 건너뜁니다.`);
            continue;
        }

        const { id: groupId, created } = await upsertGroup(mallId, sc.menuCode, sc.title);

        // 시드는 멱등해야 한다 — 기존 아이템을 비우고 다시 담는다.
        await pool.query('DELETE FROM product_group_item WHERE product_group_id = ?', [groupId]);
        for (let i = 0; i < products.length; i++) {
            await pool.query(
                'INSERT INTO product_group_item (product_group_id, product_id, sort_order) VALUES (?, ?, ?)',
                [groupId, products[i].id, i + 1]
            );
        }

        console.log(`  ✓ ${sc.title.padEnd(12)} 그룹 #${groupId} (${created ? '생성' : '갱신'}) — 상품 ${products.length}건`);
        products.forEach((p, i) => console.log(`      ${String(i + 1).padStart(2)}. ${p.name}`));
    }

    console.log('\n[seed] 완료. 각 메뉴 페이지 상단에 캐러셀이 노출됩니다.');
    await pool.end();
})().catch(async (e) => {
    console.error('[seed] 실패:', e.message);
    await pool.end();
    process.exit(1);
});
