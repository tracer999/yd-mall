const express = require('express');
const c = require('../../controllers/admin/resourceController');
const { requireMenuAccess } = require('../../middleware/adminRoleGuard');

const router = express.Router();

/*
 * 리소스 관리 (몰 관리 하위, super_admin).
 * 마운트: routes/admin.js → '/resources' (requireMenuAccess('/admin/resources')).
 */

const guard = requireMenuAccess('/admin/resources');

router.get('/', guard, c.getIndex);
router.post('/naver/refresh', guard, c.postNaverRefresh);
router.get('/naver/search', guard, c.getNaverSearch);

module.exports = router;
