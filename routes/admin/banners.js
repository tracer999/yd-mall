const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/admin/bannerController');
const upload = require('../../middleware/upload');

const bannerUpload = upload.fields([
    { name: 'banner_image', maxCount: 1 },
    { name: 'mobile_banner_image', maxCount: 1 }
]);

function handleBannerUpload(req, res, next) {
    bannerUpload(req, res, (err) => {
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
}

router.get('/', bannerController.getList);
router.get('/add', bannerController.getAdd);
router.post('/add', handleBannerUpload, bannerController.postAdd);
router.get('/edit/:id', bannerController.getEdit);
router.post('/edit/:id', handleBannerUpload, bannerController.postEdit);
router.post('/delete', bannerController.postDelete);

module.exports = router;
