const pool = require('../config/db');
const UAParser = require('ua-parser-js');

/**
 * 모든 사용자 GET 요청에 대해 page_views 테이블에 기록하는 미들웨어.
 * 세션ID, IP, 페이지URL, Referer, 디바이스타입을 수집한다.
 * INSERT 후 res.locals._pvId를 설정하여 체류시간 비콘에서 사용한다.
 */
module.exports = async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const p = req.path;
    if (
        p.startsWith('/admin') || p.startsWith('/css') || p.startsWith('/js') ||
        p.startsWith('/images') || p.startsWith('/auth') || p.startsWith('/api') ||
        p.startsWith('/favicon') || p.startsWith('/uploads') || p.startsWith('/sitemap')
    ) {
        return next();
    }

    try {
        const ua = req.get('User-Agent') || '';
        const parser = new UAParser(ua);
        const deviceRaw = parser.getDevice().type; // 'mobile', 'tablet', or undefined
        const deviceType = deviceRaw === 'mobile' ? 'mobile'
            : deviceRaw === 'tablet' ? 'tablet'
            : 'desktop';

        const referer = req.get('Referer') || null;
        let refererHost = null;
        if (referer) {
            try { refererHost = new URL(referer).hostname; } catch (_) {}
        }

        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket.remoteAddress;
        const sessionId = req.sessionID || '';

        // URL 디코딩하여 저장 (한글 slug 매칭용)
        let pageUrl;
        try { pageUrl = decodeURIComponent(req.originalUrl); } catch (_) { pageUrl = req.originalUrl; }

        const [result] = await pool.query(
            `INSERT INTO page_views (session_id, ip_address, page_url, referer, referer_host, device_type, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sessionId, ip, pageUrl, referer, refererHost, deviceType, ua]
        );

        res.locals._pvId = result.insertId;
    } catch (err) {
        console.error('PageView log error:', err.message);
    }

    next();
};
