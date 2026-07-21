/*
 * 견적 상태 전이 (설계 §8.1).
 *
 * 전이 규칙의 **단일 소스**다. 컨트롤러가 `UPDATE quote SET status` 를 직접 쓰지 않는다.
 * 견적은 두 당사자가 번갈아 두는 협상이라, 규칙이 두 군데로 갈라지면 "고객이 수락했는데
 * 판매자 화면에선 아직 제안 중" 같은 상태가 생긴다.
 */

const pool = require('../../config/db');

const STATUS = {
    DRAFT: '작성 중',
    REQUESTED: '견적 요청',
    UNDER_REVIEW: '검토 중',
    SELLER_PROPOSED: '판매자 제안',
    BUYER_COUNTERED: '고객 재제안',
    BUYER_ACCEPTED: '고객 수락',
    SELLER_ACCEPTED: '판매자 수락',
    REJECTED: '반려',
    EXPIRED: '기간 만료',
    CONVERTED_TO_ORDER: '주문 전환',
    CANCELLED: '취소',
};

/** 확정 상태 — 주문으로 전환할 수 있다. */
const ACCEPTED = new Set(['BUYER_ACCEPTED', 'SELLER_ACCEPTED']);

/** 더 이상 협상이 진행되지 않는 상태. */
const CLOSED = new Set(['REJECTED', 'EXPIRED', 'CONVERTED_TO_ORDER', 'CANCELLED']);

/*
 * 허용 전이표. `actor` 는 누가 그 전이를 일으킬 수 있는지다.
 * BUYER = 거래처, SELLER = 관리자, SYSTEM = 만료 처리 등.
 */
const TRANSITIONS = {
    DRAFT: [
        { to: 'REQUESTED', actor: 'BUYER' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    REQUESTED: [
        { to: 'UNDER_REVIEW', actor: 'SELLER' },
        { to: 'SELLER_PROPOSED', actor: 'SELLER' },
        { to: 'REJECTED', actor: 'SELLER' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    UNDER_REVIEW: [
        { to: 'SELLER_PROPOSED', actor: 'SELLER' },
        { to: 'REJECTED', actor: 'SELLER' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    SELLER_PROPOSED: [
        { to: 'BUYER_COUNTERED', actor: 'BUYER' },
        { to: 'BUYER_ACCEPTED', actor: 'BUYER' },
        { to: 'EXPIRED', actor: 'SYSTEM' },
        { to: 'REJECTED', actor: 'SELLER' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    BUYER_COUNTERED: [
        { to: 'SELLER_PROPOSED', actor: 'SELLER' },
        { to: 'SELLER_ACCEPTED', actor: 'SELLER' },
        { to: 'REJECTED', actor: 'SELLER' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    BUYER_ACCEPTED: [
        { to: 'CONVERTED_TO_ORDER', actor: 'BUYER' },
        { to: 'CONVERTED_TO_ORDER', actor: 'SELLER' },
        { to: 'EXPIRED', actor: 'SYSTEM' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    SELLER_ACCEPTED: [
        { to: 'CONVERTED_TO_ORDER', actor: 'BUYER' },
        { to: 'CONVERTED_TO_ORDER', actor: 'SELLER' },
        { to: 'EXPIRED', actor: 'SYSTEM' },
        { to: 'CANCELLED', actor: 'BUYER' },
    ],
    REJECTED: [],
    EXPIRED: [],
    CONVERTED_TO_ORDER: [],
    CANCELLED: [],
};

/** 이 액터가 지금 상태에서 할 수 있는 전이 목록. 화면의 버튼 구성에 쓴다. */
function allowedFor(status, actor) {
    return (TRANSITIONS[status] || [])
        .filter((t) => t.actor === actor)
        .map((t) => t.to)
        .filter((v, i, arr) => arr.indexOf(v) === i);
}

function canTransition(from, to, actor) {
    return (TRANSITIONS[from] || []).some((t) => t.to === to && t.actor === actor);
}

/**
 * 상태를 바꾼다. 트랜잭션 커넥션을 넘기면 그 안에서 실행한다.
 *
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function transition(quoteId, to, { actor, conn = null } = {}) {
    const db = conn || pool;
    const [[q]] = await db.query('SELECT id, status FROM quote WHERE id = ?', [quoteId]);
    if (!q) return { ok: false, error: '견적을 찾을 수 없습니다.' };
    if (q.status === to) return { ok: true };

    if (!canTransition(q.status, to, actor)) {
        return {
            ok: false,
            error: `${STATUS[q.status] || q.status} 상태에서는 ${STATUS[to] || to} 로 바꿀 수 없습니다.`,
        };
    }
    await db.query('UPDATE quote SET status = ? WHERE id = ?', [to, quoteId]);
    return { ok: true };
}

/**
 * 유효기간이 지난 견적을 만료 처리한다.
 *
 * 스케줄러가 없으므로 조회 시점에 호출한다(목록·상세 진입). 만료는 되돌리지 않는다.
 */
async function expireOverdue() {
    const [r] = await pool.query(
        `UPDATE quote
            SET status = 'EXPIRED'
          WHERE status IN ('SELLER_PROPOSED','BUYER_ACCEPTED','SELLER_ACCEPTED')
            AND valid_until IS NOT NULL
            AND valid_until < CURDATE()`
    );
    return r.affectedRows;
}

module.exports = {
    STATUS,
    ACCEPTED,
    CLOSED,
    TRANSITIONS,
    allowedFor,
    canTransition,
    transition,
    expireOverdue,
};
