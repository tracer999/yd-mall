const pool = require('../../config/db');

exports.getList = async (req, res) => {
    try {
        const statusFilter = req.query.status || '';
        let whereClause = '';
        const params = [];
        if (statusFilter && ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(statusFilter)) {
            whereClause = 'WHERE o.status = ?';
            params.push(statusFilter);
        }
        const [orders] = await pool.query(`
            SELECT 
                o.*, 
                u.name AS customer_name, 
                u.email AS customer_email,
                u.picture AS customer_picture,
                u.google_id AS customer_google_id,
                u.kakao_id AS customer_kakao_id
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            ${whereClause}
            ORDER BY o.created_at DESC
        `, params);
        res.render('admin/sales/list', {
            layout: 'layouts/admin_layout',
            title: '판매 관리',
            orders,
            statusFilter
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const { id } = req.params;
    try {
        const [orders] = await pool.query(`
            SELECT 
                o.*, 
                u.name AS customer_name, 
                u.email AS customer_email,
                u.picture AS customer_picture,
                u.google_id AS customer_google_id,
                u.kakao_id AS customer_kakao_id
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            WHERE o.id = ?
        `, [id]);

        if (orders.length === 0) {
            return res.redirect('/admin/sales');
        }

        const order = orders[0];
        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
        const [shipment] = await pool.query('SELECT * FROM shipments WHERE order_id = ?', [id]);

        let usedCoupon = null;
        if (order.user_coupon_id) {
            const [couponRows] = await pool.query(`
                SELECT c.name AS coupon_name, c.code AS coupon_code, c.discount_amount
                FROM user_coupons uc
                JOIN coupons c ON uc.coupon_id = c.id
                WHERE uc.id = ?
            `, [order.user_coupon_id]);
            if (couponRows.length > 0) {
                usedCoupon = couponRows[0];
            }
        }

        res.render('admin/sales/detail', {
            layout: 'layouts/admin_layout',
            title: '주문 상세',
            order,
            items,
            shipment: shipment[0] || null,
            usedCoupon
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postStatus = async (req, res) => {
    const { id, status } = req.body;
    try {
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        res.redirect(`/admin/sales/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
