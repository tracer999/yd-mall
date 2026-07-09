const pool = require('../../config/db');
const upload = require('../../middleware/upload');
let hasMobileImageColumnCache = null;

async function hasMobileImageColumn() {
    if (hasMobileImageColumnCache !== null) return hasMobileImageColumnCache;
    try {
        const [rows] = await pool.query(`
            SELECT COUNT(*) AS count
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'banners'
              AND COLUMN_NAME = 'mobile_image_url'
        `);
        hasMobileImageColumnCache = !!rows[0]?.count;
    } catch (err) {
        hasMobileImageColumnCache = false;
    }
    return hasMobileImageColumnCache;
}

exports.getList = async (req, res) => {
    try {
        const type = req.query.type || 'MAIN';
        const [banners] = await pool.query(`
            SELECT b.*, c.name AS category_name
            FROM banners b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE b.banner_type = ?
            ORDER BY b.display_order ASC, b.created_at DESC
        `, [type]);
        res.render('admin/banners/list', {
            layout: 'layouts/admin_layout',
            title: '배너 관리',
            banners,
            currentType: type
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getAdd = async (req, res) => {
    try {
        const type = req.query.type || 'MAIN';
        const [categories] = await pool.query('SELECT id, name, type FROM categories ORDER BY display_order ASC, id ASC');
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 등록',
            banner: null,
            categories,
            currentType: type,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAdd = async (req, res) => {
    const { title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date } = req.body;
    const bannerImage = req.files?.banner_image?.[0];
    const mobileBannerImage = req.files?.mobile_banner_image?.[0];
    const image_url = bannerImage ? '/uploads/banners/' + bannerImage.filename : null;
    const mobile_image_url = mobileBannerImage ? '/uploads/banners/' + mobileBannerImage.filename : null;

    const type = ['MAIN', 'CATEGORY', 'POPUP', 'BRAND'].includes(banner_type) ? banner_type : 'MAIN';
    const categoryId = (type === 'CATEGORY' || type === 'BRAND') && category_id ? Number(category_id) || null : null;

    try {
        if (await hasMobileImageColumn()) {
            await pool.query(
                `INSERT INTO banners (banner_type, category_id, title, image_url, mobile_image_url, link_url, display_order, is_active, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    type,
                    categoryId,
                    title,
                    image_url,
                    mobile_image_url,
                    link_url,
                    display_order || 0,
                    is_active ? 1 : 0,
                    start_date || null,
                    end_date || null
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO banners (banner_type, category_id, title, image_url, link_url, display_order, is_active, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    type,
                    categoryId,
                    title,
                    image_url,
                    link_url,
                    display_order || 0,
                    is_active ? 1 : 0,
                    start_date || null,
                    end_date || null
                ]
            );
        }
        res.redirect(`/admin/banners?type=${type}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Banner save failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.getEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT b.*, c.name AS category_name 
            FROM banners b 
            LEFT JOIN categories c ON b.category_id = c.id 
            WHERE b.id = ?
        `, [id]);

        if (rows.length === 0) return res.redirect('/admin/banners');

        const [categories] = await pool.query('SELECT id, name, type FROM categories ORDER BY display_order ASC, id ASC');
        res.render('admin/banners/form', {
            layout: 'layouts/admin_layout',
            title: '배너 수정',
            categories,
            banner: rows[0],
            currentType: rows[0].banner_type,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const { id } = req.params;
    const { title, link_url, display_order, is_active, banner_type, category_id, start_date, end_date } = req.body;
    let image_url = req.body.existing_image;
    let mobile_image_url = req.body.existing_mobile_image || null;
    const bannerImage = req.files?.banner_image?.[0];
    const mobileBannerImage = req.files?.mobile_banner_image?.[0];

    if (bannerImage) {
        image_url = '/uploads/banners/' + bannerImage.filename;
    }
    if (mobileBannerImage) {
        mobile_image_url = '/uploads/banners/' + mobileBannerImage.filename;
    }

    const type = ['MAIN', 'CATEGORY', 'POPUP', 'BRAND'].includes(banner_type) ? banner_type : 'MAIN';
    // If not category or brand type, set category_id to null
    const categoryId = (type === 'CATEGORY' || type === 'BRAND') && category_id ? Number(category_id) || null : null;

    try {
        if (await hasMobileImageColumn()) {
            await pool.query(`
                UPDATE banners SET 
                banner_type=?, category_id=?, title=?, image_url=?, mobile_image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?
                WHERE id=?
            `, [
                type, categoryId, title, image_url, mobile_image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null, id
            ]);
        } else {
            await pool.query(`
                UPDATE banners SET 
                banner_type=?, category_id=?, title=?, image_url=?, link_url=?, display_order=?, is_active=?, start_date=?, end_date=?
                WHERE id=?
            `, [
                type, categoryId, title, image_url, link_url, display_order || 0, is_active ? 1 : 0, start_date || null, end_date || null, id
            ]);
        }
        res.redirect(`/admin/banners?type=${type}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Banner update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM banners WHERE id = ?', [id]);
        res.redirect('/admin/banners');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
