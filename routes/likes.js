const express = require('express');
const router = express.Router();
const likeController = require('../controllers/likeController');
const { ensureAuthenticated } = require('../middleware/auth');

/**
 * POST /likes/toggle
 * 상품 찜하기/해제 토글 API (로그인 필요)
 */
router.post('/toggle', ensureAuthenticated, likeController.toggleLike);

module.exports = router;