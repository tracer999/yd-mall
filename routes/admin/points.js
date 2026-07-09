const express = require('express');
const router = express.Router();
const pointController = require('../../controllers/admin/pointController');

router.get('/', pointController.getList);
router.get('/grant', pointController.getGrant);
router.post('/grant', pointController.postGrant);
router.get('/deduct', pointController.getDeduct);
router.post('/deduct', pointController.postDeduct);

module.exports = router;
