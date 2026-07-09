const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');

router.get('/', brandController.getList);
router.get('/:brandId', brandController.redirectToBrandProducts);

module.exports = router;
