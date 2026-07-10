const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const c = require('../../controllers/admin/exhibitionController');

/*
 * 기획전 관리 (1차)
 * 설계: docs/사이트개선/exhibition_design_and_development.md §8-2
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다.
 * 정적 세그먼트(`/add`, `/product-search`)를 `/:id` 보다 먼저 선언하고,
 * 숫자 검증은 requireNumericId 가 담당한다. (product-groups.js 와 동일)
 */
function requireNumericId(param) {
    return (req, res, next) => {
        if (!/^\d+$/.test(req.params[param] || '')) return res.status(404).send('Not Found');
        next();
    };
}

/** 기획전 이미지 4종. multer 가 public/uploads/exhibitions 로 저장한다. */
const exhibitionImages = upload.fields([
    { name: 'list_thumbnail', maxCount: 1 },
    { name: 'pc_hero_image', maxCount: 1 },
    { name: 'mobile_hero_image', maxCount: 1 },
    { name: 'og_image', maxCount: 1 },
]);

router.get('/', c.getList);
router.get('/add', c.getAdd);
router.post('/add', exhibitionImages, c.postAdd);
router.get('/product-search', c.getProductSearch);

router.get('/:id/edit', requireNumericId('id'), c.getEdit);
router.post('/:id/edit', requireNumericId('id'), exhibitionImages, c.postEdit);
router.post('/:id/delete', requireNumericId('id'), c.postDelete);

router.post('/:id/sections', requireNumericId('id'), c.postSaveSections);

router.post('/:id/products', requireNumericId('id'), c.postSaveProducts);
router.post('/:id/products/add', requireNumericId('id'), c.postAddProduct);
router.post('/:id/products/:mappingId/delete',
    requireNumericId('id'), requireNumericId('mappingId'), c.postRemoveProduct);

module.exports = router;
