const express = require('express');
const router = express.Router();
const featureMenuController = require('../../controllers/admin/featureMenuController');

/*
 * 시스템 메뉴 설정 (B4) — 헤더 유틸/우측 레일의 노출·표시명·순서
 *   GET  /admin/system-menus
 *   POST /admin/system-menus
 *
 * 일반 메뉴 관리(/admin/feature-menus)와 같은 컨트롤러를 쓰되 담당 position 만 다르다.
 */
router.get('/', featureMenuController.getSystemList);
router.post('/', featureMenuController.postSystemSave);

module.exports = router;
