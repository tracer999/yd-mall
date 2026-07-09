const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');

// TinyMCE 이미지 업로드 처리
router.post('/tinymce', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
        }

        // multer 가 public/ 이하에 저장하므로, 클라이언트에는 /uploads/... 경로로 노출
        const filePath = req.file.path.replace(/^public/, '');

        return res.json({ location: filePath });
    } catch (err) {
        console.error('TinyMCE 업로드 오류:', err);
        return res.status(500).json({ error: '업로드 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
