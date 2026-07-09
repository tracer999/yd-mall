const express = require('express');
const router = express.Router();
const shippingController = require('../../controllers/admin/shippingController');

router.get('/', shippingController.getList);
router.post('/tracking', shippingController.postTracking);

module.exports = router;
