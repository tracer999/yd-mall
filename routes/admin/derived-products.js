const express = require('express');
const router = express.Router();
const derivedProductController = require('../../controllers/admin/derivedProductController');
const productCompositeController = require('../../controllers/admin/productCompositeController');

// 목록·생성
router.get('/', derivedProductController.getList);
router.get('/new', derivedProductController.getNew);
router.post('/new', express.urlencoded({ extended: true }), derivedProductController.postNew);

// 구성 편집(세트·묶음) — compositeService 편집기 재사용
router.get('/:id/compose', productCompositeController.getEditor);
router.get('/:id/compose/search', productCompositeController.searchComponents);
router.post('/:id/compose', express.json(), productCompositeController.postSave);

// 삭제
router.post('/:id/delete', derivedProductController.postDelete);

module.exports = router;
