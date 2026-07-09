const productGroupService = require('../productGroupService');

/**
 * product_carousel — product_grid 와 동일한 데이터 소스(product_group).
 * 표현만 캐러셀이므로 기본 노출 수만 다르다(12).
 * 상품이 0건이면 스킵.
 */
async function resolve({ section, shared, config, locals }) {
    const group = await productGroupService.getById(section.data_source_id);
    const products = await productGroupService.resolve(group, {
        hasUser: shared.hasUser,
        limit: config.maxCount || 12
    });
    if (!products || products.length === 0) return null;

    locals.products = products;
    return locals;
}

module.exports = { resolve };
