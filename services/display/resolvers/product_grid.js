const productGroupService = require('../productGroupService');

/**
 * product_grid — data_source_id 의 상품 그룹을 해석한다.
 * 상품이 0건이면 스킵(빈 그리드 미노출).
 */
async function resolve({ section, shared, config, locals }) {
    const group = await productGroupService.getById(section.data_source_id);
    const products = await productGroupService.resolve(group, {
        hasUser: shared.hasUser,
        limit: config.maxCount || 8
    });
    if (!products || products.length === 0) return null;

    locals.products = products;
    return locals;
}

module.exports = { resolve };
