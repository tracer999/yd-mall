const pool = require('../../../config/db');
const { P_STATUS, STOCK_COL, visibilityClause } = require('./_shared');
const newArrival = require('../../catalog/newArrival');

/**
 * new_by_category — 카테고리별 신상품 (탭 + 그리드)
 *
 * 신상품이 실제로 있는 NORMAL 최상위 카테고리만 탭으로 세운다. 카테고리를 먼저 나열하고
 * 상품을 채우면 대부분의 탭이 비어버리므로, 상품이 있는 카테고리만 역으로 뽑는다.
 * 카테고리는 서브트리(자신+후손) 기준으로 집계한다 — 부모 탭을 눌렀는데 자식 상품이
 * 안 나오면 비어 보인다.
 *
 * config:
 *   maxCount     탭별 상품 수 (기본 8)
 *   maxCategory  탭 최대 수 (기본 6)
 *
 * 신상품이 0건이면 스킵.
 */
async function resolve({ shared, config, locals }) {
    const productLimit = Math.min(Number(config.maxCount) || 8, 24);
    const categoryLimit = Math.min(Number(config.maxCategory) || 6, 12);
    const vis = visibilityClause(shared.hasUser);
    const mallId = shared.mallId || 1;

    const np = newArrival.newProductPredicate('p');

    // 활성 NORMAL 카테고리 전체 → 서브트리 구성용.
    // 글로벌(0) + 이 몰 소유분 둘 다 본다 — 카테고리 글로벌화 이후 이 몰만 보면 0건이 된다.
    const [cats] = await pool.query(`
        SELECT id, name, parent_id
        FROM categories
        WHERE type = 'NORMAL' AND mall_id IN (0, ?) AND is_active = 1
        ORDER BY display_order ASC, id ASC
    `, [mallId]);
    if (!cats.length) return null;

    const childrenOf = new Map();
    for (const c of cats) {
        const p = c.parent_id || 0;
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p).push(c);
    }

    const subtreeIds = (rootId) => {
        const ids = [];
        const seen = new Set();
        const queue = [rootId];
        while (queue.length) {
            const cur = queue.shift();
            if (seen.has(cur)) continue; // 순환 가드
            seen.add(cur);
            ids.push(cur);
            (childrenOf.get(cur) || []).forEach(ch => queue.push(ch.id));
        }
        return ids;
    };

    const tabs = [];
    for (const root of (childrenOf.get(0) || [])) {
        if (tabs.length >= categoryLimit) break;

        const ids = subtreeIds(root.id);
        const placeholders = ids.map(() => '?').join(',');
        const [products] = await pool.query(`
            SELECT p.id, p.name, p.slug, p.main_image, p.price, p.original_price,
                   p.discount_rate, p.status, ${STOCK_COL}, p.provider,
                   p.product_badge, p.distribution_badge, p.sale_start_date
            FROM products p
            WHERE p.mall_id = ? AND p.category_id IN (${placeholders})
              AND ${P_STATUS} AND ${vis} AND ${np.sql}
            ORDER BY ${newArrival.newProductOrder('p')}
            LIMIT ?
        `, [mallId, ...ids, ...np.params, productLimit]);

        if (!products.length) continue; // 신상품 없는 카테고리는 탭을 만들지 않는다
        tabs.push({ id: root.id, name: root.name, products });
    }

    if (!tabs.length) return null;

    locals.tabs = tabs;
    return locals;
}

module.exports = { resolve };
