const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/brandController');

/*
 * 브랜드 관리 — brand_profile(확장 속성) 편집 + 집계 재계산
 *
 * Express 5 는 `:id(\d+)` 를 지원하지 않는다. 고정 경로(/recalc)를 :id 보다 먼저
 * 선언하고 숫자 검증은 requireNumericId 가 맡는다 (recommend-groups 관례와 동일).
 */
function requireNumericId(param) {
    return (req, res, next) => {
        if (!/^\d+$/.test(req.params[param] || '')) return res.status(404).send('Not Found');
        next();
    };
}

router.get('/', c.getList);
router.get('/search.json', c.searchJson);
router.post('/recalc', c.postRecalc);

router.get('/:id', requireNumericId('id'), c.getEdit);
router.post('/:id', requireNumericId('id'), c.postUpdate);

// 상품 배정/제거 (현재 편집 몰 스코프)
router.get('/:id/product-search', requireNumericId('id'), c.getProductSearch);
router.post('/:id/products', requireNumericId('id'), c.postAssignProducts);
router.post('/:id/products/remove', requireNumericId('id'), c.postRemoveProduct);

module.exports = router;
