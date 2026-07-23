const express = require('express');
const router = express.Router();
const mypageController = require('../controllers/mypageController');
const { ensureAuthenticated } = require('../middleware/auth');

// 모든 마이페이지 라우트에 로그인 체크 적용
router.use(ensureAuthenticated);

router.get('/', mypageController.getDashboard);
router.get('/likes', mypageController.getLikes);
router.get('/brand-likes', mypageController.getBrandLikes);
router.get('/recent-views', mypageController.getRecentViews);
router.get('/activities', mypageController.getActivities);
router.get('/coupons', mypageController.getCoupons);
router.get('/points', mypageController.getPoints);

router.get('/orders', mypageController.getOrders);
router.get('/orders/:id', mypageController.getOrderDetail);
// 취소·반품·교환 신청은 전용 화면에서 한다(팝업 아님).
router.get('/orders/:id/claim', mypageController.getClaimRequest);
router.post('/orders/:id/confirm', mypageController.confirmPurchase);
router.post('/orders/:id/cancel', mypageController.cancelOrder);

// 취소·반품 내역
router.get('/claims', mypageController.getClaims);
router.post('/claims/:id/withdraw', mypageController.withdrawClaim);

router.get('/profile', mypageController.getProfile);
router.post('/profile/update', mypageController.updateProfile);

router.get('/withdraw', mypageController.getWithdraw);
router.post('/withdraw', mypageController.postWithdraw);

module.exports = router;