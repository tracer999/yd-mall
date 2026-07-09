const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const mainController = require('../controllers/mainController');
const productController = require('../controllers/productController');

// 카카오톡 문의 클릭 추적 API
router.post('/api/kakao-click', express.json(), async (req, res) => {
    const { productId } = req.body;
    if (!productId) return res.status(400).end();
    try {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket.remoteAddress;
        const userId = req.user ? req.user.id : null;
        await pool.query(
            'INSERT INTO kakao_click_logs (product_id, user_id, ip_address) VALUES (?, ?, ?)',
            [productId, userId, ip]
        );
    } catch (_) {}
    res.status(204).end();
});

// 카카오톡 문의 경로별 클릭 추적 API
router.post('/api/kakao-inquiry', express.json(), async (req, res) => {
    const { source, sourceLabel, productId } = req.body;
    if (!source) return res.status(400).end();
    try {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket.remoteAddress;
        const userId = req.user ? req.user.id : null;
        const ua = req.get('User-Agent') || null;
        await pool.query(
            'INSERT INTO kakao_inquiry_logs (source, source_label, product_id, user_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
            [source, sourceLabel || null, productId || null, userId, ip, ua]
        );
    } catch (_) {}
    res.status(204).end();
});

// 체류시간 비콘 API
router.post('/api/pv-duration', express.json(), async (req, res) => {
    const { pvId, duration } = req.body;
    if (!pvId || !duration || duration < 0 || duration > 3600) {
        return res.status(400).end();
    }
    try {
        await pool.query(
            'UPDATE page_views SET duration = ? WHERE id = ? AND session_id = ?',
            [Math.round(duration), pvId, req.sessionID || '']
        );
    } catch (_) {}
    res.status(204).end();
});

router.get('/', mainController.getHome);
router.get('/api/main/category-products', mainController.getCategoryProducts);
router.get('/search', productController.searchPage);
router.get('/design-guide/user', (req, res) => {
	res.render('user/design_guide', {
		title: '사용자 디자인 가이드 예시',
		currentUser: req.user
	});
});
router.use('/', require('./terms'));

router.use('/products', require('./products'));
router.use('/brands', require('./brands'));
router.use('/notices', require('./notices'));
router.use('/inquiries', require('./inquiries'));

module.exports = router;
