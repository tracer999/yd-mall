const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/admin/bannerController');
const heroSlideController = require('../../controllers/admin/heroSlideController');
const upload = require('../../middleware/upload');

const bannerUpload = upload.fields([
    { name: 'banner_image', maxCount: 1 },
    { name: 'mobile_banner_image', maxCount: 1 }
]);

/*
 * 메인 슬라이드 — 이미지 + 동영상(PC·모바일) + 포스터.
 *
 * ⚠️ 여기 선언되지 않은 name 의 file input 이 폼에 있으면 multer 가
 *    LIMIT_UNEXPECTED_FILE 을 던지고 아래 핸들러가 400 으로 뭉갠다. 폼에 파일 칸을
 *    추가하면 **반드시 이 목록에도 추가**할 것.
 *
 * upload.heroSlide 는 동영상 상한(MAX_VIDEO_UPLOAD_MB)이 적용된 별도 인스턴스다.
 */
const heroSlideUpload = upload.heroSlide.fields([
    { name: 'slide_image', maxCount: 1 },
    { name: 'slide_poster', maxCount: 1 },
    { name: 'slide_video_webm', maxCount: 1 },
    { name: 'slide_video_mp4', maxCount: 1 },
    { name: 'slide_mobile_video_webm', maxCount: 1 },
    { name: 'slide_mobile_video_mp4', maxCount: 1 }
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
                    return res.status(413).send(`업로드 파일이 너무 큽니다. 이미지 ${upload.MAX_UPLOAD_FILE_MB}MB · 동영상 ${upload.MAX_VIDEO_UPLOAD_MB}MB 이하로 올려주세요.`);
                }
                // 폼에 있는 파일 칸이 위 fields 선언에 빠졌을 때. 원인을 안 남기면 추적이 불가능하다.
                if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                    console.error('[banners] 선언되지 않은 업로드 필드:', err.field);
                    return res.status(400).send(`허용되지 않은 업로드 항목입니다: ${err.field}`);
                }
                console.error('[banners] MulterError:', err.code, err.field || '');
                return res.status(400).send('파일 업로드 처리 중 오류가 발생했습니다.');
            }

            // fileFilter 가 MIME 을 거른 경우 — 어떤 칸이 문제인지 알려준다.
            if (err.message === 'Invalid video file type.') {
                return res.status(400).send('동영상 칸에는 동영상 파일만 올릴 수 있습니다(mp4 · webm).');
            }
            if (err.message === 'Invalid image file type.') {
                return res.status(400).send('이미지 칸에는 이미지 파일만 올릴 수 있습니다.');
            }
            console.error('[banners] 업로드 오류:', err.message);

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
// 쇼케이스 상품 고르기 — 검색(JSON) + 선택분 일괄 추가
router.get('/hero-slides/product-search', heroSlideController.getProductSearch);
router.post('/hero-slides/products', heroSlideController.postAddProducts);
// 에디토리얼 히어로 하단 흐름문구(마퀴) — site_settings 에 바로 저장(프론트 즉시 반영)
router.post('/hero-slides/marquee', heroSlideController.postMarquee);
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
