const express = require('express');
const router = express.Router();
const authController = require('../controllers/admin/authController');
const dashboardController = require('../controllers/admin/dashboardController');
const adminAuth = require('../middleware/adminAuth');
const { requireMenuAccess } = require('../middleware/adminRoleGuard');

// Auth Routes
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.get('/logout', authController.logout);

// Protected Routes
router.use(adminAuth); // Apply middleware to all routes below

router.get('/', dashboardController.getDashboard);
router.get('/design-guide', (req, res) => {
	res.render('admin/design_guide', {
		layout: 'layouts/admin_layout',
		title: '관리자 디자인 가이드 예시',
		subtitle: '관리자 화면에서 사용하는 공통 UI 패턴을 모아둔 예시입니다.',
	});
});
router.get('/search-logs', dashboardController.getSearchLogs);
router.get('/traffic-sources', dashboardController.getTrafficSources);
router.get('/traffic-sources/drill', dashboardController.getTrafficSourceDrill);
router.get('/popular-products', dashboardController.getPopularProducts);

router.use('/categories', requireMenuAccess('/admin/categories'), require('./admin/categories'));
// 스토어프론트 메뉴(GNB/헤더유틸/우측레일) ON·OFF·순서 관리 (B2)
router.use('/feature-menus', requireMenuAccess('/admin/feature-menus'), require('./admin/feature-menus'));
router.use('/products', requireMenuAccess('/admin/products'), require('./admin/products'));
router.use('/banners', requireMenuAccess('/admin/banners'), require('./admin/banners'));
router.use('/display', requireMenuAccess('/admin/display'), require('./admin/display'));
router.use('/page-builder', requireMenuAccess('/admin/page-builder'), require('./admin/page-builder'));
router.use('/users', requireMenuAccess('/admin/users'), require('./admin/users'));
router.use('/sales', requireMenuAccess('/admin/sales'), require('./admin/sales'));
router.use('/shipping', requireMenuAccess('/admin/shipping'), require('./admin/shipping'));
router.use('/visitors', requireMenuAccess('/admin/visitors'), require('./admin/visitors'));
router.use('/settings', requireMenuAccess('/admin/settings'), require('./admin/settings'));
router.use('/site-settings', requireMenuAccess('/admin/site-settings'), require('./admin/siteSettings'));
router.use('/sys-settings', requireMenuAccess('/admin/sys-settings'), require('./admin/sysSettings'));
router.use('/operators', requireMenuAccess('/admin/operators'), require('./admin/operators'));
router.use('/policies', requireMenuAccess('/admin/policies'), require('./admin/policies'));
router.use('/notices', requireMenuAccess('/admin/notices'), require('./admin/notices'));
router.use('/inquiries', requireMenuAccess('/admin/inquiries'), require('./admin/inquiries'));
router.use('/coupons', requireMenuAccess('/admin/coupons'), require('./admin/coupons'));
router.use('/points', requireMenuAccess('/admin/points'), require('./admin/points'));
router.use('/uploads', requireMenuAccess('/admin/uploads'), require('./admin/uploads'));
router.use('/menus', requireMenuAccess('/admin/menus'), require('./admin/menus'));
router.use('/shopify-orders', requireMenuAccess('/admin/shopify-orders'), require('./admin/shopify-orders'));

module.exports = router;
