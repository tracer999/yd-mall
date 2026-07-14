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
]);

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'video_file') {
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

upload.MAX_UPLOAD_FILE_MB = MAX_UPLOAD_FILE_MB;
module.exports = upload;
