const pool = require('../../config/db');

exports.getList = async (req, res) => {
    try {
        // Fetch orders that need shipping or are shipped
        const [orders] = await pool.query(`
            SELECT 
                o.*, 
                s.tracking_number, 
                s.courier_company, 
                s.status AS shipping_status,
                u.name AS customer_name,
                u.email AS customer_email,
                u.picture AS customer_picture,
                u.google_id AS customer_google_id,
                u.kakao_id AS customer_kakao_id
            FROM orders o 
            LEFT JOIN shipments s ON o.id = s.order_id 
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.status IN ('PAID', 'PREPARING', 'SHIPPED', 'DELIVERED')
            ORDER BY o.created_at DESC
        `);
        res.render('admin/shipping/list', {
            layout: 'layouts/admin_layout',
            title: '배송 관리',
            orders
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postTracking = async (req, res) => {
    const { order_id, courier_company, tracking_number } = req.body;
    try {
        // Check if shipment exists
        const [start] = await pool.query('SELECT id FROM shipments WHERE order_id = ?', [order_id]);

        if (start.length > 0) {
            await pool.query(`
                UPDATE shipments 
                SET courier_company = ?, tracking_number = ?, status = 'IN_TRANSIT', shipped_at = NOW() 
                WHERE order_id = ?
            `, [courier_company, tracking_number, order_id]);
        } else {
            await pool.query(`
                INSERT INTO shipments (order_id, courier_company, tracking_number, status, shipped_at) 
                VALUES (?, ?, ?, 'IN_TRANSIT', NOW())
            `, [order_id, courier_company, tracking_number]);
        }

        // Update order status to SHIPPED
        await pool.query("UPDATE orders SET status = 'SHIPPED' WHERE id = ?", [order_id]);

        res.redirect('/admin/shipping');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
