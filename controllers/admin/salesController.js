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
const csv = require('../../services/export/csv');
const settlement = require('../../services/order/settlementService');

const ORDER_STATUS_KEYS = ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

/*
 * 목록·내려받기가 **같은 조건**을 보게 하는 단일 지점.
 * 화면에서 걸러 놓고 내려받기를 눌렀는데 전건이 떨어지면 정산이 틀어지므로 조건을 공유한다.
 */
function buildOrderFilter(req) {
    const statusFilter = ORDER_STATUS_KEYS.includes(req.query.status) ? req.query.status : '';
    // 주문은 몰별로 "관리"하지 않고 통합 조회한다. 몰 필터(?mallId=<id>)는 조회 편의일 뿐이고
    // 기본은 전 몰 통합이다. 소속 몰은 손님 결제 시 orders.mall_id 에 기록된다(checkoutController).
    const conditions = ["o.order_type = 'B2C'"];
    const params = [];
    if (statusFilter) {
        conditions.push('o.status = ?');
        params.push(statusFilter);
    }
    const filterMallId = Number.parseInt(req.query.mallId, 10);
    const hasMallFilter = Number.isFinite(filterMallId);
    if (hasMallFilter) {
        conditions.push('o.mall_id = ?');
        params.push(filterMallId);
    }
    /*
     * 전화 문의 대응용 검색. 고객이 대는 단서는 대개 셋 중 하나다 —
     * 주문번호, 자기 이름(주문자), 받는 사람 이름. 전화 뒷자리로 찾는 경우도 흔해 연락처도 넣는다.
     * 어느 칸에 무엇을 넣어야 하는지 고르게 하지 않고 한 칸에서 전부 훑는다.
     */
    const keyword = String(req.query.q || '').trim();
    if (keyword) {
        const like = `%${keyword}%`;
        conditions.push(`(
            o.order_number LIKE ?
            OR o.buyer_name LIKE ?
            OR o.receiver_name LIKE ?
            OR o.buyer_phone LIKE ?
            OR o.receiver_phone LIKE ?
            OR o.buyer_email LIKE ?
            OR u.name LIKE ?
            OR u.email LIKE ?
        )`);
        params.push(like, like, like, like, like, like, like, like);
    }
    // 기간 — 정산은 늘 "몇 월분"이라 시작·끝 날짜가 필요하다.
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { conditions.push('o.created_at >= ?'); params.push(`${from} 00:00:00`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { conditions.push('o.created_at <= ?'); params.push(`${to} 23:59:59`); }

    const qsParts = [];
    if (statusFilter) qsParts.push('status=' + encodeURIComponent(statusFilter));
    if (hasMallFilter) qsParts.push('mallId=' + filterMallId);
    if (keyword) qsParts.push('q=' + encodeURIComponent(keyword));
    if (from) qsParts.push('from=' + encodeURIComponent(from));
    if (to) qsParts.push('to=' + encodeURIComponent(to));

    return {
        whereClause: `WHERE ${conditions.join(' AND ')}`,
        params,
        statusFilter,
        keyword,
        from,
        to,
        filterMallId: hasMallFilter ? filterMallId : null,
        exportQuery: qsParts.join('&'),
    };
}

exports.getList = async (req, res) => {
    try {
        const f = buildOrderFilter(req);
        const { whereClause, params, statusFilter, keyword } = f;
        const hasMallFilter = f.filterMallId !== null;
        const filterMallId = f.filterMallId;
        const malls = [...(await getMalls()).byId.values()];

        // 주문은 계속 쌓이기만 한다. 전건을 한 화면에 그리면 언젠가 반드시 멈추므로 나눠 싣는다.
        const PER_PAGE = 50;
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM orders o LEFT JOIN users u ON o.user_id = u.id ${whereClause}`, params);
        const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
        const currentPage = Math.min(page, totalPages);

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
            LIMIT ? OFFSET ?
        `, [...params, PER_PAGE, (currentPage - 1) * PER_PAGE]);

        res.render('admin/sales/list', {
            layout: 'layouts/admin_layout',
            title: '판매 관리',
            orders,
            statusFilter,
            keyword,
            from: f.from,
            to: f.to,
            exportQuery: f.exportQuery,
            malls,
            selectedMallId: hasMallFilter ? filterMallId : null,
            page: currentPage,
            totalPages,
            totalCount: total
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

/*
 * GET /admin/sales/export — 현재 검색·필터 조건 그대로 CSV 로 내려받는다.
 * 택배사 접수 파일 만들기 · 정산 · 회계 제출의 출발점이라, 화면에 보이는 것과 같은 집합이어야 한다.
 * 상품명은 한 줄로 요약한다(주문 1건 = 1행). 품목 단위가 필요하면 정산 리포트를 쓴다.
 */
exports.getExport = async (req, res) => {
    try {
        const { whereClause, params } = buildOrderFilter(req);
        const [rows] = await pool.query(`
            SELECT
                o.*,
                u.name AS customer_name,
                m.name AS mall_name,
                s.courier_company, s.tracking_number, s.shipped_at, s.delivered_at,
                (SELECT GROUP_CONCAT(CONCAT(oi.product_name,
                        IFNULL(CONCAT(' [', oi.option_snapshot, ']'), ''), ' x', oi.quantity)
                        ORDER BY oi.id SEPARATOR ' / ')
                   FROM order_items oi WHERE oi.order_id = o.id) AS items_summary,
                (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id) AS items_qty
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN mall m ON o.mall_id = m.id
            LEFT JOIN shipments s ON s.order_id = o.id
            ${whereClause}
            ORDER BY o.created_at DESC
        `, params);

        const STATUS = { PENDING: '대기', PAID: '결제완료', PREPARING: '배송준비', SHIPPED: '배송중', DELIVERED: '배송완료', CANCELLED: '취소', REFUNDED: '환불' };
        const PAY = { PENDING: '미결제', PAID: '결제완료', CANCELLED: '결제취소', REFUNDED: '환불완료', PARTIAL_REFUNDED: '부분환불' };
        const dt = (v) => (v ? new Date(v).toLocaleString('ko-KR', { hour12: false }) : '');

        csv.sendCsv(res, `주문내역_${new Date().toISOString().slice(0, 10)}.csv`, rows, [
            { label: '주문번호', key: 'order_number' },
            { label: '주문일시', value: (r) => dt(r.created_at) },
            { label: '몰', value: (r) => r.mall_name || '' },
            { label: '주문상태', value: (r) => STATUS[r.status] || r.status },
            { label: '결제상태', value: (r) => PAY[r.payment_status] || r.payment_status },
            { label: '주문자', value: (r) => r.buyer_name || r.customer_name || '' },
            { label: '주문자연락처', key: 'buyer_phone' },
            { label: '주문자이메일', key: 'buyer_email' },
            { label: '받는분', key: 'receiver_name' },
            { label: '받는분연락처', key: 'receiver_phone' },
            { label: '우편번호', key: 'receiver_zipcode' },
            { label: '주소', value: (r) => [r.receiver_address, r.receiver_detailed_address].filter(Boolean).join(' ') || r.shipping_address || '' },
            { label: '배송메시지', key: 'shipping_message' },
            { label: '상품', key: 'items_summary' },
            { label: '총수량', key: 'items_qty' },
            { label: '상품금액', key: 'subtotal_amount' },
            { label: '배송비', key: 'shipping_fee' },
            { label: '배송비할인', key: 'shipping_discount' },
            { label: '쿠폰할인', key: 'coupon_discount' },
            { label: '등급할인', key: 'grade_discount' },
            { label: '포인트사용', key: 'point_used' },
            { label: '결제금액', key: 'total_amount' },
            { label: '결제수단', key: 'payment_method' },
            { label: '결제일시', value: (r) => dt(r.paid_at) },
            { label: '택배사', key: 'courier_company' },
            { label: '송장번호', key: 'tracking_number' },
            { label: '발송일시', value: (r) => dt(r.shipped_at) },
            { label: '배송완료일시', value: (r) => dt(r.delivered_at) },
        ]);
    } catch (err) {
        console.error('[sales] export:', err.message);
        res.status(500).send('Server Error');
    }
};

/*
 * GET /admin/sales/:id/invoice — 주문서 · 거래명세서 인쇄
 *
 * `?type=statement` 이면 거래명세서(공급자·공급받는자·공급가액/세액), 기본은 주문서(거래명세 없이 배송 중심).
 * 발행처 정보는 그 주문이 속한 몰의 사이트 설정에서 가져온다 — 운영자가 같은 내용을 두 번 적지 않는다.
 * 별도 라이브러리 없이 브라우저 인쇄(Ctrl+P → PDF 저장)로 마무리한다.
 */
exports.getInvoice = async (req, res) => {
    const { id } = req.params;
    try {
        const [[order]] = await pool.query(`
            SELECT o.*, u.name AS customer_name, m.name AS mall_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN mall m ON o.mall_id = m.id
            WHERE o.id = ?
        `, [id]);
        if (!order) return res.redirect('/admin/sales');

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
        const [[shipment]] = await pool.query('SELECT * FROM shipments WHERE order_id = ?', [id]);

        // 그 주문의 몰 설정 → 없으면 기본몰 설정으로 폴백(새 몰은 아직 자기 설정이 없을 수 있다).
        const [[settings]] = await pool.query(`
            SELECT s.* FROM site_settings s
            WHERE s.mall_id = ? OR s.mall_id = (SELECT id FROM mall WHERE is_default = 1)
            ORDER BY (s.mall_id = ?) DESC LIMIT 1
        `, [order.mall_id, order.mall_id]);

        const type = req.query.type === 'statement' ? 'statement' : 'order';
        res.render('admin/sales/invoice', {
            layout: false,           // 인쇄 전용 — 관리자 레이아웃(사이드바)을 태우지 않는다
            order, items, shipment: shipment || null,
            settings: settings || {},
            type,
        });
    } catch (err) {
        console.error('[sales] invoice:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ------------------------------------------------------------------
 * 정산 · 매출 리포트 (2-7)
 *
 * "이번 달 얼마 팔았고 얼마 돌려줬나" 를 한 화면에서 본다.
 * 집계 규칙(무엇을 매출로 보는지, 환불을 왜 따로 빼는지)은 settlementService 주석 참고.
 * ------------------------------------------------------------------ */
exports.getSettlement = async (req, res) => {
    try {
        const def = settlement.defaultRange();
        const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : def.from;
        const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : def.to;
        const mallId = Number.parseInt(req.query.mallId, 10);
        const orderType = ['B2C', 'B2B'].includes(req.query.orderType) ? req.query.orderType : '';
        const scope = { from, to, mallId: Number.isFinite(mallId) ? mallId : null, orderType };

        const [summary, daily, byProduct, byPayment] = await Promise.all([
            settlement.getSummary(scope),
            settlement.getDaily(scope),
            settlement.getByProduct(scope),
            settlement.getByPaymentMethod(scope),
        ]);

        const malls = [...(await getMalls()).byId.values()];
        const qsParts = [`from=${from}`, `to=${to}`];
        if (Number.isFinite(mallId)) qsParts.push('mallId=' + mallId);
        if (orderType) qsParts.push('orderType=' + orderType);

        res.render('admin/sales/settlement', {
            layout: 'layouts/admin_layout',
            title: '정산 · 매출 리포트',
            from, to, malls,
            selectedMallId: Number.isFinite(mallId) ? mallId : null,
            orderType,
            summary, daily, byProduct, byPayment,
            exportQuery: qsParts.join('&'),
        });
    } catch (err) {
        console.error('[sales] settlement:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 정산 리포트 내려받기 — 일자별 표를 그대로 CSV 로. */
exports.getSettlementExport = async (req, res) => {
    try {
        const def = settlement.defaultRange();
        const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : def.from;
        const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : def.to;
        const mallId = Number.parseInt(req.query.mallId, 10);
        const orderType = ['B2C', 'B2B'].includes(req.query.orderType) ? req.query.orderType : '';
        const scope = { from, to, mallId: Number.isFinite(mallId) ? mallId : null, orderType };

        const daily = await settlement.getDaily(scope);
        const d = (v) => (v ? new Date(v).toLocaleDateString('ko-KR') : '');
        csv.sendCsv(res, `정산_${from}_${to}.csv`, daily, [
            { label: '일자', value: (r) => d(r.day) },
            { label: '주문건수', key: 'orderCount' },
            { label: '매출', key: 'gross' },
            { label: '환불', key: 'refund' },
            { label: '순매출', key: 'net' },
        ]);
    } catch (err) {
        console.error('[sales] settlement export:', err.message);
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
