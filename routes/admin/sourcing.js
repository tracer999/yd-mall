const express = require('express');
const c = require('../../controllers/admin/sourcingController');
const { requireMenuAccess } = require('../../middleware/adminRoleGuard');
const { requireSourcingEnabled } = require('../../middleware/sourcingFlag');

const router = express.Router();

/*
 * 외부몰 연동 라우트 (골격).
 * 마운트: routes/admin.js → '/sourcing'.
 *
 * - requireSourcingEnabled: 몰 사용여부 게이트(super_admin=제공자는 통과).
 * - 화면별 requireMenuAccess(path): admin_menus.visible_roles 기반 RBAC.
 *
 * Express 5(path-to-regexp v8): 정적 세그먼트를 :id 보다 먼저 선언한다.
 */

router.use(requireSourcingEnabled);

function requireNumericId(param = 'id') {
    return (req, res, next) => {
        if (!/^\d+$/.test(String(req.params[param] || ''))) return next('route');
        next();
    };
}

// 공급처/채널 연결 (연결·저장·설정·복사는 정적 경로)
router.get('/connections', requireMenuAccess('/admin/sourcing/connections'), c.getConnections);
router.post('/connections/save', requireMenuAccess('/admin/sourcing/connections'), c.postConnectionSave);
router.post('/connections/setting', requireMenuAccess('/admin/sourcing/connections'), c.postSetting);
router.post('/connections/copy', requireMenuAccess('/admin/sourcing/connections'), c.postConnectionCopy);
router.post('/connections/:id/verify', requireNumericId(), requireMenuAccess('/admin/sourcing/connections'), c.postConnectionVerify);
router.post('/connections/:id/delete', requireNumericId(), requireMenuAccess('/admin/sourcing/connections'), c.postConnectionDelete);

// 상품 가져오기 — 검색(GET) / 선택 적재(POST)
router.get('/import', requireMenuAccess('/admin/sourcing/import'), c.getImport);
router.post('/import/run', requireMenuAccess('/admin/sourcing/import'), c.postImportRun);
// 카테고리 선택기용 트리(JSON) — 사용자가 코드를 몰라도 이름으로 고를 수 있게 한다.
router.get('/domeggook-categories', requireMenuAccess('/admin/sourcing/import'), c.getDomeggookCategories);

// 가져온 상품(중간 테이블) — 목록·상세·재수집·삭제.
// Express 5: 정적 세그먼트('/delete')를 :id 보다 먼저 선언한다.
router.get('/staging', requireMenuAccess('/admin/sourcing/staging'), c.getStaging);
router.post('/staging/delete', requireMenuAccess('/admin/sourcing/staging'), c.postStagingDelete);
// 우리 몰 상품으로 등록(스마트스토어 등록 아님) — 목록 일괄 / 상세 단건
router.post('/staging/publish', requireMenuAccess('/admin/sourcing/staging'), c.postPublishToMall);
router.post('/staging/:id/publish', requireNumericId(), requireMenuAccess('/admin/sourcing/staging'), c.postPublishToMall);
router.get('/staging/:id', requireNumericId(), requireMenuAccess('/admin/sourcing/staging'), c.getStagingDetail);
router.post('/staging/:id/refresh', requireNumericId(), requireMenuAccess('/admin/sourcing/staging'), c.postStagingRefresh);
router.post('/staging/:id/delete', requireNumericId(), requireMenuAccess('/admin/sourcing/staging'), c.postStagingDelete);

/*
 * 스마트스토어 등록 — **우리 몰 상품 → 네이버** 방향.
 * (위의 /staging/publish 는 "공급처 → 우리 몰" 이라 이름만 비슷하고 전혀 다른 경로다.)
 * Express 5: 정적 세그먼트를 :id 보다 먼저 선언한다.
 */
router.get('/publish', requireMenuAccess('/admin/sourcing/publish'), c.getPublish);
router.post('/publish/profile', requireMenuAccess('/admin/sourcing/publish'), c.postNaverProfile);
router.post('/publish/run', requireMenuAccess('/admin/sourcing/publish'), c.postPublishToNaver);
router.post('/publish/:id/verify', requireNumericId(), requireMenuAccess('/admin/sourcing/publish'), c.postVerifyPublished);

router.get('/channel-import', requireMenuAccess('/admin/sourcing/channel-import'), c.getChannelImport);
router.get('/sync', requireMenuAccess('/admin/sourcing/sync'), c.getSync);

// 네이버 카테고리 리소스 — 현황·수동수집·스케줄 + 상품폼 검색 API
router.get('/naver-taxonomy', requireMenuAccess('/admin/sourcing/naver-taxonomy'), c.getNaverTaxonomy);
router.post('/naver-taxonomy/refresh', requireMenuAccess('/admin/sourcing/naver-taxonomy'), c.postNaverTaxonomyRefresh);
router.post('/naver-taxonomy/schedule', requireMenuAccess('/admin/sourcing/naver-taxonomy'), c.postNaverTaxonomySchedule);
router.get('/naver-taxonomy/search', requireMenuAccess('/admin/sourcing/naver-taxonomy'), c.getNaverCategorySearch);

module.exports = router;
