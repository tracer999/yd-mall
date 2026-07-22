const pool = require('../../config/db');

/*
 * 배너 조회 서비스 (CT-5)
 *
 * 전시 섹션의 배너 데이터소스를 일원화한다.
 * 노출 조건: is_active = 1 AND (start_date <= 오늘) AND (end_date >= 오늘)
 * 날짜가 NULL 이면 제한 없음.
 */

/** 노출 기간 필터 (start_date/end_date 는 DATE 타입) */
const PERIOD_CLAUSE = `
    AND (start_date IS NULL OR start_date <= CURDATE())
    AND (end_date   IS NULL OR end_date   >= CURDATE())`;

/*
 * banners 는 mall_id 로 스코프한다(20260720_banners_mall_scope.sql).
 * mallId 를 안 넘기면 전 몰 배너가 섞이므로, 호출부는 반드시 몰을 넘겨야 한다.
 * 폴백(기본몰 1)은 두지 않는다 — 조용히 남의 몰 배너를 노출하느니 빈 목록이 낫다.
 */
function mallClause(mallId) {
    return Number.isFinite(Number(mallId)) ? { sql: 'AND mall_id = ?', param: [Number(mallId)] } : null;
}

/**
 * 배너 그룹으로 조회한다.
 * @param {string} groupKey banners.group_key
 * @param {{ limit?: number, mallId?: number }} opts
 * @returns {Promise<Array>} 활성/기간 내 배너 목록 (display_order 순)
 */
async function getByGroup(groupKey, { limit = 12, mallId } = {}) {
    if (!groupKey) return [];
    const scope = mallClause(mallId);
    if (!scope) return [];
    const lim = Math.min(Math.max(Number(limit) || 12, 1), 50);

    const [rows] = await pool.query(`
        SELECT id, title, overlay_subtitle, image_url, mobile_image_url, link_url, display_order
        FROM banners
        WHERE group_key = ? AND is_active = 1
        ${scope.sql}
        ${PERIOD_CLAUSE}
        ORDER BY display_order ASC, id ASC
        LIMIT ?
    `, [groupKey, ...scope.param, lim]);
    return rows;
}

/**
 * 배너 타입(MAIN/CATEGORY/POPUP/BRAND)으로 조회한다.
 * @param {string} bannerType
 * @param {{ limit?: number, mallId?: number }} opts
 */
async function getByType(bannerType, { limit = 12, mallId } = {}) {
    const scope = mallClause(mallId);
    if (!scope) return [];
    const lim = Math.min(Math.max(Number(limit) || 12, 1), 50);
    const [rows] = await pool.query(`
        SELECT id, title, overlay_subtitle, image_url, mobile_image_url, link_url, display_order
        FROM banners
        WHERE banner_type = ? AND is_active = 1
        ${scope.sql}
        ${PERIOD_CLAUSE}
        ORDER BY display_order ASC, id ASC
        LIMIT ?
    `, [bannerType, ...scope.param, lim]);
    return rows;
}

module.exports = { getByGroup, getByType };
