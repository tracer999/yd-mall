const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/bestGroupController');

/*
 * 베스트/랭킹 관리
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 정규식 파라미터를 지원하지 않는다.
 * 그래서 고정 경로(/config, /calculate)를 `/:id` 보다 **먼저** 선언한다.
 * 뒤에 두면 'config' 가 :id 로 잡힌다(product-groups 의 /new 와 같은 함정).
 */
function requireNumericId(param) {
    return (req, res, next) => {
        if (!/^\d+$/.test(req.params[param] || '')) return res.status(404).send('Not Found');
        next();
    };
}

router.get('/', c.getList);
router.post('/', c.postCreate);

router.post('/config', c.postConfig);
router.post('/calculate', c.postCalculate);

router.get('/:id', requireNumericId('id'), c.getDetail);
router.post('/:id', requireNumericId('id'), c.postUpdate);
router.post('/:id/delete', requireNumericId('id'), c.postDelete);

router.get('/:id/product-search', requireNumericId('id'), c.getProductSearch);
router.post('/:id/pins', requireNumericId('id'), c.postAddPin);
router.post('/:id/pins/:pinId', requireNumericId('id'), requireNumericId('pinId'), c.postUpdatePin);
router.post('/:id/pins/:pinId/delete', requireNumericId('id'), requireNumericId('pinId'), c.postDeletePin);

module.exports = router;
