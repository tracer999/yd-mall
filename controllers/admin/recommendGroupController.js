const pool = require('../../config/db');
const { usedCategoryOptions } = require('../../services/catalog/categoryScope');

/*
 * 상품 추천관리 — 추천 그룹 CRUD + 상품 큐레이션
 *
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md
 *
 * 그룹 하나 = /recommend 랜딩의 섹션 하나. name 이 섹션 제목, description 이 그 아래 근거 문구다.
 * 구성 방식은 **수동 선택 하나뿐**이다. 조건 검색(badge/카테고리 자동 수집)이 필요하면
 * 그것은 이미 product_group 이 하고 있고, 추천 화면의 자동 섹션(MD 추천·지금 많이 보는)이
 * 그 역할을 한다. 여기는 "운영자가 이름을 붙이고 손으로 고른 것"만 담는다.
 *
 * product_group 과 달리 page_section 이 참조하지 않으므로 삭제·비활성 가드가 필요 없다.
 * 그룹을 끄면 그 섹션이 추천 화면에서 사라질 뿐이다.
 */

/** GET /admin/recommend-groups */
exports.getList = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const [groups] = await pool.query(`
            SELECT g.*,
                   (SELECT COUNT(*) FROM recommend_group_item i WHERE i.recommend_group_id = g.id) AS item_count,
                   (SELECT COUNT(*)
                      FROM recommend_group_item i
                      JOIN products p ON p.id = i.product_id
                     WHERE i.recommend_group_id = g.id
                       AND p.visibility = 'PUBLIC' AND p.status <> 'OFF') AS visible_count
              FROM recommend_group g
             WHERE g.mall_id = ?
             ORDER BY g.sort_order ASC, g.id ASC
        `, [MALL_ID]);

        res.render('admin/recommend-groups/list', {
            layout: 'layouts/admin_layout',
            title: '상품 추천관리',
            groups,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[recommendGroup] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 편집 화면(신규/수정 공용) */
async function renderForm(res, group, mallId, extra = {}) {
    // 상품 조회 팝업의 카테고리 필터 — 이 몰이 실제로 쓰는 카테고리만 고를 수 있게 한다.
    // 브랜드는 검색형 위젯(partials/admin/brand_picker)이 /admin/brands/search.json 으로 직접 받는다.
    const categories = await usedCategoryOptions(mallId);

    let items = [];
    if (group.id) {
        /*
         * 담긴 상품 전부를 보여주되 노출 여부를 함께 준다.
         * 고객 화면(recommendService)은 PUBLIC·판매중만 그리므로, 숨김 상품을 담아 둔 운영자가
         * "왜 안 뜨지?" 로 헤매지 않도록 관리자에서는 숨김 배지를 달아 그대로 보여준다.
         */
        const [rows] = await pool.query(`
            SELECT i.id AS item_id, i.sort_order,
                   p.id, p.name, p.main_image, p.price, p.status, p.stock, p.visibility
              FROM recommend_group_item i
              JOIN products p ON p.id = i.product_id
             WHERE i.recommend_group_id = ?
             ORDER BY i.sort_order ASC, i.id ASC
        `, [group.id]);
        items = rows;
    }

    res.render('admin/recommend-groups/edit', Object.assign({
        layout: 'layouts/admin_layout',
        title: group.id ? '추천 그룹 수정' : '추천 그룹 등록',
        group,
        items,
        categories,
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/recommend-groups/new */
exports.getNew = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        // 새 그룹은 맨 뒤에 붙는다.
        const [[maxRow]] = await pool.query(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM recommend_group WHERE mall_id = ?', [MALL_ID]
        );
        await renderForm(res, {
            id: null, name: '', description: '', sort_order: maxRow.next_order, is_active: 1,
        }, MALL_ID);
    } catch (err) {
        console.error('[recommendGroup] getNew:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/recommend-groups/:id */
exports.getEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const [[group]] = await pool.query(
            'SELECT * FROM recommend_group WHERE id = ? AND mall_id = ?', [req.params.id, MALL_ID]
        );
        if (!group) {
            return res.redirect('/admin/recommend-groups?error=' + encodeURIComponent('그룹을 찾을 수 없습니다.'));
        }

        await renderForm(res, group, MALL_ID, {
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[recommendGroup] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

function normalizeSortOrder(v) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 9999) : 0;
}

/** POST /admin/recommend-groups — 생성 */
exports.postCreate = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const name = String(req.body.name || '').trim();
        if (!name) return res.redirect('/admin/recommend-groups/new');

        const [r] = await pool.query(`
            INSERT INTO recommend_group (mall_id, name, description, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?)
        `, [
            MALL_ID,
            name.slice(0, 100),
            String(req.body.description || '').trim().slice(0, 200) || null,
            normalizeSortOrder(req.body.sort_order),
            req.body.is_active ? 1 : 0,
        ]);

        res.redirect(`/admin/recommend-groups/${r.insertId}?saved=1`);
    } catch (err) {
        console.error('[recommendGroup] postCreate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/recommend-groups/:id — 수정 */
exports.postUpdate = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const name = String(req.body.name || '').trim();
        if (!name) {
            return res.redirect(`/admin/recommend-groups/${id}?error=` + encodeURIComponent('그룹명을 입력하세요.'));
        }

        const [r] = await pool.query(`
            UPDATE recommend_group
               SET name = ?, description = ?, sort_order = ?, is_active = ?
             WHERE id = ? AND mall_id = ?
        `, [
            name.slice(0, 100),
            String(req.body.description || '').trim().slice(0, 200) || null,
            normalizeSortOrder(req.body.sort_order),
            req.body.is_active ? 1 : 0,
            id, MALL_ID,
        ]);
        if (!r.affectedRows) {
            return res.redirect('/admin/recommend-groups?error=' + encodeURIComponent('그룹을 찾을 수 없습니다.'));
        }

        res.redirect(`/admin/recommend-groups/${id}?saved=1`);
    } catch (err) {
        console.error('[recommendGroup] postUpdate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/recommend-groups/:id/delete */
exports.postDelete = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        // recommend_group_item 은 ON DELETE CASCADE 로 함께 지워진다.
        await pool.query('DELETE FROM recommend_group WHERE id = ? AND mall_id = ?', [req.params.id, MALL_ID]);
        res.redirect('/admin/recommend-groups?saved=1');
    } catch (err) {
        console.error('[recommendGroup] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ── 담긴 상품 ─────────────────────────────────────────────── */

/** 이 몰의 그룹이 맞는지 (요청 위조 차단) */
async function ownsGroup(groupId, mallId) {
    const [[g]] = await pool.query('SELECT id FROM recommend_group WHERE id = ? AND mall_id = ?', [groupId, mallId]);
    return !!g;
}

/** POST /admin/recommend-groups/:id/items/:itemId/delete */
exports.postRemoveItem = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id;
    try {
        if (!await ownsGroup(id, MALL_ID)) return res.redirect('/admin/recommend-groups');

        await pool.query(
            'DELETE FROM recommend_group_item WHERE id = ? AND recommend_group_id = ?', [req.params.itemId, id]
        );
        res.redirect(`/admin/recommend-groups/${id}?saved=1`);
    } catch (err) {
        console.error('[recommendGroup] postRemoveItem:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/recommend-groups/:id/items/reorder — AJAX */
exports.postReorderItems = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id;
    const order = Array.isArray(req.body.order) ? req.body.order : null;
    if (!order) return res.status(400).json({ success: false });

    const conn = await pool.getConnection();
    try {
        if (!await ownsGroup(id, MALL_ID)) return res.status(404).json({ success: false });

        await conn.beginTransaction();
        for (let i = 0; i < order.length; i++) {
            await conn.query(
                'UPDATE recommend_group_item SET sort_order = ? WHERE id = ? AND recommend_group_id = ?',
                [i + 1, order[i], id]
            );
        }
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        console.error('[recommendGroup] postReorderItems:', err.message);
        res.status(500).json({ success: false });
    } finally {
        conn.release();
    }
};

/**
 * GET /admin/recommend-groups/:id/product-search — AJAX (상품 조회 팝업)
 *
 * 검색어는 선택이다. 카테고리·브랜드 필터만으로도 조회할 수 있어야 한다.
 */
const VISIBILITIES = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'];

exports.getProductSearch = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        const categoryId = Number.parseInt(req.query.category_id, 10);
        const brandId = Number.parseInt(req.query.brand_id, 10);
        const inStock = String(req.query.in_stock || '');       // '' | 'y' | 'n'
        const visibility = String(req.query.visibility || '');  // '' | PUBLIC | HIDDEN | MEMBER_ONLY

        const where = ['p.mall_id = ?'];
        const params = [MALL_ID];

        if (q) { where.push('(p.name LIKE ? OR p.product_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (Number.isFinite(categoryId) && categoryId > 0) { where.push('p.category_id = ?'); params.push(categoryId); }
        if (Number.isFinite(brandId) && brandId > 0) { where.push('p.brand_category_id = ?'); params.push(brandId); }
        if (inStock === 'y') where.push('p.stock > 0');
        else if (inStock === 'n') where.push('p.stock <= 0');
        if (VISIBILITIES.includes(visibility)) { where.push('p.visibility = ?'); params.push(visibility); }

        // 이미 이 그룹에 담긴 상품은 후보에서 뺀다.
        where.push('p.id NOT IN (SELECT product_id FROM recommend_group_item WHERE recommend_group_id = ?)');
        params.push(req.params.id);

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.product_code, p.main_image, p.price, p.stock, p.status, p.visibility, p.product_badge
              FROM products p
             WHERE ${where.join(' AND ')}
             ORDER BY p.created_at DESC
             LIMIT 100
        `, params);

        res.json({ products, limited: products.length >= 100 });
    } catch (err) {
        console.error('[recommendGroup] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};

/**
 * POST /admin/recommend-groups/:id/items/bulk — 여러 상품 한번에 담기 (AJAX)
 * body: { product_ids: number[] }. 이미 담긴 것·타 몰 상품은 조용히 건너뛴다.
 */
exports.postAddItems = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id;

    const raw = Array.isArray(req.body.product_ids) ? req.body.product_ids : [];
    const ids = [...new Set(raw.map(n => Number.parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ success: false, added: 0 });

    const conn = await pool.getConnection();
    try {
        if (!await ownsGroup(id, MALL_ID)) return res.status(404).json({ success: false });

        // 이 몰 소유 상품만 (요청 위조 차단)
        const ph = ids.map(() => '?').join(',');
        const [owned] = await conn.query(`SELECT id FROM products WHERE mall_id = ? AND id IN (${ph})`, [MALL_ID, ...ids]);
        const ownedIds = new Set(owned.map(r => r.id));

        const [existing] = await conn.query(
            'SELECT product_id FROM recommend_group_item WHERE recommend_group_id = ?', [id]
        );
        const have = new Set(existing.map(r => r.product_id));

        const toAdd = ids.filter(pid => ownedIds.has(pid) && !have.has(pid));

        if (toAdd.length) {
            await conn.beginTransaction();
            const [[maxRow]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS m FROM recommend_group_item WHERE recommend_group_id = ?', [id]
            );
            let order = maxRow.m;
            for (const pid of toAdd) {
                order += 1;
                await conn.query(
                    'INSERT INTO recommend_group_item (recommend_group_id, product_id, sort_order) VALUES (?, ?, ?)',
                    [id, pid, order]
                );
            }
            await conn.commit();
        }
        res.json({ success: true, added: toAdd.length, skipped: ids.length - toAdd.length });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 미시작 */ }
        console.error('[recommendGroup] postAddItems:', err.message);
        res.status(500).json({ success: false });
    } finally {
        conn.release();
    }
};
