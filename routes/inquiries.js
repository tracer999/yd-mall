const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiryController');

router.get('/', inquiryController.getList);
router.get('/write', inquiryController.getForm);
router.post('/write', inquiryController.postInquiry);
router.get('/:id', inquiryController.getDetail);

module.exports = router;
