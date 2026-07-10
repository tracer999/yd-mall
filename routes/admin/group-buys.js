const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const c = require('../../controllers/admin/groupBuyController');

/*
 * 공동구매 관리 (1차)
 * 설계: docs/사이트개선/group_buy_design_and_development.md §5
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다.
 * 정적 세그먼트(`/add`, `/product-search`)를 `/:id` 보다 먼저 선언하고,
 * 숫자 검증은 requireNumericId 가 담당한다. (exhibitions.js 와 동일)
 */
function requireNumericId(param) {
    return (req, res, next) => {
        if (!/^\d+$/.test(req.params[param] || '')) return res.status(404).send('Not Found');
        next();
    };
}

/**
 * 공동구매 이미지 3종.
 *
 * 필드명에 `gb_` 접두어를 붙인다. multer 의 destination 은 fieldname 으로만 저장 경로를
 * 고르는데, 접두어가 없으면 기획전의 `list_thumbnail` 과 이름이 겹쳐 같은 폴더로 섞인다.
 */
const groupBuyImages = upload.fields([
    { name: 'gb_list_thumbnail', maxCount: 1 },
    { name: 'gb_pc_hero_image', maxCount: 1 },
    { name: 'gb_mobile_hero_image', maxCount: 1 },
]);

router.get('/', c.getList);
router.get('/add', c.getAdd);
router.post('/add', groupBuyImages, c.postAdd);
router.get('/product-search', c.getProductSearch);

router.get('/:id/edit', requireNumericId('id'), c.getEdit);
router.post('/:id/edit', requireNumericId('id'), groupBuyImages, c.postEdit);
router.post('/:id/delete', requireNumericId('id'), c.postDelete);

router.post('/:id/products', requireNumericId('id'), c.postSaveProducts);
router.post('/:id/products/add', requireNumericId('id'), c.postAddProduct);
router.post('/:id/products/:mappingId/delete',
    requireNumericId('id'), requireNumericId('mappingId'), c.postRemoveProduct);

module.exports = router;
