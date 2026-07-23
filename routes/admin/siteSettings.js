const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/admin/settingsController');
const upload = require('../../middleware/upload');

// 사이트 설정 (site_settings) 전용
router.get('/', settingsController.getSiteSettings);
router.post('/', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'kakao_share_image', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]), settingsController.updateSettings);
// 리뷰 적립 구간 — 이 화면에도 폼이 있으므로 같은 액션을 여기에도 건다.
router.post('/review-tiers', settingsController.updateReviewTiers);

module.exports = router;
