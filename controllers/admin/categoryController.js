const pool = require('../../config/db');
const { syncCategoryById, deleteCategoryFromShopify } = require('../../services/shopify/categorySync');
const depthGuard = require('../../services/tree/depthGuard');

/*
 * 카테고리 관리 (B1 — 트리 + 최대 3뎁스)
 *
 * 계층은 `parent_id` 자기참조로 저장하고, 최대 뎁스는 **앱 레이어에서 강제**한다
 * (MySQL CHECK 로는 "부모.depth + 1" 동적 검증이 불가능).
 * `depth` 는 캐시 컬럼이므로 부모가 바뀌면 자신 + 모든 후손을 재계산한다.
 *
 * 상한: navigation_config.category_max_depth (기본 3)
 *
 * type(NORMAL/THEME/BRAND)은 뎁스가 아니라 **병렬 분류축**이다.
 * 뎁스 제한은 각 type 트리 내부에서 독립 적용하며, 부모는 같은 type 안에서만 고를 수 있다.
 */

const TYPES = ['NORMAL', 'THEME', 'BRAND'];

function normalizeTab(tab) {
    return ['product', 'theme', 'brand'].includes(tab) ? tab : 'product';
}

function normalizeType(type) {
    return TYPES.includes(type) ? type : 'NORMAL';
}

/*
 * 체크박스는 "hidden value=0 + checkbox value=1" 쌍으로 보낸다(JS 없이도 해제가 전달되도록).
 * 이름이 같으므로 체크 시 qs 가 ['0','1'] 배열을 만든다 → 마지막 값이 실제 선택이다.
 */
function toBool(v) {
    const last = Array.isArray(v) ? v[v.length - 1] : v;
    return last === '1' || last === 1 || last === true || last === 'on' ? 1 : 0;
}

/** 부모 → 자식 순으로 평탄화하고 depth 를 붙인다(정렬은 display_order). */
function flattenTree(rows, parentId = null, depth = 1, out = []) {
    rows
        .filter(r => (r.parent_id || null) === parentId)
        .sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id))
        .forEach((r) => {
            out.push(Object.assign({}, r, { _depth: depth }));
            flattenTree(rows, r.id, depth + 1, out);
        });
    return out;
}

/** node 의 후손 id 집합 (부모 선택지에서 제외해야 순환이 생기지 않는다) */
function descendantIds(rows, nodeId, acc = new Set()) {
    rows.filter(r => r.parent_id === nodeId).forEach((child) => {
        acc.add(child.id);
        descendantIds(rows, child.id, acc);
    });
    return acc;
}

exports.getList = async (req, res) => {
    const MALL_ID = req.adminMallId || 1; // P5: 편집 중인 몰의 카테고리만
    try {
        const [categories] = await pool.query('SELECT * FROM categories WHERE mall_id = ? ORDER BY display_order ASC, id ASC', [MALL_ID]);
        const [counts] = await pool.query(
            'SELECT p.category_id, COUNT(*) AS n FROM products p WHERE p.category_id IS NOT NULL AND p.mall_id = ? GROUP BY p.category_id', [MALL_ID]
        );
        const productCountBy = new Map(counts.map(c => [c.category_id, c.n]));

        const maxDepth = await depthGuard.getCategoryMaxDepth(MALL_ID);
        const maxParent = maxDepth - 1; // 부모가 될 수 있는 최대 depth

        const byType = {};
        for (const type of TYPES) {
            const rows = categories.filter(c => c.type === type);
            const tree = flattenTree(rows).map(node => Object.assign({}, node, {
                productCount: productCountBy.get(node.id) || 0,
                childCount: rows.filter(r => r.parent_id === node.id).length,
                // 이 노드의 부모 후보: 같은 type, depth <= maxParent, 자기 자신/후손 제외
                parentOptions: (() => {
                    const banned = descendantIds(rows, node.id);
                    banned.add(node.id);
                    return flattenTree(rows)
                        .filter(o => !banned.has(o.id) && o._depth <= maxParent)
                        .map(o => ({ id: o.id, name: o.name, depth: o._depth }));
                })(),
            }));
            byType[type] = tree;
        }

        const nextDisplayOrder = {};
        for (const type of TYPES) {
            const rows = categories.filter(c => c.type === type);
            nextDisplayOrder[type] = (rows.length ? Math.max(...rows.map(c => Number(c.display_order) || 0)) : -1) + 1;
        }

        // 신규 추가 모달의 부모 선택지 (type 별, depth <= maxParent)
        const addParentOptions = {};
        for (const type of TYPES) {
            addParentOptions[type] = flattenTree(categories.filter(c => c.type === type))
                .filter(o => o._depth <= maxParent)
                .map(o => ({ id: o.id, name: o.name, depth: o._depth }));
        }

        res.render('admin/categories/list', {
            layout: 'layouts/admin_layout',
            title: '카테고리 관리',
            categories,
            productCategories: byType.NORMAL,
            themeCategories: byType.THEME,
            brandCategories: byType.BRAND,
            addParentOptions,
            activeTab: normalizeTab(req.query.tab),
            nextDisplayOrder,
            maxDepth,
            error: req.query.error || '',
        });
    } catch (err) {
        console.error('[category] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 같은 type 안에서만 부모로 지정할 수 있다. */
async function assertSameType(conn, parentId, type) {
    if (!parentId) return;
    const [rows] = await conn.query('SELECT type FROM categories WHERE id = ?', [parentId]);
    if (rows.length === 0) throw Object.assign(new Error('상위 카테고리를 찾을 수 없습니다.'), { statusCode: 400 });
    if (rows[0].type !== type) {
        throw Object.assign(new Error('상위 카테고리는 같은 분류(일반/테마/브랜드) 안에서만 지정할 수 있습니다.'), { statusCode: 400 });
    }
}

function redirectWithError(res, tab, message) {
    return res.redirect(`/admin/categories?tab=${tab}&error=${encodeURIComponent(message)}`);
}

exports.postAdd = async (req, res) => {
    const { name, display_order, type, active_tab, parent_id } = req.body;
    const allowedType = normalizeType(type);
    const activeTab = normalizeTab(active_tab);
    const parentId = Number(parent_id) > 0 ? Number(parent_id) : null;

    const logoFile = req.file;
    const logoPath = logoFile ? '/uploads/brands/' + logoFile.filename : null;
    const description = (req.body.description || '').trim() || null;

    const conn = await pool.getConnection();
    try {
        await assertSameType(conn, parentId, allowedType);

        // 부모.depth + 1 > 최대뎁스 → DepthLimitError
        const depth = await depthGuard.assertDepthAllowed({ parentId, conn });

        const MALL_ID = req.adminMallId || 1; // P5: 새 카테고리는 편집 중인 몰에 속한다
        let nextOrder = Number.parseInt(display_order, 10);
        if (Number.isNaN(nextOrder)) {
            const [rows] = await conn.query(
                'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM categories WHERE type = ? AND mall_id = ?', [allowedType, MALL_ID]
            );
            nextOrder = rows[0].next_order;
        }

        const [result] = await conn.query(
            `INSERT INTO categories (mall_id, name, display_order, type, logo_image_path, description, parent_id, depth, is_active, pc_visible, mobile_visible)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [MALL_ID, name, nextOrder, allowedType, logoPath, description, parentId, depth,
             toBool(req.body.is_active ?? '1'), toBool(req.body.pc_visible ?? '1'), toBool(req.body.mobile_visible ?? '1')]
        );

        // Shopify 컬렉션 동기화 (THEME 제외, 백그라운드). 미사용 시 categorySync 가 스킵한다.
        if (allowedType !== 'THEME') {
            syncCategoryById(result.insertId)
                .then(r => !r?.skipped && console.log(`[Shopify] 카테고리 컬렉션 생성: ${name}`))
                .catch(e => console.error(`[Shopify] 카테고리 컬렉션 생성 실패: ${name}: ${e.message}`));
        }
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        if (err.name === 'DepthLimitError' || err.statusCode === 400) {
            return redirectWithError(res, activeTab, err.message);
        }
        console.error('[category] postAdd:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

exports.postEdit = async (req, res) => {
    const { id, name, display_order, type, active_tab, parent_id } = req.body;
    const allowedType = normalizeType(type);
    const activeTab = normalizeTab(active_tab);
    const nodeId = Number(id);
    const newParentId = Number(parent_id) > 0 ? Number(parent_id) : null;

    let logoPath = req.body.existing_logo || null;
    if (req.file) logoPath = '/uploads/brands/' + req.file.filename;
    const description = (req.body.description || '').trim() || null;

    const conn = await pool.getConnection();
    try {
        const [[current]] = await conn.query('SELECT parent_id FROM categories WHERE id = ?', [nodeId]);
        if (!current) return redirectWithError(res, activeTab, '카테고리를 찾을 수 없습니다.');

        const parentChanged = (current.parent_id || null) !== newParentId;

        if (parentChanged) {
            await assertSameType(conn, newParentId, allowedType);

            // 자기 자신 / 자기 후손 밑으로 옮기면 순환 참조가 된다.
            const cycle = await depthGuard.wouldCreateCycle({ nodeId, candidateParentId: newParentId, conn });
            if (cycle) return redirectWithError(res, activeTab, '자기 자신이나 하위 카테고리를 상위로 지정할 수 없습니다.');

            // 옮긴 뒤 서브트리 전체가 최대 뎁스를 넘지 않아야 한다.
            await depthGuard.assertDepthAllowed({ parentId: newParentId, conn });
        }

        await conn.beginTransaction();
        await conn.query(
            `UPDATE categories
             SET name = ?, display_order = ?, type = ?, logo_image_path = ?, description = ?, parent_id = ?,
                 is_active = ?, pc_visible = ?, mobile_visible = ?
             WHERE id = ?`,
            [name, display_order, allowedType, logoPath, description, newParentId,
             toBool(req.body.is_active), toBool(req.body.pc_visible), toBool(req.body.mobile_visible), nodeId]
        );

        if (parentChanged) {
            // 자신 + 모든 후손의 depth 재계산. 상한 초과면 여기서 예외 → 롤백.
            await depthGuard.recalcSubtreeDepth({ nodeId, conn });
        }
        await conn.commit();

        if (allowedType !== 'THEME') {
            syncCategoryById(nodeId)
                .then(r => !r?.skipped && console.log(`[Shopify] 카테고리 컬렉션 업데이트: ${name}`))
                .catch(e => console.error(`[Shopify] 카테고리 컬렉션 업데이트 실패: ${name}: ${e.message}`));
        }
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 트랜잭션 미시작 */ }
        if (err.name === 'DepthLimitError' || err.statusCode === 400) {
            return redirectWithError(res, activeTab, err.message);
        }
        console.error('[category] postEdit:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

exports.postDelete = async (req, res) => {
    const { id, active_tab } = req.body;
    const activeTab = normalizeTab(active_tab);
    const nodeId = Number(id);

    try {
        /*
         * categories.parent_id 는 ON DELETE SET NULL 이다.
         * 그대로 부모를 지우면 자식들이 조용히 최상위로 승격되고 depth 가 어긋난 채 남는다.
         * → 하위 카테고리가 있으면 삭제를 막는다.
         */
        const [[{ n: childCount }]] = await pool.query(
            'SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?', [nodeId]
        );
        if (childCount > 0) {
            return redirectWithError(res, activeTab,
                `하위 카테고리 ${childCount}개가 있어 삭제할 수 없습니다. 먼저 하위 카테고리를 옮기거나 삭제하세요.`);
        }

        // Shopify 컬렉션 삭제 — DB 삭제 전에 (shopify_collection_id 를 읽어야 하므로).
        // Shopify 미사용 시 categorySync 가 즉시 스킵한다.
        await deleteCategoryFromShopify(nodeId)
            .catch(e => console.error(`[Shopify] 카테고리 컬렉션 삭제 실패 (id=${nodeId}): ${e.message}`));

        await pool.query('DELETE FROM categories WHERE id = ?', [nodeId]);
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        console.error('[category] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
