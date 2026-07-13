const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/recommendGroupController');

/*
 * 상품 추천관리 — 추천 그룹(= /recommend 랜딩의 섹션)
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 를 지원하지 않는다.
 * `/new` 를 `/:id` 보다 먼저 선언하고(뒤에 두면 'new' 가 :id 로 잡힌다),
 * 숫자 검증은 requireNumericId 가 담당한다.
 */
function requireNumericId(param) {
    return (req, res, next) => {
        if (!/^\d+$/.test(req.params[param] || '')) return res.status(404).send('Not Found');
        next();
    };
}

router.get('/', c.getList);
router.get('/new', c.getNew);
router.post('/', c.postCreate);

router.get('/:id', requireNumericId('id'), c.getEdit);
router.post('/:id', requireNumericId('id'), c.postUpdate);
router.post('/:id/delete', requireNumericId('id'), c.postDelete);

router.get('/:id/product-search', requireNumericId('id'), c.getProductSearch);
router.post('/:id/items/bulk', requireNumericId('id'), c.postAddItems);
router.post('/:id/items/reorder', requireNumericId('id'), c.postReorderItems);
router.post('/:id/items/:itemId/delete', requireNumericId('id'), requireNumericId('itemId'), c.postRemoveItem);

module.exports = router;
