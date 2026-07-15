/*
 * 멤버십 등급 CRUD + 혜택 조회 (설계 §5, §7)
 *
 * 등급 정의(membership_grade)와 등급 혜택(membership_grade_benefit, 등급당 1행)을 함께 다룬다.
 * 몰별 스코프 — 모든 조회에 mall_id 를 건다(설계 부록 A.7).
 */

const pool = require('../../config/db');

/** 등급 + 혜택 조인. rank_order 오름차순(1이 최상위). */
async function listGrades(mallId) {
    const [rows] = await pool.query(
        `SELECT g.*, b.discount_rate, b.max_discount_amount, b.min_order_amount,
                b.point_rate, b.point_rate_mode, b.free_shipping, b.free_ship_threshold,
                b.discount_enabled, b.point_enabled, b.shipping_enabled,
                (SELECT COUNT(*) FROM customer_membership cm WHERE cm.current_grade_id = g.id) AS member_count
           FROM membership_grade g
           LEFT JOIN membership_grade_benefit b ON b.grade_id = g.id
          WHERE g.mall_id = ?
          ORDER BY g.rank_order ASC, g.id ASC`,
        [mallId]
    );
    return rows;
}

/** 활성 등급만(스토어프론트·평가용). */
async function listActiveGrades(mallId) {
    const rows = await listGrades(mallId);
    return rows.filter((g) => Number(g.is_active) === 1);
}

async function getGrade(id) {
    const [[row]] = await pool.query(
        `SELECT g.*, b.discount_rate, b.max_discount_amount, b.min_order_amount,
                b.point_rate, b.point_rate_mode, b.free_shipping, b.free_ship_threshold,
                b.discount_enabled, b.point_enabled, b.shipping_enabled
           FROM membership_grade g
           LEFT JOIN membership_grade_benefit b ON b.grade_id = g.id
          WHERE g.id = ?`,
        [id]
    );
    return row || null;
}

/** 몰의 기본 가입 등급. 없으면 최하위(rank 큰 값) 활성 등급으로 폴백. */
async function getDefaultGrade(mallId) {
    const [[row]] = await pool.query(
        'SELECT * FROM membership_grade WHERE mall_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1',
        [mallId]
    );
    if (row) return row;
    const [[fallback]] = await pool.query(
        'SELECT * FROM membership_grade WHERE mall_id = ? AND is_active = 1 ORDER BY rank_order DESC LIMIT 1',
        [mallId]
    );
    return fallback || null;
}

/** 등급 생성 + 혜택 1행. 트랜잭션. */
async function createGrade(mallId, data) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        if (Number(data.is_default) === 1) {
            await conn.query('UPDATE membership_grade SET is_default = 0 WHERE mall_id = ?', [mallId]);
        }
        const [res] = await conn.query(
            `INSERT INTO membership_grade
                (mall_id, grade_code, grade_name, rank_order, is_default, is_active, is_auto_evaluation, color, badge_icon, description, mypage_note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                mallId, data.grade_code, data.grade_name, Number(data.rank_order) || 100,
                Number(data.is_default) === 1 ? 1 : 0,
                Number(data.is_active) === 0 ? 0 : 1,
                Number(data.is_auto_evaluation) === 0 ? 0 : 1,
                data.color || null, data.badge_icon || null, data.description || null, data.mypage_note || null,
            ]
        );
        const gradeId = res.insertId;
        await upsertBenefitConn(conn, gradeId, data);
        await conn.commit();
        return gradeId;
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

async function updateGrade(id, data) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[cur]] = await conn.query('SELECT mall_id FROM membership_grade WHERE id = ?', [id]);
        if (!cur) throw new Error('등급을 찾을 수 없습니다.');
        if (Number(data.is_default) === 1) {
            await conn.query('UPDATE membership_grade SET is_default = 0 WHERE mall_id = ? AND id <> ?', [cur.mall_id, id]);
        }
        await conn.query(
            `UPDATE membership_grade
                SET grade_name = ?, rank_order = ?, is_default = ?, is_active = ?, is_auto_evaluation = ?,
                    color = ?, badge_icon = ?, description = ?, mypage_note = ?
              WHERE id = ?`,
            [
                data.grade_name, Number(data.rank_order) || 100,
                Number(data.is_default) === 1 ? 1 : 0,
                Number(data.is_active) === 0 ? 0 : 1,
                Number(data.is_auto_evaluation) === 0 ? 0 : 1,
                data.color || null, data.badge_icon || null, data.description || null, data.mypage_note || null,
                id,
            ]
        );
        await upsertBenefitConn(conn, id, data);
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

async function upsertBenefitConn(conn, gradeId, data) {
    const pointRate = data.point_rate === '' || data.point_rate == null ? null : Number(data.point_rate);
    const freeThreshold = data.free_ship_threshold === '' || data.free_ship_threshold == null ? null : Number(data.free_ship_threshold);
    const maxDiscount = data.max_discount_amount === '' || data.max_discount_amount == null ? null : Number(data.max_discount_amount);
    await conn.query(
        `INSERT INTO membership_grade_benefit
            (grade_id, discount_enabled, point_enabled, shipping_enabled,
             discount_rate, max_discount_amount, min_order_amount, point_rate, point_rate_mode, free_shipping, free_ship_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            discount_enabled = VALUES(discount_enabled), point_enabled = VALUES(point_enabled),
            shipping_enabled = VALUES(shipping_enabled),
            discount_rate = VALUES(discount_rate), max_discount_amount = VALUES(max_discount_amount),
            min_order_amount = VALUES(min_order_amount), point_rate = VALUES(point_rate),
            point_rate_mode = VALUES(point_rate_mode), free_shipping = VALUES(free_shipping),
            free_ship_threshold = VALUES(free_ship_threshold)`,
        [
            gradeId,
            Number(data.discount_enabled) === 1 ? 1 : 0,
            Number(data.point_enabled) === 1 ? 1 : 0,
            Number(data.shipping_enabled) === 1 ? 1 : 0,
            Number(data.discount_rate) || 0,
            maxDiscount,
            Number(data.min_order_amount) || 0,
            pointRate,
            data.point_rate_mode === 'REPLACE' ? 'REPLACE' : 'ADD',
            Number(data.free_shipping) === 1 ? 1 : 0,
            freeThreshold,
        ]
    );
}

/**
 * 삭제 정책(설계 §5.3): 회원이 소속됐거나 이력·기준에 참조되면 물리삭제 금지.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function deleteGrade(id) {
    const [[cnt]] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM customer_membership WHERE current_grade_id = ?) AS members,
            (SELECT COUNT(*) FROM membership_grade_criterion WHERE grade_id = ?) AS criteria,
            (SELECT COUNT(*) FROM membership_grade_history WHERE to_grade_id = ? OR from_grade_id = ?) AS history`,
        [id, id, id, id]
    );
    if (Number(cnt.members) > 0) return { ok: false, reason: '소속 회원이 있어 삭제할 수 없습니다. 비활성화하세요.' };
    if (Number(cnt.criteria) > 0) return { ok: false, reason: '평가 기준에 참조되어 삭제할 수 없습니다.' };
    if (Number(cnt.history) > 0) return { ok: false, reason: '변경 이력이 있어 삭제할 수 없습니다. 비활성화하세요.' };
    await pool.query('DELETE FROM membership_grade WHERE id = ?', [id]);
    return { ok: true };
}

module.exports = {
    listGrades,
    listActiveGrades,
    getGrade,
    getDefaultGrade,
    createGrade,
    updateGrade,
    deleteGrade,
};
