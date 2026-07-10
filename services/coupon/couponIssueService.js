/*
 * 쿠폰 발급 · 점유 · 복원 (쿠폰 문서 §6-2 · §6-3)
 *
 * 발급 경로가 다섯 개다 — 가입 자동지급 · 관리자 지급 · 코드 입력 · 다운로드 · 이벤트.
 * 다섯 곳이 각자 선착순과 유효기간을 계산하면 반드시 어긋난다. 여기 한 곳에 모은다.
 *
 * ── 두 한도는 다른 축이다 (§5-2)
 *      issue_limit / issued_count   수령(발급) 한도. 선착순 수량
 *      max_total_uses               사용 한도. 결제 시점에 checkoutController 가 검증한다
 *    옛 코드는 max_total_uses 를 발급 한도로 썼다. 마이그레이션이 그 값을 issue_limit 로 옮겼다.
 *
 * ── 선착순은 애플리케이션이 아니라 DB 가 판정한다
 *    COUNT 후 INSERT 하면 동시 요청에 초과 발급된다. 조건부 UPDATE 의 affectedRows 로
 *    슬롯을 **먼저 확보**한 뒤 행을 넣는다(event 모듈이 이미 쓰는 패턴).
 */

const pool = require('../../config/db');

const ISSUED_BY = ['AUTO', 'ADMIN', 'CODE', 'DOWNLOAD', 'EVENT'];

/** 쿠폰을 지금 발급할 수 있는 상태인가. 수령 기간은 DOWNLOAD 에만 적용된다. */
function couponIssuable(coupon) {
    if (coupon.status !== 'ACTIVE') return { ok: false, reason: 'inactive' };
    if (coupon.valid_to && new Date(coupon.valid_to) < new Date()) return { ok: false, reason: 'expired' };
    return { ok: true };
}

/** 수령 기간(다운로드 전용). NULL 은 제한 없음. */
function downloadOpen(coupon) {
    const now = new Date();
    if (coupon.download_start_at && new Date(coupon.download_start_at) > now) return { ok: false, reason: 'not_started' };
    if (coupon.download_end_at && new Date(coupon.download_end_at) < now) return { ok: false, reason: 'ended' };
    return { ok: true };
}

/** valid_days 가 있으면 발급 시점 기준 만료일을 계산해 박는다. 없으면 NULL(= coupons.valid_to 를 쓴다). */
function calcExpiresAt(coupon) {
    if (!coupon.valid_days) return null;
    const d = new Date();
    d.setDate(d.getDate() + Number(coupon.valid_days));
    return d;
}

/**
 * 선착순 슬롯을 확보한다. 확보에 성공해야 발급할 수 있다.
 * @returns {Promise<boolean>} false = 마감
 */
async function reserveIssueSlot(conn, couponId) {
    const [r] = await conn.query(
        `UPDATE coupons SET issued_count = issued_count + 1
          WHERE id = ? AND (issue_limit IS NULL OR issued_count < issue_limit)`,
        [couponId]
    );
    return r.affectedRows === 1;
}

/** 확보한 슬롯을 되돌린다(중복 수령 등으로 INSERT 가 실패했을 때). */
async function releaseIssueSlot(conn, couponId) {
    await conn.query('UPDATE coupons SET issued_count = GREATEST(0, issued_count - 1) WHERE id = ?', [couponId]);
}

/**
 * 쿠폰 한 장을 회원에게 발급한다. 호출측이 트랜잭션을 연다.
 *
 * `skipIfHeld` 가 true 면 **미사용 상태로 이미 보유** 중일 때 건너뛴다(가입·관리자 지급의 현행 사양).
 * 다운로드는 `coupon_download` PK 가 1인 1회를 보장하므로 이 플래그를 쓰지 않는다.
 *
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function issueCoupon(conn, { userId, coupon, issuedBy, skipIfHeld = true }) {
    if (!ISSUED_BY.includes(issuedBy)) throw new Error(`unknown issued_by: ${issuedBy}`);

    const issuable = couponIssuable(coupon);
    if (!issuable.ok) return issuable;

    if (skipIfHeld) {
        const [held] = await conn.query(
            'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? AND used_at IS NULL',
            [userId, coupon.id]
        );
        if (held.length > 0) return { ok: false, reason: 'already_held' };
    }

    if (!(await reserveIssueSlot(conn, coupon.id))) return { ok: false, reason: 'issue_limit' };

    try {
        await conn.query(
            'INSERT INTO user_coupons (user_id, coupon_id, issued_by, expires_at) VALUES (?, ?, ?, ?)',
            [userId, coupon.id, issuedBy, calcExpiresAt(coupon)]
        );
    } catch (err) {
        await releaseIssueSlot(conn, coupon.id);
        throw err;
    }
    return { ok: true };
}

/**
 * 다운로드 수령. 중복은 `coupon_download` PK 가 DB 레벨에서 막는다.
 * 호출측이 트랜잭션을 연다 — 슬롯 확보와 중복 차단이 한 단위여야 한다.
 */
async function claimDownloadCoupon(conn, { userId, coupon }) {
    if (coupon.issue_method !== 'DOWNLOAD') return { ok: false, reason: 'not_downloadable' };

    const issuable = couponIssuable(coupon);
    if (!issuable.ok) return issuable;

    const open = downloadOpen(coupon);
    if (!open.ok) return open;

    if (!(await reserveIssueSlot(conn, coupon.id))) return { ok: false, reason: 'sold_out' };

    try {
        await conn.query('INSERT INTO coupon_download (user_id, coupon_id) VALUES (?, ?)', [userId, coupon.id]);
    } catch (err) {
        await releaseIssueSlot(conn, coupon.id);
        if (err.code === 'ER_DUP_ENTRY') return { ok: false, reason: 'already_claimed' };
        throw err;
    }

    await conn.query(
        'INSERT INTO user_coupons (user_id, coupon_id, issued_by, expires_at) VALUES (?, ?, ?, ?)',
        [userId, coupon.id, 'DOWNLOAD', calcExpiresAt(coupon)]
    );
    return { ok: true };
}

/**
 * 쿠폰 코드로 수령한다 (C5). 체크아웃과 쿠폰존이 같은 경로를 쓴다.
 * @returns {Promise<{ok:boolean, reason?:string, coupon?:object}>}
 */
async function redeemCouponCode(userId, rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return { ok: false, reason: 'empty' };

    const [rows] = await pool.query(
        "SELECT * FROM coupons WHERE code = ? AND issue_method = 'CODE' AND status = 'ACTIVE'",
        [code]
    );
    if (rows.length === 0) return { ok: false, reason: 'not_found' };
    const coupon = rows[0];

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await issueCoupon(conn, { userId, coupon, issuedBy: 'CODE' });
        if (!result.ok) {
            await conn.rollback();
            return result;
        }
        await conn.commit();
        return { ok: true, coupon };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 주문 생성 시 쿠폰을 점유한다 (C2). 이미 다른 주문이 잡고 있으면 실패한다.
 *
 * 결제하지 않고 떠난 PENDING 주문의 점유는 영원히 남는다. 해제 배치는 3차이므로,
 * 그때까지는 **30분 지난 점유를 새 주문이 빼앗을 수 있게** 한다(§6-2 각주).
 * 조회(getForm)도 같은 기준으로 거른다 — 두 기준이 어긋나면 목록엔 보이는데 선택은 실패한다.
 *
 * @returns {Promise<boolean>} false = 이미 다른 주문이 사용 중
 */
const RESERVE_TTL_MINUTES = 30;

async function reserveCouponForOrder(conn, { userCouponId, userId, orderId }) {
    const [r] = await conn.query(
        `UPDATE user_coupons SET reserved_order_id = ?, reserved_at = NOW()
          WHERE id = ? AND user_id = ? AND used_at IS NULL
            AND (reserved_order_id IS NULL OR reserved_at < NOW() - INTERVAL ? MINUTE)`,
        [orderId, userCouponId, userId, RESERVE_TTL_MINUTES]
    );
    return r.affectedRows === 1;
}

module.exports = {
    issueCoupon,
    claimDownloadCoupon,
    redeemCouponCode,
    reserveCouponForOrder,
    reserveIssueSlot,
    releaseIssueSlot,
    calcExpiresAt,
    couponIssuable,
    downloadOpen,
};
