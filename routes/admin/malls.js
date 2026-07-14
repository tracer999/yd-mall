const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/mallController');

/*
 * 몰 관리 (P5 Phase 2) — mall 정의 테이블 CRUD
 * super_admin/admin 만 접근. Express 5 라 /new 를 /:id 보다 먼저.
 */
const requireSuperAdmin = (req, res, next) => {
    const role = req.session.admin && req.session.admin.role;
    if (role === 'super_admin' || role === 'admin') return next();
    res.status(403).send('Access Denied');
};

function requireNumericId(req, res, next) {
    if (!/^\d+$/.test(req.params.id || '')) return res.status(404).send('Not Found');
    next();
}

router.use(requireSuperAdmin);

router.get('/', c.getList);
router.get('/new', c.getNew);
router.post('/', c.postAdd);
router.get('/:id', requireNumericId, c.getEdit);
router.post('/:id', requireNumericId, c.postEdit);
// 프리셋 재적용 — 내비·메뉴·테마를 프리셋으로 되돌린다(홈 교체는 include_home=1 일 때만).
router.post('/:id/provision', requireNumericId, c.postProvision);
router.post('/:id/delete', requireNumericId, c.postDelete);

module.exports = router;
