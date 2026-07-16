const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const urlIngest = require('../../services/media/urlIngest');

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

/*
 * POST /admin/uploads/from-url  { url, dest, kind }  →  { success, path }
 *
 * 이미지/비디오 **URL 을 받아 서버가 내려받아 우리 사이트에 저장**하고 그 경로를 돌려준다.
 * 관리자 어느 폼에서든 파일 선택 대신 URL 로 올릴 수 있게 하는 공통 창구다
 * (상품·배너·히어로·브랜드 …). 저장 위치는 화이트리스트(urlIngest.DEST_DIRS)로 제한한다.
 *
 * 원본 URL 을 DB 에 그대로 넣지 않는 이유: 상대 사이트가 링크를 바꾸거나 핫링크를 막으면
 * 우리 몰 이미지가 깨진다. 내려받아 두면 직접 업로드한 것과 완전히 같아진다.
 *
 * ⚠️ SSRF 방어는 urlIngest.assertPublicUrl(사설/루프백 IP 차단 + http/https 만)에 있다.
 */
router.post('/from-url', async (req, res) => {
    try {
        const { url, dest, kind, format, maxWidth } = req.body || {};
        if (!url) return res.status(400).json({ success: false, error: 'URL 을 입력하세요.' });

        const savedPath = await urlIngest.ingestFromUrl(url, {
            kind: kind === 'video' ? 'video' : 'image',
            dest: dest || 'products',
            format: format === 'webp' ? 'webp' : undefined,   // poster 는 webp
            maxWidth: Number(maxWidth) || undefined,
        });
        return res.json({ success: true, path: savedPath });
    } catch (err) {
        const status = err.statusCode || 500;
        if (status >= 500) console.error('[uploads] from-url:', err.message);
        return res.status(status).json({ success: false, error: err.message || '가져오지 못했습니다.' });
    }
});

module.exports = router;
