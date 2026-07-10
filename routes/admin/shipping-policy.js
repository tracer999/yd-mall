const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/shippingPolicyController');

// 송장 관리(/admin/shipping)와 다른 화면이다. 이쪽은 배송비 정책.
router.get('/', controller.getList);
router.post('/', controller.postSavePolicy);
router.post('/zones', controller.postAddZone);
router.post('/zones/:id/delete', controller.postDeleteZone);

module.exports = router;
