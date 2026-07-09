const express = require('express');
const router = express.Router();
const termsController = require('../controllers/termsController');

router.get('/terms', termsController.getTerms);
router.get('/privacy', termsController.getPrivacy);
router.get('/about', termsController.getAbout);
router.get('/guide', termsController.getGuide);

module.exports = router;
