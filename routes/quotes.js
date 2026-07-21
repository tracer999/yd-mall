const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');

// 견적함
router.get('/', quoteController.getList);

// 장바구니 → 견적 요청
router.get('/request', quoteController.getRequest);
router.post('/request', quoteController.postRequest);

// 견적 상세 · 협상
router.get('/:id', quoteController.getDetail);
router.post('/:id/action', quoteController.postAction);
router.post('/:id/convert', quoteController.postConvert);
router.get('/:id/pdf', quoteController.getPdf);

module.exports = router;
