const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/claimController');

router.get('/', controller.getList);
router.get('/:id', controller.getDetail);
router.post('/:id/approve', controller.postApprove);
router.post('/:id/reject', controller.postReject);
router.post('/:id/manual-refund', controller.postManualRefund);

module.exports = router;
