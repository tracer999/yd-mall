/*
 * 판매 관리 — **일반(B2C) 주문 전용 화면**이다.
 *
 * 기업(B2B) 주문은 접수 → 승인(재고 차감) → 입금 확인이라는 별도 단계를 거치고, 그 단계는
 * b2b_order_detail.approval_status 가 들고 있다. 이 화면은 그 축을 모르기 때문에 여기서
 * B2B 주문의 상태를 바꾸면 "재고를 깎지 않은 채 결제완료" 같은 어긋난 상태가 만들어진다.
 * 그래서 목록·상세·상태변경 모두 order_type='B2C' 로 잠그고, B2B 는 /admin/b2b/orders 로 보낸다.
 */

const pool = require('../../config/db');
const { restoreOrderResources } = require('../../services/order/orderCancelService');
const { refundOrder } = require('../../services/order/refundService');
const { transition, history } = require('../../services/order/orderStatusService');
const { getMalls } = require('../../middleware/mallContext');

exports.getList = async (req, res) => {
    try {
        const statusFilter = req.query.status || '';
        // 주문은 몰별로 "관리"하지 않고 통합 조회한다. 몰 필터(?mallId=<id>)는 조회 편의일 뿐이고
        // 기본은 전 몰 통합이다. 소속 몰은 손님 결제 시 orders.mall_id 에 기록된다(checkoutController).
        const conditions = ["o.order_type = 'B2C'"];
        const params = [];
        if (statusFilter && ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(statusFilter)) {
            conditions.push('o.status = ?');
            params.push(statusFilter);
        }
        const filterMallId = Number.parseInt(req.query.mallId, 10);
        const hasMallFilter = Number.isFinite(filterMallId);
        if (hasMallFilter) {
            conditions.push('o.mall_id = ?');
            params.push(filterMallId);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const malls = [...(await getMalls()).byId.values()];
        const [orders] = await pool.query(`
            SELECT
                o.*,
                u.name AS customer_name,
                u.email AS customer_email,
                u.picture AS customer_picture,
                u.google_id AS customer_google_id,
                u.kakao_id AS customer_kakao_id,
                m.name AS mall_name,
                m.code AS mall_code,
                m.is_default AS mall_is_default
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN mall m ON o.mall_id = m.id
            ${whereClause}
            ORDER BY o.created_at DESC
        `, params);
        res.render('admin/sales/list', {
            layout: 'layouts/admin_layout',
            title: '판매 관리',
            orders,
            statusFilter,
            malls,
            selectedMallId: hasMallFilter ? filterMallId : null
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
                u.kakao_id AS customer_kakao_id,
                m.name AS mall_name,
                m.code AS mall_code,
                m.is_default AS mall_is_default
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN mall m ON o.mall_id = m.id
            WHERE o.id = ?
        `, [id]);

        if (orders.length === 0) {
            return res.redirect('/admin/sales');
        }

        const order = orders[0];
        // B2B 주문은 이 화면에서 다루지 않는다 — 링크·즐겨찾기로 직접 들어와도 전용 화면으로 넘긴다.
        if (order.order_type === 'B2B') {
            return res.redirect(`/admin/b2b/orders/${order.id}`);
        }
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

        // 상태 변경 이력 + 클레임/환불 (주문/클레임 문서 §5-2)
        const logs = await history(pool, id);
        const [claims] = await pool.query('SELECT * FROM order_claims WHERE order_id = ? ORDER BY created_at DESC', [id]);
        const [refunds] = await pool.query('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC', [id]);

        res.render('admin/sales/detail', {
            layout: 'layouts/admin_layout',
            title: '주문 상세',
            order,
            items,
            shipment: shipment[0] || null,
            usedCoupon,
            shippingCoupon,
            logs,
            claims,
            refunds
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

const ORDER_STATUSES = ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const CANCEL_STATUSES = ['CANCELLED', 'REFUNDED'];

/*
 * 상태 변경. 취소·환불로 넘어갈 때는 재고·쿠폰·적립금을 함께 되돌리고(C1) PG 결제도 취소한다.
 * 복원은 멱등하다 — 클레임 승인이 이미 되돌린 주문을 여기서 또 눌러도 재고가 두 번 늘지 않는다.
 * 모든 변경은 order_status_logs 에 남는다.
 *
 * 이 화면(/admin/sales)이 운영자가 실제로 쓰는 유일한 주문 상태 변경 경로다
 * — routes/admin/orders.js 는 마운트돼 있지 않다.
 */
exports.postStatus = async (req, res) => {
    const { id, status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
        return res.redirect(`/admin/sales/${id}`);
    }
    const adminId = req.session.admin ? req.session.admin.id : null;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [[order]] = await connection.query(
            `SELECT id, user_id, status, point_used, total_amount, shipping_fee, shipping_discount, payment_key, order_type
               FROM orders WHERE id = ? FOR UPDATE`,
            [id]
        );
        if (!order) {
            await connection.rollback();
            return res.redirect('/admin/sales');
        }
        // 승인·입금 단계를 모르는 화면이 B2B 주문을 뒤집지 못하게 막는다.
        if (order.order_type === 'B2B') {
            await connection.rollback();
            return res.redirect(`/admin/b2b/orders/${order.id}`);
        }

        const becomingCancelled = CANCEL_STATUSES.includes(status) && !CANCEL_STATUSES.includes(order.status);
        let refund = null;
        if (becomingCancelled) {
            await restoreOrderResources(connection, order);
            refund = await refundOrder(connection, { order, reason: '관리자 취소' });
        }

        await transition(connection, order.id, Object.assign(
            { status },
            becomingCancelled ? {
                payment_status: refund && refund.ok ? 'REFUNDED' : 'CANCELLED',
                claim_status: 'COMPLETED',
                refund_status: refund && refund.ok ? 'COMPLETED' : (refund ? 'FAILED' : 'NONE'),
            } : {}
        ), { actorType: 'ADMIN', actorId: adminId, memo: '관리자 상태 변경' });

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
