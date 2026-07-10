const { loadHomeCategoryBests } = require('./_shared');

/**
 * category_showcase — 최상위(1뎁스) 카테고리별 베스트 상품 행.
 * 카테고리 서브트리에서 상품이 하나도 없으면 그 카테고리는 스킵,
 * 전부 비면 섹션 자체를 스킵.
 *
 * config(선택): { productLimit, categoryLimit, title }
 */
async function resolve({ shared, config, locals }) {
    const groups = await loadHomeCategoryBests(shared.hasUser, shared.mallId || 1, {
        productLimit: config && config.productLimit,
        categoryLimit: config && config.categoryLimit,
    });
    if (!groups || groups.length === 0) return null;

    locals.categoryGroups = groups;
    return locals;
}

module.exports = { resolve };
