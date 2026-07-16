const pool = require('../config/db');
const categoryScope = require('../services/catalog/categoryScope');
const { getMalls } = require('./mallContext');

/*
 * 사이트 설정 + 카테고리 주입 (P5 몰 스코프)
 *
 * res.locals.siteSettings = 몰별 브랜딩(회사명·로고·슬로건·색상·hero_variant·SNS 등).
 * res.locals.categories   = 그 몰의 카테고리(스토어프론트 상품목록 사이드바 등에서 사용).
 *
 * site_settings 는 몰별 1행. 요청 몰의 행이 없으면 **기본몰 행으로 폴백**한다
 * (새 몰이 빈 브랜딩으로 뜨지 않도록). 둘 다 없으면 하드코딩 기본값.
 *
 * mallContext 미들웨어보다 뒤에 마운트되므로 req.mallId 를 신뢰한다.
 */

const HARD_DEFAULT = Object.freeze({
    company_name: '와이디몰',
    brand_main_color: '#76A764',
    brand_dark_color: '#5A824B',
    brand_light_color: '#F0F7EE',
    ga4_measurement_id: null,
});

module.exports = async (req, res, next) => {
    const mallId = req.mallId || 1;
    try {
        let defaultId = 1;
        try { defaultId = (await getMalls()).defaultId; } catch (e) { /* mall 테이블 없으면 1 */ }

        // 요청 몰의 브랜딩 → 없으면 기본몰 브랜딩
        const [rows] = await pool.query(
            'SELECT * FROM site_settings WHERE mall_id IN (?, ?) ORDER BY (mall_id = ?) DESC LIMIT 1',
            [mallId, defaultId, mallId]
        );
        res.locals.siteSettings = rows[0] || Object.assign({}, HARD_DEFAULT);

        // 카테고리는 글로벌 한 벌 — 사이드바엔 "이 몰에 상품이 있는(유효)" 것에서 몰별 숨김을 뺀 것.
        const _valid = await categoryScope.visibleCategoryIdSet(mallId);
        const [_allCats] = await pool.query(
            'SELECT id, name FROM categories WHERE mall_id IN (0, ?) ORDER BY display_order ASC', [mallId]
        );
        res.locals.categories = _allCats.filter((c) => _valid.has(c.id));
        next();
    } catch (err) {
        console.error('Site Settings Middleware Error:', err);
        res.locals.siteSettings = Object.assign({}, HARD_DEFAULT);
        res.locals.categories = [];
        next();
    }
};
