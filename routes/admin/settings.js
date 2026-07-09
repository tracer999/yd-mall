const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/admin/settingsController');
const upload = require('../../middleware/upload');

// Using 'logo' as field name for multer. 
// We need to configure upload middleware to handle destinations if needed, 
// strictly speaking upload middleware in 'middleware/upload.js' saves to 'public/uploads/products'.
// We should probably generalize it or just let it save there and move logic, or modify middleware.
// For simplicity, let's look at upload middleware first.
// Assuming default upload middleware works for now.

router.get('/', settingsController.getSettings);
router.post('/', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'kakao_share_image', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]), settingsController.updateSettings);
router.post('/system', settingsController.updateSystemSettings);
router.post('/send-test-email', settingsController.sendTestEmail);

module.exports = router;
