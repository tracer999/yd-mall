const express = require('express');
const c = require('../../controllers/admin/sourcingController');
const { requireMenuAccess } = require('../../middleware/adminRoleGuard');
const { requireSourcingEnabled } = require('../../middleware/sourcingFlag');

const router = express.Router();

/*
 * 외부몰 연동 라우트 (골격).
 * 마운트: routes/admin.js → '/sourcing'.
 *
 * - requireSourcingEnabled: 몰 사용여부 게이트(super_admin=제공자는 통과).
 * - 화면별 requireMenuAccess(path): admin_menus.visible_roles 기반 RBAC.
 *
 * Express 5(path-to-regexp v8): 정적 세그먼트를 :id 보다 먼저 선언한다.
 */

router.use(requireSourcingEnabled);

function requireNumericId(param = 'id') {
    return (req, res, next) => {
        if (!/^\d+$/.test(String(req.params[param] || ''))) return next('route');
        next();
    };
}

// 공급처/채널 연결 (연결·저장·설정·복사는 정적 경로)
router.get('/connections', requireMenuAccess('/admin/sourcing/connections'), c.getConnections);
router.post('/connections/save', requireMenuAccess('/admin/sourcing/connections'), c.postConnectionSave);
router.post('/connections/setting', requireMenuAccess('/admin/sourcing/connections'), c.postSetting);
router.post('/connections/copy', requireMenuAccess('/admin/sourcing/connections'), c.postConnectionCopy);
router.post('/connections/:id/verify', requireNumericId(), requireMenuAccess('/admin/sourcing/connections'), c.postConnectionVerify);
router.post('/connections/:id/delete', requireNumericId(), requireMenuAccess('/admin/sourcing/connections'), c.postConnectionDelete);

// 1차 나머지 화면 (골격 플레이스홀더)
router.get('/import', requireMenuAccess('/admin/sourcing/import'), c.getImport);
router.get('/staging', requireMenuAccess('/admin/sourcing/staging'), c.getStaging);
router.get('/publish', requireMenuAccess('/admin/sourcing/publish'), c.getPublish);
router.get('/channel-import', requireMenuAccess('/admin/sourcing/channel-import'), c.getChannelImport);
router.get('/sync', requireMenuAccess('/admin/sourcing/sync'), c.getSync);

module.exports = router;
