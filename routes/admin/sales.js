const express = require('express');
const router = express.Router();
const salesController = require('../../controllers/admin/salesController');

router.get('/', salesController.getList);
// `/:id` 보다 먼저 — 뒤에 두면 'export' 가 주문 id 로 잡힌다.
router.get('/export', salesController.getExport);
router.get('/settlement', salesController.getSettlement);
router.get('/settlement/export', salesController.getSettlementExport);
router.get('/:id/invoice', salesController.getInvoice);
router.get('/:id', salesController.getDetail);
router.post('/status', salesController.postStatus);

module.exports = router;
