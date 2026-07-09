/**
 * Shopify Cart 서비스 (Storefront API)
 * Cart 생성 → 상품 추가 → checkoutUrl 반환
 */
const { storefrontQuery } = require('./storefrontClient');

const CART_CREATE = `
  mutation CartCreate($lines: [CartLineInput!], $buyerIdentity: CartBuyerIdentityInput) {
    cartCreate(input: { lines: $lines, buyerIdentity: $buyerIdentity }) {
      cart {
        id
        checkoutUrl
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
        lines(first: 20) {
          edges {
            node {
              id quantity
              merchandise {
                ... on ProductVariant {
                  id title
                  price { amount currencyCode }
                  product { title handle }
                }
              }
            }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD = `
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id checkoutUrl
        cost { totalAmount { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE = `
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        id checkoutUrl
        cost { totalAmount { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

const GET_CART = `
  query GetCart($cartId: ID!) {
    cart(id: $cartId) {
      id checkoutUrl
      cost { totalAmount { amount currencyCode } }
      lines(first: 20) {
        edges {
          node {
            id quantity
            merchandise {
              ... on ProductVariant {
                id title
                price { amount currencyCode }
                product { title handle }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @param {Array<{variantId: string, quantity: number}>} items
 * @param {Object} buyerIdentity - 선택적 구매자 국가/언어 정보
 * @returns {Promise<{id: string, checkoutUrl: string, cost: object}>}
 */
async function createCart(items = [], buyerIdentity = null) {
    const lines = items.map(item => ({
        merchandiseId: item.variantId,
        quantity: item.quantity,
    }));

    const variables = { lines };
    if (buyerIdentity) variables.buyerIdentity = buyerIdentity;

    const data = await storefrontQuery(CART_CREATE, variables);
    const { cart, userErrors } = data.cartCreate;

    if (userErrors && userErrors.length > 0) {
        throw new Error(`Cart 생성 실패: ${userErrors.map(e => e.message).join(', ')}`);
    }

    return cart;
}

async function addLinesToCart(cartId, items) {
    const lines = items.map(item => ({
        merchandiseId: item.variantId,
        quantity: item.quantity,
    }));

    const data = await storefrontQuery(CART_LINES_ADD, { cartId, lines });
    const { cart, userErrors } = data.cartLinesAdd;

    if (userErrors && userErrors.length > 0) {
        throw new Error(`Cart 상품 추가 실패: ${userErrors.map(e => e.message).join(', ')}`);
    }

    return cart;
}

async function getCart(cartId) {
    const data = await storefrontQuery(GET_CART, { cartId });
    return data.cart;
}

module.exports = { createCart, addLinesToCart, getCart };
