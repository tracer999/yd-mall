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

/**
 * 배너 그룹으로 조회한다.
 * @param {string} groupKey banners.group_key
 * @param {{ limit?: number }} opts
 * @returns {Promise<Array>} 활성/기간 내 배너 목록 (display_order 순)
 */
async function getByGroup(groupKey, { limit = 12 } = {}) {
    if (!groupKey) return [];
    const lim = Math.min(Math.max(Number(limit) || 12, 1), 50);

    const [rows] = await pool.query(`
        SELECT id, title, image_url, mobile_image_url, link_url, display_order
        FROM banners
        WHERE group_key = ? AND is_active = 1
        ${PERIOD_CLAUSE}
        ORDER BY display_order ASC, id ASC
        LIMIT ?
    `, [groupKey, lim]);
    return rows;
}

/**
 * 배너 타입(MAIN/CATEGORY/POPUP/BRAND)으로 조회한다.
 * @param {string} bannerType
 */
async function getByType(bannerType, { limit = 12 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 12, 1), 50);
    const [rows] = await pool.query(`
        SELECT id, title, image_url, mobile_image_url, link_url, display_order
        FROM banners
        WHERE banner_type = ? AND is_active = 1
        ${PERIOD_CLAUSE}
        ORDER BY display_order ASC, id ASC
        LIMIT ?
    `, [bannerType, lim]);
    return rows;
}

module.exports = { getByGroup, getByType };
