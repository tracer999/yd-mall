/*
 * 관리자 — 세트·기획상품(파생상품) 관리
 *
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §31
 * 기본상품(SINGLE/OPTION)과 분리된 별도 메뉴. 파생상품은 기본 SKU 를 참조해 "따로 만드는" 상품.
 */

const pool = require('../../config/db');
const compositeService = require('../../services/catalog/compositeService');

const DERIVED_TYPES = compositeService.COMPOSITE_TYPES; // BUNDLE, SET, GIFT_SET, BUILD_SET
const TYPE_LABEL = { BUNDLE: '묶음', SET: '세트', GIFT_SET: '선물세트', BUILD_SET: '선택형세트' };

/** 파생상품 목록 (GET /admin/derived-products) */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const [products] = await pool.query(
            `SELECT p.id, p.name, p.product_type, p.price, p.status, p.main_image, p.thumbnail_image, p.created_at,
                    (SELECT COUNT(*) FROM composite_component cc WHERE cc.composite_product_id = p.id) AS component_count
               FROM products p
              WHERE p.mall_id = ? AND p.product_type IN (?)
              ORDER BY p.created_at DESC`,
            [mallId, DERIVED_TYPES]
        );
        // 파생 가용수량(구성에서 파생)
        for (const p of products) {
            p.available_qty = p.component_count ? await compositeService.getAvailableQty(p.id) : 0;
            p.type_label = TYPE_LABEL[p.product_type] || p.product_type;
        }
        res.render('admin/derived-products/list', {
            layout: 'layouts/admin_layout',
            title: '세트·기획상품',
            products,
        });
    } catch (err) {
        console.error('[admin/derived] getList error:', err);
        res.status(500).send('Server Error');
    }
};

/** 새 파생상품 폼 (GET /admin/derived-products/new) */
exports.getNew = (req, res) => {
    res.render('admin/derived-products/new', {
        layout: 'layouts/admin_layout',
        title: '새 세트·기획상품',
        types: DERIVED_TYPES,
        typeLabel: TYPE_LABEL,
        query: req.query,
    });
};

/** 파생상품 생성 (POST /admin/derived-products/new) → 구성 편집기로 이동 */
exports.postNew = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const name = String(req.body.name || '').trim().slice(0, 100);
    const type = DERIVED_TYPES.includes(req.body.type) ? req.body.type : 'SET';
    const price = parseInt(req.body.price, 10) || 0;
    if (!name) return res.redirect('/admin/derived-products/new?error=name');

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // 파생상품 products 행 (판매가 보유, 재고는 구성 파생이라 products.stock 은 의미 없음 → 0)
        const [pr] = await conn.query(
            `INSERT INTO products (mall_id, name, price, stock, status, product_type, visibility)
             VALUES (?, ?, ?, 0, 'ON', ?, 'PUBLIC')`,
            [mallId, name, price, type]
        );
        const productId = pr.insertId;
        // 대표 SKU (stock_managed=0 — 재고는 구성 SKU 에서 파생)
        await conn.query(
            `INSERT INTO product_sku (mall_id, product_id, price, stock, stock_managed, status, is_default)
             VALUES (?, ?, ?, 0, 0, 'ON', 1)`,
            [mallId, productId, price]
        );
        await conn.commit();
        return res.redirect(`/admin/derived-products/${productId}/compose`);
    } catch (err) {
        await conn.rollback();
        console.error('[admin/derived] postNew error:', err);
        return res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/** 파생상품 삭제 (POST /admin/derived-products/:id/delete) */
exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const { id } = req.params;
    try {
        // 파생상품만 삭제(기본상품 오삭제 방지). composite_component·sku 는 CASCADE.
        await pool.query(
            'DELETE FROM products WHERE id = ? AND mall_id = ? AND product_type IN (?)',
            [id, mallId, DERIVED_TYPES]
        );
        res.redirect('/admin/derived-products');
    } catch (err) {
        console.error('[admin/derived] postDelete error:', err);
        res.status(500).send('Server Error');
    }
};
