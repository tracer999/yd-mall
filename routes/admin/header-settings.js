const express = require('express');
const router = express.Router();
const headerSettingsController = require('../../controllers/admin/headerSettingsController');

/*
 * Header 설정 (B5) — navigation_config (GNB 슬롯 수, 카테고리 최대 뎁스, 레이아웃)
 *   GET  /admin/header-settings
 *   POST /admin/header-settings
 */
router.get('/', headerSettingsController.getEdit);
router.post('/', headerSettingsController.postUpdate);

module.exports = router;
