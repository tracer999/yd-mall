const { loadHomeCategories } = require('./_shared');

/** category_showcase — 상품이 있는 NORMAL 카테고리 탭. 카테고리가 없으면 스킵. */
async function resolve({ shared, locals }) {
    const categories = await loadHomeCategories(shared.hasUser);
    if (!categories || categories.length === 0) return null;

    locals.categories = categories;
    return locals;
}

module.exports = { resolve };
