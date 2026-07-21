/*
 * ── B2B 주문 절차 (설계 §7) ──
 *
 * B2C 는 "주문 → 즉시 결제 → 재고 차감" 이 몇 초 안에 끝난다.
 * B2B 는 "주문 접수 → 판매자 승인 → 입금 → 출고" 이고, 승인과 입금 사이가 며칠 벌어진다.
 *
 * 주문 엔진은 공통이다(orders/order_items/shipments). 새 상태머신을 만들지 않고
 * 기존 4축(status·payment_status·claim_status·refund_status)에 매핑하며,
 * 판매자 승인 단계만 b2b_order_detail.approval_status 가 담는다.
 *
 *   접수      status=PENDING  payment=PENDING  approval=REQUESTED     재고 손대지 않음
 *   승인      status=PENDING  payment=PENDING  approval=APPROVED      ← 여기서 재고 차감
 *   입금확인  status=PAID     payment=PAID     approval=APPROVED      예약 확정
 *   반려/취소 status=CANCELLED payment=CANCELLED                      재고 복원
 *
 * ⚠️ 승인 시점에 재고를 깎는 이유: 입금 기한(기본 7일) 동안 아무 확보가 없으면 마지막 재고를
 *    두 거래처가 동시에 승인받고 한쪽이 출고 불가가 된다. 차감 사실은 orders.stock_deducted_at
 *    에 남고, 취소·기한만료 시 orderCancelService 가 그 값을 보고 되돌린다.
 */

const pool = require('../../config/db');
const skuService = require('../catalog/skuService');
const { restoreOrderResources } = require('../order/orderCancelService');
const b2bContext = require('../../middleware/b2bContext');
const { sendEmail } = require('../emailService');

/** B2B 주문번호. B2C(ORD-)와 눈으로 구분된다(설계 §7.5). */
function generateB2bOrderNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 90000) + 10000);
    return `B2B-${y}${m}${d}-${rand}`;
}

/** 입금 기한 = 지금 + 설정일수. */
function paymentDueDate(from = new Date()) {
    const days = b2bContext.getSettings().paymentDueDays;
    const due = new Date(from.getTime());
    due.setDate(due.getDate() + days);
    due.setHours(23, 59, 59, 0);
    return due;
}

/** 주문 + B2B 확장정보 + 거래처를 함께 읽는다. */
async function findOrder(orderId) {
    const [[row]] = await pool.query(
        `SELECT o.*, d.*, bp.company_name, bp.business_number, bp.tax_invoice_email,
                u.email AS user_email, u.name AS user_name
           FROM orders o
           JOIN b2b_order_detail d ON d.order_id = o.id
           JOIN business_profile bp ON bp.id = d.business_profile_id
           LEFT JOIN users u ON u.id = o.user_id
          WHERE o.id = ?`,
        [orderId]
    );
    return row || null;
}

/**
 * 판매자 승인 — **재고를 차감한다.**
 *
 * 재고 부족이면 승인하지 않는다(주문은 접수 상태로 남아 관리자가 수량을 조정하거나 반려한다).
 * `stock_deducted_at` 조건부 UPDATE 로 이중 차감을 막는다.
 *
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function approve(orderId, { adminId = null } = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            `SELECT o.id, o.status, o.stock_deducted_at, d.approval_status
               FROM orders o JOIN b2b_order_detail d ON d.order_id = o.id
              WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        if (!order) { await conn.rollback(); return { ok: false, error: '주문을 찾을 수 없습니다.' }; }
        if (order.approval_status === 'APPROVED') { await conn.rollback(); return { ok: true }; }
        if (order.status === 'CANCELLED') { await conn.rollback(); return { ok: false, error: '취소된 주문입니다.' }; }

        // 재고 차감 — 실패하면 승인 자체를 하지 않는다.
        if (!order.stock_deducted_at) {
            const deduct = await skuService.deductStockForOrder(conn, orderId);
            if (!deduct.ok) {
                await conn.rollback();
                return { ok: false, error: '재고가 부족해 승인할 수 없습니다. 수량을 조정하거나 반려하세요.' };
            }
            await conn.query('UPDATE orders SET stock_deducted_at = NOW() WHERE id = ?', [orderId]);
        }

        const due = paymentDueDate();
        await conn.query(
            `UPDATE b2b_order_detail
                SET approval_status = 'APPROVED', approved_at = NOW(), approved_by = ?,
                    payment_due_at = ?, reject_reason = NULL
              WHERE order_id = ?`,
            [adminId, due, orderId]
        );
        await conn.commit();

        await notify(orderId, 'APPROVED').catch((e) => console.warn('[b2b] 승인 안내 실패:', e.message));
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** 심사 착수 표시. 재고는 건드리지 않는다. */
async function markUnderReview(orderId) {
    await pool.query(
        "UPDATE b2b_order_detail SET approval_status = 'UNDER_REVIEW' WHERE order_id = ? AND approval_status = 'REQUESTED'",
        [orderId]
    );
    return { ok: true };
}

/**
 * 입금 확인 — 주문을 확정한다.
 *
 * 재고는 승인 때 이미 깎았으므로 **여기서 다시 깎지 않는다.**
 * B2C 의 completeOrderWithStockAndPaid 와 달리 쿠폰·포인트·적립 처리가 없다
 * (B2B 는 쿠폰·포인트를 쓰지 않는다 — 설계 §4.5).
 */
async function confirmDeposit(orderId, { adminId = null, depositName = null } = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            `SELECT o.id, o.status, o.payment_status, o.stock_deducted_at, d.approval_status
               FROM orders o JOIN b2b_order_detail d ON d.order_id = o.id
              WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        if (!order) { await conn.rollback(); return { ok: false, error: '주문을 찾을 수 없습니다.' }; }
        if (order.status === 'CANCELLED') { await conn.rollback(); return { ok: false, error: '취소된 주문입니다.' }; }
        if (order.approval_status !== 'APPROVED') {
            await conn.rollback();
            return { ok: false, error: '먼저 주문을 승인해야 입금을 확인할 수 있습니다.' };
        }
        if (order.payment_status === 'PAID') { await conn.rollback(); return { ok: true }; }

        // 승인 없이 여기까지 온 예외 상황(데이터 보정 등) 대비 — 아직 안 깎았으면 지금 깎는다.
        if (!order.stock_deducted_at) {
            const deduct = await skuService.deductStockForOrder(conn, orderId);
            if (!deduct.ok) { await conn.rollback(); return { ok: false, error: '재고가 부족합니다.' }; }
            await conn.query('UPDATE orders SET stock_deducted_at = NOW() WHERE id = ?', [orderId]);
        }

        await conn.query(
            `UPDATE orders
                SET status = 'PAID', payment_status = 'PAID', paid_at = NOW(), payment_method = 'BANK_TRANSFER'
              WHERE id = ?`,
            [orderId]
        );
        await conn.query(
            'UPDATE b2b_order_detail SET deposited_at = NOW(), deposit_name = COALESCE(?, deposit_name) WHERE order_id = ?',
            [depositName, orderId]
        );
        await conn.commit();

        await notify(orderId, 'PAID').catch((e) => console.warn('[b2b] 입금확인 안내 실패:', e.message));
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 반려·취소 — 재고를 되돌린다.
 *
 * 복원은 orderCancelService.restoreOrderResources 에 맡긴다. 그 함수가
 * orders.stock_deducted_at 을 보고 판정하며 멱등하다(두 번 불러도 재고는 한 번만 돌아온다).
 */
async function cancel(orderId, { reason = null, adminId = null, byCustomer = false } = {}) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            `SELECT o.id, o.user_id, o.status, o.point_used, d.approval_status
               FROM orders o JOIN b2b_order_detail d ON d.order_id = o.id
              WHERE o.id = ? FOR UPDATE`,
            [orderId]
        );
        if (!order) { await conn.rollback(); return { ok: false, error: '주문을 찾을 수 없습니다.' }; }
        if (order.status === 'CANCELLED') { await conn.rollback(); return { ok: true }; }
        if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
            await conn.rollback();
            return { ok: false, error: '이미 출고된 주문은 여기서 취소할 수 없습니다. 클레임으로 처리하세요.' };
        }

        await restoreOrderResources(conn, order);

        await conn.query(
            `UPDATE orders SET status = 'CANCELLED', payment_status = 'CANCELLED', cancel_reason = ? WHERE id = ?`,
            [reason, orderId]
        );
        await conn.query(
            `UPDATE b2b_order_detail SET approval_status = 'REJECTED', reject_reason = ?, approved_by = COALESCE(?, approved_by)
              WHERE order_id = ?`,
            [reason, adminId, orderId]
        );
        await conn.commit();

        if (!byCustomer) await notify(orderId, 'REJECTED').catch((e) => console.warn('[b2b] 반려 안내 실패:', e.message));
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 입금 기한이 지난 승인 주문 목록.
 *
 * 이 주문들이 재고를 잡고 있다. 스케줄러가 없으므로 관리자가 화면에서 확인하고 회수한다
 * (설계 §7.3 — 자동화는 §14.2 #3 결정 대기).
 */
async function listOverdue() {
    const [rows] = await pool.query(
        `SELECT o.id, o.order_number, o.total_amount, o.created_at,
                d.payment_due_at, bp.company_name,
                DATEDIFF(NOW(), d.payment_due_at) AS overdue_days
           FROM orders o
           JOIN b2b_order_detail d ON d.order_id = o.id
           JOIN business_profile bp ON bp.id = d.business_profile_id
          WHERE o.order_type = 'B2B'
            AND d.approval_status = 'APPROVED'
            AND o.payment_status = 'PENDING'
            AND o.status <> 'CANCELLED'
            AND d.payment_due_at IS NOT NULL
            AND d.payment_due_at < NOW()
          ORDER BY d.payment_due_at ASC`
    );
    return rows;
}

/** 기한초과 주문 일괄 취소 + 재고 회수. */
async function cancelOverdue(orderIds, { adminId = null } = {}) {
    const ids = (orderIds || []).map(Number).filter(Boolean);
    const results = { cancelled: 0, failed: [] };
    for (const id of ids) {
        try {
            const r = await cancel(id, { reason: '입금 기한 초과', adminId });
            if (r.ok) results.cancelled += 1; else results.failed.push({ id, error: r.error });
        } catch (e) {
            results.failed.push({ id, error: e.message });
        }
    }
    return results;
}

/** 세금계산서 상태 갱신 (1단계는 수동 발행 + 상태 기록). */
async function updateTaxInvoice(orderId, { status, invoiceNo = null }) {
    if (!['NOT_ISSUED', 'REQUESTED', 'ISSUED', 'CANCELLED'].includes(status)) {
        return { ok: false, error: '알 수 없는 상태입니다.' };
    }
    await pool.query(
        `UPDATE b2b_order_detail
            SET tax_invoice_status = ?, tax_invoice_no = ?,
                tax_invoice_issued_at = CASE WHEN ? = 'ISSUED' THEN NOW() ELSE tax_invoice_issued_at END
          WHERE order_id = ?`,
        [status, invoiceNo, status, orderId]
    );
    return { ok: true };
}

/** 거래처에 보내는 단계별 안내. 실패해도 주문 처리는 되돌리지 않는다. */
async function notify(orderId, kind) {
    const o = await findOrder(orderId);
    if (!o || !o.user_email) return;
    const settings = b2bContext.getSettings();
    const won = (n) => Number(n || 0).toLocaleString('ko-KR');
    const due = o.payment_due_at ? new Date(o.payment_due_at).toLocaleDateString('ko-KR') : '-';

    const map = {
        REQUESTED: {
            subject: `[주문 접수] ${o.order_number}`,
            text: `${o.company_name} 님, 주문이 접수되었습니다.\n주문번호: ${o.order_number}\n금액: ${won(o.total_amount)}원\n\n담당자 확인 후 입금 안내를 드립니다.`,
        },
        APPROVED: {
            subject: `[주문 승인 · 입금 안내] ${o.order_number}`,
            text: `${o.company_name} 님, 주문이 승인되었습니다.\n주문번호: ${o.order_number}\n결제 금액: ${won(o.total_amount)}원`
                + `\n  공급가액 ${won(o.supply_amount)}원 / 부가세 ${won(o.vat_amount)}원`
                + `\n입금 기한: ${due}\n${settings.bankAccountInfo ? '입금 계좌: ' + settings.bankAccountInfo : ''}`
                + `\n\n기한 내 입금이 확인되지 않으면 주문이 자동 취소될 수 있습니다.`,
        },
        PAID: {
            subject: `[입금 확인] ${o.order_number}`,
            text: `${o.company_name} 님, 입금이 확인되었습니다.\n주문번호: ${o.order_number}\n상품 준비 후 출고해 드립니다.`,
        },
        REJECTED: {
            subject: `[주문 반려] ${o.order_number}`,
            text: `${o.company_name} 님, 주문이 반려되었습니다.\n주문번호: ${o.order_number}\n사유: ${o.reject_reason || '-'}`,
        },
    };
    const msg = map[kind];
    if (!msg) return;
    await sendEmail({ to: o.user_email, subject: msg.subject, text: msg.text });
}

module.exports = {
    generateB2bOrderNumber,
    paymentDueDate,
    findOrder,
    approve,
    markUnderReview,
    confirmDeposit,
    cancel,
    listOverdue,
    cancelOverdue,
    updateTaxInvoice,
    notify,
};
