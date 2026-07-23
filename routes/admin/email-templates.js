const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/emailTemplateController');

router.get('/', controller.getList);
router.post('/admin-email', controller.postAdminEmail);

// :key 는 registry 에 정의된 템플릿 키만 유효하다(컨트롤러에서 검증).
router.get('/:key', controller.getEdit);
router.post('/:key', controller.postEdit);
router.post('/:key/reset', controller.postReset);
router.post('/:key/toggle', controller.postToggle);
router.post('/:key/preview', controller.postPreview);
router.post('/:key/test', controller.postTest);

module.exports = router;
