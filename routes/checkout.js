const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

// 비로그인 시 회원/비회원 선택
router.get('/choose', checkoutController.getChoose);

// 주문 폼 (GET) 및 주문 생성 (POST)
router.get('/', checkoutController.getForm);
router.post('/', checkoutController.postForm);
router.post('/apply-coupon-code', checkoutController.postApplyCouponCode);
// 배송지 우편번호 변경 시 배송비 재조회 (표시용. 금액은 서버가 다시 구한다)
router.post('/shipping-fee', checkoutController.postShippingFee);

// 결제창
router.get('/pay/:orderId', checkoutController.getPay);

// 토스 결제 성공/실패 콜백
router.get('/success', checkoutController.getSuccess);
router.get('/fail', checkoutController.getFail);

// 주문 완료
router.get('/complete', checkoutController.getComplete);

// B2B 주문 접수 완료 (즉시 결제가 아니므로 결제창·완료 화면을 타지 않는다)
router.get('/b2b-received', checkoutController.getB2bReceived);

module.exports = router;
