/**
 * Shopify 상품 조회 서비스 (Storefront API)
 * context 파라미터로 Markets 국가/언어별 현지 가격(presentment pricing) 조회 지원
 */
const { storefrontQuery } = require('./storefrontClient');

// @inContext 디렉티브: 국가/언어별 현지 가격 반환
const GET_PRODUCT_BY_HANDLE = `
  query GetProduct($handle: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      handle
      description
      featuredImage { url altText }
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const GET_PRODUCTS = `
  query GetProducts($first: Int!, $cursor: String, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    products(first: $first, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title handle
          featuredImage { url }
          variants(first: 1) {
            edges {
              node {
                id
                price { amount currencyCode }
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * @param {string} handle
 * @param {Object} [context]  { country?: string, language?: string }
 */
async function getProductByHandle(handle, context = {}) {
    const variables = { handle };
    if (context.country) variables.country = context.country;
    if (context.language) variables.language = context.language;
    const data = await storefrontQuery(GET_PRODUCT_BY_HANDLE, variables, context);
    return data.product;
}

/**
 * @param {number} first
 * @param {string|null} cursor
 * @param {Object} [context]  { country?: string, language?: string }
 */
async function getProducts(first = 20, cursor = null, context = {}) {
    const variables = { first, cursor };
    if (context.country) variables.country = context.country;
    if (context.language) variables.language = context.language;
    const data = await storefrontQuery(GET_PRODUCTS, variables, context);
    return data.products;
}

module.exports = { getProductByHandle, getProducts };
