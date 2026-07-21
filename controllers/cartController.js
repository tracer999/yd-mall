const pool = require('../config/db');
const { calcShippingFee } = require('../services/shipping/shippingCalculator');
const dealSvc = require('../services/deal/dealService');
const skuService = require('../services/catalog/skuService');
// B2B — 전용가·수량규칙·장바구니 유형(설계 §6.3)
const b2bPricingService = require('../services/b2b/b2bPricingService');

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

        /*
         * B2B 전용가를 특가보다 **먼저** 적용한다(주문서와 같은 순서).
         * 비활성 컨텍스트면 rows 가 그대로라 B2C 장바구니는 예전과 같다.
         */
        const isB2bCart = !!(req.b2b && req.b2b.active);
        if (isB2bCart) {
            const priced = await b2bPricingService.resolveForProducts(req.b2b, rows.map(r => r.product_id));
            for (const r of rows) {
                const info = priced.get(Number(r.product_id));
                if (!info || !info.visible || info.priceSource === 'B2C_FALLBACK') continue;
                // 담은 수량 기준으로 수량구간가를 다시 본다.
                const atQty = await b2bPricingService.resolveForProduct({ b2b: req.b2b, productId: r.product_id, quantity: r.quantity });
                r.b2b_list_price = r.price;
                r.price = atQty.unitPrice;
                r.b2b_price_source = atQty.priceSource;
                r.b2b_min_qty = atQty.minOrderQty;
                r.b2b_order_unit = atQty.orderUnit;
                r.b2b_qty_error = b2bPricingService.validateQuantity(
                    { min_order_qty: atQty.minOrderQty, order_unit: atQty.orderUnit, max_order_qty: atQty.maxOrderQty },
                    r.quantity
                );
            }
        }

        // 특가를 반영한 뒤 합계를 낸다 — 장바구니 금액이 주문서 금액과 어긋나면 안 된다.
        // B2B 라인은 위에서 이미 전용가가 잡혀 특가 대상이 아니다.
        if (!isB2bCart) await dealSvc.applyDeals(rows, { idKey: 'product_id' });

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
            isB2bCart,
            items: rows,
            totalQuantity,
            totalAmount,
            shipping,
            currentUser: req.user,
            stockError: req.query.error === 'stock' ? req.query.max : null,
            /*
             * B2B 관련 안내. 리다이렉트만 하고 이유를 안 보여주면 사용자는 왜 안 담겼는지 모른다.
             * 문구는 서버가 정한다 — 뷰가 error 코드를 해석하지 않게.
             */
            b2bNotice: (() => {
                switch (req.query.error) {
                    case 'b2b_qty':
                        return req.query.reason
                            ? `주문 수량 조건을 확인해 주세요 — ${req.query.reason}`
                            : '주문 수량 조건을 확인해 주세요.';
                    case 'mixed':
                        return req.query.type === 'B2B'
                            ? '개인 구매로 담은 상품이 있어 기업 상품을 함께 담을 수 없습니다. 장바구니를 비운 뒤 다시 담아 주세요.'
                            : '기업 구매로 담은 상품이 있어 함께 담을 수 없습니다. 장바구니를 비운 뒤 다시 담아 주세요.';
                    case 'switch_mode':
                        return '장바구니에 담긴 상품이 있어 구매 자격을 전환할 수 없습니다. 먼저 장바구니를 비워 주세요.';
                    default:
                        return null;
                }
            })()
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

        // 판매 SKU 확정: 옵션상품이면 선택 SKU, 아니면 대표 SKU. 재고는 SKU 기준.
        const selectedSkuId = parseInt(req.body.sku_id, 10) || null;
        const sku = await skuService.resolveSkuForLine(productId, selectedSkuId);
        if (!sku) return res.redirect('back');
        const skuId = sku.id;
        const stock = (sku.stock != null && sku.stock >= 0) ? sku.stock : 0;

        /*
         * 거래 유형 혼합 금지 (설계 §6.3).
         * 개인 구매와 기업 구매는 가격·주문절차·결제가 전부 다르다. 한 장바구니에 섞이면
         * 주문서에서 어느 쪽 규칙을 쓸지 정할 수 없다.
         */
        const cartType = (req.b2b && req.b2b.active) ? 'B2B' : 'B2C';
        const [[other]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM carts WHERE user_id = ? AND cart_type <> ?',
            [userId, cartType]
        );
        if (other.cnt > 0) {
            return res.redirect(`/cart?error=mixed&type=${cartType}`);
        }

        // 같은 SKU 라인만 합친다(옵션이 다르면 별도 라인).
        const [existingRows] = await pool.query(
            'SELECT id, quantity FROM carts WHERE user_id = ? AND product_id = ? AND sku_id <=> ?',
            [userId, productId, skuId]
        );

        const newQty = existingRows.length > 0 ? existingRows[0].quantity + qty : qty;
        if (newQty > stock) {
            return res.redirect(`/cart?error=stock&product=${productId}&max=${stock}`);
        }

        // B2B 는 최소 주문수량·주문단위를 담는 시점에도 검증한다(주문 시 또 한 번 본다).
        if (cartType === 'B2B') {
            const violations = await b2bPricingService.validateOrderItems(req.b2b, [{ product_id: productId, quantity: newQty }]);
            if (violations.length > 0) {
                return res.redirect(`/cart?error=b2b_qty&reason=${encodeURIComponent(violations[0].reason)}`);
            }
        }

        if (existingRows.length > 0) {
            await pool.query(
                'UPDATE carts SET quantity = ? WHERE id = ?',
                [newQty, existingRows[0].id]
            );
        } else {
            await pool.query(
                'INSERT INTO carts (user_id, product_id, sku_id, quantity, cart_type) VALUES (?, ?, ?, ?, ?)',
                [userId, productId, skuId, qty, cartType]
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
            `SELECT c.id AS cart_id, c.quantity, c.sku_id,
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
                `INSERT INTO order_items (order_id, product_id, sku_id, product_name, product_price, quantity, total_price)
                 VALUES (?, ?, ?, ?, ?, ?, ?)` ,
                [orderId, item.product_id, item.sku_id || null, item.name, price, quantity, lineTotal]
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
