const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
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

// 상품 SEO
router.get('/seo/view/:id', productController.getProductSEOView);
router.post('/seo/generate-meta', productController.generateMetaDescription);
router.post('/seo/save-meta', productController.saveMetaDescription);

module.exports = router;
