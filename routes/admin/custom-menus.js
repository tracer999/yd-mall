const express = require('express');
const router = express.Router();
const customMenuController = require('../../controllers/admin/customMenuController');

/*
 * 커스텀 메뉴 관리 (B3) — 몰별 자유 메뉴(custom_menu) CRUD
 *   GET  /admin/custom-menus              목록
 *   GET  /admin/custom-menus/add          추가 폼
 *   POST /admin/custom-menus              추가 저장
 *   GET  /admin/custom-menus/:id/edit     수정 폼
 *   POST /admin/custom-menus/:id          수정 저장
 *   POST /admin/custom-menus/:id/toggle   사용 여부 토글
 *   POST /admin/custom-menus/:id/delete   삭제
 */
router.get('/', customMenuController.getList);
router.get('/add', customMenuController.getAdd);
router.post('/', customMenuController.postSave);
router.get('/:id/edit', customMenuController.getEdit);
router.post('/:id/toggle', customMenuController.postToggle);
router.post('/:id/delete', customMenuController.postDelete);
router.post('/:id', customMenuController.postSave);

module.exports = router;
