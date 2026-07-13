const express = require('express');
const router = express.Router();
const c = require('../controllers/specialtyController');
const exhibitionController = require('../controllers/exhibitionController');

/*
 * 전문관 (고객) — 표준 URL `/specialty`
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md §5
 *
 * 전문관은 exhibition 테이블을 재사용한다(exhibition_type='SPECIALTY').
 * 목록만 전용이고, **상세는 exhibitionController.getDetail 을 그대로 공유**한다 —
 * 같은 테이블·같은 섹션·같은 상품 매핑이라 렌더를 두 벌 만들 이유가 없다.
 * getDetail 이 req.baseUrl 로 정규 URL 을 검사해, 유형이 어긋나면 301 로 넘긴다.
 *
 * ⚠️ routes/feature.js 안에 두면 안 된다. featureRoutes 가 '/' 에 먼저 마운트되므로
 *    뒤에 오는 app.use('/specialty', ...) 가 영영 닿지 못한다.
 */

router.get('/', c.getList);
router.get('/:slug', exhibitionController.getDetail);

module.exports = router;
