const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/admin/settingsController');

// 시스템 설정 (system_settings) 전용
router.get('/', settingsController.getSysSettings);
router.post('/system', settingsController.updateSystemSettings);
// 리뷰 적립 구간 — 이 화면에도 폼이 있으므로 같은 액션을 여기에도 건다.
router.post('/review-tiers', settingsController.updateReviewTiers);
router.post('/send-test-email', settingsController.sendTestEmail);

module.exports = router;

