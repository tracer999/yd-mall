const express = require('express');
const router = express.Router();
const themeSettingsController = require('../../controllers/admin/themeSettingsController');

/*
 * 테마 설정 — theme.config_json 스타일 토큰 (CSS 인젝션 방어: themeService 규칙 재사용)
 *   GET  /admin/theme-settings
 *   POST /admin/theme-settings
 */
router.get('/', themeSettingsController.getEdit);
router.post('/', themeSettingsController.postUpdate);

module.exports = router;
