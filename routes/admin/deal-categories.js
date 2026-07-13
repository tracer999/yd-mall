const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/dealCategoryController');

/*
 * 특가 카테고리 관리
 * 설계: docs/사이트개선/shopping_deal_design.md §3.1 · §7
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 를 지원하지 않는다 → `/new` 를 `/:id` 보다 먼저,
 * 숫자 검증은 requireNumericId. (product-groups.js 와 동일)
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
router.post('/:id/toggle', requireNumericId('id'), c.postToggle);
router.post('/:id/delete', requireNumericId('id'), c.postDelete);

module.exports = router;
