const { isShopifySyncEnabled } = require('../services/shopify/syncService');

/*
 * Shopify 사용 여부 플래그 주입 (A3)
 *
 * res.locals.shopifyEnabled — 뷰에서 Shopify 관련 UI(동기화 버튼, 국가 선택기,
 * 글로벌 체크아웃 버튼 등)를 노출할지 결정한다.
 *
 * 단일 소스: system_settings.shopify_sync_enabled → process.env.SHOPIFY_SYNC_ENABLED
 * (관리자에서 토글을 저장하면 loadSystemSettingsAndApplyEnv 가 즉시 반영한다)
 *
 * 주의: 이것은 **노출 제어**다. 라우트/웹훅/서비스는 그대로 살아 있으며,
 * 실제 동기화 동작 차단은 syncService 의 isShopifySyncEnabled() 가드가 담당한다.
 */
module.exports = (req, res, next) => {
    res.locals.shopifyEnabled = isShopifySyncEnabled();
    next();
};
