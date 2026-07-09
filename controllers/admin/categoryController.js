const pool = require('../../config/db');
const { syncCategoryById, deleteCategoryFromShopify } = require('../../services/shopify/categorySync');

function normalizeTab(tab) {
    return ['product', 'theme', 'brand'].includes(tab) ? tab : 'product';
}

exports.getList = async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories ORDER BY display_order ASC');
        const productCategories = categories.filter(c => c.type === 'NORMAL');
        const themeCategories = categories.filter(c => c.type === 'THEME');
        const brandCategories = categories.filter(c => c.type === 'BRAND');
        const nextDisplayOrder = {
            NORMAL: (productCategories.length > 0 ? Math.max(...productCategories.map(c => Number(c.display_order) || 0)) : -1) + 1,
            THEME: (themeCategories.length > 0 ? Math.max(...themeCategories.map(c => Number(c.display_order) || 0)) : -1) + 1,
            BRAND: (brandCategories.length > 0 ? Math.max(...brandCategories.map(c => Number(c.display_order) || 0)) : -1) + 1
        };
        const activeTab = normalizeTab(req.query.tab);

        res.render('admin/categories/list', {
            layout: 'layouts/admin_layout',
            title: '카테고리 관리',
            categories,
            productCategories,
            themeCategories,
            brandCategories,
            activeTab,
            nextDisplayOrder
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAdd = async (req, res) => {
    const { name, display_order, type, active_tab } = req.body;
    const allowedType = ['NORMAL', 'BRAND', 'THEME'].includes(type) ? type : 'NORMAL';
    const activeTab = normalizeTab(active_tab);
    const logoFile = req.file;
    const logo_image_path = logoFile && allowedType === 'BRAND' ? '/uploads/brands/' + logoFile.filename : null;

    try {
        let nextOrder = Number.parseInt(display_order, 10);
        if (Number.isNaN(nextOrder)) {
            const [rows] = await pool.query('SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM categories WHERE type = ?', [allowedType]);
            nextOrder = rows[0].next_order;
        }
        const [result] = await pool.query('INSERT INTO categories (name, display_order, type, logo_image_path) VALUES (?, ?, ?, ?)', [
            name,
            nextOrder,
            allowedType,
            logo_image_path
        ]);
        // Shopify 컬렉션 동기화 (THEME 제외, 백그라운드)
        if (allowedType !== 'THEME') {
            syncCategoryById(result.insertId)
                .then(r => console.log(`[Shopify] 카테고리 컬렉션 생성: ${name} → ${r.collectionId}`))
                .catch(e => console.error(`[Shopify] 카테고리 컬렉션 생성 실패: ${name}: ${e.message}`));
        }
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const { id, name, display_order, type, active_tab } = req.body;
    const allowedType = ['NORMAL', 'BRAND', 'THEME'].includes(type) ? type : 'NORMAL';
    const activeTab = normalizeTab(active_tab);

    // 브랜드인 경우에만 로고 이미지 유지 및 업데이트
    let logo_image_path = req.body.existing_logo;
    const logoFile = req.file;
    if (logoFile && allowedType === 'BRAND') {
        logo_image_path = '/uploads/brands/' + logoFile.filename;
    }

    try {
        await pool.query('UPDATE categories SET name = ?, display_order = ?, type = ?, logo_image_path = ? WHERE id = ?', [
            name,
            display_order,
            allowedType,
            allowedType === 'BRAND' ? logo_image_path : null,
            id
        ]);
        // Shopify 컬렉션 동기화 (THEME 제외, 백그라운드)
        if (allowedType !== 'THEME') {
            syncCategoryById(Number(id))
                .then(r => console.log(`[Shopify] 카테고리 컬렉션 업데이트: ${name} → ${r.action}`))
                .catch(e => console.error(`[Shopify] 카테고리 컬렉션 업데이트 실패: ${name}: ${e.message}`));
        }
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postDelete = async (req, res) => {
    const { id, active_tab } = req.body;
    const activeTab = normalizeTab(active_tab);

    try {
        // Shopify 컬렉션 삭제 — DB 삭제 전에 먼저 (shopify_collection_id 읽어야 하므로)
        await deleteCategoryFromShopify(Number(id))
            .catch(e => console.error(`[Shopify] 카테고리 컬렉션 삭제 실패 (id=${id}): ${e.message}`));

        await pool.query('DELETE FROM categories WHERE id = ?', [id]);
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
