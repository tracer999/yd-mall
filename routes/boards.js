const express = require('express');
const router = express.Router();
const controller = require('../controllers/boardController');

router.get('/:type', controller.getList);
router.get('/:type/:id', controller.getDetail);

module.exports = router;