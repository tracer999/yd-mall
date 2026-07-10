const express = require('express');
const router = express.Router();
const eventController = require('../../controllers/admin/eventController');

router.get('/', eventController.getList);
router.get('/add', eventController.getAdd);
router.post('/add', eventController.postAdd);
router.get('/edit/:id', eventController.getEdit);
router.post('/edit/:id', eventController.postEdit);
router.post('/delete', eventController.postDelete);

module.exports = router;
