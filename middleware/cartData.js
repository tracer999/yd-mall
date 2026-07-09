const pool = require('../config/db');

module.exports = async (req, res, next) => {
    if (!req.user) {
        res.locals.cartCount = 0;
        return next();
    }

    try {
        const [rows] = await pool.query(
            'SELECT COALESCE(SUM(quantity), 0) AS count FROM carts WHERE user_id = ?',
            [req.user.id]
        );
        res.locals.cartCount = rows[0] && rows[0].count ? rows[0].count : 0;
        next();
    } catch (err) {
        console.error('Cart Middleware Error:', err);
        res.locals.cartCount = 0;
        next();
    }
};
