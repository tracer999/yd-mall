const express = require('express');
const router = express.Router();
const visitorController = require('../../controllers/admin/visitorController');

router.get('/stats', visitorController.getStats);

module.exports = router;
