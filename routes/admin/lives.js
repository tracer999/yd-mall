const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const c = require('../../controllers/admin/liveController');

/*
 * 쇼핑라이브 관리 (1차)
 * 설계: docs/사이트개선/live sales.md §7-2
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다.
 * 정적 세그먼트(`/add`, `/product-search`)를 `/:id` 보다 먼저 선언하고,
 * 숫자 검증은 requireNumericId 가 담당한다. (group-buys.js 와 동일)
 */
function requireNumericId(param) {
    return (req, res, next) => {
        if (!/^\d+$/.test(req.params[param] || '')) return res.status(404).send('Not Found');
        next();
    };
}

/**
 * 라이브 이미지 3종.
 * 필드명에 `ls_` 접두어를 붙인다 — multer 의 destination 이 fieldname 으로 저장 경로를 고르는데,
 * 접두어가 없으면 기획전/공동구매의 같은 이름 필드와 폴더가 섞인다.
 */
const liveImages = upload.fields([
    { name: 'ls_list_thumbnail', maxCount: 1 },
    { name: 'ls_pc_hero_image', maxCount: 1 },
    { name: 'ls_mobile_hero_image', maxCount: 1 },
]);

router.get('/', c.getList);
router.get('/add', c.getAdd);
router.post('/add', liveImages, c.postAdd);
router.get('/product-search', c.getProductSearch);

router.get('/:id/edit', requireNumericId('id'), c.getEdit);
router.post('/:id/edit', requireNumericId('id'), liveImages, c.postEdit);
router.post('/:id/status', requireNumericId('id'), c.postStatus);
router.post('/:id/delete', requireNumericId('id'), c.postDelete);

router.post('/:id/products', requireNumericId('id'), c.postSaveProducts);
router.post('/:id/products/add', requireNumericId('id'), c.postAddProduct);
router.post('/:id/products/:mappingId/delete',
    requireNumericId('id'), requireNumericId('mappingId'), c.postRemoveProduct);

router.post('/:id/coupons', requireNumericId('id'), c.postSaveCoupons);
router.post('/:id/coupons/add', requireNumericId('id'), c.postAddCoupon);
router.post('/:id/coupons/:mappingId/delete',
    requireNumericId('id'), requireNumericId('mappingId'), c.postRemoveCoupon);

router.post('/:id/notices', requireNumericId('id'), c.postSaveNotices);
router.post('/:id/notices/add', requireNumericId('id'), c.postAddNotice);
router.post('/:id/notices/:noticeId/delete',
    requireNumericId('id'), requireNumericId('noticeId'), c.postRemoveNotice);

module.exports = router;
