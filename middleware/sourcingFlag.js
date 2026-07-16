/*
 * 외부몰 연동 — 몰별 사용여부(유료) 게이팅.
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §2, §5.1, §21
 *
 * - injectSourcingFlag: 관리자 전체에 마운트. req.adminMallId 의 사용여부를 res.locals 에 주입하고,
 *   꺼진 몰에서는 '외부몰 연동' 대메뉴를 사이드바(adminMenuTree/adminMenus)에서 숨긴다.
 * - requireSourcingEnabled: 연동 서브라우트 가드. 꺼진 몰의 기능 접근을 차단한다.
 *
 * super_admin(=몰 빌더 제공자)은 설정·활성화를 위해 항상 통과/노출한다.
 * 반드시 adminMallContext(req.adminMallId) 이후, adminMenu(res.locals.adminMenuTree) 이후에 마운트.
 */

const pool = require('../config/db');

const SOURCING_PREFIX = '/admin/sourcing';

async function isEnabled(mallId) {
    try {
        const [rows] = await pool.query(
            'SELECT sourcing_enabled FROM mall_channel_setting WHERE mall_id = ? LIMIT 1',
            [mallId]
        );
        return rows.length ? !!rows[0].sourcing_enabled : false;
    } catch (e) {
        // 테이블 미생성 등 — 안전하게 비활성 처리(마이그레이션 전에도 관리자 정상 동작)
        return false;
    }
}

function stripSourcing(arr) {
    return (arr || []).filter((m) => !(m.path && String(m.path).startsWith(SOURCING_PREFIX)));
}

async function injectSourcingFlag(req, res, next) {
    try {
        const role = req.session && req.session.admin ? req.session.admin.role : null;
        const enabled = await isEnabled(req.adminMallId || 1);
        req.sourcingEnabled = enabled;
        res.locals.sourcingEnabled = enabled;

        const isProvider = role === 'super_admin';
        if (!enabled && !isProvider) {
            if (Array.isArray(res.locals.adminMenus)) {
                res.locals.adminMenus = stripSourcing(res.locals.adminMenus);
            }
            if (Array.isArray(res.locals.adminMenuTree)) {
                res.locals.adminMenuTree = res.locals.adminMenuTree.filter((node) => {
                    if (!node.isGroup) return true;
                    node.children = stripSourcing(node.children);
                    return node.children.length > 0;
                });
            }
        }
    } catch (err) {
        console.error('[sourcingFlag] inject 실패:', err.message);
        req.sourcingEnabled = false;
        res.locals.sourcingEnabled = false;
    }
    next();
}

function requireSourcingEnabled(req, res, next) {
    const role = req.session && req.session.admin ? req.session.admin.role : null;
    if (req.sourcingEnabled || role === 'super_admin') return next();
    return res.status(403).render('admin/sourcing/disabled', {
        layout: 'layouts/admin_layout',
        title: '외부몰 연동',
        subtitle: '이 몰은 외부몰 연동 기능이 활성화되어 있지 않습니다.',
    });
}

module.exports = { injectSourcingFlag, requireSourcingEnabled, isEnabled };
