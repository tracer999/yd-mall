const pool = require('../../config/db');
const { transition, log } = require('../../services/order/orderStatusService');

/*
 * 배송 관리 — **일반(B2C) 주문 전용**이다.
 * 기업(B2B) 주문의 출고·송장·배송완료는 /admin/b2b/orders 상세에서 처리한다(b2bOrderService.ship).
 * 그쪽은 "입금 확인 전 출고 금지" 같은 B2B 규칙을 함께 검사한다.
 */

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
                u.kakao_id AS customer_kakao_id,
                m.name AS mall_name,
                m.code AS mall_code,
                m.is_default AS mall_is_default
            FROM orders o
            LEFT JOIN shipments s ON o.id = s.order_id
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN mall m ON o.mall_id = m.id
            WHERE o.order_type = 'B2C'
              AND o.status IN ('PAID', 'PREPARING', 'SHIPPED', 'DELIVERED')
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
    const adminId = req.session.admin ? req.session.admin.id : null;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[target]] = await conn.query('SELECT order_type FROM orders WHERE id = ?', [order_id]);
        if (!target || target.order_type === 'B2B') {
            await conn.rollback();
            return res.redirect(target ? `/admin/b2b/orders/${order_id}` : '/admin/shipping');
        }

        const [start] = await conn.query('SELECT id FROM shipments WHERE order_id = ?', [order_id]);
        if (start.length > 0) {
            await conn.query(
                `UPDATE shipments SET courier_company = ?, tracking_number = ?, status = 'IN_TRANSIT', shipped_at = NOW() WHERE order_id = ?`,
                [courier_company, tracking_number, order_id]
            );
        } else {
            await conn.query(
                `INSERT INTO shipments (order_id, courier_company, tracking_number, status, shipped_at) VALUES (?, ?, ?, 'IN_TRANSIT', NOW())`,
                [order_id, courier_company, tracking_number]
            );
        }

        // 이미 배송완료/취소된 주문은 건드리지 않는다.
        await transition(conn, Number(order_id), { status: 'SHIPPED' },
            { actorType: 'ADMIN', actorId: adminId, memo: `송장 등록 (${courier_company} ${tracking_number})` });

        await conn.commit();
        res.redirect('/admin/shipping');
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/** 배송완료 처리 — SHIPPED → DELIVERED. delivered_at 이 반품 가능 기간의 기준이 된다. */
exports.postDelivered = async (req, res) => {
    const { order_id } = req.body;
    const adminId = req.session.admin ? req.session.admin.id : null;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[target]] = await conn.query('SELECT order_type FROM orders WHERE id = ?', [order_id]);
        if (!target || target.order_type === 'B2B') {
            await conn.rollback();
            return res.redirect(target ? `/admin/b2b/orders/${order_id}` : '/admin/shipping');
        }

        await conn.query(
            "UPDATE shipments SET status = 'DELIVERED', delivered_at = NOW() WHERE order_id = ?",
            [order_id]
        );
        await transition(conn, Number(order_id), { status: 'DELIVERED' },
            { actorType: 'ADMIN', actorId: adminId, memo: '배송완료 처리' });
        await conn.commit();
        res.redirect('/admin/shipping');
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};
