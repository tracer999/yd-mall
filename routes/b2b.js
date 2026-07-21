const express = require('express');
const router = express.Router();
const b2bController = require('../controllers/b2bController');
const upload = require('../middleware/upload');

// 사업자 전환 신청 (이미 가입한 일반회원)
router.get('/apply', b2bController.getApply);
router.post('/apply', upload.businessLicense.single('license_file'), b2bController.postApply);

// 신청·승인 상태
router.get('/status', b2bController.getStatus);

// 구매 자격 전환 (개인 ↔ 기업)
router.post('/mode', b2bController.postMode);

module.exports = router;
