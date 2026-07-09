const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const upload = require('../../middleware/upload');

router.get('/', categoryController.getList);
router.post('/add', upload.single('logo_image'), categoryController.postAdd);
router.post('/edit', upload.single('logo_image'), categoryController.postEdit);
router.post('/delete', categoryController.postDelete);

module.exports = router;
