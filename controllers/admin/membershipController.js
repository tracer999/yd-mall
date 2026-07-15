/*
 * 멤버십 관리 (관리자) — 설계 §3~§10
 *
 * 화면: 대시보드 · 등급 관리 · 평가 정책 · 회원 등급 현황 · 변경/실행 이력.
 * 몰 스코프: 모든 조회·변경에 req.adminMallId 를 건다(편집 몰).
 */

const pool = require('../../config/db');
const gradeService = require('../../services/membership/gradeService');
const membershipService = require('../../services/membership/membershipService');
const evaluationService = require('../../services/membership/evaluationService');
const gradeCouponService = require('../../services/membership/gradeCouponService');

const LAYOUT = 'layouts/admin_layout';
function actor(req) {
    return (req.session && req.session.admin && (req.session.admin.username || req.session.admin.id)) || 'ADMIN';
}

/* ── 대시보드 ─────────────────────────────────────────── */
exports.getDashboard = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        const grades = await gradeService.listGrades(mallId);
        const policy = await evaluationService.getActivePolicy(mallId);
        const [[totals]] = await pool.query(
            `SELECT COUNT(*) AS members,
                    COALESCE(SUM(is_locked),0) AS locked
               FROM customer_membership WHERE mall_id = ?`,
            [mallId]
        );
        const [[lastRun]] = await pool.query(
            'SELECT * FROM membership_evaluation_run WHERE mall_id = ? ORDER BY id DESC LIMIT 1',
            [mallId]
        );
        const totalMembers = Number(totals.members) || 0;

        // 등급별 최근 30일 실적·혜택 비용 (설계 §4.1). 주문 스냅샷 기준.
        const [analytics] = await pool.query(
            `SELECT s.grade_id,
                    COUNT(*) AS order_count,
                    COALESCE(SUM(o.total_amount), 0) AS revenue,
                    COALESCE(SUM(s.grade_discount_amount), 0) AS discount_cost,
                    COALESCE(SUM(s.grade_point_expected), 0) AS point_cost
               FROM order_membership_benefit_snapshot s
               JOIN orders o ON o.id = s.order_id
              WHERE o.mall_id = ? AND o.status = 'PAID'
                AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
              GROUP BY s.grade_id`,
            [mallId]
        );
        const analyticsByGrade = {};
        let hasAnalytics = false;
        for (const a of analytics) {
            const orders = Number(a.order_count) || 0;
            analyticsByGrade[a.grade_id] = {
                orders,
                revenue: Number(a.revenue) || 0,
                aov: orders > 0 ? Math.round((Number(a.revenue) || 0) / orders) : 0,
                discountCost: Number(a.discount_cost) || 0,
                pointCost: Number(a.point_cost) || 0,
            };
            if (orders > 0) hasAnalytics = true;
        }

        res.render('admin/membership/dashboard', {
            layout: LAYOUT,
            title: '멤버십 대시보드',
            subtitle: '등급 구성·평가 현황을 요약합니다.',
            grades, policy, totals, totalMembers, lastRun: lastRun || null,
            analyticsByGrade, hasAnalytics,
            success: req.query.success, error: req.query.error,
        });
    } catch (e) { next(e); }
};

/* ── 등급 관리 ─────────────────────────────────────────── */
exports.getGrades = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        const grades = await gradeService.listGrades(mallId);
        res.render('admin/membership/grades', {
            layout: LAYOUT, title: '등급 관리',
            subtitle: '멤버십 등급과 등급별 혜택(정률할인·추가적립·무료배송)을 관리합니다.',
            grades, success: req.query.success, error: req.query.error,
        });
    } catch (e) { next(e); }
};

exports.getGradeForm = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        let grade = null;
        if (req.params.id) {
            grade = await gradeService.getGrade(req.params.id);
            if (!grade || Number(grade.mall_id) !== Number(mallId)) {
                return res.redirect('/admin/membership/grades?error=' + encodeURIComponent('등급을 찾을 수 없습니다.'));
            }
        }
        const mallCoupons = await gradeCouponService.listLinkableCoupons(mallId);
        const linkedCouponIds = grade ? await gradeCouponService.getLinkedCouponIds(grade.id) : [];
        res.render('admin/membership/grade_form', {
            layout: LAYOUT,
            title: grade ? '등급 수정' : '등급 등록',
            grade, mallCoupons, linkedCouponIds, error: req.query.error,
        });
    } catch (e) { next(e); }
};

exports.postGradeSave = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        if (!req.body.grade_name || !String(req.body.grade_name).trim()) {
            const back = id ? `/admin/membership/grades/${id}/edit` : '/admin/membership/grades/new';
            return res.redirect(back + '?error=' + encodeURIComponent('등급명을 입력하세요.'));
        }
        let gradeId = id;
        if (id) {
            await gradeService.updateGrade(id, req.body);
        } else {
            if (!req.body.grade_code || !String(req.body.grade_code).trim()) {
                return res.redirect('/admin/membership/grades/new?error=' + encodeURIComponent('등급 코드를 입력하세요.'));
            }
            gradeId = await gradeService.createGrade(mallId, req.body);
        }
        // 등급 진입 쿠폰(쿠폰팩) 연결 저장. 체크박스 미선택 시 빈 배열 → 전체 해제.
        const couponIds = req.body.entry_coupon_ids
            ? (Array.isArray(req.body.entry_coupon_ids) ? req.body.entry_coupon_ids : [req.body.entry_coupon_ids])
            : [];
        await gradeCouponService.setGradeCoupons(gradeId, couponIds);
        res.redirect('/admin/membership/grades?success=' + encodeURIComponent('저장되었습니다.'));
    } catch (e) {
        const back = id ? `/admin/membership/grades/${id}/edit` : '/admin/membership/grades/new';
        const msg = e.code === 'ER_DUP_ENTRY' ? '이미 존재하는 등급 코드입니다.' : '저장 중 오류가 발생했습니다.';
        res.redirect(back + '?error=' + encodeURIComponent(msg));
    }
};

exports.postGradeDelete = async (req, res) => {
    try {
        const result = await gradeService.deleteGrade(req.params.id);
        if (!result.ok) {
            return res.redirect('/admin/membership/grades?error=' + encodeURIComponent(result.reason));
        }
        res.redirect('/admin/membership/grades?success=' + encodeURIComponent('삭제되었습니다.'));
    } catch (e) {
        res.redirect('/admin/membership/grades?error=' + encodeURIComponent('삭제 중 오류가 발생했습니다.'));
    }
};

/* ── 평가 정책 ─────────────────────────────────────────── */
exports.getPolicy = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        const policy = await evaluationService.getActivePolicy(mallId);
        const grades = await gradeService.listActiveGrades(mallId);
        let criteria = [];
        if (policy) criteria = await evaluationService.getCriteria(policy.id);
        const criteriaByGrade = new Map(criteria.map((c) => [Number(c.grade_id), c]));

        const simResult = req.session.membershipSimResult || null;
        if (req.session.membershipSimResult) { delete req.session.membershipSimResult; req.session.save(() => {}); }

        res.render('admin/membership/policy', {
            layout: LAYOUT, title: '등급 평가 정책',
            subtitle: '실적 기준·기간·주기와 등급별 진입/유지 기준을 관리합니다.',
            policy, grades, criteriaByGrade, simResult,
            success: req.query.success, error: req.query.error,
        });
    } catch (e) { next(e); }
};

exports.postPolicySave = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const b = req.body;
    try {
        let policy = await evaluationService.getActivePolicy(mallId);
        if (!policy) {
            const [ins] = await pool.query(
                `INSERT INTO membership_evaluation_policy (mall_id, policy_name, version, status, effective_from)
                 VALUES (?, ?, 1, 'ACTIVE', CURDATE())`,
                [mallId, b.policy_name || '기본 등급 평가 정책']
            );
            policy = { id: ins.insertId };
        }
        await pool.query(
            `UPDATE membership_evaluation_policy
                SET policy_name = ?, performance_period_months = ?, evaluation_cycle = ?, amount_basis = ?,
                    condition_operator = ?, upgrade_mode = ?, downgrade_mode = ?,
                    new_member_protect_days = ?, min_holding_days = ?
              WHERE id = ?`,
            [
                b.policy_name || '기본 등급 평가 정책',
                Number(b.performance_period_months) || 12,
                ['MONTHLY', 'DAILY', 'MANUAL'].includes(b.evaluation_cycle) ? b.evaluation_cycle : 'MONTHLY',
                ['A_GROSS', 'B_NET', 'C_PAID', 'D_NET_PLUS_SHIP'].includes(b.amount_basis) ? b.amount_basis : 'B_NET',
                ['AMOUNT_ONLY', 'AND', 'OR'].includes(b.condition_operator) ? b.condition_operator : 'OR',
                ['IMMEDIATE', 'SCHEDULED'].includes(b.upgrade_mode) ? b.upgrade_mode : 'SCHEDULED',
                ['SCHEDULED', 'IMMEDIATE', 'NONE'].includes(b.downgrade_mode) ? b.downgrade_mode : 'SCHEDULED',
                Number(b.new_member_protect_days) || 0,
                Number(b.min_holding_days) || 0,
                policy.id,
            ]
        );
        // 등급별 기준 upsert. 폼은 criteria[gradeId][entry_amount] 형태로 보낸다.
        const criteria = b.criteria || {};
        for (const gradeId of Object.keys(criteria)) {
            const c = criteria[gradeId];
            await pool.query(
                `INSERT INTO membership_grade_criterion
                    (policy_id, grade_id, entry_amount_min, entry_order_count_min, retention_amount_min, retention_order_count_min)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    entry_amount_min = VALUES(entry_amount_min),
                    entry_order_count_min = VALUES(entry_order_count_min),
                    retention_amount_min = VALUES(retention_amount_min),
                    retention_order_count_min = VALUES(retention_order_count_min)`,
                [
                    policy.id, gradeId,
                    Number(String(c.entry_amount || '').replace(/[^0-9]/g, '')) || 0,
                    Number(c.entry_count) || 0,
                    c.retention_amount != null && c.retention_amount !== '' ? Number(String(c.retention_amount).replace(/[^0-9]/g, '')) : null,
                    c.retention_count != null && c.retention_count !== '' ? Number(c.retention_count) : null,
                ]
            );
        }
        res.redirect('/admin/membership/policy?success=' + encodeURIComponent('정책이 저장되었습니다.'));
    } catch (e) {
        console.error('[membership] policy save', e);
        res.redirect('/admin/membership/policy?error=' + encodeURIComponent('저장 중 오류가 발생했습니다.'));
    }
};

exports.postSimulate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const result = await evaluationService.evaluateMall(mallId, { simulate: true });
        // 등급명 매핑
        const grades = await gradeService.listGrades(mallId);
        const nameById = new Map(grades.map((g) => [Number(g.id), g.grade_name]));
        req.session.membershipSimResult = {
            summary: result.summary,
            changes: (result.changes || []).slice(0, 100).map((c) => ({
                userId: c.userId, decision: c.decision,
                from: nameById.get(Number(c.fromGradeId)) || '-',
                to: c.toGradeName || nameById.get(Number(c.toGradeId)) || '-',
                amount: c.amount, count: c.count,
            })),
        };
        req.session.save(() => res.redirect('/admin/membership/policy?success=' + encodeURIComponent('시뮬레이션이 완료되었습니다.')));
    } catch (e) {
        console.error('[membership] simulate', e);
        res.redirect('/admin/membership/policy?error=' + encodeURIComponent('시뮬레이션 실패: ' + e.message));
    }
};

exports.postEvaluate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const result = await evaluationService.evaluateMall(mallId, { mode: 'MANUAL', changedBy: actor(req) });
        const s = result.summary;
        const msg = `평가 완료 — 대상 ${s.target}, 승급 ${s.upgrade}, 강등 ${s.downgrade}, 유지 ${s.maintain}`;
        res.redirect('/admin/membership/policy?success=' + encodeURIComponent(msg));
    } catch (e) {
        console.error('[membership] evaluate', e);
        res.redirect('/admin/membership/policy?error=' + encodeURIComponent('평가 실행 실패: ' + e.message));
    }
};

/* ── 회원 등급 현황 ────────────────────────────────────── */
exports.getCustomers = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        const { q, grade_id, locked } = req.query;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = 30;
        const offset = (page - 1) * limit;

        let where = 'WHERE cm.mall_id = ?';
        const params = [mallId];
        if (q && String(q).trim()) {
            where += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
            const like = `%${String(q).trim()}%`;
            params.push(like, like, like);
        }
        if (grade_id) { where += ' AND cm.current_grade_id = ?'; params.push(grade_id); }
        if (locked === '1') where += ' AND cm.is_locked = 1';

        const [[cnt]] = await pool.query(
            `SELECT COUNT(*) AS c FROM customer_membership cm JOIN users u ON u.id = cm.user_id ${where}`, params
        );
        const [rows] = await pool.query(
            `SELECT cm.*, u.email, u.name AS user_name, u.phone,
                    g.grade_name, g.grade_code, g.color
               FROM customer_membership cm
               JOIN users u ON u.id = cm.user_id
               LEFT JOIN membership_grade g ON g.id = cm.current_grade_id
               ${where}
               ORDER BY cm.recognized_amount DESC, cm.updated_at DESC
               LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const grades = await gradeService.listGrades(mallId);
        res.render('admin/membership/customers', {
            layout: LAYOUT, title: '회원 등급 현황',
            subtitle: '회원별 등급·인정 실적을 조회하고 수동 조정합니다.',
            rows, grades, total: Number(cnt.c) || 0, page, limit,
            filters: { q: q || '', grade_id: grade_id || '', locked: locked || '' },
            success: req.query.success, error: req.query.error,
        });
    } catch (e) { next(e); }
};

exports.postChangeGrade = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { user_id, to_grade_id, reason_text } = req.body;
    try {
        if (!user_id || !to_grade_id) {
            return res.redirect('/admin/membership/customers?error=' + encodeURIComponent('회원과 등급을 선택하세요.'));
        }
        await membershipService.ensureMembership(user_id, mallId);
        await membershipService.setGrade(null, {
            userId: user_id, mallId, toGradeId: to_grade_id,
            changeType: 'MANUAL', reasonCode: 'ADMIN_MANUAL', reasonText: reason_text || null,
            changedBy: actor(req), forceHistory: true,
        });
        res.redirect('/admin/membership/customers?success=' + encodeURIComponent('등급을 변경했습니다.'));
    } catch (e) {
        res.redirect('/admin/membership/customers?error=' + encodeURIComponent('변경 중 오류가 발생했습니다.'));
    }
};

exports.postLock = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { user_id, lock, reason } = req.body;
    try {
        await membershipService.setLock(user_id, mallId, String(lock) === '1', {
            reason: reason || null, changedBy: actor(req),
        });
        res.redirect('/admin/membership/customers?success=' + encodeURIComponent(String(lock) === '1' ? '등급을 고정했습니다.' : '고정을 해제했습니다.'));
    } catch (e) {
        res.redirect('/admin/membership/customers?error=' + encodeURIComponent('처리 중 오류가 발생했습니다.'));
    }
};

/* ── 이력 (등급 변경 + 평가 실행) ──────────────────────── */
exports.getHistory = async (req, res, next) => {
    try {
        const mallId = req.adminMallId || 1;
        const [history] = await pool.query(
            `SELECT h.*, u.email, u.name AS user_name,
                    fg.grade_name AS from_name, tg.grade_name AS to_name
               FROM membership_grade_history h
               JOIN users u ON u.id = h.user_id
               LEFT JOIN membership_grade fg ON fg.id = h.from_grade_id
               LEFT JOIN membership_grade tg ON tg.id = h.to_grade_id
              WHERE h.mall_id = ?
              ORDER BY h.id DESC LIMIT 200`,
            [mallId]
        );
        const [runs] = await pool.query(
            'SELECT * FROM membership_evaluation_run WHERE mall_id = ? ORDER BY id DESC LIMIT 50',
            [mallId]
        );
        res.render('admin/membership/history', {
            layout: LAYOUT, title: '등급 변경·평가 이력',
            subtitle: '등급 변경 내역과 정기 평가 실행 결과를 확인합니다.',
            history, runs,
        });
    } catch (e) { next(e); }
};
