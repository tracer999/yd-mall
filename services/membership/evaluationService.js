/*
 * 등급 평가 엔진 (설계 §6, §9, §10.3)
 *
 * 인정 실적(performanceService.aggregate) → 정책 기준(membership_grade_criterion) 판정 →
 * 승급/유지/강등 결정 → customer_membership 반영 + 이력.
 *
 * 히스테리시스(설계 §6.5): 진입(entry) 기준으로 올라가고, 유지(retention) 기준으로 버틴다.
 *   - 진입 충족 상위 등급이 현재보다 높으면 → 승급
 *   - 아니고 현재 등급의 유지 기준 충족 → 유지
 *   - 둘 다 아니면 → 유지 기준을 충족하는 최상위 등급으로 강등
 *
 * 모드:
 *   - immediate (결제 시 호출): 승급만 즉시 반영. 강등은 하지 않는다("승급 빠르게, 강등 정기").
 *   - batch (정기 평가): 승급 + (정책이 허용하면) 강등. is_locked 회원 제외.
 */

const pool = require('../../config/db');
const performanceService = require('./performanceService');
const membershipService = require('./membershipService');
const gradeService = require('./gradeService');
const membershipInfo = require('./membershipInfo');

/** 몰의 적용중(ACTIVE) 평가 정책. 여러 개면 최신 버전. */
async function getActivePolicy(mallId) {
    const [[row]] = await pool.query(
        `SELECT * FROM membership_evaluation_policy
          WHERE mall_id = ? AND status = 'ACTIVE'
          ORDER BY version DESC, id DESC LIMIT 1`,
        [mallId]
    );
    return row || null;
}

/** 정책의 등급별 기준을 등급 정보와 조인. rank_order 오름차순(상위 먼저). */
async function getCriteria(policyId) {
    const [rows] = await pool.query(
        `SELECT c.*, g.id AS grade_id, g.grade_code, g.grade_name, g.rank_order,
                g.is_active, g.is_auto_evaluation, g.is_default
           FROM membership_grade_criterion c
           JOIN membership_grade g ON g.id = c.grade_id
          WHERE c.policy_id = ?
          ORDER BY g.rank_order ASC`,
        [policyId]
    );
    return rows;
}

function meets(amount, count, minAmount, minCount, operator) {
    const a = amount >= (Number(minAmount) || 0);
    const c = count >= (Number(minCount) || 0);
    if (operator === 'AND') return a && c;
    if (operator === 'AMOUNT_ONLY') return a;
    return a || c; // OR (기본)
}

/**
 * 실적으로 자격 등급을 판정한다.
 * @returns {{entry:object|null, retention:object|null, floor:object|null}}
 *   entry     = 진입 기준 충족 최상위 등급
 *   retention = 유지 기준 충족 최상위 등급
 *   floor     = 자동평가 대상 중 최하위(기본) 등급
 */
function resolveTargets(criteria, amount, count, operator) {
    const evaluable = criteria.filter((c) => Number(c.is_active) === 1 && Number(c.is_auto_evaluation) === 1);
    let entry = null;
    let retention = null;
    for (const c of evaluable) {
        // rank 오름차순 → 첫 충족이 최상위. 이미 잡혔으면 유지.
        if (!entry && meets(amount, count, c.entry_amount_min, c.entry_order_count_min, operator)) {
            entry = c;
        }
        const rAmt = c.retention_amount_min != null ? c.retention_amount_min : c.entry_amount_min;
        const rCnt = c.retention_order_count_min != null ? c.retention_order_count_min : c.entry_order_count_min;
        if (!retention && meets(amount, count, rAmt, rCnt, operator)) {
            retention = c;
        }
        if (entry && retention) break;
    }
    const floor = evaluable.length ? evaluable[evaluable.length - 1] : null;
    return { entry: entry || floor, retention: retention || floor, floor };
}

/**
 * 한 회원을 평가해 결정을 계산한다(부수효과 없음).
 * @returns {Promise<{decision:'UPGRADE'|'DOWNGRADE'|'MAINTAIN'|'SKIP', ...}>}
 */
async function computeDecision(userId, mallId, policy, criteria, currentGradeId, opts = {}) {
    const months = Number(policy.performance_period_months) || 12;
    const { amount, count } = await performanceService.aggregate(userId, mallId, months);
    const { entry, retention } = resolveTargets(criteria, amount, count, policy.condition_operator);

    const byId = new Map(criteria.map((c) => [Number(c.grade_id), c]));
    const current = currentGradeId != null ? byId.get(Number(currentGradeId)) : null;
    const currentRank = current ? Number(current.rank_order) : Infinity; // 미지정/비대상이면 최하로 취급

    let decision = 'MAINTAIN';
    let target = current || entry;

    if (entry && Number(entry.rank_order) < currentRank) {
        decision = 'UPGRADE';
        target = entry;
    } else if (retention && Number(retention.rank_order) <= currentRank) {
        decision = 'MAINTAIN';
        target = current || retention;
    } else if (retention) {
        decision = 'DOWNGRADE';
        target = retention;
    }

    // immediate 모드는 승급만 반영한다.
    if (opts.immediateOnly && decision !== 'UPGRADE') decision = 'SKIP';
    // 정책이 강등을 안 하면 강등을 유지로 바꾼다.
    if (decision === 'DOWNGRADE' && policy.downgrade_mode === 'NONE') decision = 'MAINTAIN';

    return {
        decision,
        amount,
        count,
        fromGradeId: currentGradeId != null ? Number(currentGradeId) : null,
        toGradeId: target ? Number(target.grade_id) : null,
        toGradeName: target ? target.grade_name : null,
    };
}

/** 다음 평가 예정일(월 주기 기준 다음달 1일). MVP 근사. */
function nextEvaluationAt(policy) {
    if (policy.evaluation_cycle === 'DAILY') return null;
    return null; // 배치가 스케줄을 관장하므로 MVP 는 비워둔다.
}

/**
 * 단일 회원 즉시 평가(주로 결제 확정 후 승급용). is_locked 면 건너뛴다.
 * @returns {Promise<{applied:boolean, decision:string, toGradeId:number|null}>}
 */
async function evaluateCustomer(userId, mallId, { immediateOnly = true, changedBy = 'SYSTEM' } = {}) {
    const policy = await getActivePolicy(mallId);
    if (!policy) return { applied: false, decision: 'SKIP', toGradeId: null };
    const membership = await membershipService.ensureMembership(userId, mallId);
    if (Number(membership.is_locked) === 1) return { applied: false, decision: 'SKIP', toGradeId: membership.current_grade_id };

    const criteria = await getCriteria(policy.id);
    const d = await computeDecision(userId, mallId, policy, criteria, membership.current_grade_id, { immediateOnly });

    if (d.decision === 'SKIP' || d.decision === 'MAINTAIN' || d.toGradeId == null) {
        // 상태 캐시(인정 실적)만 갱신한다.
        await pool.query(
            `UPDATE customer_membership SET recognized_amount = ?, recognized_order_count = ?, last_evaluated_at = NOW()
              WHERE user_id = ? AND mall_id = ?`,
            [d.amount, d.count, userId, mallId]
        );
        return { applied: false, decision: d.decision, toGradeId: membership.current_grade_id };
    }

    await membershipService.setGrade(null, {
        userId, mallId, toGradeId: d.toGradeId,
        changeType: d.decision, reasonCode: 'AUTO_' + d.decision, policyId: policy.id,
        recognizedAmount: d.amount, recognizedOrderCount: d.count, changedBy,
    });
    return { applied: true, decision: d.decision, toGradeId: d.toGradeId };
}

/**
 * 몰 전체 정기 평가 또는 시뮬레이션(설계 §9, §10.3).
 * @param {object} opts { mode:'SCHEDULED'|'MANUAL', simulate:boolean, changedBy:string }
 * @returns {Promise<{runId:number|null, summary:object, changes:Array}>}
 */
async function evaluateMall(mallId, opts = {}) {
    const { mode = 'MANUAL', simulate = false, changedBy = 'SYSTEM' } = opts;
    const policy = await getActivePolicy(mallId);
    if (!policy) return { runId: null, summary: { error: '활성 평가 정책이 없습니다.' }, changes: [] };
    const criteria = await getCriteria(policy.id);

    let runId = null;
    if (!simulate) {
        const [ins] = await pool.query(
            `INSERT INTO membership_evaluation_run (mall_id, policy_id, mode, status) VALUES (?, ?, ?, 'RUNNING')`,
            [mallId, policy.id, mode]
        );
        runId = ins.insertId;
    }

    const [members] = await pool.query(
        'SELECT user_id, current_grade_id, is_locked FROM customer_membership WHERE mall_id = ?',
        [mallId]
    );

    const summary = { target: members.length, upgrade: 0, downgrade: 0, maintain: 0, skipped: 0, failure: 0 };
    const changes = [];
    try {
        for (const m of members) {
            if (Number(m.is_locked) === 1) { summary.skipped++; continue; }
            try {
                const d = await computeDecision(m.user_id, mallId, policy, criteria, m.current_grade_id, { immediateOnly: false });
                if (d.decision === 'UPGRADE') summary.upgrade++;
                else if (d.decision === 'DOWNGRADE') summary.downgrade++;
                else summary.maintain++;

                if (d.decision === 'UPGRADE' || d.decision === 'DOWNGRADE') {
                    changes.push({ userId: m.user_id, ...d });
                    if (!simulate) {
                        await membershipService.setGrade(null, {
                            userId: m.user_id, mallId, toGradeId: d.toGradeId,
                            changeType: d.decision, reasonCode: 'BATCH_' + d.decision, policyId: policy.id,
                            evaluationRunId: runId, recognizedAmount: d.amount, recognizedOrderCount: d.count,
                            changedBy,
                        });
                    }
                } else if (!simulate) {
                    await pool.query(
                        `UPDATE customer_membership SET recognized_amount = ?, recognized_order_count = ?, last_evaluated_at = NOW()
                          WHERE user_id = ? AND mall_id = ?`,
                        [d.amount, d.count, m.user_id, mallId]
                    );
                }
            } catch (e) {
                summary.failure++;
            }
        }
        if (!simulate && runId) {
            await pool.query(
                `UPDATE membership_evaluation_run
                    SET status='SUCCESS', target_count=?, upgrade_count=?, downgrade_count=?, maintain_count=?, failure_count=?, finished_at=NOW()
                  WHERE id = ?`,
                [summary.target, summary.upgrade, summary.downgrade, summary.maintain, summary.failure, runId]
            );
        }
    } catch (e) {
        if (!simulate && runId) {
            await pool.query(
                `UPDATE membership_evaluation_run SET status='FAILED', message=?, finished_at=NOW() WHERE id = ?`,
                [String(e.message).slice(0, 500), runId]
            );
        }
        throw e;
    }
    return { runId, policyId: policy.id, summary, changes };
}

/**
 * 마이페이지 등급 요약 — 현재 등급·혜택·인정 실적·다음 등급까지 남은 금액.
 * @returns {Promise<{membership:object|null, recognizedAmount:number, recognizedCount:number,
 *                    periodMonths:number, nextGrade:object|null, amountToNext:number|null}>}
 */
async function getCustomerSummary(userId, mallId) {
    await membershipService.ensureMembership(userId, mallId);
    const m = await membershipService.getMembershipWithGrade(userId, mallId);
    const policy = await getActivePolicy(mallId);
    const months = policy ? Number(policy.performance_period_months) || 12 : 12;
    const { amount, count } = await performanceService.aggregate(userId, mallId, months);

    let nextGrade = null;
    let amountToNext = null;
    if (policy) {
        const criteria = await getCriteria(policy.id);
        const curRank = m && m.rank_order != null ? Number(m.rank_order) : Infinity;
        const higher = criteria
            .filter((c) => Number(c.is_active) === 1 && Number(c.rank_order) < curRank)
            .sort((a, b) => Number(b.rank_order) - Number(a.rank_order)); // 바로 위 등급 먼저
        if (higher.length) {
            nextGrade = higher[0];
            amountToNext = Math.max(0, Number(nextGrade.entry_amount_min) - amount);
        }
    }
    return { membership: m, recognizedAmount: amount, recognizedCount: count, periodMonths: months, nextGrade, amountToNext };
}

/**
 * 스토어프론트 공개 등급표(/membership, /event). DB 등급을 뷰의 tier 형태로 매핑한다.
 * 활성 등급이 없으면 정적 상수(membershipInfo)로 폴백한다.
 * @returns {Promise<{tiers:Array, benefits:Array}>}
 */
async function getPublicTiers(mallId) {
    const grades = await gradeService.listActiveGrades(mallId);
    if (!grades.length) return { tiers: membershipInfo.TIERS, benefits: membershipInfo.BENEFITS };

    const policy = await getActivePolicy(mallId);
    let critByGrade = new Map();
    if (policy) {
        const cs = await getCriteria(policy.id);
        critByGrade = new Map(cs.map((c) => [Number(c.grade_id), c]));
    }
    const won = (n) => `${Math.round(Number(n) / 10000).toLocaleString()}만원`;
    const ordered = [...grades].sort((a, b) => Number(b.rank_order) - Number(a.rank_order)); // 하위→상위 표시
    const tiers = ordered.map((g) => {
        const c = critByGrade.get(Number(g.id));
        const entry = c ? Number(c.entry_amount_min) : 0;
        const threshold = (Number(g.is_default) === 1 || entry <= 0) ? '가입 시' : `${won(entry)} 이상`;
        const pr = g.point_rate != null ? Number(g.point_rate) : null;
        const rate = pr != null ? (g.point_rate_mode === 'REPLACE' ? `${pr}%` : `+${pr}%`) : '기본';
        const perks = [];
        if (Number(g.discount_rate) > 0) perks.push(`상품 ${Number(g.discount_rate)}% 할인`);
        if (Number(g.free_shipping) === 1) perks.push('상시 무료배송');
        else if (g.free_ship_threshold != null) perks.push(`${won(g.free_ship_threshold)} 이상 무료배송`);
        if (pr != null) perks.push(`구매 적립 ${g.point_rate_mode === 'REPLACE' ? pr : '+' + pr}%`);
        if (!perks.length) perks.push('기본 적립');
        return { code: g.grade_code, name: g.grade_name, threshold, rate, perks, accent: g.grade_code === 'GOLD' };
    });
    return { tiers, benefits: membershipInfo.BENEFITS };
}

/**
 * 강등 예정자 식별 (설계 §14, 2차). 다음 정기 평가에서 강등될 회원 목록.
 * is_locked 회원과 정책이 강등을 안 하는 경우는 제외한다.
 * @returns {Promise<{policy:object|null, candidates:Array}>}
 */
async function getDowngradeCandidates(mallId) {
    const policy = await getActivePolicy(mallId);
    if (!policy || policy.downgrade_mode === 'NONE') return { policy: policy || null, candidates: [] };
    const criteria = await getCriteria(policy.id);
    const gradeName = new Map(criteria.map((c) => [Number(c.grade_id), c.grade_name]));
    const [members] = await pool.query(
        `SELECT cm.user_id, cm.current_grade_id, cm.is_locked, u.email, u.name AS user_name
           FROM customer_membership cm JOIN users u ON u.id = cm.user_id
          WHERE cm.mall_id = ?`,
        [mallId]
    );
    const candidates = [];
    for (const m of members) {
        if (Number(m.is_locked) === 1) continue;
        const d = await computeDecision(m.user_id, mallId, policy, criteria, m.current_grade_id, { immediateOnly: false });
        if (d.decision === 'DOWNGRADE') {
            candidates.push({
                userId: m.user_id, email: m.email, userName: m.user_name,
                fromGradeId: d.fromGradeId, fromGradeName: gradeName.get(Number(d.fromGradeId)) || null,
                toGradeId: d.toGradeId, toGradeName: d.toGradeName,
                amount: d.amount, count: d.count,
            });
        }
    }
    return { policy, candidates };
}

module.exports = {
    getActivePolicy,
    getCriteria,
    resolveTargets,
    computeDecision,
    evaluateCustomer,
    evaluateMall,
    nextEvaluationAt,
    getCustomerSummary,
    getPublicTiers,
    getDowngradeCandidates,
};
