/**
 * Shopify 라우트
 * - POST /shopify/webhooks         — Webhook 수신 (raw body 필요)
 * - GET  /shopify/markets          — 스토어 Markets 목록 조회
 * - POST /shopify/market-context   — 세션에 국가/언어 컨텍스트 저장
 * - POST /shopify/cart             — Cart 생성 및 checkoutUrl 반환
 * - GET  /shopify/cart/:id         — Cart 조회
 * - POST /shopify/cart-from-local  — 로컬 장바구니 아이템으로 Shopify Cart 생성
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const {
    verifyWebhookSignature,
    dispatchWebhook,
    createCart,
    getCart,
    getLocalization,
    isValidCountry,
    getProductByHandle,
} = require('../services/shopify');

// Webhook 수신 — raw body는 app.js에서 주입 (req.rawBody)
router.post('/webhooks', async (req, res) => {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'];

    if (!hmacHeader || !topic) {
        return res.status(400).json({ error: '필수 Shopify 헤더 누락' });
    }

    try {
        const rawBody = req.rawBody;
        if (!rawBody) {
            return res.status(400).json({ error: 'Raw body 없음' });
        }

        const valid = verifyWebhookSignature(rawBody, hmacHeader);
        if (!valid) {
            console.warn(`[Shopify Webhook] 서명 검증 실패 - topic: ${topic}`);
            return res.status(401).json({ error: '서명 검증 실패' });
        }

        const payload = JSON.parse(rawBody.toString('utf8'));
        await dispatchWebhook(topic, payload);

        res.status(200).json({ received: true });
    } catch (err) {
        console.error('[Shopify Webhook] 처리 오류:', err.message);
        res.status(500).json({ error: '내부 오류' });
    }
});

// Markets 목록 조회 — 스토어에 설정된 국가/통화/언어 반환
router.get('/markets', async (req, res) => {
    try {
        const localization = await getLocalization();
        res.json(localization);
    } catch (err) {
        console.error('[Shopify Markets] 조회 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 세션에 국가/언어 컨텍스트 저장
// Body: { countryCode: 'US', language: 'EN' }
router.post('/market-context', async (req, res) => {
    try {
        const { countryCode, language } = req.body;

        if (countryCode) {
            const valid = await isValidCountry(countryCode);
            if (!valid) {
                return res.status(400).json({ error: `지원하지 않는 국가 코드입니다: ${countryCode}` });
            }
            req.session.shopifyCountry = countryCode.toUpperCase();
        }
        if (language) {
            req.session.shopifyLanguage = language.toUpperCase();
        }

        res.json({
            country: req.session.shopifyCountry || null,
            language: req.session.shopifyLanguage || null,
        });
    } catch (err) {
        console.error('[Shopify Market Context] 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 현지화 가격 조회 — handle + country 기준 첫 번째 variant 가격 반환
// GET /shopify/price?handle=:handle&country=:country
router.get('/price', async (req, res) => {
    const handle = req.query.handle;
    const country = req.query.country || req.session.shopifyCountry || null;

    if (!handle) return res.status(400).json({ error: 'handle 파라미터가 필요합니다.' });

    try {
        const context = country ? { country } : {};
        const product = await getProductByHandle(handle, context);
        if (!product) return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });

        const variant = product.variants?.edges?.[0]?.node;
        if (!variant) return res.status(404).json({ error: 'variant 없음' });

        res.json({
            amount: variant.price.amount,
            currencyCode: variant.price.currencyCode,
            country: country || 'US',
        });
    } catch (err) {
        console.error('[Shopify Price] 조회 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Cart 생성 → checkoutUrl 반환
// Body: { items: [{ variantId, quantity }], countryCode }
// countryCode 미전달 시 세션 값 사용
router.post('/cart', async (req, res) => {
    try {
        const { items } = req.body;
        const countryCode = req.body.countryCode || req.session.shopifyCountry;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items 배열이 필요합니다.' });
        }

        const buyerIdentity = countryCode ? { countryCode } : null;
        const cart = await createCart(items, buyerIdentity);

        req.session.shopifyCartId = cart.id;

        res.json({
            cartId: cart.id,
            checkoutUrl: cart.checkoutUrl,
            cost: cart.cost,
        });
    } catch (err) {
        console.error('[Shopify Cart] 생성 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Cart 조회
router.get('/cart/:cartId', async (req, res) => {
    try {
        const cart = await getCart(req.params.cartId);
        if (!cart) return res.status(404).json({ error: 'Cart를 찾을 수 없습니다.' });
        res.json(cart);
    } catch (err) {
        console.error('[Shopify Cart] 조회 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 로컬 장바구니 → Shopify Cart 생성 → checkoutUrl 반환
// Body: { items: [{ productId, quantity }], countryCode }
// countryCode 미전달 시 세션 값 사용
router.post('/cart-from-local', async (req, res) => {
    try {
        const { items } = req.body;
        const countryCode = req.body.countryCode || req.session.shopifyCountry;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items 배열이 필요합니다.' });
        }

        const productIds = items.map(i => i.productId).filter(Boolean);
        if (productIds.length === 0) {
            return res.status(400).json({ error: '유효한 productId가 없습니다.' });
        }

        const [mappings] = await pool.query(
            'SELECT product_id, shopify_variant_id FROM shopify_product_mappings WHERE product_id IN (?)',
            [productIds]
        );

        const mappingMap = {};
        mappings.forEach(m => { mappingMap[String(m.product_id)] = m.shopify_variant_id; });

        const shopifyItems = items
            .filter(i => mappingMap[String(i.productId)])
            .map(i => ({ variantId: mappingMap[String(i.productId)], quantity: i.quantity || 1 }));

        if (shopifyItems.length === 0) {
            return res.status(400).json({ error: 'Shopify에 연동된 상품이 없습니다. 먼저 상품을 동기화해 주세요.' });
        }

        const buyerIdentity = countryCode ? { countryCode } : null;
        const cart = await createCart(shopifyItems, buyerIdentity);

        req.session.shopifyCartId = cart.id;

        res.json({
            cartId: cart.id,
            checkoutUrl: cart.checkoutUrl,
            cost: cart.cost,
            mappedCount: shopifyItems.length,
            totalCount: items.length,
        });
    } catch (err) {
        console.error('[Shopify Cart-from-local] 오류:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
