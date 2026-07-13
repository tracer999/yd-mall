const express = require('express');
const router = express.Router();
const pageBuilder = require('../../controllers/admin/pageBuilderController');
const mainController = require('../../controllers/mainController');

// 에디터 화면
router.get('/', pageBuilder.getEditor);

// draft 미리보기(라이브 page_section 기준) — iframe 소스
router.get('/preview', mainController.getHomePreview);

// 섹션 카탈로그 미리보기 — 추가하기 전에 그 섹션이 어떻게 보이는지 실데이터로 렌더 (iframe 소스)
router.get('/section-preview', pageBuilder.getSectionPreview);

// 섹션 CRUD (JSON)
router.post('/sections', pageBuilder.postSectionAdd);
router.post('/sections/reorder', pageBuilder.postSectionReorder);
router.post('/sections/:id/update', pageBuilder.postSectionUpdate);
router.post('/sections/:id/delete', pageBuilder.postSectionDelete);
router.post('/sections/:id/duplicate', pageBuilder.postSectionDuplicate);

// 발행 / 롤백
router.post('/publish', pageBuilder.postPublish);
router.post('/revisions/:revisionId/rollback', pageBuilder.postRollback);

module.exports = router;
