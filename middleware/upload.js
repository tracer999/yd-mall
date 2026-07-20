const multer = require('multer');
const path = require('path');
const fs = require('fs');

const parsedUploadLimitMb = Number(process.env.MAX_UPLOAD_FILE_MB);
const MAX_UPLOAD_FILE_MB = Number.isFinite(parsedUploadLimitMb) && parsedUploadLimitMb > 0
    ? parsedUploadLimitMb
    : 20;

// Ensure upload directory exists
const uploadDir = 'public/uploads/products';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/** 기획전 이미지 4종 — exhibition 테이블의 *_url 컬럼과 1:1 */
const EXHIBITION_IMAGE_FIELDS = new Set([
    'list_thumbnail',
    'pc_hero_image',
    'mobile_hero_image',
    'og_image',
]);

/**
 * 공동구매 이미지 3종 — group_buy 테이블의 *_url 컬럼과 1:1
 * 필드명이 기획전과 겹치면 저장 경로가 섞이므로 `gb_` 접두어를 붙였다.
 */
const GROUP_BUY_IMAGE_FIELDS = new Set([
    'gb_list_thumbnail',
    'gb_pc_hero_image',
    'gb_mobile_hero_image',
]);

/** 헤더 톱바 배너 3슬롯 — header_topbar_item.image_url 과 1:1 */
const TOPBAR_IMAGE_FIELDS = new Set([
    'topbar_banner_1',
    'topbar_banner_2',
    'topbar_banner_3',
]);

/*
 * 메인 슬라이드(hero_slide) 미디어 — hero_slide 의 *_url 컬럼과 1:1.
 *
 * 저장 위치를 `uploads/hero` 로 잡은 이유: URL 가져오기(services/media/urlIngest 의
 * dest='hero')와 **같은 폴더**에 떨어뜨려, 파일로 올렸든 URL 로 가져왔든 구분되지 않게 한다.
 *
 * ⚠️ 예전엔 slide_image 가 어느 분기에도 없어 기본값 uploads/products 에 저장되는데
 *    컨트롤러는 '/uploads/banners/' 로 URL 을 기록했다 — 올린 이미지가 전부 404 였다.
 *    이제 저장 위치와 기록 경로를 HERO_SLIDE_WEB_DIR 하나로 묶는다.
 */
const HERO_SLIDE_IMAGE_FIELDS = new Set([
    'slide_image',
    'slide_poster',
]);

const HERO_SLIDE_VIDEO_FIELDS = new Set([
    'slide_video_webm',
    'slide_video_mp4',
    'slide_mobile_video_webm',
    'slide_mobile_video_mp4',
]);

/** 히어로 미디어가 저장되는 웹 경로. 컨트롤러가 DB 에 기록할 때 그대로 쓴다. */
const HERO_SLIDE_WEB_DIR = '/uploads/hero';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'public/uploads/products';
        if (file.fieldname === 'banner_image' || file.fieldname === 'mobile_banner_image'
            || TOPBAR_IMAGE_FIELDS.has(file.fieldname)) {
            uploadPath = 'public/uploads/banners';
        } else if (file.fieldname === 'logo') {
            uploadPath = 'public/uploads/logo';
        } else if (file.fieldname === 'logo_image') {
            uploadPath = 'public/uploads/brands';
        } else if (file.fieldname === 'kakao_share_image') {
            uploadPath = 'public/uploads/og';
        } else if (file.fieldname === 'favicon') {
            uploadPath = 'public/uploads/favicon';
        } else if (EXHIBITION_IMAGE_FIELDS.has(file.fieldname)) {
            uploadPath = 'public/uploads/exhibitions';
        } else if (GROUP_BUY_IMAGE_FIELDS.has(file.fieldname)) {
            uploadPath = 'public/uploads/group-buys';
        } else if (HERO_SLIDE_IMAGE_FIELDS.has(file.fieldname)
            || HERO_SLIDE_VIDEO_FIELDS.has(file.fieldname)) {
            uploadPath = 'public/uploads/hero';
        }

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const imageOnlyFields = new Set([
    'main_image',
    'thumbnail_image',
    'sub_images',
    'banner_image',
    'mobile_banner_image',
    'logo',
    'logo_image',
    'kakao_share_image',
    'favicon',
    'file',
    ...EXHIBITION_IMAGE_FIELDS,
    ...GROUP_BUY_IMAGE_FIELDS,
    ...TOPBAR_IMAGE_FIELDS,
    ...HERO_SLIDE_IMAGE_FIELDS,
]);

/** 동영상만 받는 필드 — 이미지가 올라오면 거른다. */
const videoOnlyFields = new Set([
    'video_file',
    ...HERO_SLIDE_VIDEO_FIELDS,
]);

const fileFilter = (req, file, cb) => {
    if (videoOnlyFields.has(file.fieldname)) {
        if (file.mimetype.startsWith('video/')) {
            return cb(null, true);
        }
        return cb(new Error('Invalid video file type.'), false);
    }

    if (imageOnlyFields.has(file.fieldname)) {
        if (file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }
        return cb(new Error('Invalid image file type.'), false);
    }

    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: MAX_UPLOAD_FILE_MB * 1024 * 1024 }
});

/*
 * 동영상 전용 상한 — 이미지 기준(기본 20MB)으로는 히어로 영상이 거의 안 올라간다.
 * multer 의 limits.fileSize 는 인스턴스 단위라 필드별로 다르게 줄 수 없다. 그래서
 * 영상을 받는 폼(메인 슬라이드)만 상한이 큰 **별도 인스턴스**를 쓴다.
 *
 * ⚠️ 상한을 올릴 때는 Nginx 의 client_max_body_size(현재 100M)도 함께 봐야 한다.
 *    그보다 크게 잡으면 multer 에 닿기도 전에 Nginx 가 413 을 준다.
 */
const parsedVideoLimitMb = Number(process.env.MAX_VIDEO_UPLOAD_MB);
const MAX_VIDEO_UPLOAD_MB = Number.isFinite(parsedVideoLimitMb) && parsedVideoLimitMb > 0
    ? parsedVideoLimitMb
    : 80;

const heroSlideUploader = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: MAX_VIDEO_UPLOAD_MB * 1024 * 1024 }
});

upload.MAX_UPLOAD_FILE_MB = MAX_UPLOAD_FILE_MB;
upload.MAX_VIDEO_UPLOAD_MB = MAX_VIDEO_UPLOAD_MB;
upload.heroSlide = heroSlideUploader;
upload.HERO_SLIDE_WEB_DIR = HERO_SLIDE_WEB_DIR;
module.exports = upload;
