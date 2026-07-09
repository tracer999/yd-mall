const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/admin/couponController');

router.get('/', couponController.getList);
router.get('/create', couponController.getCreate);
router.post('/', couponController.postCreate);
router.get('/detail/:id', couponController.getDetail);
router.get('/edit/:id', couponController.getEdit);
router.post('/edit/:id', couponController.postEdit);
router.get('/issue', couponController.getIssue);
router.post('/issue', couponController.postIssue);
router.get('/usage', couponController.getUsage);

module.exports = router;
