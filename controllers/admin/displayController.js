const pool = require('../../config/db');

const SECTION_LABELS = { best: '베스트 상품', new: '신상품', category: '카테고리별' };

exports.getList = async (req, res) => {
    try {
        const [sections] = await pool.query(
            "SELECT * FROM main_display_sections ORDER BY FIELD(section_key, 'best', 'new', 'category')"
        );

        const sectionProducts = {};
        for (const section of sections) {
            if (section.display_mode === 'manual') {
                const [products] = await pool.query(`
                    SELECT mdp.id AS display_id, mdp.display_order,
                           p.id, p.name, p.main_image, p.price, p.status, p.product_badge
                    FROM main_display_products mdp
                    JOIN products p ON p.id = mdp.product_id
                    WHERE mdp.section_key = ?
                    ORDER BY mdp.display_order ASC
                `, [section.section_key]);
                sectionProducts[section.section_key] = products;
            }
        }

        res.render('admin/display/index', {
            layout: 'layouts/admin_layout',
            title: '전시관리',
            subtitle: '메인 페이지 섹션별 진열 방식과 상품을 관리합니다.',
            sections,
            sectionProducts,
            sectionLabels: SECTION_LABELS
        });
    } catch (err) {
        console.error(err);
        req.flash && req.flash('error', '전시 설정을 불러오지 못했습니다.');
        res.status(500).send('Server Error');
    }
};

exports.postUpdateSection = async (req, res) => {
    try {
        const { section_key, display_mode, max_count } = req.body;
        if (!['best', 'new', 'category'].includes(section_key)) {
            return res.redirect('/admin/display');
        }
        const mode = (section_key === 'category') ? 'auto' : (display_mode === 'manual' ? 'manual' : 'auto');
        const count = Math.min(Math.max(parseInt(max_count, 10) || 8, 1), 20);

        await pool.query(
            'UPDATE main_display_sections SET display_mode = ?, max_count = ? WHERE section_key = ?',
            [mode, count, section_key]
        );
        res.redirect('/admin/display');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/display');
    }
};

exports.postAddProduct = async (req, res) => {
    try {
        const { section_key, product_id } = req.body;
        if (!['best', 'new'].includes(section_key) || !product_id) {
            return res.redirect('/admin/display');
        }

        const [[maxRow]] = await pool.query(
            'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM main_display_products WHERE section_key = ?',
            [section_key]
        );

        await pool.query(
            'INSERT IGNORE INTO main_display_products (section_key, product_id, display_order) VALUES (?, ?, ?)',
            [section_key, product_id, maxRow.next_order]
        );
        res.redirect('/admin/display');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/display');
    }
};

exports.postRemoveProduct = async (req, res) => {
    try {
        const { display_id } = req.body;
        if (!display_id) return res.redirect('/admin/display');
        await pool.query('DELETE FROM main_display_products WHERE id = ?', [display_id]);
        res.redirect('/admin/display');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/display');
    }
};

exports.postReorderProducts = async (req, res) => {
    try {
        const { section_key, order } = req.body;
        if (!section_key || !Array.isArray(order)) {
            return res.status(400).json({ success: false });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (let i = 0; i < order.length; i++) {
                await conn.query(
                    'UPDATE main_display_products SET display_order = ? WHERE id = ? AND section_key = ?',
                    [i + 1, order[i], section_key]
                );
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.getProductSearch = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const sectionKey = req.query.section_key;
        if (!q || q.length < 1) return res.json({ products: [] });

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.main_image, p.price, p.status, p.product_badge
            FROM products p
            WHERE p.name LIKE ? AND p.status IN ('ON','OFF','SOLD_OUT','COMING_SOON')
              AND p.id NOT IN (SELECT product_id FROM main_display_products WHERE section_key = ?)
            ORDER BY p.created_at DESC LIMIT 20
        `, [`%${q}%`, sectionKey]);

        res.json({ products });
    } catch (err) {
        console.error(err);
        res.status(500).json({ products: [] });
    }
};
