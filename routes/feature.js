const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

/*
 * 기능 메뉴 표준 URL (M3)
 *
 * feature_menu.default_path 와 1:1 대응한다. 운영자는 이 URL 을 바꿀 수 없고,
 * 관리자에서는 사용 여부(is_enabled)·표시명·순서만 관리한다.
 * (docs/사이트개선/frontend_dev_plan.md §5)
 *
 * 기존 상품목록 컨트롤러(productController.getList)를 얇게 재사용한다.
 * Express 5의 req.query 는 getter 이므로 변형하지 않고 req.featurePreset 으로 주입한다.
 */

/** 상품목록 컨트롤러에 넘길 프리셋을 심는 미들웨어 */
function preset(featurePreset) {
    return (req, res, next) => {
        req.featurePreset = featurePreset;
        next();
    };
}

// 베스트 — 조회수 기준 인기 상품
router.get('/best', preset({ sort: 'best' }), productController.getList);

// 신상품 — 최근 등록 순
router.get('/new', preset({ sort: 'new' }), productController.getList);

// 오늘특가 — 마감 임박 세일 뱃지 상품
router.get('/deal/today', preset({ badge: 'DEADLINE_SALE' }), productController.getList);

// 이벤트&혜택 — 전용 모듈 구현 전까지 공지 게시판으로 연결(표준 URL 은 선점).
// TODO: 이벤트 모듈 구현 시 이 별칭을 실제 이벤트 목록 렌더로 교체한다.
router.get('/event', (req, res) => res.redirect(302, '/boards/notice'));

module.exports = router;
