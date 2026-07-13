const express = require('express');
const c = require('../controllers/outletController');

const router = express.Router();

/*
 * 아울렛 (고객).
 *
 * app.js 에서 app.use('/outlet', ...) 로 마운트한다.
 * routes/feature.js 의 `router.get('/outlet', comingSoon('outlet'))` 는 제거했다 —
 * featureRoutes 가 '/' 에 먼저 마운트되므로 남겨두면 이 라우터가 영영 안 잡힌다.
 *
 * 상품 상세는 /products/{slug} 를 그대로 쓴다. 아울렛 전용 상세를 만들지 않는다
 * (같은 상품, 같은 가격 — 아울렛 정보만 상세에 얹힌다).
 */

router.get('/', c.getList);

module.exports = router;
