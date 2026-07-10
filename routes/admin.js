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
// 관리자 편집 몰 컨텍스트 (P5) — 인증된 관리자 요청에만. req.adminMallId 주입.
router.use(require('../middleware/adminMallContext'));

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
// 스토어프론트 GNB 기능 메뉴 ON·OFF·순서 관리 (B2)
router.use('/feature-menus', requireMenuAccess('/admin/feature-menus'), require('./admin/feature-menus'));
// 헤더 유틸·우측 레일 등 고정 시스템 메뉴의 노출·표시명·순서 (B4)
router.use('/system-menus', requireMenuAccess('/admin/system-menus'), require('./admin/system-menus'));
// 헤더 레이아웃·GNB 슬롯 정책(navigation_config) (B5)
router.use('/header-settings', requireMenuAccess('/admin/header-settings'), require('./admin/header-settings'));
// 스토어프론트 메뉴 조립 결과 미리보기 (B7)
router.use('/menu-preview', requireMenuAccess('/admin/menu-preview'), require('./admin/menu-preview'));
router.use('/products', requireMenuAccess('/admin/products'), require('./admin/products'));
router.use('/banners', requireMenuAccess('/admin/banners'), require('./admin/banners'));
router.use('/display', requireMenuAccess('/admin/display'), require('./admin/display'));
router.use('/page-builder', requireMenuAccess('/admin/page-builder'), require('./admin/page-builder'));
// 페이지 빌더 섹션의 데이터 소스가 되는 상품 그룹 (B6)
router.use('/product-groups', requireMenuAccess('/admin/product-groups'), require('./admin/product-groups'));
// 기획전 — 시즌·브랜드·테마별 상품 전시 랜딩
router.use('/exhibitions', requireMenuAccess('/admin/exhibitions'), require('./admin/exhibitions'));
// 이벤트&혜택 — 응모·쿠폰팩·출석 등 참여/혜택 중심(기획전과 분리)
router.use('/events', requireMenuAccess('/admin/events'), require('./admin/events'));
// 공동구매 — 기간·목표수량·공동구매가가 있는 조건부 판매 캠페인(기획전·이벤트와 분리)
router.use('/group-buys', requireMenuAccess('/admin/group-buys'), require('./admin/group-buys'));
router.use('/users', requireMenuAccess('/admin/users'), require('./admin/users'));
router.use('/sales', requireMenuAccess('/admin/sales'), require('./admin/sales'));
router.use('/shipping', requireMenuAccess('/admin/shipping'), require('./admin/shipping'));
// 배송비 정책(몰별 기본료·무료배송 기준·지역 할증). /admin/shipping 은 송장 관리다 — 별개 화면.
router.use('/shipping-policy', requireMenuAccess('/admin/shipping-policy'), require('./admin/shipping-policy'));
router.use('/visitors', requireMenuAccess('/admin/visitors'), require('./admin/visitors'));
router.use('/settings', requireMenuAccess('/admin/settings'), require('./admin/settings'));
router.use('/site-settings', requireMenuAccess('/admin/site-settings'), require('./admin/siteSettings'));
// 스타일 토큰(theme.config_json) — 값이 CSS 에 직접 삽입되므로 서버 검증 필수
router.use('/theme-settings', requireMenuAccess('/admin/theme-settings'), require('./admin/theme-settings'));
// 고객센터 FAQ CRUD (answer 는 저장 시 새니타이즈)
router.use('/faqs', requireMenuAccess('/admin/faqs'), require('./admin/faqs'));
router.use('/sys-settings', requireMenuAccess('/admin/sys-settings'), require('./admin/sysSettings'));
router.use('/operators', requireMenuAccess('/admin/operators'), require('./admin/operators'));
// 몰 관리 (P5 Phase 2) — mall 정의 테이블 CRUD
router.use('/malls', requireMenuAccess('/admin/malls'), require('./admin/malls'));
router.use('/policies', requireMenuAccess('/admin/policies'), require('./admin/policies'));
router.use('/notices', requireMenuAccess('/admin/notices'), require('./admin/notices'));
router.use('/inquiries', requireMenuAccess('/admin/inquiries'), require('./admin/inquiries'));
router.use('/coupons', requireMenuAccess('/admin/coupons'), require('./admin/coupons'));
router.use('/points', requireMenuAccess('/admin/points'), require('./admin/points'));
router.use('/uploads', requireMenuAccess('/admin/uploads'), require('./admin/uploads'));
router.use('/menus', requireMenuAccess('/admin/menus'), require('./admin/menus'));
router.use('/shopify-orders', requireMenuAccess('/admin/shopify-orders'), require('./admin/shopify-orders'));

module.exports = router;
