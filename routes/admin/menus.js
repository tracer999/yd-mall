const express = require('express');
const router = express.Router();
const menuController = require('../../controllers/admin/menuController');

router.get('/', menuController.getMenus);
router.post('/save', menuController.saveMenus);

module.exports = router;
