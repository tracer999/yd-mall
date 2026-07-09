const express = require('express');
const router = express.Router();
const featureMenuController = require('../../controllers/admin/featureMenuController');

/*
 * 일반 메뉴 관리 (B2) — 스토어프론트 GNB/헤더유틸/우측레일 메뉴의 ON/OFF·표시명·순서
 *   GET  /admin/feature-menus
 *   POST /admin/feature-menus
 */
router.get('/', featureMenuController.getList);
router.post('/', featureMenuController.postSave);

module.exports = router;
