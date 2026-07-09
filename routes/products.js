const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// List
router.get('/', productController.getList);
router.get('/category/:categoryId', productController.getList);
router.get('/brand/:brandId', productController.getList);

// Detail (ID 기반 기본 라우트)
router.get('/view/:id', productController.getDetail);

// Detail (SEO용 slug 기반 라우트)
router.get('/:slug', productController.getDetailBySlug);

// Like AJAX
router.post('/like/:id', productController.toggleLike);

module.exports = router;
