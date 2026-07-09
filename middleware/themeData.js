const themeService = require('../services/theme/themeService');

/*
 * 활성 테마 주입 미들웨어 (P4)
 *
 * res.locals.theme = { name, tokens, cardStyle, cssVars }
 * main_layout.ejs 의 <head> 가 cssVars 를 :root 에 인라인 주입한다.
 *
 * 테마는 변경 빈도가 매우 낮으므로 프로세스 메모리에 캐시한다.
 * 관리자에서 테마를 저장하면 themeService 캐시를 비우도록 invalidate() 를 호출한다.
 */

const MALL_ID = 1;
const TTL_MS = 60 * 1000;

let cache = null;
let cachedAt = 0;

function invalidate() {
    cache = null;
    cachedAt = 0;
}

module.exports = async (req, res, next) => {
    try {
        const now = Date.now();
        if (!cache || now - cachedAt > TTL_MS) {
            cache = await themeService.getActiveTheme(MALL_ID);
            cachedAt = now;
        }
        res.locals.theme = cache;
    } catch (err) {
        console.error('Theme Middleware Error:', err.message);
        // 실패해도 화면은 떠야 한다 — 레이아웃이 기본값으로 폴백한다.
        res.locals.theme = null;
    }
    next();
};

module.exports.invalidate = invalidate;
