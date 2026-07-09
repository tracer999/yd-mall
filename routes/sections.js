const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController');

/*
 * 스토어프론트 섹션 AJAX 엔드포인트 (CT-3)
 *   GET /sections/ranking?categoryId=&sort=&limit=
 */
router.get('/ranking', sectionController.getRanking);

module.exports = router;
