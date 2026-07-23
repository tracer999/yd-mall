const express = require('express');
const router = express.Router();
const userController = require('../../controllers/admin/userController');

router.get('/', userController.getList);
router.get('/search', userController.searchApi);
router.get('/:id', userController.getDetail);
router.post('/:id/edit', userController.postEdit);
router.post('/:id/reset-password', userController.postResetPassword);
router.post('/toggle-active/:id', userController.toggleActive);
router.post('/delete/:id', userController.deleteUser);

module.exports = router;
