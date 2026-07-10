const pool = require('../config/db');

exports.getList = async (req, res) => {
    try {
        // P5 몰 스코프 — 없으면 브랜드관에 다른 몰 브랜드가 전부 섞인다.
        const mallId = req.mallId || 1;
        const [brands] = await pool.query(`
            SELECT c.id, c.name, c.display_order, c.logo_image_path
            FROM categories c
            WHERE c.type = 'BRAND' AND c.mall_id = ?
            ORDER BY c.display_order ASC, c.id ASC
        `, [mallId]);

        // 로그인 사용자의 찜한 브랜드 id 목록(하트 초기 상태용)
        let likedBrandIds = [];
        if (req.user) {
            const [rows] = await pool.query(
                'SELECT category_id FROM brand_likes WHERE user_id = ?',
                [req.user.id]
            );
            likedBrandIds = rows.map(r => r.category_id);
        }

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';
        const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

        res.render('user/brands/list', {
            title: '브랜드',
            brands,
            likedBrandIds,
            currentUser: req.user || null,
            seo: {
                ...res.locals.seo,
                title: `브랜드 | ${companyName}`,
                description: `${companyName} 브랜드별 상품을 확인해보세요.`,
                url: `${domain}/brands`,
                robots: 'index,follow'
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.redirectToBrandProducts = async (req, res) => {
    const { brandId } = req.params;
    const categoryId = req.query.categoryId;
    const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
    return res.redirect(`/products/brand/${encodeURIComponent(brandId)}${qs}`);
};
