const express = require('express');
const c = require('../../controllers/admin/outletController');

const router = express.Router();

/*
 * 아울렛 관리 라우트.
 *
 * Express 5(path-to-regexp v8)는 `:id(\d+)` 를 지원하지 않는다.
 * 정적 세그먼트(/add, /settings, /categories, /product-search)를 `/:id` 보다 **먼저** 선언해야
 * `/admin/outlet/categories` 가 `:id = 'categories'` 로 잡히지 않는다.
 */

function requireNumericId(param = 'id') {
    return (req, res, next) => {
        if (!/^\d+$/.test(String(req.params[param] || ''))) return next('route');
        next();
    };
}

// 정적 세그먼트 먼저
router.get('/', c.getList);
router.get('/add', c.getAdd);
router.post('/add', c.postAdd);
router.get('/product-search', c.getProductSearch);
router.post('/settings', c.postSetting);

// 아울렛 카테고리
router.get('/categories', c.getCategories);
router.post('/categories/add', c.postCategoryAdd);
router.post('/categories/:id/edit', requireNumericId(), c.postCategoryEdit);
router.post('/categories/:id/delete', requireNumericId(), c.postCategoryDelete);

// 동적 세그먼트
router.get('/:id/edit', requireNumericId(), c.getEdit);
router.post('/:id/edit', requireNumericId(), c.postEdit);
router.post('/:id/delete', requireNumericId(), c.postDelete);

module.exports = router;
