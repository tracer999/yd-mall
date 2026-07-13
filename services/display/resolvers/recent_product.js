const pool = require('../../../config/db');
const { P_STATUS, visibilityClause } = require('./_shared');
const dealSvc = require('../../deal/dealService');

/*
 * recent_product — 최근 본 상품 (CT-8)
 *
 * 로그인 사용자: recent_views 테이블 (상품 상세에서 기록됨)
 * 비로그인    : 서버는 빈 배열을 주고, 클라이언트가 localStorage 로 채운다.
 *
 * 로그인 상태에서 이력이 없으면 섹션 스킵.
 * 비로그인은 클라이언트가 채울 수 있으므로 섹션을 유지하고, 데이터가 없으면 JS가 숨긴다.
 */
async function resolve({ shared, config, locals }) {
    const limit = Math.min(Number(config.maxCount) || 8, 20);

    if (!shared.userId) {
        locals.products = [];
        locals.clientOnly = true;
        return locals;
    }

    const [rows] = await pool.query(`
        SELECT p.id, p.name, p.slug, p.price, p.original_price, p.discount_rate,
               p.main_image, p.provider, MAX(rv.viewed_at) AS last_viewed
        FROM recent_views rv
        JOIN products p ON p.id = rv.product_id
        WHERE rv.user_id = ? AND ${P_STATUS} AND ${visibilityClause(true)}
        GROUP BY p.id, p.name, p.slug, p.price, p.original_price, p.discount_rate, p.main_image, p.provider
        ORDER BY last_viewed DESC
        LIMIT ?
    `, [shared.userId, limit]);

    if (!rows || rows.length === 0) return null;

    // 본 뒤에 특가가 시작됐을 수 있다 — 최근 본 상품도 현재가 기준으로 보여준다.
    await dealSvc.applyDeals(rows);

    locals.products = rows;
    locals.clientOnly = false;
    return locals;
}

module.exports = { resolve };
