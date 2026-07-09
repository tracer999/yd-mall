const pool = require('../config/db');

exports.getList = async (req, res) => {
    try {
        const [brands] = await pool.query(`
            SELECT c.id, c.name, c.display_order, c.logo_image_path
            FROM categories c
            WHERE c.type = 'BRAND'
            ORDER BY c.display_order ASC, c.id ASC
        `);

        const siteSettings = res.locals.siteSettings || {};
        const companyName = siteSettings.company_name || '와이디몰';
        const domain = ((global.systemSettings && global.systemSettings.domain) || 'https://dev-mall.ydata.co.kr').replace(/\/$/, '');

        res.render('user/brands/list', {
            title: '브랜드',
            brands,
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
