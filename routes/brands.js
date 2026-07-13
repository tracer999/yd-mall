const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');

// search.json 은 :brandId 보다 먼저 잡아야 한다 (숫자가 아니어도 라우트가 먹힌다)
router.get('/', brandController.getHome);
router.get('/search.json', brandController.searchJson);
router.get('/:brandId', brandController.getDetail);

module.exports = router;
