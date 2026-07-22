/*
 * B2B 클레임 관리 (취소 · 반품) — 기업 주문 전용 화면.
 *
 * 처리 로직은 B2C 와 공통이다(`claimService`). 갈라지는 건 **환불 수단** 하나다.
 *   B2C : 카드 결제 → PG 취소 API 가 자동으로 돈을 돌려준다.
 *   B2B : 무통장 입금 → 자동 환불 수단이 없다. **사람이 거래처 계좌로 이체**한 뒤
 *         이 화면에서 [계좌 환불 완료] 를 눌러 마감한다(`refundService` 의 MANUAL/REQUESTED 경로).
 *
 * 그래서 목록 맨 위에 "환불 대기" 작업함을 둔다. 이걸 비우지 않으면 거래처는 돈을 못 받는다.
 */

const pool = require('../../config/db');
const claimService = require('../../services/order/claimService');
const { markRefundManual, calcReturnShippingFee } = require('../../services/order/refundService');

const LAYOUT = 'layouts/admin_layout';
const CLAIM_STATUS = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'WITHDRAWN'];

/** 아직 이체하지 않은 환불 — 목록 상단 작업함. */
async function listPendingRefunds() {
    const [rows] = await pool.query(
        `SELECT r.id, r.refund_amount, r.created_at, r.claim_id,
                o.id AS order_id, o.order_number, bp.company_name
           FROM order_refunds r
           JOIN orders o ON o.id = r.order_id
           JOIN b2b_order_detail d ON d.order_id = o.id
           JOIN business_profile bp ON bp.id = d.business_profile_id
          WHERE o.order_type = 'B2B'
            AND r.method = 'MANUAL'
            AND r.status = 'REQUESTED'
          ORDER BY r.created_at ASC`
    );
    return rows;
}

exports.getList = async (req, res, next) => {
    try {
        const { status, claim_type } = req.query;
        const where = ["o.order_type = 'B2B'"];
        const params = [];
        if (CLAIM_STATUS.includes(status)) { where.push('c.status = ?'); params.push(status); }
        if (['CANCEL', 'RETURN', 'EXCHANGE'].includes(claim_type)) { where.push('c.claim_type = ?'); params.push(claim_type); }

        const [claims] = await pool.query(
            `SELECT c.*, o.order_number, o.total_amount, o.status AS order_status,
                    o.refund_status, bp.company_name
               FROM order_claims c
               JOIN orders o ON o.id = c.order_id
               JOIN b2b_order_detail d ON d.order_id = o.id
               JOIN business_profile bp ON bp.id = d.business_profile_id
              WHERE ${where.join(' AND ')}
              ORDER BY c.status = 'REQUESTED' DESC, c.created_at DESC
              LIMIT 500`,
            params
        );

        res.render('admin/b2b/claims', {
            layout: LAYOUT,
            title: 'B2B 클레임',
            subtitle: '기업 주문의 취소·반품입니다. 환불은 자동으로 나가지 않고 계좌 이체 후 여기서 마감합니다.',
            claims,
            pendingRefunds: await listPendingRefunds(),
            filters: { status: status || '', claim_type: claim_type || '' },
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

exports.getDetail = async (req, res, next) => {
    try {
        const [[claim]] = await pool.query(
            `SELECT c.*, o.order_number, o.total_amount, o.subtotal_amount, o.shipping_fee, o.shipping_discount,
                    o.status AS order_status, o.payment_status, o.refund_status, o.payment_key, o.point_used,
                    o.supply_amount, o.vat_amount,
                    bp.company_name, bp.business_number,
                    d.deposit_name, d.deposited_at,
                    u.name AS customer_name, u.email AS customer_email
               FROM order_claims c
               JOIN orders o ON o.id = c.order_id
               JOIN b2b_order_detail d ON d.order_id = o.id
               JOIN business_profile bp ON bp.id = d.business_profile_id
               LEFT JOIN users u ON u.id = o.user_id
              WHERE c.id = ? AND o.order_type = 'B2B'`,
            [req.params.id]
        );
        if (!claim) return res.redirect('/admin/b2b/claims');

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [claim.order_id]);
        const [refunds] = await pool.query('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC', [claim.order_id]);

        const suggestedReturnFee = await calcReturnShippingFee({
            mallId: req.adminMallId || 1,
            responsible: claim.responsible,
            claimType: claim.claim_type,
        });

        res.render('admin/b2b/claim_detail', {
            layout: LAYOUT,
            title: 'B2B 클레임 상세',
            subtitle: `${claim.order_number} · ${claim.company_name}`,
            claim,
            items,
            refunds,
            suggestedReturnFee,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
};

/** 승인 — 재고·적립금 복원 + 환불 기록 생성. B2B 환불은 '대기'로 남고 자동 송금되지 않는다. */
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
            return res.redirect(`/admin/b2b/claims/${req.params.id}?error=` + encodeURIComponent(result.reason));
        }
        const msg = result.refund && result.refund.pending
            ? '승인했습니다. 환불액을 거래처 계좌로 이체한 뒤 [계좌 환불 완료] 를 눌러 주세요.'
            : '승인 처리했습니다.';
        return res.redirect(`/admin/b2b/claims/${req.params.id}?message=` + encodeURIComponent(msg));
    } catch (err) {
        next(err);
    }
};

exports.postReject = async (req, res, next) => {
    try {
        const adminId = req.session.admin ? req.session.admin.id : null;
        const result = await claimService.rejectClaim({ claimId: Number(req.params.id), adminId, memo: req.body.memo });
        if (!result.ok) return res.redirect(`/admin/b2b/claims/${req.params.id}?error=` + encodeURIComponent(result.reason));
        return res.redirect(`/admin/b2b/claims/${req.params.id}?message=` + encodeURIComponent('거절 처리했습니다.'));
    } catch (err) {
        next(err);
    }
};

/**
 * 계좌 환불 완료 — 운영자가 실제로 이체한 뒤 누른다.
 * 이걸 눌러야 주문의 refund_status 가 REQUESTED(대기) → COMPLETED 로 넘어간다.
 */
exports.postRefundComplete = async (req, res, next) => {
    const backTo = req.body.claim_id ? `/admin/b2b/claims/${req.body.claim_id}` : '/admin/b2b/claims';
    try {
        const refundId = Number(req.body.refund_id);
        const orderId = Number(req.body.order_id);
        if (!refundId || !orderId) {
            return res.redirect(`${backTo}?error=` + encodeURIComponent('환불 정보를 찾을 수 없습니다.'));
        }

        // 다른 유형의 주문이 섞여 들어오지 못하게 B2B 인지 확인한다.
        const [[row]] = await pool.query(
            `SELECT r.id FROM order_refunds r JOIN orders o ON o.id = r.order_id
              WHERE r.id = ? AND r.order_id = ? AND o.order_type = 'B2B'`,
            [refundId, orderId]
        );
        if (!row) return res.redirect(`${backTo}?error=` + encodeURIComponent('환불 정보를 찾을 수 없습니다.'));

        await markRefundManual(refundId, (req.body.memo || '').trim() || '계좌 환불 완료');
        await pool.query(
            "UPDATE orders SET refund_status = 'COMPLETED', payment_status = 'REFUNDED' WHERE id = ?",
            [orderId]
        );
        return res.redirect(`${backTo}?message=` + encodeURIComponent('계좌 환불 완료로 기록했습니다.'));
    } catch (err) {
        next(err);
    }
};
