const pool = require('../config/db');
const groupBuySvc = require('../services/groupBuy/groupBuyService');
const { calcShippingFee } = require('../services/shipping/shippingCalculator');

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
            `SELECT user_id, coupon_discount, point_used, user_coupon_id,
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
            const userCouponId = orderRow.user_coupon_id;

            if (userCouponId) {
                await conn.query(
                    'UPDATE user_coupons SET used_at = NOW(), order_id = ? WHERE id = ?',
                    [orderId, userCouponId]
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
            `SELECT c.id AS cart_id, c.quantity, p.id AS product_id, p.name, p.price, p.main_image, p.thumbnail_image
             FROM carts c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_id = ? AND p.status = 'ON'`,
            [req.user.id]
        );
        rows.forEach((r) => {
            const price = r.price;
            const qty = r.quantity || 1;
            items.push({ product_id: r.product_id, name: r.name, price, quantity: qty, image: r.main_image || r.thumbnail_image });
            totalAmount += price * qty;
        });
    } else if (group_buy_id && product_id && quantity) {
        // 공동구매 바로구매 — 단가는 group_buy_product.group_buy_price 로 서버가 확정한다.
        const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
        if (!line.ok) return res.redirect(groupBuyErrorRedirect(line));

        const [[p]] = await pool.query(
            'SELECT id, name, main_image, thumbnail_image FROM products WHERE id = ?', [line.product.product_id]
        );
        items = [{
            product_id: line.product.product_id,
            name: p ? p.name : line.product.name,
            price: line.unitPrice,
            quantity: line.quantity,
            image: p ? (p.main_image || p.thumbnail_image) : null,
        }];
        totalAmount = line.unitPrice * line.quantity;
    } else if (product_id && quantity) {
        const pid = parseInt(product_id, 10);
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const [rows] = await pool.query(
            'SELECT id, name, price, main_image, thumbnail_image FROM products WHERE id = ? AND status = "ON"',
            [pid]
        );
        if (rows.length === 0) return res.redirect('/products');
        const p = rows[0];
        const price = p.price;
        items = [{ product_id: p.id, name: p.name, price, quantity: qty, image: p.main_image || p.thumbnail_image }];
        totalAmount = price * qty;
    }

    if (items.length === 0) return res.redirect('/products');

    const user = req.user || null;
    let userCoupons = [];
    let pointsBalance = 0;
    let pointMinUse = 1000;
    if (user) {
        const [ucRows] = await pool.query(
            `SELECT uc.id, uc.coupon_id, c.name, c.discount_amount, c.min_order_amount
             FROM user_coupons uc
             JOIN coupons c ON uc.coupon_id = c.id
             WHERE uc.user_id = ? AND uc.used_at IS NULL AND c.is_active = 1
               AND (c.valid_from IS NULL OR c.valid_from <= NOW())
               AND (c.valid_to IS NULL OR c.valid_to >= NOW())`,
            [user.id]
        );
        userCoupons = ucRows;
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

    res.render('user/checkout/form', {
        title: '주문/결제',
        items,
        totalAmount,
        isGuest,
        prefilled,
        query: req.query,
        userCoupons: userCoupons || [],
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
        const [couponRows] = await pool.query(
            'SELECT * FROM coupons WHERE code = ? AND coupon_type = ? AND is_active = 1 AND valid_to >= NOW()',
            [code, 'SPECIAL']
        );
        if (couponRows.length === 0) {
            return res.redirect('/checkout?error=coupon_code_invalid&' + qs);
        }
        const coupon = couponRows[0];

        const [existing] = await pool.query(
            'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? AND used_at IS NULL',
            [req.user.id, coupon.id]
        );
        if (existing.length > 0) {
            return res.redirect('/checkout?error=coupon_code_duplicate&' + qs);
        }

        if (coupon.max_total_uses != null) {
            const [usageCount] = await pool.query(
                'SELECT COUNT(*) as c FROM user_coupons WHERE coupon_id = ?',
                [coupon.id]
            );
            if (usageCount[0].c >= coupon.max_total_uses) {
                return res.redirect('/checkout?error=coupon_code_limit&' + qs);
            }
        }

        await pool.query(
            'INSERT INTO user_coupons (user_id, coupon_id, issued_by) VALUES (?, ?, ?)',
            [req.user.id, coupon.id, 'CODE']
        );
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
        user_coupon_id, point_use_amount
    } = req.body;
    const isGuest = req.body.guest === '1';

    if (!req.user && !isGuest) {
        return res.redirect('/checkout/choose');
    }

    let items = [];
    if (cart === '1' && req.user) {
        const [rows] = await pool.query(
            `SELECT c.quantity, p.id AS product_id, p.name, p.price, p.stock
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
            const price = r.price;
            items.push({ product_id: r.product_id, name: r.name, price, quantity: qty });
        }
    } else if (group_buy_id && product_id && quantity) {
        // 주문서를 거치지 않고 이 POST 를 직접 두드릴 수 있으므로 여기서도 다시 검증한다.
        const line = await groupBuySvc.resolveLine(req.mallId || 1, group_buy_id, product_id, quantity);
        if (!line.ok) return res.redirect(groupBuyErrorRedirect(line));

        items = [{
            product_id: line.product.product_id,
            name: line.product.name,
            price: line.unitPrice,
            quantity: line.quantity,
            source_type: 'GROUP_BUY',
            source_id: line.groupBuy.id,
        }];
    } else if (product_id && quantity) {
        const pid = parseInt(product_id, 10);
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const [rows] = await pool.query('SELECT id, name, price, stock FROM products WHERE id = ? AND status = "ON"', [pid]);
        if (rows.length === 0) return res.redirect('/products');
        const p = rows[0];
        const stock = (p.stock != null && p.stock >= 0) ? p.stock : 0;
        if (qty > stock) {
            const [[prod]] = await pool.query('SELECT slug FROM products WHERE id = ?', [pid]);
            const path = (prod && prod.slug) ? `/products/${encodeURIComponent(prod.slug)}` : `/products/view/${pid}`;
            return res.redirect(`${path}?error=stock&max=${stock}`);
        }
        const price = p.price;
        items = [{ product_id: p.id, name: p.name, price, quantity: qty }];
    }

    if (items.length === 0) return res.redirect('/products');

    const subtotalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let couponDiscount = 0;
    let pointUsed = 0;
    let userCouponId = null;

    if (req.user) {
        // 1. 쿠폰 우선 적용
        if (user_coupon_id) {
            const [ucRows] = await pool.query(
                `SELECT uc.id, uc.coupon_id, c.discount_amount, c.min_order_amount, c.max_total_uses
                 FROM user_coupons uc
                 JOIN coupons c ON uc.coupon_id = c.id
                 WHERE uc.id = ? AND uc.user_id = ? AND uc.used_at IS NULL AND c.is_active = 1
                   AND (c.valid_from IS NULL OR c.valid_from <= NOW())
                   AND (c.valid_to IS NULL OR c.valid_to >= NOW())`,
                [user_coupon_id, req.user.id]
            );
            if (ucRows.length === 0) {
                return res.redirect('/checkout?error=coupon&' + new URLSearchParams(req.query).toString());
            }
            const uc = ucRows[0];

            // 전체 사용 한도 재검증 (C4). getForm 의 쿠폰 목록 조회는 이걸 보지 않는다.
            if (uc.max_total_uses != null) {
                const [[usedRow]] = await pool.query(
                    'SELECT COUNT(*) AS c FROM user_coupons WHERE coupon_id = ? AND used_at IS NOT NULL',
                    [uc.coupon_id]
                );
                if (Number(usedRow.c) >= Number(uc.max_total_uses)) {
                    return res.redirect('/checkout?error=coupon_limit&' + new URLSearchParams(req.query).toString());
                }
            }

            const minOrder = uc.min_order_amount || 0;
            if (subtotalAmount < minOrder) {
                return res.redirect('/checkout?error=coupon_min&' + new URLSearchParams(req.query).toString());
            }
            couponDiscount = Math.min(uc.discount_amount, subtotalAmount);
            userCouponId = user_coupon_id;
        }

        // 2. 포인트 적용 (쿠폰 할인 후 남은 금액 기준)
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

    /*
     * 배송비는 서버가 계산한다 (배송비 문서 §1-1).
     * 폼에 shipping_fee 필드를 두지 않는다 — 화면 표시값은 참고일 뿐 총액의 근거가 아니다.
     * 무료배송 판정은 쿠폰·적립금 차감 전 `subtotalAmount` 로 한다 (§1-2).
     */
    const shipping = await calcShippingFee({
        mallId: req.mallId || 1,
        subtotalAmount,
        receiverZipcode: receiver_zipcode,
    });
    const shippingFee = shipping.fee;
    const shippingDiscount = 0; // 배송비 쿠폰은 2차 (쿠폰 문서 P7~P9)

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
                total_amount, coupon_discount, point_used, user_coupon_id,
                receiver_name, receiver_phone, receiver_zipcode, receiver_address, receiver_detailed_address,
                shipping_address, shipping_message,
                buyer_name, buyer_email, buyer_phone
            ) VALUES (?, ?, 'PENDING', ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?)`,
            [
                userId, orderNumber, subtotalAmount, shippingFee, shippingDiscount,
                totalAmount, couponDiscount, pointUsed, userCouponId,
                receiver_name, receiver_phone, receiver_zipcode || null, receiver_address || null, receiver_detailed_address || null,
                shippingAddr || null, shipping_message || null,
                isGuest ? buyer_name : null, isGuest ? buyer_email : null, isGuest ? buyer_phone : null
            ]
        );
        const orderId = (await connection.query('SELECT LAST_INSERT_ID() as id'))[0][0].id;

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
