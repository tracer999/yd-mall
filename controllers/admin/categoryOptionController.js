/*
 * 관리자 — 카테고리별 추천 옵션 템플릿 관리
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §7·§8·§10
 */

const pool = require('../../config/db');
const categoryOptionService = require('../../services/catalog/categoryOptionService');

/** 카테고리 옵션 편집 (GET /admin/products/category-options[/:categoryId]) */
exports.getEditor = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const [categories] = await pool.query(
            "SELECT id, name, depth, parent_id FROM categories WHERE mall_id = ? AND type = 'NORMAL' ORDER BY parent_id IS NULL DESC, parent_id, display_order, id",
            [mallId]
        );
        const dictionary = await categoryOptionService.getOptionDictionary(mallId);

        let categoryId = Number(req.params.categoryId) || (categories[0] && categories[0].id) || null;
        let ownMap = new Map();
        let inherited = [];
        if (categoryId) {
            const own = await categoryOptionService.getCategoryOptions(categoryId);
            ownMap = new Map(own.map((o) => [o.option_definition_id, o]));
            // 상속(부모에게서 내려온 것 중 자신이 다시 지정하지 않은 것)만 표시
            const all = await categoryOptionService.getInheritedOptions(categoryId);
            inherited = all.filter((o) => o.source === 'inherited');
        }

        res.render('admin/products/category_options', {
            layout: 'layouts/admin_layout',
            title: '카테고리 추천 옵션',
            categories,
            dictionary,
            categoryId,
            ownMap,
            inherited,
        });
    } catch (err) {
        console.error('[admin/category-options] getEditor error:', err);
        res.status(500).send('Server Error');
    }
};

/** 저장 (POST /admin/products/category-options/:categoryId, JSON) */
exports.postSave = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const categoryId = Number(req.params.categoryId);
    try {
        const [[cat]] = await pool.query('SELECT id FROM categories WHERE id = ? AND mall_id = ?', [categoryId, mallId]);
        if (!cat) return res.status(404).json({ ok: false, message: '카테고리를 찾을 수 없습니다.' });

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const result = await categoryOptionService.setCategoryOptions(categoryId, req.body.options || [], conn);
            await conn.commit();
            res.json({ ok: true, ...result });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('[admin/category-options] postSave error:', err);
        res.status(500).json({ ok: false, message: '저장 중 오류가 발생했습니다.' });
    }
};
