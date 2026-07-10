const express = require('express');
const router = express.Router();
const menuPreviewController = require('../../controllers/admin/menuPreviewController');

/*
 * 메뉴 미리보기 (B7) — 스토어프론트와 같은 navigationService.getNavigation 결과를 시각화
 *   GET /admin/menu-preview?device=pc|mobile&login=0|1
 */
router.get('/', menuPreviewController.getPreview);

module.exports = router;
