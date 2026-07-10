const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/productGroupController');

/*
 * 상품 그룹 관리 (B6) — 페이지 빌더 섹션의 데이터 소스
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 같은 정규식 파라미터를 지원하지 않는다.
 * 그래서 `/new` 를 `/:id` 보다 먼저 선언하고(뒤에 두면 'new' 가 :id 로 잡힌다),
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
router.post('/:id/items', requireNumericId('id'), c.postAddItem);
router.post('/:id/items/bulk', requireNumericId('id'), c.postAddItems);
router.post('/:id/items/reorder', requireNumericId('id'), c.postReorderItems);
router.post('/:id/items/:itemId/delete', requireNumericId('id'), requireNumericId('itemId'), c.postRemoveItem);

module.exports = router;
