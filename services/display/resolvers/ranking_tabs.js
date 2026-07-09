const pool = require('../../../config/db');
const { P_STATUS, visibilityClause, loadHomeCategories } = require('./_shared');

/*
 * ranking_tabs — 카테고리 탭 + 랭킹 상품 (CT-3)
 *
 * config:
 *   maxTabs   탭 개수 (기본 6)
 *   rankLimit 탭당 노출 수 (기본 8)
 *   sort      views | sales | newest | discount (기본 views)
 *
 * 첫 탭 상품만 SSR 하고, 나머지 탭은 GET /sections/ranking 로 가져온다.
 * 탭이 0개면 섹션 스킵.
 */

const SORT_MAP = {
    views: 'p.view_count DESC, p.created_at DESC',
    sales: 'p.view_count DESC, p.created_at DESC',
    newest: 'p.created_at DESC',
    discount: 'p.discount_rate DESC, p.created_at DESC',
};

async function loadRanking({ categoryId, hasUser, sort, limit }) {
    const order = SORT_MAP[sort] || SORT_MAP.views;
    const [rows] = await pool.query(`
        SELECT p.id, p.name, p.slug, p.price, p.original_price, p.discount_rate,
               p.main_image, p.stock, p.status, p.provider,
               p.product_badge, p.distribution_badge
        FROM products p
        WHERE ${P_STATUS} AND ${visibilityClause(hasUser)} AND p.category_id = ?
        ORDER BY ${order}
        LIMIT ?
    `, [categoryId, limit]);
    return rows;
}

async function resolve({ shared, config, locals }) {
    const maxTabs = Math.min(Number(config.maxTabs) || 6, 12);
    const rankLimit = Math.min(Number(config.rankLimit) || 8, 20);
    const sort = SORT_MAP[config.sort] ? config.sort : 'views';

    const categories = await loadHomeCategories(shared.hasUser);
    if (!categories || categories.length === 0) return null;

    const tabs = categories.slice(0, maxTabs).map(c => ({ id: c.id, name: c.name }));
    const products = await loadRanking({
        categoryId: tabs[0].id,
        hasUser: shared.hasUser,
        sort,
        limit: rankLimit,
    });

    locals.tabs = tabs;
    locals.products = products;
    locals.rankLimit = rankLimit;
    locals.sort = sort;
    return locals;
}

module.exports = { resolve };
