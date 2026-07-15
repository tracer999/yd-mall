/*
 * 몰별 멤버십 운영 설정 (설계 §7.3) — 등급 할인 × 쿠폰 중복 모드
 *   STACK           등급 할인 + 쿠폰 중복 적용 (기본)
 *   COUPON_PRIORITY 쿠폰 사용 시 등급 할인 미적용 (쿠폰 우선)
 */

const pool = require('../../config/db');
const MODES = ['STACK', 'COUPON_PRIORITY'];

async function getStackingMode(mallId) {
    const [[row]] = await pool.query('SELECT discount_stacking_mode FROM membership_config WHERE mall_id = ?', [mallId]);
    return row && MODES.includes(row.discount_stacking_mode) ? row.discount_stacking_mode : 'STACK';
}

async function setStackingMode(mallId, mode) {
    const m = MODES.includes(mode) ? mode : 'STACK';
    await pool.query(
        `INSERT INTO membership_config (mall_id, discount_stacking_mode) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE discount_stacking_mode = VALUES(discount_stacking_mode)`,
        [mallId, m]
    );
}

module.exports = { MODES, getStackingMode, setStackingMode };
