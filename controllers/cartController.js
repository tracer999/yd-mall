const pool = require('../config/db');
const { calcShippingFee } = require('../services/shipping/shippingCalculator');
const dealSvc = require('../services/deal/dealService');

// 장바구니 조회
exports.getCart = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }

    try {
        const userId = req.user.id;
        const [rows] = await pool.query(`
            SELECT c.id AS cart_id, c.quantity,
                   p.id AS product_id, p.name, p.provider, p.price, p.original_price, p.discount_rate,
                   p.main_image, p.thumbnail_image, p.slug
            FROM carts c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
        `, [userId]);

        // 특가를 반영한 뒤 합계를 낸다 — 장바구니 금액이 주문서 금액과 어긋나면 안 된다.
        await dealSvc.applyDeals(rows, { idKey: 'product_id' });

        let totalQuantity = 0;
        let totalAmount = 0;
        rows.forEach(item => {
            const q = item.quantity || 0;
            const price = item.price || 0;
            totalQuantity += q;
            totalAmount += q * price;
        });

        // 무료배송 임박 안내가 가장 효과적인 자리다(배송비 문서 §5-2).
        // 배송지가 아직 없으므로 지역 할증은 계산하지 않는다 — 기본 배송비만 보여준다.
        const shipping = await calcShippingFee({ mallId: req.mallId || 1, subtotalAmount: totalAmount });

        res.render('user/cart', {
            title: '장바구니',
            items: rows,
            totalQuantity,
            totalAmount,
            shipping,
            currentUser: req.user,
            stockError: req.query.error === 'stock' ? req.query.max : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 장바구니 추가
exports.addToCart = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }

    const userId = req.user.id;
    const productId = parseInt(req.body.product_id, 10);
    const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);

    if (!productId) {
        return res.redirect('back');
    }

    try {
        const [[product]] = await pool.query('SELECT stock FROM products WHERE id = ? AND status = "ON"', [productId]);
        if (!product) return res.redirect('back');
        const stock = (product.stock != null && product.stock >= 0) ? product.stock : 0;

        const [existingRows] = await pool.query(
            'SELECT id, quantity FROM carts WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );

        const newQty = existingRows.length > 0 ? existingRows[0].quantity + qty : qty;
        if (newQty > stock) {
            return res.redirect(`/cart?error=stock&product=${productId}&max=${stock}`);
        }

        if (existingRows.length > 0) {
            await pool.query(
                'UPDATE carts SET quantity = ? WHERE id = ?',
                [newQty, existingRows[0].id]
            );
        } else {
            await pool.query(
                'INSERT INTO carts (user_id, product_id, quantity) VALUES (?, ?, ?)',
                [userId, productId, qty]
            );
        }

        return res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 장바구니 단일 항목 삭제
exports.removeItem = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }

    const userId = req.user.id;
    const cartId = parseInt(req.params.id, 10);

    if (!cartId) {
        return res.redirect('/cart');
    }

    try {
        await pool.query('DELETE FROM carts WHERE id = ? AND user_id = ?', [cartId, userId]);
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 장바구니 수량 변경
exports.updateQuantity = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }

    const userId = req.user.id;
    const cartId = parseInt(req.params.id, 10);
    const qty = parseInt(req.body.quantity, 10);

    if (!cartId) {
        return res.redirect('/cart');
    }

    try {
        if (!qty || qty <= 0) {
            await pool.query('DELETE FROM carts WHERE id = ? AND user_id = ?', [cartId, userId]);
        } else {
            const [[cartItem]] = await pool.query(
                'SELECT c.product_id, p.stock FROM carts c JOIN products p ON c.product_id = p.id WHERE c.id = ? AND c.user_id = ?',
                [cartId, userId]
            );
            if (cartItem) {
                const stock = (cartItem.stock != null && cartItem.stock >= 0) ? cartItem.stock : 0;
                if (qty > stock) {
                    return res.redirect(`/cart?error=stock&max=${stock}`);
                }
            }
            await pool.query(
                'UPDATE carts SET quantity = ? WHERE id = ? AND user_id = ?',
                [qty, cartId, userId]
            );
        }
        res.redirect('/cart');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 장바구니 전체 구매 (간단 주문 생성 후 장바구니 비우기)
exports.checkoutAll = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }

    const userId = req.user.id;

    const connection = await pool.getConnection();
    try {
        // 장바구니 아이템 조회
        const [cartRows] = await connection.query(
            `SELECT c.id AS cart_id, c.quantity,
                    p.id AS product_id, p.name, p.price
             FROM carts c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_id = ?
             ORDER BY c.created_at ASC`,
            [userId]
        );

        if (cartRows.length === 0) {
            connection.release();
            return res.redirect('/cart');
        }

        /*
         * 이 경로는 재고를 차감하지 않는다(아래 트랜잭션에 products.stock UPDATE 가 없다).
         * 특가는 선착순 수량을 원자적으로 소진해야 하므로 여기서 처리하면 오버셀이 난다.
         * 특가 상품이 담겨 있으면 재고·수량을 제대로 잠그는 정규 결제로 보낸다.
         */
        const dealMap = await dealSvc.resolveForProducts(cartRows.map((r) => r.product_id), connection);
        if (dealMap.size > 0) {
            connection.release();
            return res.redirect('/checkout?cart=1');
        }

        await connection.beginTransaction();

        // 총 금액 계산
        let totalAmount = 0;
        cartRows.forEach(item => {
            const q = item.quantity || 0;
            const price = item.price || 0;
            totalAmount += q * price;
        });

        // 주문 번호 생성 (간단 버전)
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const rand = String(Math.floor(Math.random() * 900) + 100);
        const orderNumber = `ORD-${y}${m}${d}-${rand}`;

        // Orders 테이블에 주문 생성
        const [orderResult] = await connection.query(
            `INSERT INTO orders (user_id, mall_id, order_number, status, total_amount)
             VALUES (?, ?, ?, 'PAID', ?)` ,
            [userId, req.mallId || 1, orderNumber, totalAmount]
        );
        const orderId = orderResult.insertId;

        // Order Items 생성
        for (const item of cartRows) {
            const quantity = item.quantity || 0;
            const price = item.price || 0;
            const lineTotal = quantity * price;
            await connection.query(
                `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, total_price)
                 VALUES (?, ?, ?, ?, ?, ?)` ,
                [orderId, item.product_id, item.name, price, quantity, lineTotal]
            );
        }

        // 장바구니 비우기
        await connection.query('DELETE FROM carts WHERE user_id = ?', [userId]);

        await connection.commit();
        connection.release();

        return res.redirect('/cart/complete?orderNumber=' + encodeURIComponent(orderNumber));
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// 주문 완료 페이지
exports.getComplete = async (req, res) => {
    if (!req.user) {
        return res.redirect('/auth/login');
    }

    const orderNumber = req.query.orderNumber || null;
    let orderSummary = null;

    if (orderNumber) {
        try {
            const [orderRows] = await pool.query(
                `SELECT id, subtotal_amount, total_amount, coupon_discount, point_used, payment_method
                 FROM orders
                 WHERE order_number = ? AND user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [orderNumber, req.user.id]
            );

            if (orderRows.length > 0) {
                const order = orderRows[0];
                const [itemRows] = await pool.query(
                    `SELECT oi.product_id, oi.product_name, oi.quantity, oi.product_price,
                            p.slug, p.provider, c.name AS category_name
                     FROM order_items oi
                     LEFT JOIN products p ON oi.product_id = p.id
                     LEFT JOIN categories c ON p.category_id = c.id
                     WHERE oi.order_id = ?`,
                    [order.id]
                );

                orderSummary = {
                    order_number: orderNumber,
                    subtotal_amount: Number(order.subtotal_amount || 0),
                    total_amount: Number(order.total_amount || 0),
                    coupon_discount: Number(order.coupon_discount || 0),
                    point_used: Number(order.point_used || 0),
                    payment_method: order.payment_method || null,
                    items: itemRows.map((item) => ({
                        item_id: item.slug || String(item.product_id),
                        item_name: item.product_name,
                        price: Number(item.product_price || 0),
                        quantity: Number(item.quantity || 0),
                        item_brand: item.provider || null,
                        item_category: item.category_name || null,
                        currency: 'KRW'
                    }))
                };
            }
        } catch (err) {
            console.error('Order complete summary error:', err);
        }
    }

    res.render('user/cart_complete', {
        title: '주문 완료',
        orderNumber,
        orderSummary,
        currentUser: req.user
    });
};
