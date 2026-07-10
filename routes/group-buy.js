const express = require('express');
const router = express.Router();
const c = require('../controllers/groupBuyController');

/*
 * 공동구매 (고객) — 표준 URL `/group-buy`
 * 설계: docs/사이트개선/group_buy_design_and_development.md §2-1
 *
 * `feature_menu.GROUP_BUY.default_path` 가 '/group-buy' 이고 운영자가 바꿀 수 없다.
 *
 * `/view/:id` 를 `/:slug` 보다 먼저 선언한다. 뒤에 두면 'view' 가 slug 로 잡힌다.
 * (기획전·이벤트 라우트와 같은 함정)
 */

router.get('/', c.getList);
router.get('/view/:id', c.redirectToSlug);
router.get('/:slug', c.getDetail);
router.post('/:slug/buy', c.postBuy);

module.exports = router;
