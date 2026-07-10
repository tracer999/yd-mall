const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/faqController');

/*
 * 고객센터 FAQ 관리
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다.
 * `/new` 를 `/:id` 보다 먼저 선언하고, 숫자 검증은 requireNumericId 가 한다.
 */
function requireNumericId(req, res, next) {
    if (!/^\d+$/.test(req.params.id || '')) return res.status(404).send('Not Found');
    next();
}

router.get('/', c.getList);
router.get('/new', c.getNew);
router.post('/', c.postCreate);

router.get('/:id', requireNumericId, c.getEdit);
router.post('/:id', requireNumericId, c.postUpdate);
router.post('/:id/delete', requireNumericId, c.postDelete);

module.exports = router;
