const express = require('express');
const router = express.Router();
const c = require('../controllers/liveController');

/*
 * 쇼핑라이브 (고객) — 표준 URL `/live`
 * 설계: docs/사이트개선/live sales.md §7-1
 *
 * `feature_menu.LIVE.default_path` 가 '/live' 이고 운영자가 바꿀 수 없다.
 *
 * ⚠️ routes/feature.js 의 `router.get('/live', comingSoon('live'))` 를 **제거해야** 이 라우터가 닿는다.
 *    feature.js 는 app.use('/', ...) 로 가장 먼저 마운트되기 때문이다.
 *    (COMING_SOON.live 정의는 남긴다 — 0건일 때 liveController 가 그 랜딩으로 폴백한다)
 *
 * 다시보기 전용 경로(/live/:slug/replay)는 만들지 않는다. 상세가 ENDED 면 알아서 다시보기를 렌더한다.
 */

router.get('/', c.getList);
router.get('/:slug', c.getDetail);
router.post('/:slug/buy', c.postBuy);

module.exports = router;
