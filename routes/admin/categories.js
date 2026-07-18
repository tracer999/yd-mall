const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const upload = require('../../middleware/upload');

router.get('/', categoryController.getList);
router.post('/add', upload.single('logo_image'), categoryController.postAdd);
router.post('/edit', upload.single('logo_image'), categoryController.postEdit);
// 노출(활성·PC·모바일) 일괄 저장 — 행 단위 [수정] 과 별개로, 여러 건을 한 번에 반영한다.
router.post('/visibility', categoryController.postVisibility);
// 몰별 표시 override(글로벌 카탈로그를 이 몰에서만 숨김) — 1건 토글.
router.post('/mall-visibility', categoryController.postMallVisibility);
router.post('/delete', categoryController.postDelete);

// 상세 화면 + 상품 배정/제거 (숫자 id 만) — 위 고정 경로 뒤에 선언해야 충돌하지 않는다.
function requireNumericId(req, res, next) {
    if (!/^\d+$/.test(req.params.id || '')) return res.status(404).send('Not Found');
    next();
}
router.get('/:id', requireNumericId, categoryController.getDetail);
router.get('/:id/product-search', requireNumericId, categoryController.getProductSearch);
router.post('/:id/products', requireNumericId, categoryController.postAssignProducts);
router.post('/:id/products/remove', requireNumericId, categoryController.postRemoveProduct);

module.exports = router;
