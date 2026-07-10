const express = require('express');
const router = express.Router();
const c = require('../controllers/exhibitionController');

/*
 * 기획전 (고객) — 표준 URL `/exhibition` (단수)
 * 설계: docs/사이트개선/exhibition_design_and_development.md §2, §8-1
 *
 * `feature_menu.EXHIBITION.default_path` 가 '/exhibition' 이고 운영자가 바꿀 수 없다.
 * 복수형으로 만들면 GNB 에 살아 있는 메뉴가 404 된다.
 *
 * `/view/:id` 를 `/:slug` 보다 먼저 선언한다. 뒤에 두면 'view' 가 slug 로 잡힌다.
 */

router.get('/', c.getList);
router.get('/view/:id', c.redirectToSlug);
router.get('/:slug', c.getDetail);

module.exports = router;
