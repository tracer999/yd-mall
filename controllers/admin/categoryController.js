const pool = require('../../config/db');
const { syncCategoryById, deleteCategoryFromShopify } = require('../../services/shopify/categorySync');
const depthGuard = require('../../services/tree/depthGuard');
const newArrival = require('../../services/catalog/newArrival');
const { GLOBAL_CATEGORY_MALL_ID, validCategoryIdSet, hiddenCategoryIdSet } = require('../../services/catalog/categoryScope');
// 카테고리·브랜드는 글로벌 한 벌. 관리 화면은 몰 스코핑 없이 글로벌 카탈로그를 다룬다.
// 상품 카운트(상품 있는 것만 노출)는 전 몰 통틀어 센다.

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

/* THEME 축은 폐기했다(테마 5·6 → /best·/new 로 통합). 기존 THEME 행은 DB 에 남아 있으나
   관리 화면에서 만들거나 편집하지 않는다. */
const TYPES = ['NORMAL', 'BRAND'];
const TAB_TO_TYPE = { product: 'NORMAL', brand: 'BRAND' };

/*
 * 한 페이지에 담는 최상위(1뎁스) 카테고리 수.
 * 뎁스별 아코디언이라 부모-자식이 한 페이지에 온전히 있어야 한다 → 행이 아니라
 * "최상위 + 그 서브트리 전체"를 한 단위로 잘라 서브트리가 페이지 경계에서 쪼개지지 않게 한다.
 */
const TOP_PER_PAGE = 100;

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

exports.getList = async (req, res) => {
    const MALL_ID = req.adminMallId || 1; // P5: 편집 중인 몰의 카테고리만
    try {
        // 글로벌 카탈로그(NORMAL·BRAND=mall 0). THEME 등 잔존 몰별 타입도 함께 보이도록 IN.
        const [categories] = await pool.query(
            'SELECT * FROM categories WHERE mall_id IN (?, ?) ORDER BY display_order ASC, id ASC',
            [GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        // 상품 카운트는 전 몰 통틀어(글로벌 카탈로그이므로).
        const [counts] = await pool.query(
            'SELECT p.category_id, COUNT(*) AS n FROM products p WHERE p.category_id IS NOT NULL GROUP BY p.category_id'
        );
        const productCountBy = new Map(counts.map(c => [c.category_id, c.n]));
        const [brandCounts] = await pool.query(
            'SELECT p.brand_category_id, COUNT(*) AS n FROM products p WHERE p.brand_category_id IS NOT NULL GROUP BY p.brand_category_id'
        );
        const brandCountBy = new Map(brandCounts.map(c => [c.brand_category_id, c.n]));

        const maxDepth = await depthGuard.getCategoryMaxDepth(MALL_ID);
        const maxParent = maxDepth - 1; // 부모가 될 수 있는 최대 depth

        const nameById = new Map(categories.map(c => [c.id, c.name]));

        // 몰별 표시 override — "이 몰(MALL_ID)에서 유효한(상품 있는) 카테고리/브랜드"만 토글 대상.
        // hidden(mall_category_visibility) 이면 그 몰 스토어프론트에서 숨김.
        const [mallValidCat, mallValidBrand, mallHidden] = await Promise.all([
            validCategoryIdSet(MALL_ID),
            validCategoryIdSet(MALL_ID, { brand: true }),
            hiddenCategoryIdSet(MALL_ID),
        ]);
        const [[mallRow]] = await pool.query('SELECT name FROM mall WHERE id = ?', [MALL_ID]).catch(() => [[null]]);
        const currentMallName = (mallRow && mallRow.name) || `몰 ${MALL_ID}`;

        // 부모 후보(parentOptions)를 노드마다 만들면 O(n^3) 이다(노드별 flattenTree + descendantIds).
        // 브랜드가 1354개인 mall 2 에서 응답이 18MB/70초로 터져 잘린 HTML 이 나갔다.
        // → 트리는 type 당 1회만 만들고, 부모 후보는 type 당 1벌(addParentOptions)을 뷰가
        //   select focus 시점에 클라이언트에서 걸러 쓴다. 자기/후손 제외는 UX 편의이고,
        //   실제 순환·뎁스 방어는 postEdit 의 wouldCreateCycle/assertDepthAllowed 가 한다.
        const byType = {};
        const treeByType = {};
        for (const type of TYPES) {
            const rows = categories.filter(c => c.type === type);
            const tree = flattenTree(rows);
            treeByType[type] = tree;

            const childCountBy = new Map();
            for (const r of rows) {
                if (!r.parent_id) continue;
                childCountBy.set(r.parent_id, (childCountBy.get(r.parent_id) || 0) + 1);
            }

            const mallValid = type === 'BRAND' ? mallValidBrand : mallValidCat;
            byType[type] = tree.map(node => Object.assign({}, node, {
                // NORMAL 은 category_id, BRAND 는 brand_category_id 기준 카운트
                productCount: (type === 'BRAND' ? brandCountBy : productCountBy).get(node.id) || 0,
                childCount: childCountBy.get(node.id) || 0,
                // select 초기 렌더용 — 현재 부모 1개만 option 으로 찍는다.
                parentName: node.parent_id ? (nameById.get(node.parent_id) || '') : '',
                // 몰별 표시 토글용. validForMall=이 몰에 상품이 있어 애초에 노출되는가, hiddenForMall=override 로 숨김.
                validForMall: mallValid.has(node.id),
                hiddenForMall: mallHidden.has(node.id),
            }));
        }

        /*
         * "상품 있는 것만 노출" (설계 §10-3·4). 빈 카테고리/브랜드는 숨긴다.
         * 단 트리라서 **자손에 상품이 있으면 조상은 보존**(경로 유지). ?showEmpty=1 이면 전체.
         * NORMAL·BRAND 에만 적용(THEME 은 기존대로).
         */
        const showEmpty = req.query.showEmpty === '1';
        if (!showEmpty) {
            const parentOf = new Map(categories.map(c => [c.id, c.parent_id || null]));
            for (const type of ['NORMAL', 'BRAND']) {
                if (!byType[type]) continue;
                const cnt = type === 'BRAND' ? brandCountBy : productCountBy;
                const keep = new Set();
                for (const node of byType[type]) {
                    if ((cnt.get(node.id) || 0) > 0) {
                        let cur = node.id;
                        while (cur && !keep.has(cur)) { keep.add(cur); cur = parentOf.get(cur); }
                    }
                }
                byType[type] = byType[type].filter(n => keep.has(n.id));
            }
        }

        const nextDisplayOrder = {};
        for (const type of TYPES) {
            const rows = categories.filter(c => c.type === type);
            nextDisplayOrder[type] = (rows.length ? Math.max(...rows.map(c => Number(c.display_order) || 0)) : -1) + 1;
        }

        // 부모 선택지 (type 별, depth <= maxParent) — 신규 추가 모달 + 행별 select 가 공유한다.
        // parentId 는 클라이언트가 "이 후보가 편집 중인 노드의 후손인가" 를 판정하는 데 쓴다.
        // 페이지네이션과 무관하게 **type 전체** 후보를 담으므로, 다른 페이지의 노드도 부모로 고를 수 있다.
        const addParentOptions = {};
        for (const type of TYPES) {
            addParentOptions[type] = treeByType[type]
                .filter(o => o._depth <= maxParent)
                .map(o => ({ id: o.id, name: o.name, depth: o._depth, parentId: o.parent_id || null }));
        }

        // 한 화면에 1354개(mall 2 브랜드) 행을 그리면 DOM 이 6.8만 노드가 되어 브라우저가 37초를 쓴다.
        // 최상위 서브트리 단위로 잘라야 한다(아코디언 정합성). 세 탭이 모두 서버 렌더되므로 활성 탭만 요청 page 를 쓰고 나머지는 1페이지.
        const activeTab = normalizeTab(req.query.tab);
        const activeType = TAB_TO_TYPE[activeTab];
        const reqPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

        const pageInfo = {};
        const pagedByType = {};
        for (const type of TYPES) {
            const all = byType[type]; // 부모→자식 순 평탄화

            // 최상위(_depth===1)를 만날 때마다 새 블록을 시작한다. 자식은 직전 블록에 이어붙는다
            // (평탄화가 부모→자식 순이므로 한 서브트리는 연속 구간이다).
            const blocks = [];
            for (const node of all) {
                if (node._depth === 1 || blocks.length === 0) blocks.push([node]);
                else blocks[blocks.length - 1].push(node);
            }

            const totalTop = blocks.length;
            const totalPages = Math.max(1, Math.ceil(totalTop / TOP_PER_PAGE));
            const page = Math.min(type === activeType ? reqPage : 1, totalPages);
            const pageBlocks = blocks.slice((page - 1) * TOP_PER_PAGE, page * TOP_PER_PAGE);
            pagedByType[type] = pageBlocks.flat();
            // total 은 최상위(대분류) 기준. perPage 도 최상위 기준이라 '전체 N개 중 x–y' 가 대분류 수로 표시된다.
            pageInfo[type] = { page, totalPages, total: totalTop, perPage: TOP_PER_PAGE };
        }

        res.render('admin/categories/list', {
            layout: 'layouts/admin_layout',
            title: '카테고리 관리',
            categories,
            productCategories: pagedByType.NORMAL,
            brandCategories: pagedByType.BRAND,
            addParentOptions,
            activeTab,
            pageInfo,
            nextDisplayOrder,
            maxDepth,
            newBrandDays: newArrival.newBrandDays(),
            error: req.query.error || '',
            saved: req.query.saved === '1',
            showEmpty,
            currentMallName,
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
    // 입점일은 브랜드에만 의미가 있다. NORMAL/THEME 에 값이 새어들지 않게 여기서 막는다.
    const onboardedAt = (allowedType === 'BRAND' && req.body.onboarded_at) ? req.body.onboarded_at : null;

    const conn = await pool.getConnection();
    try {
        await assertSameType(conn, parentId, allowedType);

        // 부모.depth + 1 > 최대뎁스 → DepthLimitError
        const depth = await depthGuard.assertDepthAllowed({ parentId, conn });

        // NORMAL·BRAND 는 글로벌(mall 0). THEME/OUTLET 만 편집 중인 몰에 속한다.
        const MALL_ID = (allowedType === 'THEME' || allowedType === 'OUTLET') ? (req.adminMallId || 1) : GLOBAL_CATEGORY_MALL_ID;
        let nextOrder = Number.parseInt(display_order, 10);
        if (Number.isNaN(nextOrder)) {
            const [rows] = await conn.query(
                'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM categories WHERE type = ? AND mall_id = ?', [allowedType, MALL_ID]
            );
            nextOrder = rows[0].next_order;
        }

        const [result] = await conn.query(
            `INSERT INTO categories (mall_id, name, display_order, type, logo_image_path, onboarded_at, description, parent_id, depth, is_active, pc_visible, mobile_visible)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [MALL_ID, name, nextOrder, allowedType, logoPath, onboardedAt, description, parentId, depth,
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
    // 입점일은 브랜드에만 의미가 있다. NORMAL/THEME 에 값이 새어들지 않게 여기서 막는다.
    const onboardedAt = (allowedType === 'BRAND' && req.body.onboarded_at) ? req.body.onboarded_at : null;

    const MALL_ID = req.adminMallId || 1;
    const conn = await pool.getConnection();
    try {
        // P5: 편집 중인 몰 소유 카테고리만 수정(크로스몰 덮어쓰기 방지)
        const [[current]] = await conn.query('SELECT parent_id FROM categories WHERE id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]);
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
             SET name = ?, display_order = ?, type = ?, logo_image_path = ?, onboarded_at = ?, description = ?, parent_id = ?,
                 is_active = ?, pc_visible = ?, mobile_visible = ?
             WHERE id = ? AND mall_id IN (0, ?)`,
            [name, display_order, allowedType, logoPath, onboardedAt, description, newParentId,
             toBool(req.body.is_active), toBool(req.body.pc_visible), toBool(req.body.mobile_visible), nodeId, MALL_ID]
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

/**
 * POST /admin/categories/visibility — 노출(활성·PC·모바일) 일괄 저장.
 *
 * 행마다 [수정] 을 누르면 한 번에 한 건이라, 노출만 여러 건 바꾸는 흔한 작업이 너무 느리다.
 * 이 엔드포인트는 **노출 3개 컬럼만** 건드린다 — 이름·상위·순서는 건드리지 않으므로
 * 계층(뎁스·순환) 검증이 필요 없고, 행 단위 수정 폼과 충돌하지도 않는다.
 *
 * body: id[]=3&id[]=5 …, active[c<id>]=1 / pc[c<id>]=1 / mo[c<id>]=1  (체크된 것만 전송)
 *
 * ⚠️ 키에 `c` 접두어를 붙인다. `active[3]` 처럼 숫자 키를 쓰면 qs 가 배열 인덱스로 보고
 *    값을 압축해 버려 id 로 다시 찾을 수 없다.
 */
exports.postVisibility = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const activeTab = normalizeTab(req.body.active_tab);
    const ids = [].concat(req.body.id || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    const on = (bag, id) => (bag && String(bag['c' + id]) === '1' ? 1 : 0);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const id of ids) {
            await conn.query(
                `UPDATE categories SET is_active = ?, pc_visible = ?, mobile_visible = ?
                  WHERE id = ? AND mall_id IN (0, ?)`,
                [on(req.body.active, id), on(req.body.pc, id), on(req.body.mo, id), id, mallId],
            );
        }
        await conn.commit();
        res.redirect(`/admin/categories?tab=${activeTab}&saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[categories] postVisibility:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

/**
 * POST /admin/categories/mall-visibility — 몰별 표시 override 토글(1건).
 *
 * 카테고리·브랜드는 글로벌 한 벌이라 is_active/pc/mo 는 전역이다. 이건 그와 별개로
 * "이 몰(req.adminMallId) 스토어프론트에서 이 카테고리를 숨긴다"만 담는다.
 *   visible=1 → override 제거(기본 노출 복귀)  /  visible=0 → hidden=1 upsert
 * 표시여부는 내비/사이드바 노출에만 영향(직접 URL 은 막지 않음).
 *
 * body: category_id, visible(체크박스 쌍 → toBool), active_tab
 */
exports.postMallVisibility = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const activeTab = normalizeTab(req.body.active_tab);
    const categoryId = Number(req.body.category_id);
    const visible = toBool(req.body.visible);
    try {
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            return redirectWithError(res, activeTab, '카테고리를 찾을 수 없습니다.');
        }
        if (visible) {
            await pool.query('DELETE FROM mall_category_visibility WHERE mall_id = ? AND category_id = ?', [mallId, categoryId]);
        } else {
            await pool.query(
                'INSERT INTO mall_category_visibility (mall_id, category_id, hidden) VALUES (?, ?, 1) ' +
                'ON DUPLICATE KEY UPDATE hidden = 1',
                [mallId, categoryId]
            );
        }
        res.redirect(`/admin/categories?tab=${activeTab}&saved=1`);
    } catch (err) {
        console.error('[category] postMallVisibility:', err.message);
        res.status(500).send('Server Error');
    }
};

exports.postDelete = async (req, res) => {
    const { id, active_tab } = req.body;
    const activeTab = normalizeTab(active_tab);
    const nodeId = Number(id);
    const MALL_ID = req.adminMallId || 1;

    try {
        // P5: 편집 중인 몰 소유 카테고리만 삭제(크로스몰 삭제·Shopify 오발화 방지)
        const [[owned]] = await pool.query('SELECT id FROM categories WHERE id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]);
        if (!owned) return redirectWithError(res, activeTab, '카테고리를 찾을 수 없습니다.');

        /*
         * categories.parent_id 는 ON DELETE SET NULL 이다.
         * 그대로 부모를 지우면 자식들이 조용히 최상위로 승격되고 depth 가 어긋난 채 남는다.
         * → 하위 카테고리가 있으면 삭제를 막는다.
         */
        const [[{ n: childCount }]] = await pool.query(
            'SELECT COUNT(*) AS n FROM categories WHERE parent_id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]
        );
        if (childCount > 0) {
            return redirectWithError(res, activeTab,
                `하위 카테고리 ${childCount}개가 있어 삭제할 수 없습니다. 먼저 하위 카테고리를 옮기거나 삭제하세요.`);
        }

        // Shopify 컬렉션 삭제 — DB 삭제 전에 (shopify_collection_id 를 읽어야 하므로).
        // Shopify 미사용 시 categorySync 가 즉시 스킵한다.
        await deleteCategoryFromShopify(nodeId)
            .catch(e => console.error(`[Shopify] 카테고리 컬렉션 삭제 실패 (id=${nodeId}): ${e.message}`));

        await pool.query('DELETE FROM categories WHERE id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]);
        res.redirect(`/admin/categories?tab=${activeTab}`);
    } catch (err) {
        console.error('[category] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
