const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

// 장바구니 목록
router.get('/', cartController.getCart);

// 장바구니 추가
router.post('/add', cartController.addToCart);

// 장바구니 단일 항목 삭제
router.post('/remove/:id', cartController.removeItem);

// 장바구니 수량 변경
router.post('/update/:id', cartController.updateQuantity);

// 장바구니 전체 구매
router.post('/checkout', cartController.checkoutAll);

// 주문 완료 페이지
router.get('/complete', cartController.getComplete);

module.exports = router;
