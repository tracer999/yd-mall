const express = require('express');
const router = express.Router();
const displayController = require('../../controllers/admin/displayController');

router.get('/', displayController.getList);
router.post('/section/update', displayController.postUpdateSection);
router.post('/products/add', displayController.postAddProduct);
router.post('/products/remove', displayController.postRemoveProduct);
router.post('/products/reorder', displayController.postReorderProducts);
router.get('/products/search', displayController.getProductSearch);

module.exports = router;
