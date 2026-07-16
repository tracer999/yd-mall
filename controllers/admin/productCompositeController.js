/*
 * 관리자 — 복합상품(묶음/세트/기획) 구성 편집기
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §13~15, §26.8
 */

const pool = require('../../config/db');
const compositeService = require('../../services/catalog/compositeService');

/** 편집 페이지 (GET /admin/products/composite/:id) */
exports.getEditor = async (req, res) => {
    const { id } = req.params;
    const mallId = req.adminMallId || 1;
    try {
        const [[product]] = await pool.query(
            'SELECT id, name, product_type, price FROM products WHERE id = ? AND mall_id = ?',
            [id, mallId]
        );
        if (!product) return res.redirect('/admin/products');

        const components = await compositeService.getComponents(id);
        const availableQty = components.length ? await compositeService.getAvailableQty(id) : 0;

        res.render('admin/products/composite', {
            layout: 'layouts/admin_layout',
            title: '복합상품(세트·묶음) 구성',
            product,
            components,
            availableQty,
            compositeTypes: compositeService.COMPOSITE_TYPES,
        });
    } catch (err) {
        console.error('[admin/composite] getEditor error:', err);
        res.status(500).send('Server Error');
    }
};

/** 구성 SKU 검색 (GET /admin/products/composite/:id/search?q=) */
exports.searchComponents = async (req, res) => {
    const { id } = req.params;
    const mallId = req.adminMallId || 1;
    try {
        const rows = await compositeService.searchComponentSkus(mallId, req.query.q || '', Number(id));
        res.json({ ok: true, results: rows });
    } catch (err) {
        console.error('[admin/composite] search error:', err);
        res.status(500).json({ ok: false, results: [] });
    }
};

/** 구성 저장 (POST /admin/products/composite/:id, JSON) */
exports.postSave = async (req, res) => {
    const { id } = req.params;
    const mallId = req.adminMallId || 1;

    const [[owned]] = await pool.query('SELECT id FROM products WHERE id = ? AND mall_id = ?', [id, mallId]);
    if (!owned) return res.status(404).json({ ok: false, message: '상품을 찾을 수 없습니다.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await compositeService.saveComposite(conn, Number(id), mallId, {
            type: req.body.type,
            components: Array.isArray(req.body.components) ? req.body.components : [],
        });
        await conn.commit();
        res.json({ ok: true, ...result });
    } catch (err) {
        await conn.rollback();
        console.error('[admin/composite] postSave error:', err);
        res.status(500).json({ ok: false, message: '저장 중 오류가 발생했습니다.' });
    } finally {
        conn.release();
    }
};
