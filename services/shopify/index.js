/**
 * Shopify 서비스 통합 진입점
 */
const { storefrontQuery } = require('./storefrontClient');
const { adminQuery } = require('./adminClient');
const { getProductByHandle, getProducts } = require('./productService');
const { createCart, addLinesToCart, getCart } = require('./cartService');
const { verifyWebhookSignature, dispatch: dispatchWebhook } = require('./webhookHandler');
const { getLocalization, isValidCountry } = require('./marketsService');

module.exports = {
    storefrontQuery,
    adminQuery,
    getProductByHandle,
    getProducts,
    createCart,
    addLinesToCart,
    getCart,
    verifyWebhookSignature,
    dispatchWebhook,
    getLocalization,
    isValidCountry,
};
