const pool = require('../../config/db');
const { syncCategoryById, deleteCategoryFromShopify } = require('../../services/shopify/categorySync');
const depthGuard = require('../../services/tree/depthGuard');
const { GLOBAL_CATEGORY_MALL_ID, validCategoryIdSet, hiddenCategoryIdSet } = require('../../services/catalog/categoryScope');
const naverCatInherit = require('../../services/sourcing/channel/naverCategoryInherit');
const { inStockSql, sellableStockSql } = require('../../services/catalog/sellableStock');
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

/*
 * 이 화면은 **상품 카테고리(NORMAL) 전용**이다.
 * 브랜드(type='BRAND')는 브랜드 관리(/admin/brands)로 이관했다 — 브랜드가 1,401개라
 * 같은 화면에 얹으면 부모 후보 JSON·DOM 이 함께 터지고, 브랜드 전용 속성(brand_profile)은
 * 어차피 브랜드 관리에서 편집해야 했다.
 *
 * 탭은 분류축이 아니라 **범위(scope)** 다.
 *   used = 이 몰에 상품이 있는 카테고리(+ 경로 유지를 위한 조상)  — 트리 + 아코디언
 *   all  = 빈 카테고리 포함 전체                                  — 평면 목록 + 행 페이징
 */
const SCOPES = ['used', 'all'];

/*
 * used 탭: 한 페이지에 담는 최상위(1뎁스) 카테고리 수.
 * 뎁스별 아코디언이라 부모-자식이 한 페이지에 온전히 있어야 한다 → 행이 아니라
 * "최상위 + 그 서브트리 전체"를 한 단위로 잘라 서브트리가 페이지 경계에서 쪼개지지 않게 한다.
 */
const TOP_PER_PAGE = 100;

/*
 * all 탭: 행 단위 페이징.
 * 최상위가 12개뿐인데 3뎁스가 2,094개라(몰2) 서브트리 단위로는 전량이 1페이지에 들어와
 * 2,348행을 한 번에 그리게 된다 — 이게 "빈 카테고리 모두 보기"가 느렸던 원인이다.
 * 그래서 all 탭은 트리를 포기하고 평면 + 경로 표기로 간다.
 */
const FLAT_PER_PAGE = 100;

function normalizeScope(scope) {
    return SCOPES.includes(scope) ? scope : 'used';
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
        // 예전 링크(?showEmpty=1) 는 전체 탭으로 흡수한다.
        const scope = normalizeScope(req.query.scope || (req.query.showEmpty === '1' ? 'all' : 'used'));

        // 상품 카테고리(NORMAL)만. 글로벌 카탈로그(mall 0) + 잔존 몰별 행.
        const [categories] = await pool.query(
            "SELECT * FROM categories WHERE type = 'NORMAL' AND mall_id IN (?, ?) ORDER BY display_order ASC, id ASC",
            [GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        // 카테고리는 글로벌 한 벌이지만 **상품은 몰별**이다. 관리 화면의 상품수·"사용중" 판정은
        // **편집 중인 몰(MALL_ID) 기준**으로 집계한다(전 몰 통합 아님).
        const [counts] = await pool.query(
            'SELECT p.category_id, COUNT(*) AS n FROM products p WHERE p.mall_id = ? AND p.category_id IS NOT NULL GROUP BY p.category_id',
            [MALL_ID]
        );
        const productCountBy = new Map(counts.map(c => [c.category_id, c.n]));

        const maxDepth = await depthGuard.getCategoryMaxDepth(MALL_ID);
        const maxParent = maxDepth - 1; // 부모가 될 수 있는 최대 depth

        const nameById = new Map(categories.map(c => [c.id, c.name]));
        const parentOf = new Map(categories.map(c => [c.id, c.parent_id || null]));

        // 몰별 표시 override — "이 몰(MALL_ID)에서 유효한(상품 있는) 카테고리"만 토글 대상.
        // hidden(mall_category_visibility) 이면 그 몰 스토어프론트에서 숨김.
        const [mallValid, mallHidden] = await Promise.all([
            validCategoryIdSet(MALL_ID),
            hiddenCategoryIdSet(MALL_ID),
        ]);
        const [[mallRow]] = await pool.query('SELECT name FROM mall WHERE id = ?', [MALL_ID]).catch(() => [[null]]);
        const currentMallName = (mallRow && mallRow.name) || `몰 ${MALL_ID}`;

        const tree = flattenTree(categories); // 부모→자식 순 평탄화 (트리 1회만 만든다)

        const childCountBy = new Map();
        for (const r of categories) {
            if (!r.parent_id) continue;
            childCountBy.set(r.parent_id, (childCountBy.get(r.parent_id) || 0) + 1);
        }

        /** 조상 경로("대분류 > 중분류") — 트리를 접은 전체 탭에서 계층 대신 보여준다. */
        const pathOf = (node) => {
            const names = [];
            let cur = node.parent_id || null;
            for (let guard = 0; cur && guard < 10; guard++) {
                names.unshift(nameById.get(cur) || '');
                cur = parentOf.get(cur) || null;
            }
            return names.join(' > ');
        };

        const rows = tree.map(node => Object.assign({}, node, {
            productCount: productCountBy.get(node.id) || 0,
            childCount: childCountBy.get(node.id) || 0,
            // select 초기 렌더용 — 현재 부모 1개만 option 으로 찍는다.
            parentName: node.parent_id ? (nameById.get(node.parent_id) || '') : '',
            parentPath: pathOf(node),
            // 몰별 표시 토글용. validForMall=이 몰에 상품이 있어 애초에 노출되는가, hiddenForMall=override 로 숨김.
            validForMall: mallValid.has(node.id),
            hiddenForMall: mallHidden.has(node.id),
        }));

        /*
         * "사용중" = 이 몰에 상품이 있는 카테고리. 단 트리라서 **자손에 상품이 있으면 조상은 보존**한다
         * (경로가 끊기면 아코디언으로 도달할 수 없다). 탭 배지에 쓰려고 scope 와 무관하게 항상 센다.
         */
        const keep = new Set();
        for (const node of rows) {
            if (node.productCount > 0) {
                let cur = node.id;
                while (cur && !keep.has(cur)) { keep.add(cur); cur = parentOf.get(cur); }
            }
        }
        const counts2 = { used: keep.size, all: rows.length };

        const reqPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        let pageRows;
        let pageInfo;

        if (scope === 'used') {
            let used = rows.filter(n => keep.has(n.id));

            /*
             * 아코디언 화살표(">")는 **이 화면에 실제로 남아 있는 자식** 기준이어야 한다.
             * childCount 는 글로벌 카탈로그 기준이라, 위 필터로 자식이 전부 빠진 부모도 화살표가
             * 남아 펼쳐도 아무것도 안 나오는 상태가 됐다. → 필터 이후 집합으로 다시 센다.
             * (삭제 차단은 여전히 childCount 기준 — 서버 postDelete 의 실제 자식 수와 맞춰야 한다.)
             */
            const visibleChildCountBy = new Map();
            for (const n of used) {
                if (!n.parent_id) continue;
                visibleChildCountBy.set(n.parent_id, (visibleChildCountBy.get(n.parent_id) || 0) + 1);
            }
            used = used.map(n => Object.assign({}, n, { visibleChildCount: visibleChildCountBy.get(n.id) || 0 }));

            // 최상위(_depth===1)를 만날 때마다 새 블록을 시작한다. 자식은 직전 블록에 이어붙는다
            // (평탄화가 부모→자식 순이므로 한 서브트리는 연속 구간이다).
            const blocks = [];
            for (const node of used) {
                if (node._depth === 1 || blocks.length === 0) blocks.push([node]);
                else blocks[blocks.length - 1].push(node);
            }
            const totalTop = blocks.length;
            const totalPages = Math.max(1, Math.ceil(totalTop / TOP_PER_PAGE));
            const page = Math.min(reqPage, totalPages);
            pageRows = blocks.slice((page - 1) * TOP_PER_PAGE, page * TOP_PER_PAGE).flat();
            // total 은 최상위(대분류) 기준 — '전체 N개 중 x–y' 가 대분류 수로 표시된다.
            pageInfo = { page, totalPages, total: totalTop, perPage: TOP_PER_PAGE, unit: '대분류' };
        } else {
            // 전체 탭은 평면이라 행 단위로 자른다(서브트리 단위로는 12개 최상위에 2,348행이 몰린다).
            const totalPages = Math.max(1, Math.ceil(rows.length / FLAT_PER_PAGE));
            const page = Math.min(reqPage, totalPages);
            pageRows = rows.slice((page - 1) * FLAT_PER_PAGE, page * FLAT_PER_PAGE);
            pageInfo = { page, totalPages, total: rows.length, perPage: FLAT_PER_PAGE, unit: '카테고리' };
        }

        // 부모 선택지 (depth <= maxParent) — 신규 추가 모달 + 행별 select 가 공유한다.
        // parentId 는 클라이언트가 "이 후보가 편집 중인 노드의 후손인가" 를 판정하는 데 쓴다.
        // 페이지네이션과 무관하게 **전체** 후보를 담으므로, 다른 페이지의 노드도 부모로 고를 수 있다.
        // 자기/후손 제외는 UX 편의이고, 실제 순환·뎁스 방어는 postEdit 의 wouldCreateCycle/assertDepthAllowed 가 한다.
        const parentOptions = tree
            .filter(o => o._depth <= maxParent)
            .map(o => ({ id: o.id, name: o.name, depth: o._depth, parentId: o.parent_id || null }));

        const nextDisplayOrder = (categories.length
            ? Math.max(...categories.map(c => Number(c.display_order) || 0)) : -1) + 1;

        res.render('admin/categories/list', {
            layout: 'layouts/admin_layout',
            title: '카테고리 관리',
            rows: pageRows,
            parentOptions,
            viewScope: scope,
            scopeCounts: counts2,
            pageInfo,
            nextDisplayOrder,
            maxDepth,
            error: req.query.error || '',
            saved: req.query.saved === '1',
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

/**
 * 저장/삭제 후 돌아갈 곳.
 *
 * 브랜드 관리(/admin/brands)가 이 컨트롤러의 delete·visibility·mall-visibility 를 공유하므로
 * (좁은 컬럼만 만지거나 별도 테이블이라 브랜드에도 그대로 안전하다), 어느 화면에서 왔는지를
 * 폼이 `return_url` 로 실어 보낸다. 오픈 리다이렉트 방지 — /admin/ 내부 경로만 허용한다.
 */
function backUrl(req, extra = {}) {
    const raw = String(req.body.return_url || '');
    const safe = /^\/admin\/[A-Za-z0-9][^\\]*$/.test(raw) && !raw.startsWith('/admin//');
    const base = safe ? raw : `/admin/categories?scope=${normalizeScope(req.body.scope)}`;

    const [path, qs] = base.split('?');
    const sp = new URLSearchParams(qs || '');
    for (const [k, v] of Object.entries(extra)) {
        if (v === null || v === undefined || v === '') sp.delete(k);
        else sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
}

function redirectWithError(res, req, message) {
    return res.redirect(backUrl(req, { error: message, saved: null }));
}

/** 브랜드 관리(/admin/brands)에서 넘어온 요청인가 — 안내 문구를 그 화면 말투로 낸다. */
function fromBrandScreen(req) {
    return /^\/admin\/brands(\?|$)/.test(String(req.body.return_url || ''));
}

exports.postAdd = async (req, res) => {
    const { name, display_order, type, parent_id } = req.body;
    const allowedType = normalizeType(type);
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
        res.redirect(backUrl(req, { saved: 1, error: null }));
    } catch (err) {
        if (err.name === 'DepthLimitError' || err.statusCode === 400) {
            return redirectWithError(res, req, err.message);
        }
        console.error('[category] postAdd:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};

exports.postEdit = async (req, res) => {
    const { id, name, display_order, type, parent_id } = req.body;
    const allowedType = normalizeType(type);
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
        if (!current) return redirectWithError(res, req, '카테고리를 찾을 수 없습니다.');

        const parentChanged = (current.parent_id || null) !== newParentId;

        if (parentChanged) {
            await assertSameType(conn, newParentId, allowedType);

            // 자기 자신 / 자기 후손 밑으로 옮기면 순환 참조가 된다.
            const cycle = await depthGuard.wouldCreateCycle({ nodeId, candidateParentId: newParentId, conn });
            if (cycle) return redirectWithError(res, req, '자기 자신이나 하위 카테고리를 상위로 지정할 수 없습니다.');

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
        // 상세 화면에서 저장했으면 상세로 되돌린다.
        if (req.body.return_to === 'detail') return res.redirect(`/admin/categories/${nodeId}?saved=1`);
        res.redirect(backUrl(req, { saved: 1, error: null }));
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 트랜잭션 미시작 */ }
        if (err.name === 'DepthLimitError' || err.statusCode === 400) {
            return redirectWithError(res, req, err.message);
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
    const ids = [].concat(req.body.id || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    const on = (bag, id) => (bag && String(bag['c' + id]) === '1' ? 1 : 0);

    const conn = await pool.getConnection();
    try {
        // 사용 여부(is_active)만 일괄 저장한다. 메뉴 노출(pc/mobile)은 메뉴 미리보기 소관이라 건드리지 않는다.
        await conn.beginTransaction();
        for (const id of ids) {
            await conn.query(
                'UPDATE categories SET is_active = ? WHERE id = ? AND mall_id IN (0, ?)',
                [on(req.body.active, id), id, mallId],
            );
        }
        await conn.commit();
        res.redirect(backUrl(req, { saved: 1, error: null }));
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
    const categoryId = Number(req.body.category_id);
    const visible = toBool(req.body.visible);
    try {
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            return redirectWithError(res, req, '카테고리를 찾을 수 없습니다.');
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
        res.redirect(backUrl(req, { saved: 1, error: null }));
    } catch (err) {
        console.error('[category] postMallVisibility:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ────────────────────────────────────────────────────────────────
 * 카테고리/브랜드 상세 — 기본정보 편집 + 상품 배정/제거
 *
 * 카테고리·브랜드는 글로벌(mall_id=0) 한 벌이지만 상품은 몰별이다. 그래서 상세의
 * 상품 목록·배정·제거는 모두 **편집 중인 몰(req.adminMallId)** 스코프로만 다룬다.
 * products.category_id / brand_category_id 는 단일 FK라 "배정"=컬럼 쓰기, "제거"=NULL.
 * ──────────────────────────────────────────────────────────────── */

const VISIBILITIES = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'];
const DETAIL_PER_PAGE = 50;

/** 상세에서 상품 컬럼을 type 으로 고른다(사용자 입력 아님 → SQL 주입 안전). */
function productColumnFor(type) {
    return type === 'BRAND' ? 'brand_category_id' : 'category_id';
}

/** GET /admin/categories/:id — 상세 화면 */
exports.getDetail = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = Number(req.params.id);
    try {
        const [[category]] = await pool.query(
            'SELECT * FROM categories WHERE id = ? AND mall_id IN (?, ?)',
            [id, GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        if (!category) return res.redirect('/admin/categories?error=' + encodeURIComponent('카테고리를 찾을 수 없습니다.'));

        const col = productColumnFor(category.type);

        // 이 카테고리/브랜드에 속한 이 몰 상품 (페이지네이션)
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM products WHERE mall_id = ? AND ${col} = ?`, [MALL_ID, id]
        );
        const totalPages = Math.max(1, Math.ceil(total / DETAIL_PER_PAGE));
        const page = Math.min(Math.max(1, Number.parseInt(req.query.page, 10) || 1), totalPages);
        const [products] = await pool.query(
            `SELECT id, name, product_code, main_image, price, stock, status, visibility
               FROM products WHERE mall_id = ? AND ${col} = ?
              ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [MALL_ID, id, DETAIL_PER_PAGE, (page - 1) * DETAIL_PER_PAGE]
        );

        // 미설정(이 컬럼이 NULL) 상품 수 — 팝업 안내용
        const [[{ unassigned }]] = await pool.query(
            `SELECT COUNT(*) AS unassigned FROM products WHERE mall_id = ? AND ${col} IS NULL`, [MALL_ID]
        );

        // 기본정보 편집 폼의 상위 후보(같은 type, depth <= 최대-1)
        const maxDepth = await depthGuard.getCategoryMaxDepth(MALL_ID);
        const [sameType] = await pool.query(
            'SELECT id, name, parent_id, display_order FROM categories WHERE type = ? AND mall_id IN (?, ?) ORDER BY display_order ASC, id ASC',
            [category.type, GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        const parentOptions = flattenTree(sameType)
            .filter(o => o._depth <= (maxDepth - 1) && o.id !== id)
            .map(o => ({ id: o.id, name: o.name, depth: o._depth }));

        const [[mallRow]] = await pool.query('SELECT name FROM mall WHERE id = ?', [MALL_ID]).catch(() => [[null]]);

        // 네이버 연동용 매핑 현황. 연동을 안 쓰는 몰에서도 화면이 죽지 않게 실패는 흡수한다.
        const naverMap = await naverCatInherit.categoryMappingInfo(MALL_ID, id).catch(() => null);

        res.render('admin/categories/detail', {
            layout: 'layouts/admin_layout',
            title: (category.type === 'BRAND' ? '브랜드' : '카테고리') + ' 상세',
            category, products, total, page, totalPages, perPage: DETAIL_PER_PAGE,
            unassigned, parentOptions, maxDepth, naverMap,
            currentMallName: (mallRow && mallRow.name) || `몰 ${MALL_ID}`,
            saved: req.query.saved === '1', error: req.query.error || '',
            msg: req.query.msg || '',
        });
    } catch (err) {
        console.error('[category] getDetail:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * POST /admin/categories/:id/naver-category — 이 카테고리에 네이버 리프 카테고리를 연결.
 *
 * 여기가 네이버 연동에서 **사용자가 의식적으로 입력하는 유일한 지점**이다.
 * 카테고리당 한 번 지정하면 소속 상품은 상속으로 따라간다(상품 9,680건을 개별 입력할 수 없다).
 * 고시 유형은 네이버 리프가 정하므로 따로 고를 필요가 없다.
 */
exports.postNaverCategory = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = Number(req.params.id);
    try {
        const r = await naverCatInherit.setCategoryMapping(MALL_ID, id, req.body.naver_category_id, {
            applyToProducts: req.body.apply_to_products === '1',
        });
        const msg = r.naverCategoryId
            ? `네이버 카테고리 연결: ${r.categoryPath}` + (r.applied ? ` · 상품 ${r.applied}건에 반영` : '')
            : '네이버 카테고리 연결을 해제했습니다.';
        res.redirect(`/admin/categories/${id}?msg=` + encodeURIComponent(msg));
    } catch (err) {
        res.redirect(`/admin/categories/${id}?error=` + encodeURIComponent(err.message));
    }
};

/** GET /admin/categories/:id/product-search — 미설정(이 카테고리/브랜드 없음) 상품 검색(JSON) */
exports.getProductSearch = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = Number(req.params.id);
    try {
        const [[category]] = await pool.query(
            'SELECT type FROM categories WHERE id = ? AND mall_id IN (?, ?)', [id, GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        if (!category) return res.status(404).json({ products: [] });
        const col = productColumnFor(category.type);

        const q = String(req.query.q || '').trim();
        const inStock = String(req.query.in_stock || '');
        const visibility = String(req.query.visibility || '');

        // 이 몰 상품 중 아직 이 축(카테고리/브랜드)이 미설정인 것만 후보로 제시한다.
        const where = ['p.mall_id = ?', `p.${col} IS NULL`];
        const params = [MALL_ID];
        if (q) { where.push('(p.name LIKE ? OR p.product_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (inStock === 'y') where.push(inStockSql('p'));
        else if (inStock === 'n') where.push(`NOT ${inStockSql('p')}`);
        if (VISIBILITIES.includes(visibility)) { where.push('p.visibility = ?'); params.push(visibility); }

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.product_code, p.main_image, p.price,
                   ${sellableStockSql('p')} AS stock, p.status, p.visibility
            FROM products p WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC LIMIT 100
        `, params);
        res.json({ products, limited: products.length >= 100 });
    } catch (err) {
        console.error('[category] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};

/** POST /admin/categories/:id/products — 미설정 상품을 이 카테고리/브랜드에 일괄 배정 */
exports.postAssignProducts = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = Number(req.params.id);
    const ids = [].concat(req.body.product_ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    try {
        const [[category]] = await pool.query(
            'SELECT type FROM categories WHERE id = ? AND mall_id IN (?, ?)', [id, GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        if (!category) return res.status(404).json({ success: false, message: '카테고리를 찾을 수 없습니다.' });
        if (!ids.length) return res.json({ success: true, assigned: 0 });
        const col = productColumnFor(category.type);
        // IS NULL 조건 — 이미 다른 카테고리에 속한 상품을 실수로 이동시키지 않는다(미설정만 배정).
        const [r] = await pool.query(
            `UPDATE products SET ${col} = ? WHERE mall_id = ? AND ${col} IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
            [id, MALL_ID, ...ids]
        );
        res.json({ success: true, assigned: r.affectedRows });
    } catch (err) {
        console.error('[category] postAssignProducts:', err.message);
        res.status(500).json({ success: false, message: '배정 실패' });
    }
};

/** POST /admin/categories/:id/products/remove — 상품을 이 카테고리/브랜드에서 제거(연결 해제) */
exports.postRemoveProduct = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = Number(req.params.id);
    const productId = Number(req.body.product_id);
    try {
        const [[category]] = await pool.query(
            'SELECT type FROM categories WHERE id = ? AND mall_id IN (?, ?)', [id, GLOBAL_CATEGORY_MALL_ID, MALL_ID]
        );
        if (!category) return res.status(404).json({ success: false });
        const col = productColumnFor(category.type);
        const [r] = await pool.query(
            `UPDATE products SET ${col} = NULL WHERE id = ? AND mall_id = ? AND ${col} = ?`,
            [productId, MALL_ID, id]
        );
        res.json({ success: true, removed: r.affectedRows });
    } catch (err) {
        console.error('[category] postRemoveProduct:', err.message);
        res.status(500).json({ success: false });
    }
};

exports.postDelete = async (req, res) => {
    const { id } = req.body;
    const nodeId = Number(id);
    const MALL_ID = req.adminMallId || 1;

    try {
        // P5: 편집 중인 몰 소유 카테고리만 삭제(크로스몰 삭제·Shopify 오발화 방지)
        const noun = fromBrandScreen(req) ? '브랜드' : '카테고리';
        const [[owned]] = await pool.query('SELECT id FROM categories WHERE id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]);
        if (!owned) return redirectWithError(res, req, `${noun}를 찾을 수 없습니다.`);

        /*
         * categories.parent_id 는 ON DELETE SET NULL 이다.
         * 그대로 부모를 지우면 자식들이 조용히 최상위로 승격되고 depth 가 어긋난 채 남는다.
         * → 하위 카테고리가 있으면 삭제를 막는다.
         */
        const [[{ n: childCount }]] = await pool.query(
            'SELECT COUNT(*) AS n FROM categories WHERE parent_id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]
        );
        if (childCount > 0) {
            return redirectWithError(res, req,
                `하위 카테고리 ${childCount}개가 있어 삭제할 수 없습니다. 먼저 하위 카테고리를 옮기거나 삭제하세요.`);
        }

        /*
         * 카테고리·브랜드는 글로벌 한 벌이고 products FK 는 ON DELETE SET NULL 이다.
         * 관리 화면 상품수는 "현재 몰" 기준이라 0 으로 보여도 **타몰 상품이 참조 중일 수 있다**.
         * 그대로 지우면 전 몰의 참조가 조용히 NULL 로 풀린다 → 전 몰 통틀어 참조가 있으면 삭제를 막는다.
         */
        const [[{ n: refCount }]] = await pool.query(
            'SELECT COUNT(*) AS n FROM products WHERE category_id = ? OR brand_category_id = ?', [nodeId, nodeId]
        );
        if (refCount > 0) {
            return redirectWithError(res, req,
                `이 ${noun}를 참조하는 상품이 (다른 몰 포함) ${refCount}개 있어 삭제할 수 없습니다. `
                + (noun === '브랜드' ? '먼저 [관리] 화면에서 상품을 제거하세요.' : '먼저 상품의 카테고리를 옮기세요.'));
        }

        // Shopify 컬렉션 삭제 — DB 삭제 전에 (shopify_collection_id 를 읽어야 하므로).
        // Shopify 미사용 시 categorySync 가 즉시 스킵한다.
        await deleteCategoryFromShopify(nodeId)
            .catch(e => console.error(`[Shopify] 카테고리 컬렉션 삭제 실패 (id=${nodeId}): ${e.message}`));

        await pool.query('DELETE FROM categories WHERE id = ? AND mall_id IN (0, ?)', [nodeId, MALL_ID]);
        res.redirect(backUrl(req, { saved: 1, error: null }));
    } catch (err) {
        console.error('[category] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
