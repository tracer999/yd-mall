const express = require('express');
const multer = require('multer');
const router = express.Router();
const shippingController = require('../../controllers/admin/shippingController');

/*
 * 송장 CSV 는 디스크에 남길 이유가 없다(한 번 읽고 버린다) → 메모리 저장.
 * 5MB 면 수만 줄이라 실무 한 번 분량을 훨씬 넘는다.
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/', shippingController.getList);
router.get('/bulk', shippingController.getBulkInvoice);
router.get('/bulk/template', shippingController.getInvoiceTemplate);
router.post('/bulk', upload.single('file'), shippingController.postBulkInvoice);
router.post('/tracking', shippingController.postTracking);
router.post('/delivered', shippingController.postDelivered);
router.post('/delivered/bulk', shippingController.postBulkDelivered);

module.exports = router;
