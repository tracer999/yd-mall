const express = require('express');
const router = express.Router();
const couponController = require('../../controllers/admin/couponController');

router.get('/', couponController.getList);
// 적용 대상 picker 자동완성 (동적 라우트보다 먼저 — /:id 와 충돌 방지)
router.get('/search-targets', couponController.searchTargets);
router.get('/resolve-targets', couponController.resolveTargets);
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
