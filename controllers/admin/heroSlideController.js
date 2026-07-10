const pool = require('../../config/db');
const upload = require('../../middleware/upload');

/*
 * 메인 슬라이더(hero_slide) 관리 — 프론트 히어로 product_showcase 변형의 소스.
 *
 * 프론트(mainController.buildHomeContext)는 hero_variant='product_showcase'일 때
 * hero_slide 를 mall_id 로 조회해 slot=MAIN(중앙 슬라이더)·slot=FEATURE(우측 카드)로 렌더한다.
 * 각 슬라이드는 product_id 로 상품과 연결되고, label/headline/image_url/link_url 은
 * 비어 있으면 상품 정보로 폴백한다(hero_showcase.ejs 참고).
 *
 * /admin/banners/hero-slides 하위로 마운트되어 배너 관리와 동일한 RBAC 를 상속한다.
 */

const SLOTS = ['MAIN', 'FEATURE'];

exports.getList = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const [slides] = await pool.query(`
            SELECT hs.*, p.name AS product_name, p.main_image, p.price, p.status AS product_status
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.mall_id = ?
            ORDER BY hs.slot ASC, hs.sort_order ASC, hs.id ASC
        `, [mallId]);

        res.render('admin/banners/hero-slides/list', {
            layout: 'layouts/admin_layout',
            title: '메인 슬라이더 관리',
            slides,
            mainSlides: slides.filter(s => s.slot === 'MAIN'),
            featureSlides: slides.filter(s => s.slot === 'FEATURE')
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getAdd = async (req, res) => {
    try {
        const slot = SLOTS.includes(req.query.slot) ? req.query.slot : 'MAIN';
        res.render('admin/banners/hero-slides/form', {
            layout: 'layouts/admin_layout',
            title: '슬라이드 등록',
            slide: null,
            currentSlot: slot,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { slot, product_id, label, headline, link_url, sort_order, is_active } = req.body;
    const slideImage = req.files?.slide_image?.[0];
    const image_url = slideImage ? '/uploads/banners/' + slideImage.filename : null;

    const safeSlot = SLOTS.includes(slot) ? slot : 'MAIN';
    const productId = product_id ? Number(product_id) || null : null;

    try {
        await pool.query(`
            INSERT INTO hero_slide (mall_id, slot, product_id, label, headline, image_url, link_url, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            mallId,
            safeSlot,
            productId,
            label || null,
            headline || null,
            image_url,
            link_url || null,
            Number(sort_order) || 0,
            is_active ? 1 : 0
        ]);
        res.redirect('/admin/banners/hero-slides');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero slide save failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.getEdit = async (req, res) => {
    try {
        const mallId = req.adminMallId || 1;
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT hs.*, p.name AS product_name, p.main_image
            FROM hero_slide hs
            LEFT JOIN products p ON p.id = hs.product_id
            WHERE hs.id = ? AND hs.mall_id = ?
        `, [id, mallId]);

        if (rows.length === 0) return res.redirect('/admin/banners/hero-slides');

        res.render('admin/banners/hero-slides/form', {
            layout: 'layouts/admin_layout',
            title: '슬라이드 수정',
            slide: rows[0],
            currentSlot: rows[0].slot,
            maxUploadFileMb: upload.MAX_UPLOAD_FILE_MB
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.params;
    const { slot, product_id, label, headline, link_url, sort_order, is_active } = req.body;
    let image_url = req.body.existing_image || null;
    const slideImage = req.files?.slide_image?.[0];
    if (slideImage) {
        image_url = '/uploads/banners/' + slideImage.filename;
    }

    const safeSlot = SLOTS.includes(slot) ? slot : 'MAIN';
    const productId = product_id ? Number(product_id) || null : null;

    try {
        await pool.query(`
            UPDATE hero_slide SET
              slot=?, product_id=?, label=?, headline=?, image_url=?, link_url=?, sort_order=?, is_active=?
            WHERE id=? AND mall_id=?
        `, [
            safeSlot,
            productId,
            label || null,
            headline || null,
            image_url,
            link_url || null,
            Number(sort_order) || 0,
            is_active ? 1 : 0,
            id,
            mallId
        ]);
        res.redirect('/admin/banners/hero-slides');
    } catch (err) {
        console.error(err);
        res.status(500).send(`Hero slide update failed${err.code ? `: ${err.code}` : ''}`);
    }
};

exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM hero_slide WHERE id = ? AND mall_id = ?', [id, mallId]);
        res.redirect('/admin/banners/hero-slides');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
