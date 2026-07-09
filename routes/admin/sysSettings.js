const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/admin/settingsController');

// 시스템 설정 (system_settings) 전용
router.get('/', settingsController.getSysSettings);
router.post('/system', settingsController.updateSystemSettings);
router.post('/send-test-email', settingsController.sendTestEmail);

module.exports = router;

