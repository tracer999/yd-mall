/*
 * B2B 주문 관리 (설계 §7, §11.1).
 *
 * 목록·상세는 분리하되 주문 엔진은 공통이다 — 출고·배송·클레임은 기존 화면을 그대로 쓴다.
 * 여기서 다루는 건 B2B 고유 단계뿐이다: 승인 → 입금 확인 → 세금계산서 → 기한초과 회수.
 */

const pool = require('../../config/db');
const b2bOrderService = require('../../services/b2b/b2bOrderService');
const b2bContext = require('../../middleware/b2bContext');

const LAYOUT = 'layouts/admin_layout';
const PAGE_SIZE = 20;

/** 업무 단계 라벨 — 4축(status·payment_status·approval_status)을 사람 말로 합친다(설계 §7.2). */
function stageOf(o) {
    if (o.status === 'CANCELLED') return { key: 'CANCELLED', label: '취소/반려', tone: 'gray' };
    if (o.status === 'DELIVERED') return { key: 'DELIVERED', label: '배송완료', tone: 'green' };
    if (o.status === 'SHIPPED') return { key: 'SHIPPED', label: '출고', tone: 'green' };
    if (o.payment_status === 'PAID') return { key: 'PAID', label: '입금확인 · 준비중', tone: 'blue' };
    if (o.approval_status === 'APPROVED') return { key: 'AWAIT_DEPOSIT', label: '입금 대기', tone: 'amber' };
    if (o.approval_status === 'UNDER_REVIEW') return { key: 'UNDER_REVIEW', label: '검토 중', tone: 'blue' };
    return { key: 'REQUESTED', label: '접수', tone: 'amber' };
}

exports.getList = async (req, res, next) => {
    try {
        const stage = req.query.stage || '';
        const keyword = (req.query.q || '').trim();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);

        const where = ["o.order_type = 'B2B'"];
        const params = [];

        // 업무 단계 필터 — 화면이 조건을 조립하지 않게 서버가 매핑한다.
        const stageWhere = {
            REQUESTED: "d.approval_status = 'REQUESTED' AND o.status <> 'CANCELLED'",
            UNDER_REVIEW: "d.approval_status = 'UNDER_REVIEW' AND o.status <> 'CANCELLED'",
            AWAIT_DEPOSIT: "d.approval_status = 'APPROVED' AND o.payment_status = 'PENDING' AND o.status <> 'CANCELLED'",
            PAID: "o.payment_status = 'PAID' AND o.status IN ('PAID','PREPARING')",
            SHIPPED: "o.status IN ('SHIPPED','DELIVERED')",
            CANCELLED: "o.status = 'CANCELLED'",
        }[stage];
        if (stageWhere) where.push(stageWhere);

        if (keyword) {
            where.push('(o.order_number LIKE ? OR bp.company_name LIKE ? OR d.purchase_order_number LIKE ?)');
            const like = `%${keyword}%`;
            params.push(like, like, like);
        }

        const [rows] = await pool.query(
            `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_amount,
                    o.supply_amount, o.vat_amount, o.created_at,
                    d.approval_status, d.payment_due_at, d.purchase_order_number,
                    d.tax_invoice_status, d.requested_delivery_date,
                    bp.company_name
               FROM orders o
               JOIN b2b_order_detail d ON d.order_id = o.id
               JOIN business_profile bp ON bp.id = d.business_profile_id
              WHERE ${where.join(' AND ')}
              ORDER BY o.created_at DESC
              LIMIT ? OFFSET ?`,
            [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
        );
        const [[cnt]] = await pool.query(
            `SELECT COUNT(*) AS total FROM orders o
               JOIN b2b_order_detail d ON d.order_id = o.id
               JOIN business_profile bp ON bp.id = d.business_profile_id
              WHERE ${where.join(' AND ')}`,
            params
        );

        // 단계별 건수 (탭 뱃지)
        const [stageCounts] = await pool.query(
            `SELECT
                SUM(d.approval_status = 'REQUESTED' AND o.status <> 'CANCELLED') AS REQUESTED,
                SUM(d.approval_status = 'UNDER_REVIEW' AND o.status <> 'CANCELLED') AS UNDER_REVIEW,
                SUM(d.approval_status = 'APPROVED' AND o.payment_status = 'PENDING' AND o.status <> 'CANCELLED') AS AWAIT_DEPOSIT,
                SUM(o.payment_status = 'PAID' AND o.status IN ('PAID','PREPARING')) AS PAID
               FROM orders o JOIN b2b_order_detail d ON d.order_id = o.id
              WHERE o.order_type = 'B2B'`
        );

        const overdue = await b2bOrderService.listOverdue();

        res.render('admin/b2b/orders', {
            layout: LAYOUT,
            title: 'B2B 주문',
            subtitle: '기업 주문은 접수 → 승인 → 입금 확인 순으로 진행됩니다. 승인 시점에 재고가 차감됩니다.',
            rows: rows.map((r) => ({ ...r, stage: stageOf(r) })),
            total: cnt ? cnt.total : 0,
            page,
            pageSize: PAGE_SIZE,
            stage,
            keyword,
            stageCounts: stageCounts[0] || {},
            overdue,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const order = await b2bOrderService.findOrder(req.params.id);
        if (!order) return res.status(404).send('주문을 찾을 수 없습니다.');

        const [items] = await pool.query(
            `SELECT product_id, product_name, option_snapshot, product_price, quantity, total_price,
                    supply_price, vat_price, price_source, list_price
               FROM order_items WHERE order_id = ?`,
            [req.params.id]
        );

        res.render('admin/b2b/order_detail', {
            layout: LAYOUT,
            title: 'B2B 주문 상세',
            subtitle: `${order.order_number} · ${order.company_name}`,
            order,
            items,
            stage: stageOf(order),
            settings: b2bContext.getSettings(),
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

/** 승인·검토·입금확인·반려를 한 엔드포인트로 받는다. 실제 판정은 서비스가 한다. */
exports.postAction = async (req, res, next) => {
    const { id } = req.params;
    const { action, reason, deposit_name } = req.body;
    const adminId = req.session.admin ? req.session.admin.id : null;

    try {
        let result;
        switch (action) {
            case 'review': result = await b2bOrderService.markUnderReview(id); break;
            case 'approve': result = await b2bOrderService.approve(id, { adminId }); break;
            case 'deposit': result = await b2bOrderService.confirmDeposit(id, { adminId, depositName: (deposit_name || '').trim() || null }); break;
            case 'reject': result = await b2bOrderService.cancel(id, { reason: (reason || '').trim() || '판매자 반려', adminId }); break;
            default: result = { ok: false, error: '알 수 없는 작업입니다.' };
        }
        if (!result.ok) {
            return res.redirect(`/admin/b2b/orders/${id}?error=${encodeURIComponent(result.error)}`);
        }
        const label = { review: '검토 중으로 변경', approve: '승인(재고 차감)', deposit: '입금 확인', reject: '반려' }[action];
        return res.redirect(`/admin/b2b/orders/${id}?message=${encodeURIComponent(label + ' 처리했습니다.')}`);
    } catch (err) {
        next(err);
    }
};

exports.postTaxInvoice = async (req, res, next) => {
    const { id } = req.params;
    try {
        const r = await b2bOrderService.updateTaxInvoice(id, {
            status: req.body.tax_invoice_status,
            invoiceNo: (req.body.tax_invoice_no || '').trim() || null,
        });
        if (!r.ok) return res.redirect(`/admin/b2b/orders/${id}?error=${encodeURIComponent(r.error)}`);
        return res.redirect(`/admin/b2b/orders/${id}?message=${encodeURIComponent('세금계산서 상태를 저장했습니다.')}`);
    } catch (err) {
        next(err);
    }
};

/**
 * 기한초과 주문 일괄 취소 + 재고 회수.
 *
 * 스케줄러가 없으므로 관리자가 화면에서 회수한다(설계 §7.3). 이걸 하지 않으면
 * 미입금 주문이 재고를 영구 점유한다.
 */
exports.postCancelOverdue = async (req, res, next) => {
    try {
        const ids = [].concat(req.body.order_ids || []);
        const adminId = req.session.admin ? req.session.admin.id : null;
        const r = await b2bOrderService.cancelOverdue(ids, { adminId });
        const msg = `${r.cancelled}건 취소·재고 회수 완료`
            + (r.failed.length ? ` (실패 ${r.failed.length}건)` : '');
        return res.redirect('/admin/b2b/orders?message=' + encodeURIComponent(msg));
    } catch (err) {
        next(err);
    }
};
