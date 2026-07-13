const express = require('express');
const router = express.Router();
const c = require('../controllers/recommendController');

/*
 * 추천 (고객) — 표준 URL `/recommend`
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md §4
 *
 * ⚠️ 이 라우트를 routes/feature.js 안에 두면 안 된다. featureRoutes 가 app.js 에서
 *    '/' 에 **먼저** 마운트되므로, 거기에 router.get('/recommend') 를 두면
 *    뒤에 오는 app.use('/recommend', ...) 가 영영 닿지 못한다.
 */

router.get('/', c.getIndex);

module.exports = router;
