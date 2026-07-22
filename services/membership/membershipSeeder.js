/*
 * 멤버십 기본 리소스 시더 (몰 빌더)
 *
 * 몰을 새로 찍어내면 membership_grade 가 0건이라 관리자 [멤버십 > 등급관리]는 텅 비고,
 * 스토어프론트 /membership 은 **정적 폴백 표**(membershipInfo.TIERS)를 렌더했다.
 * → 운영자가 등록한 적도 없고 실제로 적용되지도 않는 혜택이 고객에게 광고됐다.
 *
 * 그래서 내비·테마·홈 섹션과 같은 층위의 **기본 리소스**로 등급을 심는다.
 * 정의는 membershipDefaults 한 곳에 있다(폴백 표도 같은 정의에서 만든다 — 어긋날 수 없다).
 *
 * 멱등 규칙 — 운영자가 손댄 것을 되살리지 않는다:
 *   등급   : 이 몰에 등급이 **하나라도** 있으면 통째로 건너뛴다.
 *            (하나씩 INSERT IGNORE 하면 운영자가 지운 등급이 재적용 때마다 부활한다)
 *   정책   : ACTIVE 정책이 없을 때만 만든다.
 *   기준   : 그 정책에 아직 없는 (정책, 등급) 조합만 채운다.
 *
 * customer_membership(회원별 등급 상태)은 심지 않는다 —
 * membershipService.ensureMembership 이 첫 조회 때 기본 등급으로 지연 생성한다.
 */

const pool = require('../../config/db');
const { DEFAULT_GRADES, DEFAULT_POLICY } = require('./membershipDefaults');

/** 이미 있는 등급 코드 → id */
async function loadGradeIds(conn, mallId) {
    const [rows] = await conn.query(
        'SELECT id, grade_code FROM membership_grade WHERE mall_id = ?', [mallId]);
    return new Map(rows.map((r) => [r.grade_code, r.id]));
}

/** 등급 + 혜택 1행씩. 이 몰에 등급이 하나도 없을 때만 호출된다. */
async function insertGrades(conn, mallId) {
    for (const g of DEFAULT_GRADES) {
        const [res] = await conn.query(
            `INSERT INTO membership_grade
                (mall_id, grade_code, grade_name, rank_order, is_default, is_active, is_auto_evaluation,
                 color, description, mypage_note)
             VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`,
            [mallId, g.grade_code, g.grade_name, g.rank_order, g.is_default,
             g.color, g.description, g.mypage_note]);

        const b = g.benefit;
        await conn.query(
            `INSERT INTO membership_grade_benefit
                (grade_id, discount_enabled, point_enabled, shipping_enabled,
                 discount_rate, max_discount_amount, min_order_amount,
                 point_rate, point_rate_mode, free_shipping, free_ship_threshold)
             VALUES (?, 1, 1, 1, ?, ?, ?, ?, ?, ?, ?)`,
            [res.insertId, b.discount_rate, b.max_discount_amount, b.min_order_amount,
             b.point_rate, b.point_rate_mode, b.free_shipping, b.free_ship_threshold]);
    }
    return DEFAULT_GRADES.length;
}

/** ACTIVE 평가 정책. 있으면 그 id 를 돌려준다. */
async function ensurePolicy(conn, mallId) {
    const [[existing]] = await conn.query(
        `SELECT id FROM membership_evaluation_policy
          WHERE mall_id = ? AND status = 'ACTIVE' ORDER BY version DESC, id DESC LIMIT 1`,
        [mallId]);
    if (existing) return { policyId: existing.id, created: false };

    const p = DEFAULT_POLICY;
    const [res] = await conn.query(
        `INSERT INTO membership_evaluation_policy
            (mall_id, policy_name, version, status, performance_period_months, evaluation_cycle,
             amount_basis, condition_operator, upgrade_mode, downgrade_mode,
             new_member_protect_days, min_holding_days, effective_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
        [mallId, p.policy_name, p.version, p.status, p.performance_period_months, p.evaluation_cycle,
         p.amount_basis, p.condition_operator, p.upgrade_mode, p.downgrade_mode,
         p.new_member_protect_days, p.min_holding_days]);
    return { policyId: res.insertId, created: true };
}

/**
 * 등급별 진입·유지 기준. 기준이 없으면 getPublicTiers 가 모든 등급을 '가입 시'로 표시하고
 * 평가 엔진도 승급시킬 근거가 없다 — 등급만 심고 기준을 빼면 반쪽짜리다.
 */
async function ensureCriteria(conn, policyId, gradeIdByCode) {
    let inserted = 0;
    for (const g of DEFAULT_GRADES) {
        const gradeId = gradeIdByCode.get(g.grade_code);
        if (!gradeId) continue; // 운영자가 지운 기본 등급 — 되살리지 않는다
        const c = g.criterion;
        const [res] = await conn.query(
            `INSERT IGNORE INTO membership_grade_criterion
                (policy_id, grade_id, entry_amount_min, entry_order_count_min,
                 retention_amount_min, retention_order_count_min)
             VALUES (?, ?, ?, ?, ?, NULL)`,
            [policyId, gradeId, c.entry_amount_min, c.entry_order_count_min, c.retention_amount_min]);
        inserted += res.affectedRows ? 1 : 0;
    }
    return inserted;
}

/**
 * 몰에 기본 멤버십 등급 세트를 심는다(멱등).
 *
 * @param {number} mallId
 * @param {import('mysql2/promise').PoolConnection} [conn] 호출자의 트랜잭션에 참여시킬 커넥션.
 *        생략하면 자체 트랜잭션을 연다(관리자 [기본 등급 불러오기] 버튼용).
 * @returns {Promise<{grades:number, policyCreated:boolean, criteria:number}>}
 */
async function seedMallMembership(mallId, conn) {
    const id = Number(mallId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('seedMallMembership: 잘못된 mallId');

    if (conn) return runSeed(conn, id);

    // 등급 → 정책 → 기준은 한 덩어리다. 중간에 실패하면 기준 없는 등급이 남는다.
    const own = await pool.getConnection();
    try {
        await own.beginTransaction();
        const result = await runSeed(own, id);
        await own.commit();
        return result;
    } catch (err) {
        await own.rollback();
        throw err;
    } finally {
        own.release();
    }
}

async function runSeed(db, id) {
    let gradeIdByCode = await loadGradeIds(db, id);
    let grades = 0;
    if (gradeIdByCode.size === 0) {
        grades = await insertGrades(db, id);
        gradeIdByCode = await loadGradeIds(db, id);
    }

    const { policyId, created } = await ensurePolicy(db, id);
    const criteria = await ensureCriteria(db, policyId, gradeIdByCode);

    return { grades, policyCreated: created, criteria };
}

module.exports = { seedMallMembership };
