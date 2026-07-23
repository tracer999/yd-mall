/*
 * 리뷰 — 작성 자격 · 적립
 *
 * ── 누가 쓸 수 있나
 * **산 사람만** 쓴다. 그것도 물건을 받은 뒤에. 조건은 셋이다.
 *   1) 그 주문이 **내 주문**이고
 *   2) 주문이 **배송완료**(또는 구매확정)됐고
 *   3) 그 주문 품목으로 **아직 쓰지 않았다**
 *
 * 취소·반품된 품목은 쓸 수 없다. 돌려보낸 물건의 후기를 받을 이유가 없고,
 * 적립까지 나가면 "사서 반품하고 리뷰로 포인트만 받는" 길이 열린다.
 *
 * ── 적립은 비율이 아니라 금액이다
 * 리뷰는 상품값에 비례해 수고가 커지지 않는다. 10만원짜리 후기가 1만원짜리 후기보다
 * 10배 길지 않다. 그래서 정률이 아니라 **구매 금액 구간별 정액**으로 준다.
 * 구간은 운영자가 사이트 설정에서 만들고 지운다(review_point_policy).
 *
 * 회원 등급은 보지 않는다. 등급 혜택은 구매 적립에만 붙는다 — 리뷰는 등급과 무관한
 * "수고에 대한 보상"이라 등급별로 차등을 두면 설명하기 어려워진다.
 */

const pool = require('../../config/db');
const pointExpiry = require('../point/pointExpiryService');

/** 리뷰를 쓸 수 있는 주문 상태. 물건을 받은 뒤에만. */
const REVIEWABLE_STATUS = new Set(['DELIVERED']);

/**
 * 이 회원이 아직 리뷰를 쓰지 않은, 쓸 수 있는 주문 품목 목록.
 * 마이페이지에서 "리뷰 쓸 상품" 을 보여 줄 때 쓴다.
 */
async function getWritableItems(userId, { orderId = null, limit = 100 } = {}) {
    const params = [userId];
    let where = `o.user_id = ? AND o.status = 'DELIVERED'`;
    if (orderId) { where += ' AND o.id = ?'; params.push(Number(orderId)); }

    const [rows] = await pool.query(`
        SELECT oi.id AS order_item_id, oi.order_id, oi.product_id, oi.product_name,
               oi.option_snapshot, oi.quantity, oi.total_price,
               o.order_number, o.total_amount, o.mall_id,
               p.thumbnail_image, p.slug,
               s.delivered_at
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN products p ON p.id = oi.product_id
          LEFT JOIN shipments s ON s.order_id = o.id AND s.direction = 'OUTBOUND'
         WHERE ${where}
           AND oi.product_id IS NOT NULL
           -- 이미 쓴 품목 제외
           AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_item_id = oi.id)
           -- 취소·반품된 품목 제외
           AND NOT EXISTS (
                 SELECT 1 FROM order_claim_items ci
                   JOIN order_claims c ON c.id = ci.claim_id
                  WHERE ci.order_item_id = oi.id AND c.status IN ('REQUESTED','COMPLETED'))
         ORDER BY o.created_at DESC, oi.id
         LIMIT ?
    `, [...params, Number(limit)]);
    return rows;
}

/**
 * 이 주문 품목에 리뷰를 쓸 수 있는가.
 * @returns {{ok:boolean, reason?:string, item?:object}}
 */
async function canWrite(userId, orderItemId) {
    const [[item]] = await pool.query(`
        SELECT oi.id AS order_item_id, oi.order_id, oi.product_id, oi.product_name,
               o.user_id, o.status, o.total_amount, o.mall_id
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = ?
    `, [Number(orderItemId)]);

    if (!item) return { ok: false, reason: '주문 상품을 찾을 수 없습니다.' };
    if (Number(item.user_id) !== Number(userId)) return { ok: false, reason: '본인 주문만 리뷰를 쓸 수 있습니다.' };
    if (!REVIEWABLE_STATUS.has(item.status)) {
        return { ok: false, reason: '배송이 완료된 뒤에 리뷰를 쓸 수 있습니다.' };
    }

    const [[dup]] = await pool.query('SELECT id FROM reviews WHERE order_item_id = ?', [orderItemId]);
    if (dup) return { ok: false, reason: '이미 이 상품의 리뷰를 작성하셨습니다.' };

    const [[claimed]] = await pool.query(`
        SELECT 1 AS x FROM order_claim_items ci JOIN order_claims c ON c.id = ci.claim_id
         WHERE ci.order_item_id = ? AND c.status IN ('REQUESTED','COMPLETED') LIMIT 1`, [orderItemId]);
    if (claimed) return { ok: false, reason: '취소·반품하신 상품은 리뷰를 쓸 수 없습니다.' };

    return { ok: true, item };
}

/**
 * 구매 금액에 해당하는 적립 구간을 찾는다.
 * `min_amount` **이하** 중 가장 큰 구간이 적용된다(금액이 클수록 높은 구간).
 * 걸리는 구간이 없으면(예: 최소 구간보다 적게 삼) 적립 없음.
 */
async function findTier(mallId, amount) {
    const [[row]] = await pool.query(`
        SELECT * FROM review_point_policy
         WHERE mall_id = ? AND min_amount <= ?
         ORDER BY min_amount DESC LIMIT 1
    `, [Number(mallId) || 1, Number(amount) || 0]);
    return row || null;
}

/** 이 주문 금액으로 받게 될 적립액 미리보기. 화면 안내용. */
async function previewReward(mallId, amount) {
    const tier = await findTier(mallId, amount);
    if (!tier) return { text: 0, photo: 0, tier: null };
    return { text: Number(tier.text_point) || 0, photo: Number(tier.photo_point) || 0, tier };
}

/**
 * 리뷰 작성 + 적립.
 *
 * 적립은 리뷰와 **같은 트랜잭션**에서 준다. 리뷰만 저장되고 포인트가 빠지거나
 * 그 반대가 되면 어느 쪽도 설명할 수 없는 상태가 된다.
 *
 * @returns {{ok:boolean, reason?:string, reviewId?:number, reward?:number}}
 */
async function createReview({ userId, orderItemId, rating, content, imageUrl = null, mallId = 1 }) {
    const verdict = await canWrite(userId, orderItemId);
    if (!verdict.ok) return verdict;

    const star = Math.min(5, Math.max(1, Number.parseInt(rating, 10) || 0));
    if (!star) return { ok: false, reason: '별점을 선택해 주세요.' };
    const body = String(content || '').trim();
    if (body.length < 5) return { ok: false, reason: '리뷰 내용을 5자 이상 적어 주세요.' };

    const item = verdict.item;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 적립액은 **주문 결제금액** 기준으로 구간을 찾는다(상품 하나 값이 아니라).
        const orderMallId = item.mall_id || mallId || 1;
        const [[tier]] = await conn.query(`
            SELECT * FROM review_point_policy
             WHERE mall_id = ? AND min_amount <= ?
             ORDER BY min_amount DESC LIMIT 1
        `, [orderMallId, Number(item.total_amount) || 0]);

        // 사진을 올렸으면 사진 적립액으로 **대체**한다(글 적립에 더하지 않는다).
        let reward = 0;
        if (tier) {
            reward = imageUrl
                ? (Number(tier.photo_point) || Number(tier.text_point) || 0)
                : (Number(tier.text_point) || 0);
        }

        const [ins] = await conn.query(
            `INSERT INTO reviews (mall_id, user_id, product_id, order_id, order_item_id,
                                  rating, content, image_url, is_visible, point_awarded)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [orderMallId, userId, item.product_id, item.order_id, orderItemId,
             star, body.slice(0, 5000), imageUrl, reward]
        );

        if (reward > 0) {
            await conn.query('UPDATE users SET points_balance = points_balance + ? WHERE id = ?', [reward, userId]);
            await conn.query(
                `INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description, expires_at)
                 VALUES (?, ?, 'REVIEW_REWARD', ?, ?, ${pointExpiry.expiresAtSql()})`,
                [userId, reward, item.order_id,
                 `${imageUrl ? '사진 ' : ''}리뷰 작성 적립 — ${item.product_name}`.slice(0, 255)]
            );
        }

        await conn.commit();
        return { ok: true, reviewId: ins.insertId, reward };
    } catch (err) {
        await conn.rollback();
        // UNIQUE(order_item_id) 충돌 — 같은 품목에 두 번 쓰려 한 경우
        if (err && err.code === 'ER_DUP_ENTRY') {
            return { ok: false, reason: '이미 이 상품의 리뷰를 작성하셨습니다.' };
        }
        console.error('[review] 작성 실패:', err.message);
        return { ok: false, reason: '저장 중 오류가 발생했습니다.' };
    } finally {
        conn.release();
    }
}

/**
 * 내 리뷰 삭제.
 * **지급된 적립금은 회수하지 않는다.** 이미 썼을 수도 있고, 회수하면 "리뷰를 지웠더니
 * 포인트가 마이너스" 가 된다. 대신 그 품목에 다시 쓸 수는 있어도 적립은 한 번뿐이도록,
 * 삭제 시 품목 연결을 끊지 않고 행 자체를 지운다 — 재작성 시 적립이 또 나가는 것을 막으려면
 * 관리자 숨김(is_visible=0)을 쓰는 편이 낫다(관리자 화면 기본 동작).
 */
async function deleteMyReview(userId, reviewId) {
    const [[row]] = await pool.query('SELECT id, user_id FROM reviews WHERE id = ?', [reviewId]);
    if (!row) return { ok: false, reason: '리뷰를 찾을 수 없습니다.' };
    if (Number(row.user_id) !== Number(userId)) return { ok: false, reason: '본인 리뷰만 삭제할 수 있습니다.' };
    await pool.query('DELETE FROM reviews WHERE id = ?', [reviewId]);
    return { ok: true };
}

module.exports = {
    getWritableItems, canWrite, createReview, deleteMyReview,
    findTier, previewReward, REVIEWABLE_STATUS,
};
