const dealSvc = require('../../deal/dealService');

/**
 * deal_carousel — 활성 특가를 홈에 노출한다.
 *
 * product_carousel 과 달리 data_source_id(product_group)를 쓰지 않는다. 데이터는
 * dealService 가 읽는 시점에 판정한 활성 특가다 — 기간·시간창·요일·선착순이 모두 맞아야
 * 나온다. 그래서 타임특가 시간이 끝나면 이 섹션은 다음 요청부터 자동으로 사라진다.
 *
 * config.dealCategoryCode 로 특정 카테고리만 뽑을 수 있다(예: TIME → 타임특가만).
 * 비우면 전 카테고리를 sort_order 순으로 이어 붙인다.
 *
 * 활성 특가가 0건이면 null 을 리턴해 섹션 자체를 건너뛴다(빈 캐러셀 방지).
 */
async function resolve({ section, shared, config, locals }) {
    const mallId = shared.mallId || 1;
    const code = config.dealCategoryCode ? String(config.dealCategoryCode).toUpperCase() : null;

    const categories = await dealSvc.getActiveDealsByCategory(mallId, code);
    const products = categories.flatMap((c) => c.products).slice(0, Number(config.maxCount) || 12);
    if (products.length === 0) return null;

    locals.products = products;
    return locals;
}

module.exports = { resolve };
