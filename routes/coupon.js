const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { ensureAuthenticated } = require('../middleware/auth');

// 목록은 비로그인도 본다. 수령·코드 등록은 로그인 필요.
router.get('/', couponController.getList);
router.post('/:id/claim', ensureAuthenticated, couponController.postClaim);
router.post('/apply-code', ensureAuthenticated, couponController.postApplyCode);

module.exports = router;
