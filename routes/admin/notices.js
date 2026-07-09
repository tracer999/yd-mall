const express = require('express');
const router = express.Router();
const noticeController = require('../../controllers/admin/noticeController');
const upload = require('../../middleware/upload');

router.get('/', noticeController.getList);
router.get('/create', noticeController.getCreate);
router.post('/create', noticeController.postCreate);
router.get('/detail/:id', noticeController.getDetail);
router.get('/edit/:id', noticeController.getEdit);
router.post('/edit/:id', noticeController.postEdit);
router.post('/delete', noticeController.postDelete);
router.post('/image-upload', upload.single('file'), noticeController.postUploadImage);

module.exports = router;
