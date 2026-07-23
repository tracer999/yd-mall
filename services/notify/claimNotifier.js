/*
 * 클레임 진행 문자 안내
 *
 * 이메일 안내(orderMailer)는 이미 있다. 여기는 **문자**다 — 취소·반품은 돈이 걸린 일이라
 * 메일함을 안 보는 고객에게도 닿아야 한다.
 *
 * 문구를 짧게 유지한다. 90바이트를 넘으면 LMS 로 나가 요금이 오르고, 정작 고객이 알아야 할
 * "무엇이 어떻게 됐는지" 는 한 줄이면 충분하다. 자세한 내용은 마이페이지에서 본다.
 *
 * 발송 실패는 절대 클레임 처리를 되돌리지 않는다. 로그만 남긴다.
 */

const pool = require('../../config/db');
const sms = require('./smsService');

const TYPE_LABEL = { CANCEL: '취소', RETURN: '반품', EXCHANGE: '교환' };

/** 주문의 연락처 — 받는 분 번호가 없으면 주문자 번호, 그것도 없으면 회원 번호. */
async function resolvePhone(orderId) {
    const [[row]] = await pool.query(`
        SELECT o.buyer_phone, o.receiver_phone, o.buyer_name, o.order_number, u.phone AS user_phone, u.name AS user_name
          FROM orders o LEFT JOIN users u ON u.id = o.user_id
         WHERE o.id = ?`, [orderId]);
    if (!row) return null;
    return {
        phone: row.buyer_phone || row.receiver_phone || row.user_phone || null,
        name: row.buyer_name || row.user_name || '고객',
        orderNumber: row.order_number,
    };
}

function shopName() {
    const s = global.systemSettings || {};
    return s.company_name || (global.siteSettings && global.siteSettings.company_name) || '';
}

/** 접수 안내 — 신청이 들어왔다. */
async function notifyRequested({ orderId, claimType, autoApproved }) {
    if (!sms.isEnabled()) return { skipped: true };
    const info = await resolvePhone(orderId);
    if (!info || !info.phone) return { skipped: true, reason: '연락처 없음' };

    const label = TYPE_LABEL[claimType] || '클레임';
    const text = autoApproved
        ? `[${shopName()}] 주문 ${info.orderNumber} ${label}가 완료되었습니다. 환불은 결제수단에 따라 영업일 기준 3~5일 소요됩니다.`
        : `[${shopName()}] 주문 ${info.orderNumber} ${label} 신청이 접수되었습니다. 처리 결과를 다시 안내드리겠습니다.`;

    const r = await sms.sendAlimtalk({
        to: info.phone, text, title: `${label} 접수`,
        templateCode: (global.systemSettings || {}).alimtalk_tpl_claim_requested,
    });
    if (!r.ok && !r.skipped) console.error('[claimNotifier] 접수 문자 실패:', r.reason);
    return r;
}

/** 처리 결과 — 승인/거절. */
async function notifyProcessed({ claimId, approved, refundAmount }) {
    if (!sms.isEnabled()) return { skipped: true };
    const [[claim]] = await pool.query(
        'SELECT order_id, claim_type FROM order_claims WHERE id = ?', [claimId]);
    if (!claim) return { skipped: true };

    const info = await resolvePhone(claim.order_id);
    if (!info || !info.phone) return { skipped: true, reason: '연락처 없음' };

    const label = TYPE_LABEL[claim.claim_type] || '클레임';
    let text;
    if (!approved) {
        text = `[${shopName()}] 주문 ${info.orderNumber} ${label} 신청이 반려되었습니다. 자세한 사유는 마이페이지에서 확인해 주세요.`;
    } else if (claim.claim_type === 'EXCHANGE') {
        text = `[${shopName()}] 주문 ${info.orderNumber} 교환이 승인되었습니다. 회수 후 새 상품을 발송해 드립니다.`;
    } else {
        const amount = refundAmount != null ? `${Number(refundAmount).toLocaleString('ko-KR')}원 ` : '';
        text = `[${shopName()}] 주문 ${info.orderNumber} ${label}가 승인되었습니다. ${amount}환불은 결제수단에 따라 영업일 기준 3~5일 소요됩니다.`;
    }

    const r = await sms.sendAlimtalk({
        to: info.phone, text, title: `${label} ${approved ? '승인' : '반려'}`,
        templateCode: (global.systemSettings || {}).alimtalk_tpl_claim_processed,
    });
    if (!r.ok && !r.skipped) console.error('[claimNotifier] 처리 문자 실패:', r.reason);
    return r;
}

/** 회수 접수 — 반품·교환 물건을 가지러 간다. */
async function notifyReturnPickup({ claimId, courier, trackingNumber }) {
    if (!sms.isEnabled()) return { skipped: true };
    const [[claim]] = await pool.query('SELECT order_id, claim_type FROM order_claims WHERE id = ?', [claimId]);
    if (!claim) return { skipped: true };
    const info = await resolvePhone(claim.order_id);
    if (!info || !info.phone) return { skipped: true, reason: '연락처 없음' };

    const text = `[${shopName()}] 주문 ${info.orderNumber} 회수가 접수되었습니다. ${courier} ${trackingNumber} · 상품을 포장해 두시면 기사님이 방문합니다.`;
    const r = await sms.sendAlimtalk({
        to: info.phone, text, title: '회수 접수',
        templateCode: (global.systemSettings || {}).alimtalk_tpl_return_pickup,
    });
    if (!r.ok && !r.skipped) console.error('[claimNotifier] 회수 문자 실패:', r.reason);
    return r;
}

module.exports = { notifyRequested, notifyProcessed, notifyReturnPickup };
