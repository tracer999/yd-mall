const express = require('express');
const router = express.Router();
const menuPreviewController = require('../../controllers/admin/menuPreviewController');

/*
 * 메뉴 미리보기 (B7) — 스토어프론트와 같은 navigationService.getNavigation 결과를 시각화
 *   GET  /admin/menu-preview?device=pc|mobile&login=0|1
 *   POST /admin/menu-preview/gnb   통합 GNB 순서·노출 저장 (nav_mode='unified' 전용)
 */
router.get('/', menuPreviewController.getPreview);
router.post('/gnb', menuPreviewController.postGnb);

module.exports = router;
