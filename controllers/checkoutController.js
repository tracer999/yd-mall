const pool = require('../config/db');
const groupBuySvc = require('../services/groupBuy/groupBuyService');
const dealSvc = require('../services/deal/dealService');
const { calcShippingFee } = require('../services/shipping/shippingCalculator');
const { redeemCouponCode, reserveCouponForOrder } = require('../services/coupon/couponIssueService');
const {
    combinationGroup, couponableAmount, calcOrderDiscount, calcShippingDiscount,
    meetsMinOrder, benefitLabel,
} = require('../services/coupon/discountCalculator');

/*
 * ── 공동구매 연동 (docs/사이트개선/group_buy_design_and_development.md §9) ──
 *
 * `group_buy_id` 가 없으면 이 파일의 동작은 예전과 완전히 같다. 있으면 단일 상품
 * 바로구매 경로에서만 갈라지고, 결제 단가를 `groupBuySvc.resolveLine()` 이 서버에서
 * 다시 계산한다. 프론트가 보낸 가격은 어디서도 쓰지 않는다(§9-2).
 *
 * 장바구니(cart=1) 경로는 건드리지 않았다 — carts 에 가격·출처 컬럼이 없어 라인마다
 * 공동구매가를 실을 수 없다(2차).
 */

/** 공동구매 검증 실패 시 되돌아갈 곳. slug 를 모르면 목록으로. */
function groupBuyErrorRedirect(line) {
    return line.slug
        ? `/group-buy/${encodeURIComponent(line.slug)}?error=${line.reason}`
        : '/group-buy';
}

/*
 * 쿠폰 적용범위(scope_json) 판정에 필요한 상품 속성. 주문 라인마다 실어 나른다.
 * 이 컬럼들이 없으면 카테고리·브랜드·뱃지 쿠폰이 전 상품에 걸린다.
 */
const PRODUCT_SCOPE_COLS = `p.id AS product_id, p.name, p.price,
    p.category_id, p.brand_category_id, p.product_badge`;

function toScopeItem(row) {
    return {
        product_id: row.product_id,
        name: row.name,
        price: row.price,
        category_id: row.category_id,
        brand_id: row.brand_category_id,
        badges: row.product_badge ? String(row.product_badge).split(',') : [],
    };
}

/**
 * 지금 쓸 수 있는 쿠폰 (미사용 + 미점유 + 유효기간 내 + 몰 스코프).
 *
 *  · 유효기간은 `COALESCE(uc.expires_at, c.valid_to)` — valid_days 로 발급된 쿠폰은 개인별 만료일이 있다.
 *  · 다른 PENDING 주문이 점유 중인 쿠폰은 제외한다(C2). 30분 넘게 방치된 점유는 무시한다
 *    — 점유 해제 배치가 없으므로 조회 시 나이로 거른다(§6-2 각주).
 *  · `uc.id` 를 `user_coupon_id` 로 내보낸다. `c.id` 는 쿠폰 마스터 id 다 — 섞으면 안 된다.
 */
async function loadUsableCoupons(userId, mallId) {
    const [rows] = await pool.query(
        `SELECT uc.id AS user_coupon_id, c.*
           FROM user_coupons uc
           JOIN coupons c ON uc.coupon_id = c.id
          WHERE uc.user_id = ? AND uc.used_at IS NULL AND c.status = 'ACTIVE'
            AND (c.mall_id IS NULL OR c.mall_id = ?)
            AND (uc.reserved_order_id IS NULL OR uc.reserved_at < NOW() - INTERVAL 30 MINUTE)
            AND (c.valid_from IS NULL OR c.valid_from <= NOW())
            AND (COALESCE(uc.expires_at, c.valid_to) IS NULL OR COALESCE(uc.expires_at, c.valid_to) >= NOW())`,
        [userId, mallId]
    );
    return rows;
}

/** 전체 사용 한도(max_total_uses) 재검증 (C4). 발급 한도(issue_limit)와 다른 축이다. */
async function usageLimitReached(coupon) {
    if (coupon.max_total_uses == null) return false;
    const [[row]] = await pool.query(
        'SELECT COUNT(*) AS c FROM user_coupons WHERE coupon_id = ? AND used_at IS NOT NULL',
        [coupon.id]
    );
    return Number(row.c) >= Number(coupon.max_total_uses);
}

/**
 * 주문 번호 생성 (토스 orderId: 6자 이상 64자 이하, 영문/숫자/-_)
 */
function generateOrderNumber() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 90000) + 10000);
    return `ORD-${y}${m}${d}-${rand}`;
}

/**
 * 주문의 재고 검증 (결제 전 재고 확인)
 * @returns {{ ok: boolean, productName?: string, available?: number }}
 */
async function validateStockForOrder(orderId) {
    const [items] = await pool.query(
        `SELECT oi.product_id, oi.product_name, oi.quantity, p.stock
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
        [orderId]
    );
    for (const item of items) {
        const available = (item.stock != null && item.stock >= 0) ? item.stock : 0;
        if (item.quantity > available) {
            return { ok: false, productName: item.product_name, available };
        }
    }
    return { ok: true };
}

/**
 * 재고 확인 + 차감 + 주문 PAID 업데이트를 한 트랜잭션으로 처리
 * @param {number} orderId - orders.id (PK)
 * @param {{ paymentKey?: string, paymentMethod: string }} opts
 * @returns {{ ok: boolean }}
 */
async function completeOrderWithStockAndPaid(orderId, opts = {}) {
    const { paymentKey = null, paymentMethod = 'CARD' } = opts;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 쿠폰·적립금·배송비는 **주문 행이 유일한 근거**다. 요청에서 읽지 않는다(배송비 문서 §1-1).
        const [[orderRow]] = await conn.query(
            `SELECT user_id, coupon_discount, point_used, user_coupon_id, shipping_coupon_id,
                    subtotal_amount, shipping_fee, shipping_discount, total_amount
               FROM orders WHERE id = ?`,
            [orderId]
        );

        const [items] = await conn.query(
            'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
            [orderId]
        );
        for (const item of items) {
            const [[row]] = await conn.query(
                'SELECT stock FROM products WHERE id = ? FOR UPDATE',
                [item.product_id]
            );
            const stock = (row && row.stock != null && row.stock >= 0) ? row.stock : 0;
            if (item.quantity > stock) {
                await conn.rollback();
                return { ok: false };
            }
            await conn.query(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        await conn.query(
            `UPDATE orders SET status = 'PAID', payment_key = ?, payment_method = ?, paid_at = NOW() WHERE id = ?`,
            [paymentKey, paymentMethod, orderId]
        );

        if (orderRow && orderRow.user_id) {
            const userId = orderRow.user_id;
            const pointUsed = Number(orderRow.point_used) || 0;

            // 점유(RESERVED) → 사용(USED). 주문 쿠폰과 배송비 쿠폰 둘 다 소모한다.
            for (const ucId of [orderRow.user_coupon_id, orderRow.shipping_coupon_id].filter(Boolean)) {
                await conn.query(
                    'UPDATE user_coupons SET used_at = NOW(), order_id = ?, reserved_order_id = NULL, reserved_at = NULL WHERE id = ?',
                    [orderId, ucId]
                );
            }

            if (pointUsed > 0) {
                await conn.query(
                    'UPDATE users SET points_balance = points_balance - ? WHERE id = ?',
                    [pointUsed, userId]
                );
                await conn.query(
                    'INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description) VALUES (?, ?, ?, ?, ?)',
                    [userId, -pointUsed, 'PURCHASE_USE', orderId, '주문 결제 사용']
                );
            }

            // 적립은 상품 결제액에만 붙인다. 배송비에 적립을 주면 배송비를 내고 포인트를 버는 셈이 된다.
            const rate = Number(global.systemSettings?.point_accumulate_rate || 5) || 5;
            const netShipping = (Number(orderRow.shipping_fee) || 0) - (Number(orderRow.shipping_discount) || 0);
            const payAmount = Math.max(0, (Number(orderRow.total_amount) || 0) - netShipping);
            const accumulate = Math.floor((payAmount * rate) / 100);
            if (accumulate > 0) {
                await conn.query(
                    'UPDATE users SET points_balance = points_balance + ? WHERE id = ?',
                    [accumulate, userId]
                );
                await conn.query(
                    'INSERT INTO point_transactions (user_id, amount, transaction_type, order_id, description) VALUES (?, ?, ?, ?, ?)',
                    [userId, accumulate, 'PURCHASE_ACCUMULATE', orderId, `구매 적립 (${rate}%)`]
                );
            }
        }

        /*
         * 공동구매 참여 기록 (§9-1).
         *
         * 같은 트랜잭션 안에서 돌린다 — 결제는 확정됐는데 참여 수량은 안 올라간 상태를
         * 만들지 않기 위해서다. 공동구매 주문이 아니면 order_items 스캔 1회로 끝난다.
         * 재실행돼도 uk_gb_participation_order_item 때문에 중복 집계되지 않는다.
         */
        await groupBuySvc.recordParticipation(conn, orderId);

        await conn.commit();
        return { ok: true };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * 토스페이먼츠 결제 취소 API 호출
 */
async function cancelTossPayment(paymentKey, secretKey, cancelReason) {
    const auth = Buffer.from(secretKey + ':').toString('base64');
    const resp = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cancelReason: cancelReason || '재고 부족' })
    });
    return resp.ok;
}

/**
 * 비로그인 시 회원/비회원 선택
 */
exports.getChoose = async (req, res) => {
    if (req.user) {
        const redirect = `/checkout?${new URLSearchParams(req.query).toString()}`;
        return res.redirect(redirect);
    }
    res.render('user/checkout/choose', {
        title: '구매 방법 선택',
        query: req.query
    });
};

/**
 * 주문 폼 표시 (GET)
 * - 비로그인 + guest=1: 비회원 주문 폼
 * - 로그인: 회원 주문 폼 (주소 프리필)
 */
exports.getForm = async (req, res) => {
    const { product_id, quantity, guest, cart, error, success, group_buy_id } = req.query;
    const isGuest = guest === '1';

    if (!req.user && !isGuest) {
        const qs = new URLSearchParams(req.query).toString();
        return res.redirect(`/checkout/choose?${qs}`);
    }

    let items = [];
    let totalAmount = 0;

    if (cart === '1' && req.user) {
        const [rows] = await pool.query(
            `SELECT c.id AS cart_id, c.quantity, ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image
             FROM carts c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_id = ? AND p.status = 'ON'`,
            [req.user.id]
        );
        rows.forEach((r) => {
            const qty = r.quantity || 1;
            items.push({ ...toScopeItem(r), quantity: qty, image: r.main_image || r.thumbnail_image });
            totalAmount += r.price * qty;
        });
    } else if (group_buy_id && product_id && quantity) {
        // 공동구매 바로구매 — 단가는 group_buy_product.group_buy_price 로 서버가 확정한다.
        const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
        if (!line.ok) return res.redirect(groupBuyErrorRedirect(line));

        const [[p]] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image FROM products p WHERE p.id = ?`,
            [line.product.product_id]
        );
        items = [{
            ...(p ? toScopeItem(p) : { product_id: line.product.product_id, name: line.product.name }),
            price: line.unitPrice,           // 공동구매가가 상품 정가를 이긴다
            quantity: line.quantity,
            image: p ? (p.main_image || p.thumbnail_image) : null,
        }];
        totalAmount = line.unitPrice * line.quantity;
    } else if (product_id && quantity) {
        const pid = parseInt(product_id, 10);
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const [rows] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.main_image, p.thumbnail_image FROM products p WHERE p.id = ? AND p.status = 'ON'`,
            [pid]
        );
        if (rows.length === 0) return res.redirect('/products');
        const p = rows[0];
        items = [{ ...toScopeItem(p), quantity: qty, image: p.main_image || p.thumbnail_image }];
        totalAmount = p.price * qty;
    }

    if (items.length === 0) return res.redirect('/products');

    const user = req.user || null;
    let pointsBalance = 0;
    let pointMinUse = 1000;
    if (user) {
        const [[uRow]] = await pool.query('SELECT points_balance FROM users WHERE id = ?', [user.id]);
        pointsBalance = (uRow && uRow.points_balance) || 0;
        pointMinUse = Number(global.systemSettings?.point_min_use || 1000) || 1000;
    }

    const prefilled = user ? {
        buyer_name: user.name || '',
        buyer_email: user.email || '',
        buyer_phone: user.phone || '',
        receiver_name: user.name || '',
        receiver_phone: user.phone || '',
        receiver_zipcode: user.zipcode || '',
        receiver_address: user.address || '',
        receiver_detailed_address: user.detailed_address || ''
    } : {};

    // 화면 표시용 배송비. 주문 생성 시 서버가 다시 계산한다(§1-1) — 이 값은 총액의 근거가 아니다.
    const shipping = await calcShippingFee({
        mallId: req.mallId || 1,
        subtotalAmount: totalAmount,
        receiverZipcode: prefilled.receiver_zipcode,
    });

    /*
     * 쿠폰을 두 그룹으로 나눠 넘긴다 (§6-1).
     *   ORDER    → 주문 쿠폰 1장 (user_coupon_id)
     *   SHIPPING → 배송비 쿠폰 1장 (shipping_coupon_id)
     * 적용 가능/불가 사유도 서버가 판정한다 — 뷰가 조건을 다시 조립하지 않는다(§7-3).
     */
    const usable = user ? await loadUsableCoupons(user.id, req.mallId || 1) : [];
    const options = usable.map((c) => {
        const group = combinationGroup(c);
        const couponable = couponableAmount(items, c);
        const ok = meetsMinOrder(c, couponable);
        const discount = group === 'SHIPPING'
            ? calcShippingDiscount(c, shipping.fee)
            : calcOrderDiscount(c, couponable);
        return {
            id: c.user_coupon_id,
            name: c.name,
            group,
            benefit: benefitLabel(c),
            minOrder: Number(c.min_order_amount) || 0,
            couponable,
            discount,
            applicable: ok && discount > 0,
            reason: !ok
                ? `${Number(c.min_order_amount).toLocaleString('ko-KR')}원 이상 구매 시 사용 가능 (현재 ${couponable.toLocaleString('ko-KR')}원)`
                : (discount === 0 ? (group === 'SHIPPING' ? '배송비가 없어 사용할 수 없습니다' : '할인 대상 상품이 없습니다') : null),
        };
    });

    res.render('user/checkout/form', {
        title: '주문/결제',
        items,
        totalAmount,
        isGuest,
        prefilled,
        query: req.query,
        orderCoupons: options.filter((o) => o.group === 'ORDER'),
        shippingCoupons: options.filter((o) => o.group === 'SHIPPING'),
        pointsBalance: typeof pointsBalance === 'number' ? pointsBalance : 0,
        pointMinUse: typeof pointMinUse === 'number' ? pointMinUse : 1000,
        shipping,
        error,
        success
    });
};

/**
 * 배송비 재조회 (AJAX) — 배송지 우편번호가 바뀌면 화면 배송비를 갱신한다.
 *
 * 클라이언트는 우편번호만 보낸다. **금액은 보내지 않는다.** 상품 금액은 서버가 장바구니·상품에서
 * 다시 구한다. 이 응답 역시 표시용이며, 주문 생성 시 서버가 한 번 더 계산한다.
 */
exports.postShippingFee = async (req, res) => {
    try {
        const { product_id, quantity, cart, group_buy_id, receiver_zipcode } = req.body;
        let subtotalAmount = 0;

        if (cart === '1' && req.user) {
            const [[row]] = await pool.query(
                `SELECT COALESCE(SUM(p.price * c.quantity), 0) AS subtotal
                   FROM carts c JOIN products p ON c.product_id = p.id
                  WHERE c.user_id = ? AND p.status = 'ON'`,
                [req.user.id]
            );
            subtotalAmount = Number(row.subtotal) || 0;
        } else if (group_buy_id && product_id && quantity) {
            const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
            if (line.ok) subtotalAmount = line.unitPrice * line.quantity;
        } else if (product_id && quantity) {
            const qty = Math.max(1, parseInt(quantity, 10) || 1);
            const [[p]] = await pool.query('SELECT price FROM products WHERE id = ? AND status = "ON"', [parseInt(product_id, 10)]);
            if (p) subtotalAmount = p.price * qty;
        }

        const shipping = await calcShippingFee({
            mallId: req.mallId || 1,
            subtotalAmount,
            receiverZipcode: receiver_zipcode,
        });
        return res.json({ ok: true, subtotalAmount, shipping });
    } catch (err) {
        console.error('[Checkout] postShippingFee error:', err);
        return res.status(500).json({ ok: false });
    }
};

/**
 * 쿠폰 코드 적용 (SPECIAL 타입) - 회원만
 */
exports.postApplyCouponCode = async (req, res) => {
    if (!req.user) {
        const qs = new URLSearchParams(req.body).toString();
        return res.redirect('/checkout/choose?' + qs);
    }
    const code = String(req.body.coupon_code || '').trim();
    const redirectParams = new URLSearchParams();
    if (req.body.product_id) redirectParams.set('product_id', req.body.product_id);
    if (req.body.quantity) redirectParams.set('quantity', req.body.quantity);
    if (req.body.cart) redirectParams.set('cart', req.body.cart);
    const qs = redirectParams.toString();

    if (!code) {
        return res.redirect('/checkout?error=coupon_code_empty&' + qs);
    }

    try {
        // 코드 입력형은 `coupon_type='SPECIAL'` 이 아니라 `issue_method='CODE'` 로 식별한다.
        const result = await redeemCouponCode(req.user.id, code);
        if (!result.ok) {
            const map = { not_found: 'coupon_code_invalid', already_held: 'coupon_code_duplicate', issue_limit: 'coupon_code_limit' };
            return res.redirect(`/checkout?error=${map[result.reason] || 'coupon_code_error'}&` + qs);
        }
        return res.redirect('/checkout?success=coupon_applied&' + qs);
    } catch (err) {
        console.error('[Checkout] apply coupon code error:', err);
        return res.redirect('/checkout?error=coupon_code_error&' + qs);
    }
};

/**
 * 주문 생성 (POST) → PENDING, redirect /checkout/pay/:orderId
 */
exports.postForm = async (req, res) => {
    const {
        product_id, quantity, cart, group_buy_id,
        buyer_name, buyer_email, buyer_phone,
        receiver_name, receiver_phone, receiver_zipcode, receiver_address, receiver_detailed_address,
        shipping_message,
        user_coupon_id, shipping_coupon_id, point_use_amount
    } = req.body;
    const isGuest = req.body.guest === '1';

    if (!req.user && !isGuest) {
        return res.redirect('/checkout/choose');
    }

    let items = [];
    if (cart === '1' && req.user) {
        const [rows] = await pool.query(
            `SELECT c.quantity, ${PRODUCT_SCOPE_COLS}, p.stock
             FROM carts c JOIN products p ON c.product_id = p.id
             WHERE c.user_id = ? AND p.status = 'ON'`,
            [req.user.id]
        );
        for (const r of rows) {
            const qty = r.quantity || 1;
            const stock = (r.stock != null && r.stock >= 0) ? r.stock : 0;
            if (qty > stock) {
                return res.redirect(`/cart?error=stock&product=${r.product_id}&max=${stock}`);
            }
            items.push({ ...toScopeItem(r), quantity: qty });
        }
    } else if (group_buy_id && product_id && quantity) {
        // 주문서를 거치지 않고 이 POST 를 직접 두드릴 수 있으므로 여기서도 다시 검증한다.
        const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
        if (!line.ok) return res.redirect(groupBuyErrorRedirect(line));

        const [[p]] = await pool.query(`SELECT ${PRODUCT_SCOPE_COLS} FROM products p WHERE p.id = ?`, [line.product.product_id]);
        items = [{
            ...(p ? toScopeItem(p) : { product_id: line.product.product_id, name: line.product.name }),
            price: line.unitPrice,
            quantity: line.quantity,
            source_type: 'GROUP_BUY',
            source_id: line.groupBuy.id,
        }];
    } else if (product_id && quantity) {
        const pid = parseInt(product_id, 10);
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const [rows] = await pool.query(
            `SELECT ${PRODUCT_SCOPE_COLS}, p.stock, p.slug FROM products p WHERE p.id = ? AND p.status = 'ON'`, [pid]
        );
        if (rows.length === 0) return res.redirect('/products');
        const p = rows[0];
        const stock = (p.stock != null && p.stock >= 0) ? p.stock : 0;
        if (qty > stock) {
            const path = p.slug ? `/products/${encodeURIComponent(p.slug)}` : `/products/view/${pid}`;
            return res.redirect(`${path}?error=stock&max=${stock}`);
        }
        items = [{ ...toScopeItem(p), quantity: qty }];
    }

    if (items.length === 0) return res.redirect('/products');

    const subtotalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    /*
     * 배송비는 서버가 계산한다 (배송비 문서 §1-1).
     * 폼에 shipping_fee 필드를 두지 않는다 — 화면 표시값은 참고일 뿐 총액의 근거가 아니다.
     * 무료배송 판정은 쿠폰·적립금 차감 전 `subtotalAmount` 로 한다 (§1-2).
     * 배송비 쿠폰보다 **먼저** 구해야 한다 — 배송비 할인이 배송비를 넘을 수 없기 때문이다.
     */
    const shipping = await calcShippingFee({
        mallId: req.mallId || 1,
        subtotalAmount,
        receiverZipcode: receiver_zipcode,
    });
    const shippingFee = shipping.fee;

    let couponDiscount = 0;
    let shippingDiscount = 0;
    let pointUsed = 0;
    let userCouponId = null;
    let shippingCouponId = null;

    /**
     * 선택된 쿠폰을 검증하고 할인액을 돌려준다. 쿼리스트링·폼의 금액은 절대 믿지 않는다.
     * @returns {{error:string}|{coupon:object, discount:number}}
     */
    const validateCoupon = async (userCouponId_, expectedGroup) => {
        const usable = await loadUsableCoupons(req.user.id, req.mallId || 1);
        const coupon = usable.find((c) => Number(c.user_coupon_id) === Number(userCouponId_));
        if (!coupon) return { error: 'coupon' };
        if (combinationGroup(coupon) !== expectedGroup) return { error: 'coupon' };
        if (await usageLimitReached(coupon)) return { error: 'coupon_limit' };

        const couponable = couponableAmount(items, coupon);
        if (!meetsMinOrder(coupon, couponable)) return { error: 'coupon_min' };

        const discount = expectedGroup === 'SHIPPING'
            ? calcShippingDiscount(coupon, shippingFee)   // ≤ shippingFee 를 계산기가 보장한다 (P9)
            : calcOrderDiscount(coupon, couponable);      // ≤ couponable 을 계산기가 보장한다
        return { coupon, discount };
    };

    if (req.user) {
        // 1. 주문 쿠폰 (ORDER 그룹) — 1장
        if (user_coupon_id) {
            const r = await validateCoupon(user_coupon_id, 'ORDER');
            if (r.error) return res.redirect(`/checkout?error=${r.error}&` + new URLSearchParams(req.query).toString());
            // 적용범위(scope_json)에 걸려 할인 대상 상품이 하나도 없으면 쿠폰을 태우지 않는다.
            if (r.discount === 0) {
                return res.redirect('/checkout?error=coupon_scope&' + new URLSearchParams(req.query).toString());
            }
            couponDiscount = r.discount;
            userCouponId = Number(user_coupon_id);
        }

        /*
         * 2. 배송비 쿠폰 (SHIPPING 그룹) — 1장. 주문 쿠폰과 동시 적용된다 (§6-1)
         *
         * 배송비가 0원이면(무료배송 기준 초과) 할인액도 0이다. 이때 쿠폰을 붙이면 **소모만 되고
         * 혜택은 없다.** 조용히 떼어 낸다 — 주문을 막을 이유는 없다.
         */
        if (shipping_coupon_id) {
            const r = await validateCoupon(shipping_coupon_id, 'SHIPPING');
            if (r.error) return res.redirect(`/checkout?error=${r.error}&` + new URLSearchParams(req.query).toString());
            if (r.discount > 0) {
                shippingDiscount = r.discount;
                shippingCouponId = Number(shipping_coupon_id);
            }
        }

        // 3. 포인트 (상품 할인 후 남은 상품금액 기준 — 배송비는 포인트로 결제하지 않는다)
        const pointMinUse = Number(global.systemSettings?.point_min_use || 1000) || 1000;
        const reqPoint = Math.abs(Number(point_use_amount) || 0);
        if (reqPoint > 0) {
            const [[uRow]] = await pool.query('SELECT points_balance FROM users WHERE id = ?', [req.user.id]);
            const balance = (uRow && uRow.points_balance) || 0;
            if (reqPoint > balance) {
                return res.redirect('/checkout?error=point&' + new URLSearchParams(req.query).toString());
            }
            if (reqPoint % pointMinUse !== 0) {
                return res.redirect('/checkout?error=point_min&' + new URLSearchParams(req.query).toString());
            }
            if (reqPoint > subtotalAmount - couponDiscount) {
                return res.redirect('/checkout?error=point_max&' + new URLSearchParams(req.query).toString());
            }
            pointUsed = reqPoint;
        }
    }

    // 계산 순서는 배송비 문서 §4 와 쿠폰 문서 §9 가 같아야 한다.
    //   subtotal − coupon − point + shipping_fee − shipping_discount = total
    const totalAmount = Math.max(0, subtotalAmount - couponDiscount - pointUsed + shippingFee - shippingDiscount);
    const orderNumber = generateOrderNumber();

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const userId = req.user ? req.user.id : null;
        const shippingAddr = [receiver_zipcode, receiver_address, receiver_detailed_address].filter(Boolean).join(' ');

        await connection.query(
            `INSERT INTO orders (
                user_id, order_number, status, subtotal_amount, shipping_fee, shipping_discount,
                total_amount, coupon_discount, point_used, user_coupon_id, shipping_coupon_id,
                receiver_name, receiver_phone, receiver_zipcode, receiver_address, receiver_detailed_address,
                shipping_address, shipping_message,
                buyer_name, buyer_email, buyer_phone
            ) VALUES (?, ?, 'PENDING', ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?)`,
            [
                userId, orderNumber, subtotalAmount, shippingFee, shippingDiscount,
                totalAmount, couponDiscount, pointUsed, userCouponId, shippingCouponId,
                receiver_name, receiver_phone, receiver_zipcode || null, receiver_address || null, receiver_detailed_address || null,
                shippingAddr || null, shipping_message || null,
                isGuest ? buyer_name : null, isGuest ? buyer_email : null, isGuest ? buyer_phone : null
            ]
        );
        const orderId = (await connection.query('SELECT LAST_INSERT_ID() as id'))[0][0].id;

        /*
         * 쿠폰 점유 (C2). 같은 쿠폰을 두 개의 PENDING 주문이 물면, 먼저 결제되는 쪽만 살고
         * 나머지는 "할인은 받았는데 쿠폰은 안 쓰인" 상태가 된다. 조건부 UPDATE 로 잡는다.
         * 주문 쿠폰과 배송비 쿠폰을 둘 다 잡는다 — 어느 하나라도 실패하면 주문을 만들지 않는다.
         */
        for (const ucId of [userCouponId, shippingCouponId].filter(Boolean)) {
            const reserved = await reserveCouponForOrder(connection, {
                userCouponId: ucId, userId: req.user.id, orderId,
            });
            if (!reserved) {
                await connection.rollback();
                connection.release();
                return res.redirect('/checkout?error=coupon_reserved&' + new URLSearchParams(req.query).toString());
            }
        }

        for (const item of items) {
            const lineTotal = item.price * item.quantity;
            // source_type/source_id 는 nullable — 일반 주문에는 NULL 이 들어간다(§9-1).
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, total_price, source_type, source_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.name, item.price, item.quantity, lineTotal,
                    item.source_type || null, item.source_id || null]
            );
        }

        if (cart === '1' && req.user) {
            await connection.query('DELETE FROM carts WHERE user_id = ?', [req.user.id]);
        }

        await connection.commit();
        connection.release();

        // 비회원 주문에는 소유자를 판정할 user_id 가 없다. 주문 완료 화면이 남의 주문번호로
        // 배송지를 노출하지 않도록, 이 세션이 만든 주문번호만 기억해 둔다(getComplete 참고).
        if (!userId && req.session) {
            req.session.guestOrders = [...((req.session.guestOrders || []).slice(-9)), orderNumber];
        }

        return res.redirect(`/checkout/pay/${orderNumber}`);
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('[Checkout] postForm error:', err);
        return res.status(500).send('주문 생성 중 오류가 발생했습니다.');
    }
};

/**
 * 결제창 페이지
 */
exports.getPay = async (req, res) => {
    const { orderId } = req.params;
    const [rows] = await pool.query(
        'SELECT id, order_number, total_amount, status, coupon_discount, point_used, user_coupon_id, subtotal_amount FROM orders WHERE order_number = ?',
        [orderId]
    );
    if (rows.length === 0 || rows[0].status !== 'PENDING') {
        return res.redirect('/checkout/fail?reason=invalid');
    }
    const order = rows[0];
    const clientKey = (global.systemSettings && global.systemSettings.tosspayments_client_key) || process.env.TOSSPAYMENTS_CLIENT_KEY;
    const domain = (global.systemSettings && global.systemSettings.domain) || process.env.DOMAIN || 'http://localhost:3000';
    const baseUrl = domain.replace(/\/$/, '');

    res.render('user/checkout/pay', {
        title: '결제하기',
        order,
        clientKey,
        successUrl: `${baseUrl}/checkout/success`,
        failUrl: `${baseUrl}/checkout/fail`
    });
};

/**
 * 결제 성공 콜백 → 승인 API 호출 → complete 리다이렉트
 */
exports.getSuccess = async (req, res) => {
    const { paymentKey, orderId, amount } = req.query;
    if (!paymentKey || !orderId || !amount) {
        return res.redirect('/checkout/fail?reason=missing');
    }

    const [rows] = await pool.query('SELECT id, total_amount, status FROM orders WHERE order_number = ?', [orderId]);
    if (rows.length === 0 || rows[0].status !== 'PENDING') {
        return res.redirect('/checkout/fail?reason=invalid');
    }
    const order = rows[0];
    const expectedAmount = parseInt(amount, 10);
    if (order.total_amount !== expectedAmount) {
        return res.redirect('/checkout/fail?reason=amount');
    }

    const secretKey = (global.systemSettings && global.systemSettings.tosspayments_secret_key) || process.env.TOSSPAYMENTS_SECRET_KEY;
    if (!secretKey) {
        console.error('[Checkout] TOSSPAYMENTS_SECRET_KEY not configured');
        return res.redirect('/checkout/fail?reason=config');
    }

    try {
        const stockCheck = await validateStockForOrder(order.id);
        if (!stockCheck.ok) {
            return res.redirect('/checkout/fail?reason=stock');
        }

        const auth = Buffer.from(secretKey + ':').toString('base64');
        const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paymentKey, orderId, amount: expectedAmount })
        });

        if (!resp.ok) {
            const errBody = await resp.text();
            console.error('[Checkout] Toss confirm fail:', resp.status, errBody);
            return res.redirect('/checkout/fail?reason=approve');
        }

        const completeResult = await completeOrderWithStockAndPaid(order.id, {
            paymentKey,
            paymentMethod: 'CARD'
        });
        if (!completeResult.ok) {
            await cancelTossPayment(paymentKey, secretKey, '재고 부족으로 인한 결제 취소');
            return res.redirect('/checkout/fail?reason=stock');
        }

        return res.redirect(`/checkout/complete?orderId=${encodeURIComponent(orderId)}`);
    } catch (err) {
        console.error('[Checkout] getSuccess error:', err);
        return res.redirect('/checkout/fail?reason=error');
    }
};

/**
 * 결제 실패
 */
exports.getFail = (req, res) => {
    const reason = req.query.reason || 'unknown';
    res.render('user/checkout/fail', {
        title: '결제 실패',
        reason
    });
};

/**
 * 주문 완료
 *
 * ⚠️ 이 함수는 과거 `?test=1&coupon_discount=...&user_coupon_id=...` 쿼리스트링을 그대로 믿고
 *    주문을 PAID 로 확정했다. 결제 없이 주문 완료가 가능했고, 남의 user_coupon_id 를 주입해
 *    타인의 쿠폰을 소모시킬 수 있었다(쿠폰 문서 C3).
 *
 *    지금은 세 가지를 지킨다.
 *      1) 쿠폰·포인트·배송비는 요청에서 읽지 않는다. 주문 행이 유일한 근거다.
 *      2) 테스트 확정 경로는 NODE_ENV 로 잠근다. 클라이언트가 켤 수 없다.
 *      3) 주문 소유자만 조회할 수 있다(비회원은 주문 생성 시 세션에 남긴 주문번호로 판정).
 */
function isTestCheckoutAllowed(req) {
    return process.env.NODE_ENV !== 'production' && req.query.test === '1';
}

function isOrderOwner(req, order) {
    if (order.user_id) {
        return !!(req.user && Number(req.user.id) === Number(order.user_id));
    }
    const guestOrders = (req.session && req.session.guestOrders) || [];
    return guestOrders.includes(order.order_number);
}

exports.getComplete = async (req, res) => {
    const orderNumber = req.query.orderId;
    let order = null;

    if (orderNumber) {
        const [rows] = await pool.query(
            'SELECT id, user_id, order_number, status FROM orders WHERE order_number = ?',
            [orderNumber]
        );
        const found = rows[0];

        if (found && isOrderOwner(req, found)) {
            if (found.status === 'PENDING' && isTestCheckoutAllowed(req)) {
                const completeResult = await completeOrderWithStockAndPaid(found.id, { paymentMethod: 'TEST' });
                if (!completeResult.ok) {
                    return res.redirect('/checkout/fail?reason=stock');
                }
            }

            const [paidRows] = await pool.query(
                `SELECT o.id, o.order_number, o.subtotal_amount, o.coupon_discount, o.point_used,
                        o.shipping_fee, o.shipping_discount, o.total_amount,
                        o.receiver_name, o.receiver_phone, o.shipping_address, o.created_at
                 FROM orders o WHERE o.id = ? AND o.status = 'PAID'`,
                [found.id]
            );
            if (paidRows.length > 0) order = paidRows[0];
        }
    }
    res.render('user/checkout/complete', {
        title: '주문 완료',
        order
    });
};
