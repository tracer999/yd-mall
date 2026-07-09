const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/shopifyOrderController');

router.get('/', controller.getList);
router.get('/:id', controller.getDetail);

module.exports = router;
