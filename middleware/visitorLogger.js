const pool = require('../config/db');

/**
 * Middleware to log visitor entry.
 * It uses a cookie 'visited_today' to prevent duplicate logging per user per day.
 * If the cookie is not present, it logs the visit to the database and sets the cookie.
 */
module.exports = async (req, res, next) => {
    // 1. Skip for admin routes, static files, or API calls if necessary
    if (req.path.startsWith('/admin') || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/images') || req.path.startsWith('/auth')) {
        return next();
    }

    try {
        // 2. Check if cookie exists
        if (!req.cookies['visited_today']) {
            const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                || req.socket.remoteAddress;
            const userAgent = req.get('User-Agent');
            const today = new Date().toISOString().split('T')[0];

            // 3. 신규/재방문 판별
            const [existing] = await pool.query(
                'SELECT 1 FROM visitor_logs WHERE ip_address = ? LIMIT 1', [ip]
            );
            const isNew = existing.length === 0 ? 1 : 0;

            // 4. Log to DB
            await pool.query(
                'INSERT INTO visitor_logs (ip_address, user_agent, visited_date, is_new) VALUES (?, ?, ?, ?)',
                [ip, userAgent, today, isNew]
            );

            // 4. Set cookie to expire at the end of the day
            const now = new Date();
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const maxAge = tomorrow - now; // Milliseconds until midnight

            res.cookie('visited_today', 'true', {
                maxAge: maxAge,
                httpOnly: true,
                // secure: process.env.NODE_ENV === 'production' // Uncomment for HTTPS
            });
        }
    } catch (err) {
        console.error('Visitor Logging Error:', err);
        // Do not block the request if logging fails
    }

    next();
};
