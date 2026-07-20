const pool = require('../config/db');

/*
 * 관리자 브랜딩 재해석 (P5 관리자편)
 *
 * 전역 middleware/siteSettings 는 req.mallId(손님이 보는 몰)로 res.locals.siteSettings 를 채운다.
 * 그런데 그건 app.js 에서 전역으로 돌기 때문에, routes/admin.js 가 req.adminMallId(편집 몰)를
 * 정하기 **전에** 이미 확정된다. 그 결과 관리자 화면 로고·회사명이 편집 몰과 무관하게 손님 몰을
 * 따라가고, 관리자가 스토어프론트를 ?mall=2 로 한 번 미리보기하면 세션에 박혀 계속 어긋난다.
 * (같은 레이아웃의 '편집 몰' 배지는 adminMall.name 이라 정상 → 한 화면에서 둘이 불일치)
 *
 * 그래서 adminMallContext 뒤에서 편집 몰 기준으로 다시 읽어 덮어쓴다.
 * 폴백 규칙은 siteSettings 와 동일하다 — 편집 몰 행이 없으면 기존 값을 그대로 둔다.
 */
module.exports = async (req, res, next) => {
    const mallId = req.adminMallId;
    if (!mallId) return next();
    try {
        const [rows] = await pool.query('SELECT * FROM site_settings WHERE mall_id = ? LIMIT 1', [mallId]);
        if (rows[0]) res.locals.siteSettings = rows[0];
    } catch (err) {
        // 실패해도 전역 siteSettings 가 남아 있으므로 화면은 뜬다.
        console.error('[adminSiteSettings] 편집 몰 브랜딩 조회 실패:', err.message);
    }
    next();
};
