const pool = require('../../../config/db');
const productGroupService = require('../productGroupService');
const { P_STATUS, visibilityClause } = require('./_shared');
const dealSvc = require('../../deal/dealService');

/*
 * benefit_bento — 대형 딜 + 썸네일 그리드 + 프로모 블록 (CT-4)
 *
 * config:
 *   dealProductId  대형 딜 상품 id (없거나 비노출 상품이면 슬롯만 숨김)
 *   maxCount       썸네일 수 (기본 8)
 *   promoBlocks    [{ copy, color, url }]
 *
 * 딜/썸네일/프로모가 모두 비면 섹션 스킵.
 */
async function loadDeal(dealProductId, hasUser) {
    if (!dealProductId) return null;
    const [rows] = await pool.query(`
        SELECT p.id, p.name, p.slug, p.price, p.original_price, p.discount_rate, p.main_image
        FROM products p
        WHERE p.id = ? AND ${P_STATUS} AND ${visibilityClause(hasUser)}
        LIMIT 1
    `, [Number(dealProductId)]);
    // 대형 딜 슬롯 — 썸네일 쪽은 productGroupService 가 이미 특가를 반영한다.
    await dealSvc.applyDeals(rows);
    return rows[0] || null;
}

async function resolve({ section, shared, config, locals }) {
    const deal = await loadDeal(config.dealProductId, shared.hasUser);

    let products = [];
    if (section.data_source_id) {
        const group = await productGroupService.getById(section.data_source_id);
        products = await productGroupService.resolve(group, {
            hasUser: shared.hasUser,
            limit: config.maxCount || 8,
        });
    }

    const promoBlocks = Array.isArray(config.promoBlocks) ? config.promoBlocks : [];
    if (!deal && products.length === 0 && promoBlocks.length === 0) return null;

    locals.deal = deal;
    locals.products = products;
    locals.promoBlocks = promoBlocks;
    return locals;
}

module.exports = { resolve };
