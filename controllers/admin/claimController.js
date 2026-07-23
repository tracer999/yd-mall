/*
 * 관리자 클레임 관리 (주문/클레임 문서 §5-2, O11)
 *
 * 화면은 하나다(레퍼런스 §5). 유형(취소·반품)으로 구분하고, 승인 시 귀책·반품배송비를 확정한다.
 * 승인 로직은 claimService 가 소유한다 — 복원·환불·상태 전이를 한 트랜잭션에서 한다.
 *
 * ⚠️ **일반(B2C) 주문 전용이다.** 기업 주문의 취소·반품은 `/admin/b2b/claims` 가 다룬다.
 *    환불 수단이 다르기 때문이다 — B2C 는 PG 취소로 자동 환불되지만, B2B 는 무통장이라
 *    사람이 계좌로 이체한 뒤 마감해야 한다. 이 화면에는 그 마감 절차가 없어서, 여기서 B2B
 *    클레임을 승인하면 "이체 대기" 건이 아무 화면에도 뜨지 않고 묻힌다.
 */

const pool = require('../../config/db');
const claimService = require('../../services/order/claimService');
const { markRefundManual } = require('../../services/order/refundService');
const orderMailer = require('../../services/email/orderMailer');
const couriers = require('../../services/shipping/couriers');
const partial = require('../../services/order/partialClaimService');
const claimNotifier = require('../../services/notify/claimNotifier');

const CLAIM_STATUS = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'WITHDRAWN'];

exports.getList = async (req, res, next) => {
    try {
        const { status, claim_type } = req.query;
        const where = ["o.order_type = 'B2C'"];
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
                    o.status AS order_status, o.payment_key, o.point_used, o.order_type,
                    u.name AS customer_name, u.email AS customer_email
               FROM order_claims c
               JOIN orders o ON o.id = c.order_id
               LEFT JOIN users u ON u.id = o.user_id
              WHERE c.id = ?`,
            [req.params.id]
        );
        if (!claim) return res.redirect('/admin/claims');
        // 기업 주문 클레임은 계좌 환불 절차가 있는 전용 화면으로 보낸다.
        if (claim.order_type === 'B2B') return res.redirect(`/admin/b2b/claims/${claim.id}`);

        const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [claim.order_id]);
        const [refunds] = await pool.query('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC', [claim.order_id]);

        /*
         * 부분 클레임이면 "무엇을 몇 개" 가 이 표에 있다. 행이 하나도 없으면 주문 전건 클레임이다.
         * 승인 전에는 신청 수량만, 승인 뒤에는 확정된 환불 몫까지 함께 보인다.
         */
        const [claimItems] = await pool.query(`
            SELECT ci.*, oi.product_name, oi.option_snapshot, oi.product_price, oi.quantity AS ordered_qty
              FROM order_claim_items ci
              JOIN order_items oi ON oi.id = ci.order_item_id
             WHERE ci.claim_id = ?
             ORDER BY ci.id
        `, [req.params.id]);

        // 회수 송장 — 반품·교환은 물건이 돌아와야 끝난다. 방향(RETURN)으로만 가른다.
        const [[returnShipment]] = await pool.query(
            "SELECT * FROM shipments WHERE claim_id = ? AND direction = 'RETURN' ORDER BY id DESC LIMIT 1",
            [req.params.id]
        );

        // 반품·고객귀책일 때 청구될 반품 배송비 미리보기
        const { calcReturnShippingFee } = require('../../services/order/refundService');
        const suggestedReturnFee = await calcReturnShippingFee({
            mallId: req.adminMallId || 1,
            responsible: claim.responsible,
            claimType: claim.claim_type,
        });

        /*
         * 예상 환불액.
         * 부분 클레임이면 주문 전액이 아니라 **안분된 금액**을 보여야 한다 —
         * 전액을 띄워 놓고 실제로는 일부만 환불되면 운영자가 승인 버튼을 누르기 전에 확인할 방법이 없다.
         */
        const fee = claim.responsible === 'CUSTOMER' && claim.claim_type === 'RETURN' ? suggestedReturnFee : 0;
        let refundPreview = Math.max(0, Number(claim.total_amount) - fee);
        if (claimItems.length) {
            const all = await partial.getClaimableItems(pool, claim.order_id);
            const pick = new Map(claimItems.map((r) => [Number(r.order_item_id), Number(r.quantity)]));
            const preview = partial.calcPartialAmounts(all, pick, claim, fee);
            if (preview) refundPreview = preview.refundAmount;
        }
        // 교환은 돈이 오가지 않는다.
        if (claim.claim_type === 'EXCHANGE') refundPreview = 0;

        res.render('admin/claims/detail', {
            layout: 'layouts/admin_layout',
            title: '클레임 상세',
            claim,
            items,
            claimItems,
            refunds,
            returnShipment: returnShipment || null,
            couriers: couriers.COURIERS,
            trackingUrl: couriers.trackingUrl,
            suggestedReturnFee,
            refundPreview,
            error: req.query.error || null,
            message: req.query.message || null,
            refund_failed: req.query.refund_failed === '1',
        });
    } catch (err) {
        next(err);
    }
};

/** B2B 클레임이면 전용 화면으로 보낸다. 처리했으면 true. */
async function divertIfB2b(claimId, res) {
    const [[row]] = await pool.query(
        `SELECT o.order_type FROM order_claims c JOIN orders o ON o.id = c.order_id WHERE c.id = ?`,
        [claimId]
    );
    if (row && row.order_type === 'B2B') {
        res.redirect(`/admin/b2b/claims/${claimId}`);
        return true;
    }
    return false;
}

exports.postApprove = async (req, res, next) => {
    try {
        if (await divertIfB2b(Number(req.params.id), res)) return;
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
        // 처리 결과 안내 메일 — 문구는 관리자 > 이메일 템플릿 관리에서 정한다.
        const refundAmount = result.amounts ? result.amounts.refundAmount
            : (result.refund && result.refund.amount != null ? result.refund.amount : null);
        orderMailer.notifyClaimProcessed({
            claimId: Number(req.params.id),
            approved: true,
            memo,
            refundAmount,
        }).catch((e) => console.error('[mail] 클레임 승인 안내 실패:', e.message));
        // 문자·알림톡 — 설정이 없으면 조용히 건너뛴다(services/notify/smsService 주석 참고).
        claimNotifier.notifyProcessed({ claimId: Number(req.params.id), approved: true, refundAmount })
            .catch((e) => console.error('[sms] 클레임 승인 안내 실패:', e.message));

        // PG 환불이 실패했으면 상세에서 수동 처리하도록 안내
        const flag = result.refund && !result.refund.ok ? '?refund_failed=1' : '';
        res.redirect(`/admin/claims/${req.params.id}${flag}`);
    } catch (err) {
        next(err);
    }
};

exports.postReject = async (req, res, next) => {
    try {
        if (await divertIfB2b(Number(req.params.id), res)) return;
        const adminId = req.session.admin ? req.session.admin.id : null;
        const result = await claimService.rejectClaim({ claimId: Number(req.params.id), adminId, memo: req.body.memo });
        if (!result.ok) return res.redirect(`/admin/claims/${req.params.id}?error=` + encodeURIComponent(result.reason));

        orderMailer.notifyClaimProcessed({ claimId: Number(req.params.id), approved: false, memo: req.body.memo })
            .catch((e) => console.error('[mail] 클레임 반려 안내 실패:', e.message));
        claimNotifier.notifyProcessed({ claimId: Number(req.params.id), approved: false })
            .catch((e) => console.error('[sms] 클레임 반려 안내 실패:', e.message));

        res.redirect(`/admin/claims/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};

/* ------------------------------------------------------------------
 * 반품 회수 송장 (1-4)
 *
 * 반품을 승인해도 물건이 언제 돌아오는지 시스템이 몰랐다. 그래서 환불 시점 판단이
 * 사람 기억에 의존했다. 회수는 방향만 반대인 배송이므로 `shipments` 를 `direction='RETURN'`
 * 으로 재사용한다 — 택배사·송장·조회 링크가 출고와 똑같이 동작한다.
 * ------------------------------------------------------------------ */

exports.postReturnShipment = async (req, res, next) => {
    const claimId = Number(req.params.id);
    const back = (msg, isError) =>
        res.redirect(`/admin/claims/${claimId}?${isError ? 'error' : 'message'}=` + encodeURIComponent(msg));
    try {
        if (await divertIfB2b(claimId, res)) return;

        const [[claim]] = await pool.query('SELECT id, order_id, claim_type FROM order_claims WHERE id = ?', [claimId]);
        if (!claim) return res.redirect('/admin/claims');
        if (claim.claim_type === 'CANCEL') return back('취소 건은 회수할 물건이 없습니다.', true);

        const courier = couriers.normalize(req.body.courier_company);
        const tracking = String(req.body.tracking_number || '').replace(/[\s-]/g, '');
        if (!courier) return back('택배사를 선택하세요.', true);
        if (!tracking) return back('회수 송장번호를 입력하세요.', true);

        const [[existing]] = await pool.query(
            "SELECT id FROM shipments WHERE claim_id = ? AND direction = 'RETURN' ORDER BY id DESC LIMIT 1", [claimId]);
        if (existing) {
            await pool.query(
                "UPDATE shipments SET courier_company = ?, tracking_number = ?, status = 'RETURNING' WHERE id = ?",
                [courier, tracking, existing.id]);
        } else {
            await pool.query(
                `INSERT INTO shipments (order_id, direction, claim_id, courier_company, tracking_number, status, shipped_at)
                 VALUES (?, 'RETURN', ?, ?, ?, 'RETURNING', NOW())`,
                [claim.order_id, claimId, courier, tracking]);
        }
        claimNotifier.notifyReturnPickup({ claimId, courier, trackingNumber: tracking })
            .catch((e) => console.error('[sms] 회수 안내 실패:', e.message));

        back(`회수 송장을 등록했습니다. (${courier} ${tracking})`);
    } catch (err) {
        next(err);
    }
};

/** 회수 완료 — 물건이 실제로 돌아왔다. 여기가 "환불해도 되는 시점" 의 근거가 된다. */
exports.postReturnReceived = async (req, res, next) => {
    const claimId = Number(req.params.id);
    try {
        if (await divertIfB2b(claimId, res)) return;
        const [r] = await pool.query(
            "UPDATE shipments SET status = 'RETURNED', picked_up_at = NOW() WHERE claim_id = ? AND direction = 'RETURN'",
            [claimId]);
        const msg = r.affectedRows
            ? '회수 완료로 표시했습니다.'
            : '회수 송장이 없습니다. 먼저 회수 송장을 등록하세요.';
        res.redirect(`/admin/claims/${claimId}?${r.affectedRows ? 'message' : 'error'}=` + encodeURIComponent(msg));
    } catch (err) {
        next(err);
    }
};

/** PG 환불 실패분을 계좌 수동 환불로 마감한다. */
exports.postManualRefund = async (req, res, next) => {
    try {
        if (await divertIfB2b(Number(req.params.id), res)) return;
        await markRefundManual(Number(req.body.refund_id), req.body.memo);
        await pool.query("UPDATE orders SET refund_status = 'COMPLETED', payment_status = 'REFUNDED' WHERE id = ?", [req.body.order_id]);
        res.redirect(`/admin/claims/${req.params.id}`);
    } catch (err) {
        next(err);
    }
};
