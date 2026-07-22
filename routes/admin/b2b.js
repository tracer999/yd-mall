const express = require('express');
const router = express.Router();
const memberController = require('../../controllers/admin/b2bMemberController');
const settingController = require('../../controllers/admin/b2bSettingController');
const orderController = require('../../controllers/admin/b2bOrderController');
const quoteController = require('../../controllers/admin/quoteAdminController');
const claimController = require('../../controllers/admin/b2bClaimController');

// 기업회원 승인
router.get('/members', memberController.getList);
router.get('/members/:id', memberController.getDetail);
// 사업자등록증 — storage/ (public 밖) 파일을 관리자 인증 통과 시에만 스트리밍
router.get('/members/:id/license', memberController.getLicense);
router.post('/members/:id/status', memberController.postStatus);
router.post('/members/:id/update', memberController.postUpdate);

// B2B 주문 — 접수 → 승인(재고 차감) → 입금 확인 → 세금계산서
router.get('/orders', orderController.getList);
router.post('/orders/cancel-overdue', orderController.postCancelOverdue);
router.get('/orders/:id', orderController.getDetail);
router.post('/orders/:id/action', orderController.postAction);
router.post('/orders/:id/tax-invoice', orderController.postTaxInvoice);

// B2B 클레임 — 취소·반품 승인 + 계좌 환불 마감 (B2C 는 /admin/claims)
router.get('/claims', claimController.getList);
router.post('/claims/refund-complete', claimController.postRefundComplete);
router.get('/claims/:id', claimController.getDetail);
router.post('/claims/:id/approve', claimController.postApprove);
router.post('/claims/:id/reject', claimController.postReject);

// 견적 관리 · 협상 (설계 §8, §11.4)
router.get('/quotes', quoteController.getList);
router.get('/quotes/:id', quoteController.getDetail);
router.post('/quotes/:id/action', quoteController.postAction);
router.post('/quotes/:id/convert', quoteController.postConvert);
router.get('/quotes/:id/pdf', quoteController.getPdf);
router.post('/quotes/:id/issue-pdf', quoteController.postIssuePdf);

// 거래처 할인 — 거래처마다 얹는 추가 할인율
router.get('/discounts', settingController.getDiscounts);
router.post('/discounts', settingController.postDiscount);

// 운영 설정 (system_settings 전역 키)
router.get('/settings', settingController.getSettings);
router.post('/settings', settingController.postSettings);

module.exports = router;
