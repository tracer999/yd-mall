const pool = require('../../config/db');

exports.getList = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;
        const { status, keyword, user_id } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND o.status = ?';
            params.push(status);
        }

        if (user_id) {
            whereClause += ' AND o.user_id = ?';
            params.push(user_id);
        }

        if (keyword) {
            whereClause += ' AND (o.order_number LIKE ? OR o.buyer_name LIKE ? OR o.receiver_name LIKE ?)';
            const likeKeyword = `%${keyword}%`;
            params.push(likeKeyword, likeKeyword, likeKeyword);
        }

        // 전체 주문 수 조회
        const [[{ totalCount }]] = await pool.query(`SELECT COUNT(*) as totalCount FROM orders o ${whereClause}`, params);
        const totalPages = Math.ceil(totalCount / limit);

        // 주문 목록 조회 (사용자 정보 조인)
        const [orders] = await pool.query(
            `SELECT o.*, u.email as user_email, u.name as user_name
             FROM orders o ${whereClause}
             LEFT JOIN users u ON o.user_id = u.id
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.render('admin/orders/list', {
            layout: 'layouts/admin_layout',
            orders,
            currentPage: page,
            totalPages,
            totalCount,
            status,
            keyword,
            user_id
        });
    } catch (err) {
        next(err);
    }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // 상태 변경
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

        // TODO: 필요 시 상태 변경 알림 이메일 발송 로직 추가 가능

        res.redirect('/admin/orders');
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const { id } = req.params;

        // 주문 기본 정보 조회
        const [orders] = await pool.query(
            `SELECT o.*, u.email as user_email, u.name as user_name
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.redirect('/admin/orders');
        }
        const order = orders[0];

        // 주문 상품 목록 조회
        const [items] = await pool.query(
            `SELECT oi.*, p.thumbnail_image
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [id]
        );

        // 배송 정보 조회
        const [shipments] = await pool.query('SELECT * FROM shipments WHERE order_id = ?', [id]);

        res.render('admin/orders/detail', {
            layout: 'layouts/admin_layout',
            order,
            items,
            shipment: shipments[0] || null
        });
    } catch (err) {
        next(err);
    }
};

exports.updateTracking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { courier_company, tracking_number } = req.body;

        // 배송 정보 존재 여부 확인
        const [exists] = await pool.query('SELECT id FROM shipments WHERE order_id = ?', [id]);

        if (exists.length > 0) {
            await pool.query(
                'UPDATE shipments SET courier_company = ?, tracking_number = ?, shipped_at = IFNULL(shipped_at, NOW()) WHERE order_id = ?',
                [courier_company, tracking_number, id]
            );
        } else {
            await pool.query(
                'INSERT INTO shipments (order_id, courier_company, tracking_number, status, shipped_at) VALUES (?, ?, ?, ?, NOW())',
                [id, courier_company, tracking_number, 'IN_TRANSIT']
            );
        }

        // 송장이 입력되면 주문 상태를 '배송중'으로 변경 (이미 배송완료/취소 등이 아닌 경우)
        await pool.query("UPDATE orders SET status = 'SHIPPED' WHERE id = ? AND status IN ('PAID', 'PREPARING')", [id]);

        res.redirect(`/admin/orders/${id}`);
    } catch (err) {
        next(err);
    }
};

exports.cancelOrder = async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { cancel_reason } = req.body;

        // 주문 상태 확인 (Lock)
        const [[order]] = await connection.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [id]);
        
        if (!order) {
            await connection.rollback();
            return res.status(404).send('주문을 찾을 수 없습니다.');
        }

        if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
            await connection.rollback();
            return res.redirect(`/admin/orders/${id}`);
        }

        // 재고 복구
        const [items] = await connection.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
        for (const item of items) {
            await connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
        }

        // 주문 상태 업데이트
        await connection.query('UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?', ['CANCELLED', cancel_reason || '관리자 취소', id]);

        await connection.commit();
        res.redirect(`/admin/orders/${id}`);
    } catch (err) {
        await connection.rollback();
        next(err);
    } finally {
        connection.release();
    }
};

exports.downloadExcel = async (req, res, next) => {
    try {
        const { status, keyword, user_id } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND o.status = ?';
            params.push(status);
        }

        if (user_id) {
            whereClause += ' AND o.user_id = ?';
            params.push(user_id);
        }

        if (keyword) {
            whereClause += ' AND (o.order_number LIKE ? OR o.buyer_name LIKE ? OR o.receiver_name LIKE ?)';
            const likeKeyword = `%${keyword}%`;
            params.push(likeKeyword, likeKeyword, likeKeyword);
        }

        const [orders] = await pool.query(
            `SELECT o.*, u.email as user_email, s.courier_company, s.tracking_number
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             LEFT JOIN shipments s ON o.id = s.order_id
             ${whereClause}
             ORDER BY o.created_at DESC`,
            params
        );

        const header = [
            '주문번호', '주문일시', '상태', '결제금액',
            '주문자명', '주문자연락처', '주문자이메일',
            '수령인명', '수령인연락처', '우편번호', '주소', '상세주소', '배송메모',
            '택배사', '송장번호', '취소사유'
        ];

        let csv = '\uFEFF' + header.join(',') + '\n';

        orders.forEach(o => {
            const row = [
                o.order_number, new Date(o.created_at).toLocaleString('ko-KR'), o.status, o.total_amount,
                o.buyer_name, o.buyer_phone, o.buyer_email || o.user_email,
                o.receiver_name, o.receiver_phone, o.receiver_zipcode, o.receiver_address, o.receiver_detailed_address, o.shipping_message,
                o.courier_company, o.tracking_number, o.cancel_reason
            ];

            csv += row.map(field => {
                if (field === null || field === undefined) return '';
                const str = String(field);
                return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=orders_' + new Date().toISOString().slice(0,10) + '.csv');
        res.send(csv);
    } catch (err) {
        next(err);
    }
};

exports.bulkUpdateStatus = async (req, res, next) => {
    try {
        const { order_ids, status } = req.body;

        if (!order_ids) {
            return res.redirect('/admin/orders');
        }

        const ids = Array.isArray(order_ids) ? order_ids : [order_ids];
        await pool.query('UPDATE orders SET status = ? WHERE id IN (?)', [status, ids]);

        res.redirect('/admin/orders');
    } catch (err) {
        next(err);
    }
};