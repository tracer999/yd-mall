const express = require('express');
const router = express.Router();
const c = require('../controllers/eventController');

/*
 * 이벤트&혜택 (고객) — 표준 URL `/event` (단수)
 * 설계: docs/사이트개선/gnb_menu_design.md §2-7, §8-1
 *
 * `feature_menu.EVENT.default_path` 가 '/event' 이고 운영자가 바꿀 수 없다.
 *
 * `/view/:id` 를 `/:slug` 보다 먼저 선언한다. 뒤에 두면 'view' 가 slug 로 잡힌다.
 * (기획전 라우트와 같은 함정)
 */

router.get('/', c.getList);
router.get('/view/:id', c.redirectToSlug);
router.get('/:slug', c.getDetail);
router.post('/:slug/apply', c.postApply);

module.exports = router;
