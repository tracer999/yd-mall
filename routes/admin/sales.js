const express = require('express');
const router = express.Router();
const salesController = require('../../controllers/admin/salesController');

router.get('/', salesController.getList);
router.get('/:id', salesController.getDetail);
router.post('/status', salesController.postStatus);

module.exports = router;
