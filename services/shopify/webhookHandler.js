/**
 * Shopify Webhook 핸들러
 * HMAC-SHA256 서명 검증 + 이벤트별 처리
 */
const crypto = require('crypto');
const pool = require('../../config/db');

function verifyWebhookSignature(rawBody, hmacHeader) {
    // Custom App Webhook은 Client Secret으로 서명됨
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!secret) throw new Error('SHOPIFY_CLIENT_SECRET 환경변수가 설정되지 않았습니다.');

    const digest = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

async function handleOrderCreate(payload) {
    const orderId = String(payload.id);
    console.log(`[Shopify Webhook] orders/create - 주문 ID: ${orderId}, 고객: ${payload.email}`);

    try {
        await pool.query(
            `INSERT INTO shopify_orders
                (shopify_order_id, shopify_order_number, customer_email,
                 total_price, currency, financial_status, fulfillment_status, raw_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                financial_status = VALUES(financial_status),
                fulfillment_status = VALUES(fulfillment_status),
                raw_payload = VALUES(raw_payload),
                updated_at = NOW()`,
            [
                orderId,
                payload.name || null,
                payload.email || null,
                parseFloat(payload.total_price) || 0,
                payload.currency || 'USD',
                payload.financial_status || null,
                payload.fulfillment_status || null,
                JSON.stringify(payload),
            ]
        );
        console.log(`[Shopify Webhook] 주문 저장 완료: ${orderId}`);
    } catch (err) {
        console.error(`[Shopify Webhook] 주문 저장 실패: ${err.message}`);
    }
}

async function handleOrderPaid(payload) {
    const orderId = String(payload.id);
    console.log(`[Shopify Webhook] orders/paid - 주문 ID: ${orderId}`);

    try {
        await pool.query(
            `UPDATE shopify_orders SET financial_status = 'paid', updated_at = NOW()
             WHERE shopify_order_id = ?`,
            [orderId]
        );
    } catch (err) {
        console.error(`[Shopify Webhook] orders/paid 처리 실패: ${err.message}`);
    }
}

async function handleOrderCancelled(payload) {
    const orderId = String(payload.id);
    console.log(`[Shopify Webhook] orders/cancelled - 주문 ID: ${orderId}`);

    try {
        await pool.query(
            `UPDATE shopify_orders SET financial_status = 'cancelled', updated_at = NOW()
             WHERE shopify_order_id = ?`,
            [orderId]
        );
    } catch (err) {
        console.error(`[Shopify Webhook] orders/cancelled 처리 실패: ${err.message}`);
    }
}

async function handleInventoryUpdate(payload) {
    // payload.inventory_item_id는 numeric ID, GID로 변환해서 매핑 테이블 조회
    const numericId = String(payload.inventory_item_id);
    const gid = `gid://shopify/InventoryItem/${numericId}`;
    const available = payload.available;

    console.log(`[Shopify Webhook] inventory_levels/update - inventoryItem: ${numericId}, available: ${available}`);

    if (available === null || available === undefined) {
        console.warn('[Shopify Webhook] available 값 없음, 재고 업데이트 스킵');
        return;
    }

    try {
        const [rows] = await pool.query(
            'SELECT product_id FROM shopify_product_mappings WHERE shopify_inventory_item_id = ?',
            [gid]
        );

        if (rows.length === 0) {
            console.log(`[Shopify Webhook] 매핑 없음: ${gid} (무시)`);
            return;
        }

        const productId = rows[0].product_id;
        await pool.query(
            'UPDATE products SET stock = ? WHERE id = ?',
            [available, productId]
        );
        console.log(`[Shopify Webhook] 재고 동기화 완료: product_id=${productId}, stock=${available}`);
    } catch (err) {
        console.error(`[Shopify Webhook] inventory_levels/update 처리 실패: ${err.message}`);
    }
}

const TOPIC_HANDLERS = {
    'orders/create': handleOrderCreate,
    'orders/paid': handleOrderPaid,
    'orders/cancelled': handleOrderCancelled,
    'inventory_levels/update': handleInventoryUpdate,
};

async function dispatch(topic, payload) {
    const handler = TOPIC_HANDLERS[topic];
    if (!handler) {
        console.warn(`[Shopify Webhook] 처리기 없음: ${topic}`);
        return;
    }
    await handler(payload);
}

module.exports = { verifyWebhookSignature, dispatch };
