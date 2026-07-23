/*
 * 관리자 — 옵션상품(SKU) 편집기
 *
 * 거대한 상품 폼(form.ejs, 1152줄)을 건드리지 않고 옵션·SKU 관리를 전용 페이지로 분리한다.
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §5·§11·§26
 */

const pool = require('../../config/db');
const optionService = require('../../services/catalog/optionService');
const categoryOptionService = require('../../services/catalog/categoryOptionService');

/** 옵션 편집 페이지 (GET /admin/products/options/:id) */
exports.getEditor = async (req, res) => {
    const { id } = req.params;
    const mallId = req.adminMallId || 1;
    try {
        const [[product]] = await pool.query(
            'SELECT id, name, product_type, price FROM products WHERE id = ? AND mall_id = ?',
            [id, mallId]
        );
        if (!product) return res.redirect('/admin/products');

        // 관리자 편집기는 기본 SKU 도 함께 띄운다(삭제 불가 행).
        const { options, skus, defaultSku } = await optionService.getProductOptionsAndSkus(id, pool, { includeDefault: true });

        res.render('admin/products/options', {
            layout: 'layouts/admin_layout',
            title: '옵션·SKU 관리',
            product,
            options,
            skus,
            defaultSku,
        });
    } catch (err) {
        console.error('[admin/options] getEditor error:', err);
        res.status(500).send('Server Error');
    }
};

/** 카테고리 추천 옵션 프리필 (GET /admin/products/options/:id/recommended) — 설계 §11·§18 */
exports.getRecommended = async (req, res) => {
    const { id } = req.params;
    const mallId = req.adminMallId || 1;
    try {
        const [[product]] = await pool.query('SELECT category_id FROM products WHERE id = ? AND mall_id = ?', [id, mallId]);
        if (!product) return res.status(404).json({ ok: false, options: [] });
        if (!product.category_id) return res.json({ ok: true, options: [] });
        const options = await categoryOptionService.getInheritedOptions(product.category_id);
        res.json({
            ok: true,
            options: options.map((o) => ({ name: o.option_name, values: o.recommendedValues, required: o.is_required, source: o.source })),
        });
    } catch (err) {
        console.error('[admin/options] getRecommended error:', err);
        res.status(500).json({ ok: false, options: [] });
    }
};

/** 옵션·SKU 저장 (POST /admin/products/options/:id, JSON) */
exports.postSave = async (req, res) => {
    const { id } = req.params;
    const mallId = req.adminMallId || 1;
    const payload = req.body || {};

    // 소유 몰 검증
    const [[owned]] = await pool.query('SELECT id FROM products WHERE id = ? AND mall_id = ?', [id, mallId]);
    if (!owned) return res.status(404).json({ ok: false, message: '상품을 찾을 수 없습니다.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await optionService.saveOptionProduct(conn, Number(id), mallId, {
            options: Array.isArray(payload.options) ? payload.options : [],
            skus: Array.isArray(payload.skus) ? payload.skus : [],
            defaultSku: payload.defaultSku && typeof payload.defaultSku === 'object' ? payload.defaultSku : null,
        });
        await conn.commit();
        res.json({ ok: true, ...result });
    } catch (err) {
        await conn.rollback();
        console.error('[admin/options] postSave error:', err);
        // 세트 구성 중인 SKU(FK RESTRICT) 삭제 시도 등
        const msg = err.code === 'ER_ROW_IS_REFERENCED_2'
            ? '세트/묶음 구성에 사용 중인 SKU가 있어 변경할 수 없습니다.'
            : '저장 중 오류가 발생했습니다.';
        res.status(500).json({ ok: false, message: msg });
    } finally {
        conn.release();
    }
};
