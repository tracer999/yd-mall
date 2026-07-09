const pool = require('../config/db');

module.exports = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM site_settings WHERE id = 1');
        res.locals.siteSettings = rows[0] || {
            company_name: '와이디몰',
            brand_main_color: '#76A764',
            brand_dark_color: '#5A824B',
            brand_light_color: '#F0F7EE',
            ga4_measurement_id: null
        };
        const [categories] = await pool.query('SELECT id, name FROM categories ORDER BY display_order ASC');
        res.locals.categories = categories || [];
        next();
    } catch (err) {
        console.error('Site Settings Middleware Error:', err);
        res.locals.siteSettings = {
            company_name: '와이디몰',
            brand_main_color: '#76A764',
            brand_dark_color: '#5A824B',
            brand_light_color: '#F0F7EE',
            ga4_measurement_id: null
        };
        res.locals.categories = [];
        next();
    }
};
