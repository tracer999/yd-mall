const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/reviewController');

router.get('/', controller.getList);
router.post('/:id/toggle', controller.postToggleVisible);
router.post('/:id/delete', controller.postDelete);

module.exports = router;
