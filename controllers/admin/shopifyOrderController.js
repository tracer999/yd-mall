const pool = require('../../config/db');

exports.getList = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const { status, keyword } = req.query;

        let where = 'WHERE 1=1';
        const params = [];

        if (status) {
            where += ' AND financial_status = ?';
            params.push(status);
        }
        if (keyword) {
            where += ' AND (shopify_order_number LIKE ? OR customer_email LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM shopify_orders ${where}`, params);
        const [orders] = await pool.query(
            `SELECT * FROM shopify_orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.render('admin/shopify-orders/list', {
            layout: 'layouts/admin_layout',
            title: 'Shopify 주문 관리',
            orders,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalCount: total,
            status,
            keyword,
        });
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [[order]] = await pool.query('SELECT * FROM shopify_orders WHERE id = ?', [id]);
        if (!order) return res.redirect('/admin/shopify-orders');

        let payload = null;
        try { payload = typeof order.raw_payload === 'string' ? JSON.parse(order.raw_payload) : order.raw_payload; } catch {}

        res.render('admin/shopify-orders/detail', {
            layout: 'layouts/admin_layout',
            title: 'Shopify 주문 상세',
            order,
            payload,
        });
    } catch (err) {
        next(err);
    }
};
