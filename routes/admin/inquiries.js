const express = require('express');
const router = express.Router();
const inquiryController = require('../../controllers/admin/inquiryController');

router.get('/', inquiryController.getList);
router.get('/:id', inquiryController.getDetail);
router.post('/:id/answer', inquiryController.postAnswer);

module.exports = router;
