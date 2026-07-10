const themeService = require('../services/theme/themeService');

/*
 * 활성 테마 주입 미들웨어 (P4 · P5 몰 스코프)
 *
 * res.locals.theme = { name, tokens, cardStyle, cssVars }
 * main_layout.ejs 의 <head> 가 cssVars 를 :root 에 인라인 주입한다.
 *
 * 테마는 변경 빈도가 매우 낮으므로 프로세스 메모리에 캐시한다. 몰별로 다른 테마를 쓸 수 있으므로
 * **몰 id 를 키로** 캐시한다. 관리자에서 테마를 저장하면 invalidate() 를 호출한다.
 */

const TTL_MS = 60 * 1000;

// mallId → { theme, at }
const cache = new Map();

/** 특정 몰(또는 전체) 캐시를 비운다. */
function invalidate(mallId) {
    if (mallId == null) cache.clear();
    else cache.delete(Number(mallId));
}

module.exports = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        const now = Date.now();
        const hit = cache.get(mallId);
        if (!hit || now - hit.at > TTL_MS) {
            const theme = await themeService.getActiveTheme(mallId);
            cache.set(mallId, { theme, at: now });
            res.locals.theme = theme;
        } else {
            res.locals.theme = hit.theme;
        }
    } catch (err) {
        console.error('Theme Middleware Error:', err.message);
        // 실패해도 화면은 떠야 한다 — 레이아웃이 기본값으로 폴백한다.
        res.locals.theme = null;
    }
    next();
};

module.exports.invalidate = invalidate;
