/*
 * 관리자 — 카테고리별 상품 필터(facet) 부여
 * 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §6·§10(Phase 5)
 *
 * 필터 "정의"(어떤 필터가 존재하는가)는 제품 카탈로그라 마이그레이션으로 배포에 싣는다.
 * 여기서 다루는 건 "이 카테고리에서 어떤 필터를 쓸 것인가" 뿐이다.
 */

const pool = require('../../config/db');
const facetAdminService = require('../../services/catalog/facetAdminService');
const facetExtractor = require('../../services/catalog/facetExtractor');

/** 편집 화면 (GET /admin/products/facets[/:categoryId]) */
exports.getEditor = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const [categories] = await pool.query(
            `SELECT id, name, depth, parent_id FROM categories
              WHERE mall_id IN (0, ?) AND type = 'NORMAL' AND is_active = 1
              ORDER BY parent_id IS NULL DESC, parent_id, display_order, id`,
            [mallId]
        );

        const categoryId = Number(req.params.categoryId) || (categories[0] && categories[0].id) || null;
        const matrix = categoryId ? await facetAdminService.getFacetMatrix(categoryId) : [];

        // 지금 이 카테고리에 값이 얼마나 채워져 있는지 — 속성 필터는 값이 없으면 고객 화면에 안 뜬다.
        let filled = new Map();
        if (categoryId) {
            const [rows] = await pool.query(
                `SELECT pa.attr_name, COUNT(DISTINCT pa.product_id) AS cnt
                   FROM product_attribute pa
                   JOIN products p ON p.id = pa.product_id
                  WHERE pa.is_searchable = 1 AND p.mall_id = ?
                  GROUP BY pa.attr_name`,
                [mallId]
            );
            filled = new Map(rows.map((r) => [r.attr_name, r.cnt]));
        }

        res.render('admin/products/facets', {
            layout: 'layouts/admin_layout',
            title: '카테고리 상품 필터',
            categories,
            categoryId,
            matrix,
            filled,
        });
    } catch (err) {
        console.error('[admin/facets] getEditor error:', err);
        res.status(500).send('Server Error');
    }
};

/**
 * 상품 폼의 속성 입력 정의 (GET /admin/products/attribute-form?categoryId=&productId=)
 *
 * 카테고리를 고를 때마다 항목이 달라지므로 폼에서 AJAX 로 가져간다.
 */
exports.getAttributeForm = async (req, res) => {
    try {
        const categoryId = Number(req.query.categoryId) || null;
        const productId = Number(req.query.productId) || null;
        const defs = await facetAdminService.getProductAttributeForm(categoryId);
        const values = productId ? await facetAdminService.getProductAttributes(productId) : {};
        res.json({ ok: true, defs, values });
    } catch (err) {
        console.error('[admin/facets] getAttributeForm error:', err);
        res.status(500).json({ ok: false, message: '속성 목록을 불러오지 못했습니다.' });
    }
};

/** 저장 (POST /admin/products/facets/:categoryId, JSON) */
exports.postSave = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const categoryId = Number(req.params.categoryId);
    try {
        const [[cat]] = await pool.query(
            'SELECT id FROM categories WHERE id = ? AND mall_id IN (0, ?)', [categoryId, mallId]
        );
        if (!cat) return res.status(404).json({ ok: false, message: '카테고리를 찾을 수 없습니다.' });

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const result = await facetAdminService.setCategoryFacets(categoryId, req.body.facets || [], conn);
            await conn.commit();
            res.json({ ok: true, ...result });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('[admin/facets] postSave error:', err);
        res.status(500).json({ ok: false, message: '저장 중 오류가 발생했습니다.' });
    }
};

/* ------------------------------------------------------------------ *
 * Phase 8 — 속성 자동 추출 + 검수
 *
 * 기존 상품 9,700여 건을 사람이 다 입력할 수는 없다. 옵션값·상품명·공급사 원본에서
 * 사전으로 뽑아 **검수 대기(is_searchable=0)** 로 넣고, 승인해야 고객 필터에 걸린다.
 * ------------------------------------------------------------------ */

/** 검수 화면 (GET /admin/products/facet-extract) */
exports.getExtract = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const [categories] = await pool.query(
            `SELECT id, name FROM categories
              WHERE mall_id IN (0, ?) AND type = 'NORMAL' AND depth = 1 AND is_active = 1
              ORDER BY display_order, id`,
            [mallId]
        );
        const pending = await facetExtractor.getPending(mallId);
        const [[stat]] = await pool.query(
            'SELECT SUM(is_searchable = 1) AS approved, SUM(is_searchable = 0) AS waiting FROM product_attribute'
        );
        res.render('admin/products/facet_extract', {
            layout: 'layouts/admin_layout',
            title: '상품 속성 추출·검수',
            categories,
            pending,
            stat: stat || { approved: 0, waiting: 0 },
        });
    } catch (err) {
        console.error('[admin/facets] getExtract error:', err);
        res.status(500).send('Server Error');
    }
};

/** 추출 실행 (POST /admin/products/facet-extract/run, JSON) */
exports.postExtractRun = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const categoryId = Number(req.body.categoryId) || null;
        const result = await facetExtractor.extract(mallId, categoryId);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[admin/facets] postExtractRun error:', err);
        res.status(500).json({ ok: false, message: '추출 중 오류가 발생했습니다.' });
    }
};

/** 승인·반려 (POST /admin/products/facet-extract/review, JSON) */
exports.postExtractReview = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const pairs = Array.isArray(req.body.pairs) ? req.body.pairs : [];
        if (!pairs.length) return res.json({ ok: true, updated: 0, deleted: 0 });
        const result = req.body.action === 'reject'
            ? await facetExtractor.reject(mallId, pairs)
            : await facetExtractor.approve(mallId, pairs);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[admin/facets] postExtractReview error:', err);
        res.status(500).json({ ok: false, message: '처리 중 오류가 발생했습니다.' });
    }
};
