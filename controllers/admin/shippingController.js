const pool = require('../../config/db');
const { transition, log } = require('../../services/order/orderStatusService');
const orderMailer = require('../../services/email/orderMailer');
const csv = require('../../services/export/csv');
const couriers = require('../../services/shipping/couriers');
const { markDelivered } = require('../../services/shipping/deliveryService');

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
            orders,
            couriers: couriers.COURIERS,
            trackingUrl: couriers.trackingUrl,
            flash: req.query.done ? decodeURIComponent(req.query.done) : null,
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

        // 출고 안내 메일 — 실패해도 송장 등록을 되돌리지 않는다.
        orderMailer.notifyOrderShipped(Number(order_id))
            .catch((e) => console.error('[mail] 출고 안내 실패 (order ' + order_id + '):', e.message));

        res.redirect('/admin/shipping');
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/* ------------------------------------------------------------------
 * 송장 일괄 등록 (CSV)
 *
 * 하루 서른 건만 넘어도 한 건씩 손으로 넣는 것은 불가능하다. 택배사에서 받은 접수 결과를
 * 엑셀에서 정리해 "CSV UTF-8" 로 저장한 뒤 통째로 올린다.
 * 실패한 줄은 조용히 버리지 않고 **몇 번째 줄이 왜 실패했는지** 그대로 돌려준다.
 * ------------------------------------------------------------------ */

/** 업로드 양식 내려받기 — 미발송 주문이 이미 채워진 채로 나온다(주문번호를 옮겨 적지 않게). */
exports.getInvoiceTemplate = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT o.order_number, o.receiver_name, o.receiver_phone,
                   CONCAT(IFNULL(o.receiver_address, ''), ' ', IFNULL(o.receiver_detailed_address, '')) AS addr,
                   s.courier_company, s.tracking_number
            FROM orders o
            LEFT JOIN shipments s ON s.order_id = o.id
            WHERE o.order_type = 'B2C' AND o.status IN ('PAID', 'PREPARING')
            ORDER BY o.created_at ASC
        `);
        csv.sendCsv(res, `송장등록양식_${new Date().toISOString().slice(0, 10)}.csv`, rows, [
            { label: '주문번호', key: 'order_number' },
            { label: '택배사', value: (r) => r.courier_company || '' },
            { label: '송장번호', value: (r) => r.tracking_number || '' },
            { label: '받는분(참고용)', key: 'receiver_name' },
            { label: '연락처(참고용)', key: 'receiver_phone' },
            { label: '주소(참고용)', value: (r) => String(r.addr || '').trim() },
        ]);
    } catch (err) {
        console.error('[shipping] template:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 업로드 화면 */
exports.getBulkInvoice = (req, res) => {
    res.render('admin/shipping/bulk', {
        layout: 'layouts/admin_layout',
        title: '송장 일괄 등록',
        couriers: couriers.COURIERS,
        result: null,
    });
};

exports.postBulkInvoice = async (req, res) => {
    const adminId = req.session.admin ? req.session.admin.id : null;
    const render = (result) => res.render('admin/shipping/bulk', {
        layout: 'layouts/admin_layout', title: '송장 일괄 등록', couriers: couriers.COURIERS, result,
    });

    if (!req.file) return render({ error: 'CSV 파일을 선택하세요.' });

    let rows;
    try {
        rows = csv.parseCsv(req.file.buffer.toString('utf8'));
    } catch (e) {
        return render({ error: '파일을 읽지 못했습니다. 엑셀에서 [다른 이름으로 저장] → **CSV UTF-8** 로 저장한 파일인지 확인하세요.' });
    }
    if (rows.length < 2) return render({ error: '내용이 없습니다. 첫 줄은 제목 줄이고, 둘째 줄부터 자료가 있어야 합니다.' });

    const idx = csv.mapHeader(rows[0], {
        orderNumber: ['주문번호', 'order_number', '주문 번호'],
        courier: ['택배사', 'courier', '택배사명'],
        tracking: ['송장번호', 'tracking_number', '운송장번호', '운송장 번호'],
    });
    if (idx.orderNumber < 0 || idx.courier < 0 || idx.tracking < 0) {
        return render({ error: '제목 줄에 <b>주문번호 · 택배사 · 송장번호</b> 가 모두 있어야 합니다. [양식 내려받기]로 받은 파일을 쓰면 확실합니다.' });
    }

    const ok = [];
    const failed = [];
    const mailTargets = [];
    const conn = await pool.getConnection();
    try {
        for (let i = 1; i < rows.length; i++) {
            const lineNo = i + 1;                       // 사람이 보는 줄 번호(제목 줄 포함)
            const orderNumber = csv.pick(rows[i], idx.orderNumber);
            const courierRaw = csv.pick(rows[i], idx.courier);
            const tracking = csv.pick(rows[i], idx.tracking).replace(/[\s-]/g, '');

            if (!orderNumber && !courierRaw && !tracking) continue;   // 빈 줄
            if (!orderNumber) { failed.push({ lineNo, orderNumber, reason: '주문번호가 비어 있습니다' }); continue; }
            if (!tracking) { failed.push({ lineNo, orderNumber, reason: '송장번호가 비어 있습니다' }); continue; }

            const courier = couriers.normalize(courierRaw);
            if (!courier) {
                failed.push({ lineNo, orderNumber, reason: `택배사 '${courierRaw || '(빈칸)'}' 를 알 수 없습니다 — 아래 목록의 이름으로 적어 주세요` });
                continue;
            }

            const [[order]] = await conn.query(
                'SELECT id, order_type, status FROM orders WHERE order_number = ?', [orderNumber]);
            if (!order) { failed.push({ lineNo, orderNumber, reason: '그런 주문번호가 없습니다' }); continue; }
            if (order.order_type === 'B2B') { failed.push({ lineNo, orderNumber, reason: '기업(B2B) 주문입니다 — 기업 주문 화면에서 처리하세요' }); continue; }
            if (['CANCELLED', 'REFUNDED'].includes(order.status)) { failed.push({ lineNo, orderNumber, reason: `이미 ${order.status === 'CANCELLED' ? '취소' : '환불'}된 주문입니다` }); continue; }
            if (order.status === 'PENDING') { failed.push({ lineNo, orderNumber, reason: '아직 결제가 완료되지 않은 주문입니다' }); continue; }

            // 한 줄씩 독립 트랜잭션 — 900번째 줄에서 실패해도 앞의 899건은 살린다.
            try {
                await conn.beginTransaction();
                const [[existing]] = await conn.query('SELECT id FROM shipments WHERE order_id = ?', [order.id]);
                if (existing) {
                    await conn.query(
                        `UPDATE shipments SET courier_company = ?, tracking_number = ?, status = 'IN_TRANSIT', shipped_at = NOW() WHERE order_id = ?`,
                        [courier, tracking, order.id]);
                } else {
                    await conn.query(
                        `INSERT INTO shipments (order_id, courier_company, tracking_number, status, shipped_at) VALUES (?, ?, ?, 'IN_TRANSIT', NOW())`,
                        [order.id, courier, tracking]);
                }
                await transition(conn, order.id, { status: 'SHIPPED' },
                    { actorType: 'ADMIN', actorId: adminId, memo: `송장 일괄 등록 (${courier} ${tracking})` });
                await conn.commit();
                ok.push({ lineNo, orderNumber, courier, tracking });
                mailTargets.push(order.id);
            } catch (e) {
                await conn.rollback();
                failed.push({ lineNo, orderNumber, reason: '저장 중 오류: ' + e.message });
            }
        }
    } finally {
        conn.release();
    }

    // 출고 안내 메일은 커밋된 건에 대해서만, 등록 결과와 무관하게 뒤에서 보낸다.
    for (const orderId of mailTargets) {
        orderMailer.notifyOrderShipped(orderId)
            .catch((e) => console.error('[mail] 출고 안내 실패 (order ' + orderId + '):', e.message));
    }

    render({ ok, failed, total: ok.length + failed.length });
};

/** 배송완료 처리 — SHIPPED → DELIVERED. delivered_at 이 반품 가능 기간의 기준이 된다. */
exports.postDelivered = async (req, res) => {
    const { order_id } = req.body;
    const adminId = req.session.admin ? req.session.admin.id : null;
    const r = await markDelivered(Number(order_id), { actorType: 'ADMIN', actorId: adminId, memo: '배송완료 처리' });
    if (!r.ok && r.reason === '기업주문') return res.redirect(`/admin/b2b/orders/${order_id}`);
    res.redirect('/admin/shipping' + (r.ok ? '' : '?done=' + encodeURIComponent(`처리하지 못했습니다 — ${r.reason}`)));
};

/**
 * 배송완료 일괄 처리 — 목록에서 체크한 주문을 한 번에 DELIVERED 로 넘긴다.
 * 택배사 API 없이도 "배송중으로 영원히 남아 구매확정·정산이 멈추는" 상황을 막는 손잡이다.
 * (기간이 지나면 자동으로 넘기는 것은 services/scheduler 의 autoDeliver 잡이 맡는다)
 */
exports.postBulkDelivered = async (req, res) => {
    const adminId = req.session.admin ? req.session.admin.id : null;
    const raw = req.body.order_ids;
    const ids = (Array.isArray(raw) ? raw : [raw])
        .map((v) => Number.parseInt(v, 10))
        .filter((v) => Number.isFinite(v));
    if (!ids.length) return res.redirect('/admin/shipping?done=' + encodeURIComponent('선택된 주문이 없습니다.'));

    let done = 0;
    const skipped = [];
    for (const orderId of ids) {
        const r = await markDelivered(orderId, { actorType: 'ADMIN', actorId: adminId, memo: '배송완료 일괄 처리' });
        if (r.ok) done++; else skipped.push(`${r.orderNumber || orderId}(${r.reason})`);
    }
    const msg = skipped.length
        ? `${done}건 배송완료 처리. ${skipped.length}건 건너뜀 — ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ' 외' : ''}`
        : `${done}건 배송완료 처리했습니다.`;
    res.redirect('/admin/shipping?done=' + encodeURIComponent(msg));
};
