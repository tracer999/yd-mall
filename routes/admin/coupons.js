const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/admin/couponController');

router.get('/', couponController.getList);
router.get('/create', couponController.getCreate);
router.post('/', couponController.postCreate);
router.get('/detail/:id', couponController.getDetail);
router.get('/edit/:id', couponController.getEdit);
router.post('/edit/:id', couponController.postEdit);
// 삭제가 아니라 종료다 (C7 — FK 가 CASCADE 라 삭제하면 사용 이력까지 사라진다)
router.post('/end/:id', couponController.postEnd);
router.get('/issue', couponController.getIssue);
router.post('/issue', couponController.postIssue);
router.get('/usage', couponController.getUsage);

module.exports = router;
