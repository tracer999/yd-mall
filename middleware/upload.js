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

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'public/uploads/products';
        if (file.fieldname === 'banner_image' || file.fieldname === 'mobile_banner_image') {
            uploadPath = 'public/uploads/banners';
        } else if (file.fieldname === 'logo') {
            uploadPath = 'public/uploads/logo';
        } else if (file.fieldname === 'logo_image') {
            uploadPath = 'public/uploads/brands';
        } else if (file.fieldname === 'kakao_share_image') {
            uploadPath = 'public/uploads/og';
        } else if (file.fieldname === 'favicon') {
            uploadPath = 'public/uploads/favicon';
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
    'file'
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
