const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { ensureAuthenticated } = require('../middleware/auth');

// Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다.
// 숫자 검증은 미들웨어에서 처리하고, '/:id/claim' 같은 정적 하위 경로를 먼저 둔다.
function requireNumericId(req, res, next) {
    if (!/^\d+$/.test(req.params.id || '')) return res.status(404).send('Not Found');
    next();
}

// 목록·상세는 비로그인도 본다. 수령·코드 등록은 로그인 필요.
router.get('/', couponController.getList);
router.post('/apply-code', ensureAuthenticated, couponController.postApplyCode);
router.post('/:id/claim', ensureAuthenticated, requireNumericId, couponController.postClaim);
router.get('/:id', requireNumericId, couponController.getDetail);

module.exports = router;
