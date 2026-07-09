const express = require('express');
const router = express.Router();
const csController = require('../controllers/csController');

/*
 * 고객센터 (M8) — feature_menu.HEADER_CS.default_path = '/cs'
 *   GET  /cs                 메인 (FAQ BEST 10 + 공지사항)
 *   GET  /cs/faq             분류별 FAQ / 검색
 *   POST /cs/faq/:id/view    조회수 증가
 */
router.get('/', csController.getIndex);
router.get('/faq', csController.getFaq);
router.post('/faq/:id/view', express.json(), csController.postFaqView);

module.exports = router;
