const pool = require('../../config/db');
const { restoreOrderResources } = require('../../services/order/orderCancelService');

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

        // 주문 쿠폰 1장 + 배송비 쿠폰 1장 (쿠폰 문서 §6-1)
        const loadCoupon = async (userCouponId) => {
            if (!userCouponId) return null;
            const [rows] = await pool.query(`
                SELECT c.name AS coupon_name, c.code AS coupon_code, c.discount_amount
                FROM user_coupons uc
                JOIN coupons c ON uc.coupon_id = c.id
                WHERE uc.id = ?
            `, [userCouponId]);
            return rows[0] || null;
        };
        const usedCoupon = await loadCoupon(order.user_coupon_id);
        const shippingCoupon = await loadCoupon(order.shipping_coupon_id);

        res.render('admin/sales/detail', {
            layout: 'layouts/admin_layout',
            title: '주문 상세',
            order,
            items,
            shipment: shipment[0] || null,
            usedCoupon,
            shippingCoupon
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

const ORDER_STATUSES = ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const CANCEL_STATUSES = ['CANCELLED', 'REFUNDED'];

/*
 * 상태 변경. 취소·환불로 넘어갈 때는 재고·쿠폰·적립금을 함께 되돌린다(C1).
 * 이 화면(/admin/sales)이 운영자가 실제로 쓰는 유일한 주문 취소 경로다
 * — routes/admin/orders.js 는 마운트돼 있지 않다.
 */
exports.postStatus = async (req, res) => {
    const { id, status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
        return res.redirect(`/admin/sales/${id}`);
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [[order]] = await connection.query(
            'SELECT id, user_id, status, point_used FROM orders WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!order) {
            await connection.rollback();
            return res.redirect('/admin/sales');
        }

        const becomingCancelled = CANCEL_STATUSES.includes(status) && !CANCEL_STATUSES.includes(order.status);
        if (becomingCancelled) {
            await restoreOrderResources(connection, order);
        }

        await connection.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        await connection.commit();
        res.redirect(`/admin/sales/${id}`);
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        connection.release();
    }
};
