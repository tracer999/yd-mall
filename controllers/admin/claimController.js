/*
 * 관리자 클레임 관리 (주문/클레임 문서 §5-2, O11)
 *
 * 화면은 하나다(레퍼런스 §5). 유형(취소·반품)으로 구분하고, 승인 시 귀책·반품배송비를 확정한다.
 * 승인 로직은 claimService 가 소유한다 — 복원·환불·상태 전이를 한 트랜잭션에서 한다.
 */

const pool = require('../../config/db');
const claimService = require('../../services/order/claimService');
const { markRefundManual } = require('../../services/order/refundService');

const CLAIM_STATUS = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'WITHDRAWN'];

exports.getList = async (req, res, next) => {
    try {
        const { status, claim_type } = req.query;
        const where = ['1=1'];
        const params = [];
        if (CLAIM_STATUS.includes(status)) { where.push('c.status = ?'); params.push(status); }
        if (['CANCEL', 'RETURN', 'EXCHANGE'].includes(claim_type)) { where.push('c.claim_type = ?'); params.push(claim_type); }

        const [claims] = await pool.query(
            `SELECT c.*, o.order_number, o.total_amount, o.status AS order_status,
                    u.name AS customer_name, u.email AS customer_email
               FROM order_claims c
               JOIN orders o ON o.id = c.order_id
               LEFT JOIN users u ON u.id = o.user_id
              WHERE ${where.join(' AND ')}
              ORDER BY c.status = 'REQUESTED' DESC, c.created_at DESC
              LIMIT 500`,
            params
        );

        res.render('admin/claims/list', {
            layout: 'layouts/admin_layout',
            title: '클레임 관리',
            claims,
            filters: { status: status || '', claim_type: claim_type || '' },
        });
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const [[claim]] = await pool.query(
            `SELECT c.*, o.order_number, o.total_amount, o.subtotal_amount, o.shipping_fee, o.shipping_discount,
                    o.status AS order_status, o.payment_key, o.point_used,
                    u.name AS customer_name, u.email AS customer_email
               FROM order_claims c
               JOIN orders o ON o.id = c.order_id
               LEFT JOIN users u ON u.id = o.user_id
              WHERE c.id = ?`,
            [req.params.id]
        );
        if (!claim) return res.redirect('/admin/claims');

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [claim.order_id]);
        const [refunds] = await pool.query('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC', [claim.order_id]);

        // 반품·고객귀책일 때 청구될 반품 배송비 미리보기
        const { calcReturnShippingFee } = require('../../services/order/refundService');
        const suggestedReturnFee = await calcReturnShippingFee({
            mallId: req.adminMallId || 1,
            responsible: claim.responsible,
            claimType: claim.claim_type,
        });

        res.render('admin/claims/detail', {
            layout: 'layouts/admin_layout',
            title: '클레임 상세',
            claim,
            items,
            refunds,
            suggestedReturnFee,
            error: req.query.error || null,
            refund_failed: req.query.refund_failed === '1',
        });
    } catch (err) {
        next(err);
    }
};

exports.postApprove = async (req, res, next) => {
    try {
        const adminId = req.session.admin ? req.session.admin.id : null;
        const { responsible, return_shipping_fee, memo } = req.body;
        const result = await claimService.approveClaim({
            claimId: Number(req.params.id),
            adminId,
            responsible: ['CUSTOMER', 'SELLER'].includes(responsible) ? responsible : undefined,
            returnShippingFee: return_shipping_fee !== undefined && return_shipping_fee !== ''
                ? Math.max(0, parseInt(return_shipping_fee, 10) || 0) : undefined,
            memo,
            mallId: req.adminMallId || 1,
        });
        if (!result.ok) {
            return res.redirect(`/admin/claims/${req.params.id}?error=` + encodeURIComponent(result.reason));
        }
        // PG 환불이 실패했으면 상세에서 수동 처리하도록 안내
        const flag = result.refund && !result.refund.ok ? '?refund_failed=1' : '';
        res.redirect(`/admin/claims/${req.params.id}${flag}`);
    } catch (err) {
        next(err);
    }
};

exports.postReject = async (req, res, next) => {
    try {
        const adminId = req.session.admin ? req.session.admin.id : null;
        const result = await claimService.rejectClaim({ claimId: Number(req.params.id), adminId, memo: req.body.memo });
        if (!result.ok) return res.redirect(`/admin/claims/${req.params.id}?error=` + encodeURIComponent(result.reason));
        res.redirect(`/admin/claims/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};

/** PG 환불 실패분을 계좌 수동 환불로 마감한다. */
exports.postManualRefund = async (req, res, next) => {
    try {
        await markRefundManual(Number(req.body.refund_id), req.body.memo);
        await pool.query("UPDATE orders SET refund_status = 'COMPLETED', payment_status = 'REFUNDED' WHERE id = ?", [req.body.order_id]);
        res.redirect(`/admin/claims/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};
