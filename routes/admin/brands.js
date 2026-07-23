const express = require('express');
const router = express.Router();
const c = require('../../controllers/admin/brandController');
const upload = require('../../middleware/upload');

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
// 목록에서 브랜드 등록 — 카테고리 관리의 브랜드 탭에서 이관했다.
router.post('/add', upload.single('logo_image'), c.postAdd);

router.get('/:id', requireNumericId('id'), c.getEdit);
router.post('/:id', requireNumericId('id'), c.postUpdate);
// 목록 행 인라인 저장(이름·순서·입점일·사용여부·로고). 상세 저장(POST /:id)과 다루는 컬럼이 다르다.
router.post('/:id/inline', requireNumericId('id'), upload.single('logo_image'), c.postInlineEdit);

// 상품 배정/제거 (현재 편집 몰 스코프)
router.get('/:id/product-search', requireNumericId('id'), c.getProductSearch);
router.post('/:id/products', requireNumericId('id'), c.postAssignProducts);
router.post('/:id/products/remove', requireNumericId('id'), c.postRemoveProduct);

module.exports = router;
