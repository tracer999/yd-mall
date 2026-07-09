const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');

router.get('/', noticeController.getList);
router.get('/:id', noticeController.getDetail);

module.exports = router;
