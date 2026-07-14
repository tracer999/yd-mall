const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/admin/bannerController');
const heroSlideController = require('../../controllers/admin/heroSlideController');
const upload = require('../../middleware/upload');

const bannerUpload = upload.fields([
    { name: 'banner_image', maxCount: 1 },
    { name: 'mobile_banner_image', maxCount: 1 }
]);

const heroSlideUpload = upload.fields([
    { name: 'slide_image', maxCount: 1 }
]);

// 헤더 톱바 — 배너 3슬롯을 한 폼에서 함께 올린다(슬롯이 고정이라 개별 등록 화면이 없다).
const topbarUpload = upload.fields([
    { name: 'topbar_banner_1', maxCount: 1 },
    { name: 'topbar_banner_2', maxCount: 1 },
    { name: 'topbar_banner_3', maxCount: 1 }
]);

// 업로드 미들웨어 공통 에러 처리 (배너·슬라이드 공용)
function makeUploadHandler(uploadFn) {
    return function (req, res, next) {
        uploadFn(req, res, (err) => {
            if (!err) return next();

            if (err.name === 'MulterError') {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).send(`업로드 파일은 ${upload.MAX_UPLOAD_FILE_MB}MB 이하만 가능합니다.`);
                }
                return res.status(400).send('파일 업로드 처리 중 오류가 발생했습니다.');
            }

            if (err.status === 413) {
                return res.status(413).send(`요청 본문 크기가 너무 큽니다. 서버 업로드 제한(${upload.MAX_UPLOAD_FILE_MB}MB) 이하로 업로드해 주세요.`);
            }

            return res.status(400).send('파일 업로드 중 오류가 발생했습니다.');
        });
    };
}

const handleBannerUpload = makeUploadHandler(bannerUpload);
const handleHeroSlideUpload = makeUploadHandler(heroSlideUpload);
const handleTopbarUpload = makeUploadHandler(topbarUpload);

// 헤더 톱바(배너 3 + 알림 1) — /add, /edit 보다 먼저 마운트해 경로 충돌을 피한다.
router.get('/topbar', bannerController.getTopbar);
router.post('/topbar', handleTopbarUpload, bannerController.postTopbar);

// 메인 슬라이더 관리 — /add, /edit 라우트보다 먼저 마운트해 경로 충돌을 피한다.
// 한 화면에서 히어로 방식(상품 쇼케이스 / 이미지 배너)을 고르고 그 방식의 콘텐츠를 편집한다.
router.get('/hero-slides', heroSlideController.getList);
router.post('/hero-slides/variant', heroSlideController.postVariant);
// 이미지 배너 슬라이드(banner_type='MAIN')의 순서·노출 일괄 저장
router.post('/hero-slides/banners', heroSlideController.postBannerOrder);
router.get('/hero-slides/add', heroSlideController.getAdd);
router.post('/hero-slides/add', handleHeroSlideUpload, heroSlideController.postAdd);
router.get('/hero-slides/edit/:id', heroSlideController.getEdit);
router.post('/hero-slides/edit/:id', handleHeroSlideUpload, heroSlideController.postEdit);
router.post('/hero-slides/delete', heroSlideController.postDelete);

router.get('/', bannerController.getList);
router.get('/add', bannerController.getAdd);
router.post('/add', handleBannerUpload, bannerController.postAdd);
router.get('/edit/:id', bannerController.getEdit);
router.post('/edit/:id', handleBannerUpload, bannerController.postEdit);
router.post('/delete', bannerController.postDelete);

module.exports = router;
