const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/orderController');

// 주문 목록 조회
router.get('/', controller.getList);

// 엑셀 다운로드 (상세 조회보다 먼저 선언해야 함)
router.get('/download', controller.downloadExcel);

// 주문 상세 조회
router.get('/:id', controller.getDetail);

// 주문 상태 변경
router.post('/:id/status', controller.updateStatus);

// 송장 번호 저장
router.post('/:id/tracking', controller.updateTracking);

// 주문 취소 (재고 복구)
router.post('/:id/cancel', controller.cancelOrder);

// 일괄 상태 변경
router.post('/bulk-status', controller.bulkUpdateStatus);

module.exports = router;