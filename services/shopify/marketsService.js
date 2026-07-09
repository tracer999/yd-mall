/**
 * Shopify Markets 서비스 (Storefront API)
 * 스토어에 설정된 국가·통화·언어 목록 조회
 */
const { storefrontQuery } = require('./storefrontClient');

const LOCALIZATION_QUERY = `
  query Localization {
    localization {
      country {
        isoCode
        name
        currency { isoCode symbol }
      }
      availableCountries {
        isoCode
        name
        currency { isoCode symbol }
      }
      availableLanguages {
        isoCode
        name
      }
    }
  }
`;

let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

/**
 * 스토어에 설정된 Markets 정보 반환 (10분 캐시)
 * @returns {Promise<{availableCountries: Array, availableLanguages: Array, country: Object}>}
 */
async function getLocalization() {
    if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;

    const data = await storefrontQuery(LOCALIZATION_QUERY);
    _cache = data.localization;
    _cacheAt = Date.now();
    return _cache;
}

/**
 * 특정 국가가 Markets에 설정되어 있는지 확인
 * @param {string} countryCode  ISO 3166-1 alpha-2 (예: 'US')
 */
async function isValidCountry(countryCode) {
    const loc = await getLocalization();
    return loc.availableCountries.some(c => c.isoCode === countryCode.toUpperCase());
}

module.exports = { getLocalization, isValidCountry };
