/*
 * 주문·배송 안내 메일 발송 (이벤트별 진입점)
 *
 * 컨트롤러·서비스는 여기 함수만 부른다. 어떤 데이터를 조회해 어떤 토큰으로 넘길지는 전부 이 파일이 안다.
 * **메일 실패가 주문 처리를 되돌리지 않는다** — 모든 함수는 예외를 삼키고 결과만 돌려준다.
 */

const pool = require('../../config/db');
const { sendTemplateMail, escapeHtml } = require('./emailTemplateService');

const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

function dt(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateOnly(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 주문의 mall_id 가 이미 지워진 몰을 가리킬 수 있다 — 몰 빌더라 몰을 만들고 지우는 게 정상 흐름이고,
 * 주문은 남는다. 그런 주문의 안내 메일은 기본몰 이름·템플릿으로 내보낸다.
 */
async function resolveMallId(mallId) {
    const id = Number(mallId) || 0;
    try {
        if (id) {
            const [[hit]] = await pool.query('SELECT id FROM mall WHERE id = ?', [id]);
            if (hit) return Number(hit.id);
        }
        const [[def]] = await pool.query('SELECT id FROM mall ORDER BY is_default DESC, id ASC LIMIT 1');
        return def ? Number(def.id) : 1;
    } catch (err) {
        console.warn('[orderMailer] 몰 확인 실패:', err.message);
        return id || 1;
    }
}

/** 몰 이름·고객센터 등 모든 템플릿이 공유하는 값. */
async function siteVars(mallId) {
    const id = Number(mallId) || 1;
    let row = {};
    try {
        const [[found]] = await pool.query(
            `SELECT m.name AS mall_name, s.company_name, s.contact_phone, s.contact_email, s.cs_hours
               FROM mall m LEFT JOIN site_settings s ON s.mall_id = m.id
              WHERE m.id = ?`,
            [id]
        );
        row = found || {};
    } catch (err) {
        console.warn('[orderMailer] 사이트 정보 조회 실패:', err.message);
    }
    const settings = global.systemSettings || {};
    const baseUrl = String(settings.domain || process.env.SITE_URL || '').replace(/\/+$/, '');

    return {
        shop_name: row.mall_name || row.company_name || '쇼핑몰',
        shop_url: baseUrl,
        cs_phone: row.contact_phone || '-',
        cs_email: row.contact_email || settings.smtp_sender_email || '-',
        cs_hours: row.cs_hours || '-',
        _baseUrl: baseUrl,
    };
}

/** 주문 상품 목록 → 요약 문자열 + HTML 표 */
function itemVars(items) {
    const first = items[0];
    const summary = !first
        ? '-'
        : items.length > 1
            ? `${first.product_name} 외 ${items.length - 1}건`
            : first.product_name;

    const rows = items.map((it) => `
    <tr>
      <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;">
        ${escapeHtml(it.product_name)}
        ${it.option_snapshot ? `<div style="color:#6b7280;font-size:12px;">${escapeHtml(it.option_snapshot)}</div>` : ''}
      </td>
      <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;text-align:center;white-space:nowrap;">${Number(it.quantity || 0)}개</td>
      <td style="padding:8px 4px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">${won(it.total_price)}</td>
    </tr>`).join('');

    const table = items.length === 0 ? '' : `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
  <thead>
    <tr style="background:#f9fafb;">
      <th style="padding:8px 4px;text-align:left;font-size:12px;color:#6b7280;">상품</th>
      <th style="padding:8px 4px;text-align:center;font-size:12px;color:#6b7280;width:60px;">수량</th>
      <th style="padding:8px 4px;text-align:right;font-size:12px;color:#6b7280;width:100px;">금액</th>
    </tr>
  </thead>
  <tbody>${rows}
  </tbody>
</table>`;

    return {
        item_summary: summary,
        item_count: String(items.length),
        item_table: table,
        item_list: items.map((it) => `${it.product_name} x ${it.quantity}`).join('\n') || '-',
    };
}

/** 주문 한 건에 대한 토큰 묶음. 주문이 없으면 null. */
async function buildOrderVars(orderId) {
    const [[order]] = await pool.query(
        `SELECT o.*, u.name AS user_name, u.email AS user_email,
                s.courier_company, s.tracking_number, s.shipped_at, s.delivered_at
           FROM orders o
           LEFT JOIN users u ON u.id = o.user_id
           LEFT JOIN shipments s ON s.order_id = o.id
          WHERE o.id = ?`,
        [orderId]
    );
    if (!order) return null;

    const [items] = await pool.query(
        'SELECT product_name, option_snapshot, quantity, total_price FROM order_items WHERE order_id = ?',
        [orderId]
    );

    const mallId = await resolveMallId(order.mall_id);
    const site = await siteVars(mallId);
    const discount = (Number(order.coupon_discount) || 0)
        + (Number(order.grade_discount) || 0)
        + (Number(order.shipping_discount) || 0);

    const address = [order.receiver_address, order.receiver_detailed_address].filter(Boolean).join(' ')
        || order.shipping_address || '-';

    const vars = {
        ...site,
        ...itemVars(items),
        order_id: String(order.id),
        order_number: order.order_number || String(order.id),
        order_date: dt(order.created_at),
        order_url: site._baseUrl ? `${site._baseUrl}/mypage/orders/${order.id}` : '',
        b2b_order_url: site._baseUrl ? `${site._baseUrl}/b2b/orders/${order.id}` : '',
        customer_name: order.buyer_name || order.user_name || '고객',
        subtotal_amount: won(order.subtotal_amount),
        shipping_fee: won(order.shipping_fee),
        discount_amount: won(discount),
        point_used: won(order.point_used),
        total_amount: won(order.total_amount),
        payment_method: order.payment_method || '-',
        receiver_name: order.receiver_name || '-',
        receiver_phone: order.receiver_phone || '-',
        receiver_address: address,
        shipping_message: order.shipping_message || '-',
        courier_company: order.courier_company || '-',
        tracking_number: order.tracking_number || '-',
        shipped_at: dt(order.shipped_at),
        delivered_at: dt(order.delivered_at),
    };

    return {
        order,
        vars,
        mallId,
        to: order.buyer_email || order.user_email || null,
    };
}

const CLAIM_LABEL = { CANCEL: '취소', RETURN: '반품', EXCHANGE: '교환' };
const REASON_LABEL = {
    CHANGE_OF_MIND: '단순 변심',
    DEFECT: '상품 불량',
    WRONG_DELIVERY: '오배송',
    OTHER: '기타',
};

/* ── B2C ────────────────────────────────────────────────────────── */

/** 결제 완료 안내 */
async function notifyOrderPaid(orderId) {
    const ctx = await buildOrderVars(orderId).catch((e) => {
        console.warn('[orderMailer] 주문 조회 실패:', e.message);
        return null;
    });
    if (!ctx || ctx.order.order_type === 'B2B') return { skipped: true };
    return sendTemplateMail({ mallId: ctx.mallId, key: 'b2c_order_paid', to: ctx.to, vars: ctx.vars });
}

/** 출고(송장 등록) 안내 */
async function notifyOrderShipped(orderId) {
    const ctx = await buildOrderVars(orderId).catch(() => null);
    if (!ctx || ctx.order.order_type === 'B2B') return { skipped: true };
    return sendTemplateMail({ mallId: ctx.mallId, key: 'b2c_order_shipped', to: ctx.to, vars: ctx.vars });
}

/** 배송완료 안내 */
async function notifyOrderDelivered(orderId) {
    const ctx = await buildOrderVars(orderId).catch(() => null);
    if (!ctx || ctx.order.order_type === 'B2B') return { skipped: true };
    return sendTemplateMail({ mallId: ctx.mallId, key: 'b2c_order_delivered', to: ctx.to, vars: ctx.vars });
}

/**
 * 취소·반품 접수 안내 (고객 + 운영자).
 * 운영자 수신 주소가 없으면 고객 메일만 나간다.
 */
async function notifyClaimRequested({ orderId, claimType, reasonType, reasonDetail, autoApproved = false }) {
    const ctx = await buildOrderVars(orderId).catch(() => null);
    if (!ctx) return { skipped: true };

    const label = CLAIM_LABEL[claimType] || '취소';
    const vars = {
        ...ctx.vars,
        claim_type_label: label,
        claim_reason: reasonDetail || REASON_LABEL[reasonType] || '-',
        claim_status_label: autoApproved ? '처리 완료' : '접수 (검토 중)',
    };

    const results = {};
    results.customer = await sendTemplateMail({
        mallId: ctx.mallId, key: 'b2c_claim_requested', to: ctx.to, vars,
    });

    const adminEmail = (global.systemSettings || {}).admin_email || process.env.ADMIN_EMAIL;
    if (adminEmail) {
        results.admin = await sendTemplateMail({
            mallId: ctx.mallId, key: 'admin_claim_requested', to: adminEmail, vars,
        });
    }
    return results;
}

/** 클레임 승인/반려 결과 안내 */
async function notifyClaimProcessed({ claimId, approved, memo = null, refundAmount = null }) {
    const [[claim]] = await pool.query(
        'SELECT order_id, claim_type, reason_type, reason_detail, return_shipping_fee, admin_memo FROM order_claims WHERE id = ?',
        [claimId]
    ).catch(() => [[]]);
    if (!claim) return { skipped: true };

    const ctx = await buildOrderVars(claim.order_id).catch(() => null);
    if (!ctx) return { skipped: true };

    /*
     * 환불 금액은 실제로 기록된 값을 쓴다. 반품배송비 공제·부분환불이 있어서 주문 총액과
     * 다를 수 있고, 고객에게는 "실제로 돌려받는 금액"이 보여야 한다.
     */
    let amount = refundAmount;
    if (amount == null) {
        const [[refund]] = await pool.query(
            'SELECT refund_amount FROM order_refunds WHERE claim_id = ? ORDER BY id DESC LIMIT 1',
            [claimId]
        ).catch(() => [[]]);
        amount = refund ? refund.refund_amount : ctx.order.total_amount;
    }

    const vars = {
        ...ctx.vars,
        claim_type_label: CLAIM_LABEL[claim.claim_type] || '취소',
        claim_reason: claim.reason_detail || REASON_LABEL[claim.reason_type] || '-',
        claim_status_label: approved ? '승인' : '반려',
        refund_amount: won(amount),
        return_shipping_fee: won(claim.return_shipping_fee),
        admin_memo: memo || claim.admin_memo || '-',
    };

    return sendTemplateMail({
        mallId: ctx.mallId,
        key: approved ? 'b2c_claim_approved' : 'b2c_claim_rejected',
        to: ctx.to,
        vars,
    });
}

/* ── B2B ────────────────────────────────────────────────────────── */

const B2B_KEY = {
    REQUESTED: 'b2b_order_requested',
    APPROVED: 'b2b_order_approved',
    PAID: 'b2b_order_paid',
    SHIPPED: 'b2b_order_shipped',
    DELIVERED: 'b2b_order_delivered',
    REJECTED: 'b2b_order_rejected',
};

/**
 * 기업회원 주문 단계별 안내.
 * @param {number} orderId
 * @param {'REQUESTED'|'APPROVED'|'PAID'|'SHIPPED'|'DELIVERED'|'REJECTED'} kind
 */
async function notifyB2bOrder(orderId, kind) {
    const key = B2B_KEY[kind];
    if (!key) return { skipped: true };

    const ctx = await buildOrderVars(orderId).catch(() => null);
    if (!ctx) return { skipped: true };

    const [[b2b]] = await pool.query(
        // business_profile 에는 담당자 메일 컬럼이 없다(계산서 수신 주소만 있다).
        // 그래서 주문 계정 메일을 먼저 쓰고, 없을 때만 계산서 주소로 폴백한다.
        `SELECT d.purchase_order_number, d.payment_due_at, d.reject_reason,
                bp.company_name, bp.business_number, bp.tax_invoice_email AS profile_email,
                u.email AS account_email
           FROM b2b_order_detail d
           JOIN business_profile bp ON bp.id = d.business_profile_id
           LEFT JOIN orders o ON o.id = d.order_id
           LEFT JOIN users u ON u.id = o.user_id
          WHERE d.order_id = ?`,
        [orderId]
    ).catch(() => [[]]);
    if (!b2b) return { skipped: true };

    // 담당자 주소 우선순위: 주문 계정 → 사업자 프로필 → 주문서 기재
    const to = b2b.account_email || b2b.profile_email || ctx.to;

    let bankAccount = '-';
    try {
        bankAccount = require('../../middleware/b2bContext').getSettings().bankAccountInfo || '-';
    } catch (err) {
        console.warn('[orderMailer] B2B 설정 조회 실패:', err.message);
    }

    const vars = {
        ...ctx.vars,
        company_name: b2b.company_name || ctx.vars.customer_name,
        business_number: b2b.business_number || '-',
        supply_amount: won(ctx.order.supply_amount),
        vat_amount: won(ctx.order.vat_amount),
        payment_due_at: dateOnly(b2b.payment_due_at),
        bank_account: bankAccount,
        purchase_order_number: b2b.purchase_order_number || '-',
        reject_reason: b2b.reject_reason || ctx.order.cancel_reason || '-',
    };

    return sendTemplateMail({ mallId: ctx.mallId, key, to, vars });
}

const B2B_CLAIM_KEY = {
    APPROVED: 'b2b_claim_approved',
    REJECTED: 'b2b_claim_rejected',
    REFUNDED: 'b2b_claim_refunded',
};

/**
 * 기업 주문의 클레임 처리 결과 안내.
 * B2B 환불은 계좌 이체라 '승인'과 '환불 완료'가 다른 시점이다 — 그래서 단계를 구분해 받는다.
 * @param {{claimId:number, kind:'APPROVED'|'REJECTED'|'REFUNDED', memo?:string, refundAmount?:number}} p
 */
async function notifyB2bClaim({ claimId, kind, memo = null, refundAmount = null }) {
    const key = B2B_CLAIM_KEY[kind];
    if (!key) return { skipped: true };

    const [[claim]] = await pool.query(
        'SELECT order_id, claim_type, reason_type, reason_detail, return_shipping_fee, admin_memo FROM order_claims WHERE id = ?',
        [claimId]
    ).catch(() => [[]]);
    if (!claim) return { skipped: true };

    const ctx = await buildOrderVars(claim.order_id).catch(() => null);
    if (!ctx) return { skipped: true };

    const [[b2b]] = await pool.query(
        `SELECT bp.company_name, bp.tax_invoice_email AS profile_email, u.email AS account_email
           FROM b2b_order_detail d
           JOIN business_profile bp ON bp.id = d.business_profile_id
           LEFT JOIN orders o ON o.id = d.order_id
           LEFT JOIN users u ON u.id = o.user_id
          WHERE d.order_id = ?`,
        [claim.order_id]
    ).catch(() => [[]]);
    if (!b2b) return { skipped: true };

    let amount = refundAmount;
    if (amount == null) {
        const [[refund]] = await pool.query(
            'SELECT refund_amount FROM order_refunds WHERE claim_id = ? ORDER BY id DESC LIMIT 1',
            [claimId]
        ).catch(() => [[]]);
        amount = refund ? refund.refund_amount : ctx.order.total_amount;
    }

    const vars = {
        ...ctx.vars,
        company_name: b2b.company_name || ctx.vars.customer_name,
        claim_type_label: CLAIM_LABEL[claim.claim_type] || '취소',
        claim_reason: claim.reason_detail || REASON_LABEL[claim.reason_type] || '-',
        refund_amount: won(amount),
        return_shipping_fee: won(claim.return_shipping_fee),
        admin_memo: memo || claim.admin_memo || '-',
    };

    return sendTemplateMail({
        mallId: ctx.mallId,
        key,
        to: b2b.account_email || b2b.profile_email || ctx.to,
        vars,
    });
}

module.exports = {
    buildOrderVars,
    notifyOrderPaid,
    notifyOrderShipped,
    notifyOrderDelivered,
    notifyClaimRequested,
    notifyClaimProcessed,
    notifyB2bOrder,
    notifyB2bClaim,
};
