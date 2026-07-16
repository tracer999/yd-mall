const express = require('express');
const router = express.Router();
const { requireMenuAccess } = require('../../middleware/adminRoleGuard');
const serviceController = require('../../controllers/admin/serviceController');

/*
 * 서비스 관리 (몰 빌더 제공자 전용) — super_admin 전용
 *
 * 각 화면을 자기 admin_menus.path 로 개별 가드한다(화면 단위).
 * visible_roles='super_admin' 이라 super_admin 외에는 사이드바에서도 빠지고 URL 직접 접근도 403.
 */
const guardPorting = requireMenuAccess('/admin/service/porting');
const guardFeatures = requireMenuAccess('/admin/service/features');

// 등급별 기능 설정 — 판매 등급(플랜)별 entitlement
router.get('/features', guardFeatures, serviceController.getFeatures);
router.post('/features', guardFeatures, serviceController.postSaveFeatures);
router.post('/features/add', guardFeatures, serviceController.postAddPlan);
router.post('/features/:id/delete', guardFeatures, serviceController.postDeletePlan);

// 배포·포팅 관리 — 배포 안내 + 납품 고객 레지스트리
router.get('/porting', guardPorting, serviceController.getPorting);
router.get('/customers/new', guardPorting, serviceController.getCustomerForm);
router.get('/customers/:id/edit', guardPorting, serviceController.getCustomerForm);
router.post('/customers', guardPorting, serviceController.postSaveCustomer);
router.post('/customers/:id/delete', guardPorting, serviceController.postDeleteCustomer);

module.exports = router;
