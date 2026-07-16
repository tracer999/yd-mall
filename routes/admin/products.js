const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const productOptionController = require('../../controllers/admin/productOptionController');
const productCompositeController = require('../../controllers/admin/productCompositeController');
const categoryOptionController = require('../../controllers/admin/categoryOptionController');
const upload = require('../../middleware/upload');

router.get('/', productController.getList);
router.get('/add', productController.getAdd);
router.post('/add', upload.fields([
    { name: 'main_image', maxCount: 1 },
    { name: 'thumbnail_image', maxCount: 1 },
    { name: 'sub_images', maxCount: 10 },
    { name: 'video_file', maxCount: 1 }
]), productController.postAdd);
router.get('/detail/:id', productController.getDetail);
router.get('/edit/:id', productController.getEdit);
router.post('/edit', upload.fields([
    { name: 'main_image', maxCount: 1 },
    { name: 'thumbnail_image', maxCount: 1 },
    { name: 'sub_images', maxCount: 10 },
    { name: 'video_file', maxCount: 1 }
]), productController.postEdit);
// URL 로 상품 가져오기 — 외부 상품 상세 페이지를 읽어 등록 폼을 채운다(DB 쓰기 없음).
router.post('/import-url', express.json(), productController.postImportUrl);
router.post('/delete', productController.postDelete);

router.post('/product-image-upload', upload.single('file'), productController.postUploadImage);
router.post('/generate-ai-recommendation', productController.generateAIRecommendation);
router.post('/status/update', productController.postUpdateStatus);
router.post('/sale-start-date/bulk', productController.postBulkSaleStartDate);
router.post('/visibility', express.json(), productController.postVisibility);
router.post('/shopify-sync', express.json(), productController.postShopifySync);

// 추천 상품 관리
router.get('/recommendations/search', productController.getRecommendationSearch);
router.get('/recommendations/:productId', productController.getRecommendations);
router.post('/recommendations/add', express.json(), productController.postAddRecommendation);
router.post('/recommendations/remove', express.json(), productController.postRemoveRecommendation);
router.post('/recommendations/reorder', express.json(), productController.postReorderRecommendations);

// 카테고리 추천 옵션 템플릿
router.get('/category-options', categoryOptionController.getEditor);
router.get('/category-options/:categoryId', categoryOptionController.getEditor);
router.post('/category-options/:categoryId', express.json(), categoryOptionController.postSave);

// 옵션·SKU 관리 (옵션상품)
router.get('/options/:id', productOptionController.getEditor);
router.get('/options/:id/recommended', productOptionController.getRecommended);
router.post('/options/:id', express.json(), productOptionController.postSave);

// 복합상품(세트·묶음·기획) 구성
router.get('/composite/:id', productCompositeController.getEditor);
router.get('/composite/:id/search', productCompositeController.searchComponents);
router.post('/composite/:id', express.json(), productCompositeController.postSave);

// 상품 SEO
router.get('/seo/view/:id', productController.getProductSEOView);
router.post('/seo/generate-meta', productController.generateMetaDescription);
router.post('/seo/save-meta', productController.saveMetaDescription);

module.exports = router;
