const pool = require('../../config/db');
const sectionRegistry = require('../../services/display/sectionRegistry');
const productGroupService = require('../../services/display/productGroupService');
const menuShowcaseService = require('../../services/menu/menuShowcaseService');
const newArrival = require('../../services/catalog/newArrival');

/*
 * 상품 그룹 관리 (B6)
 *
 * `product_group` 은 페이지 빌더 섹션(product_grid · product_carousel · benefit_bento)의
 * 데이터 소스다. 이 화면은 그 그룹을 직접 만들고 편집한다.
 *
 * 설계: docs/사이트개선/admin_dev_plan.md §3.4
 *
 * ── UI 범위는 `productGroupService.resolve()` 가 실제로 읽는 것에 정확히 맞춘다 ──
 *   manual    : product_group_item (product_id, sort_order) 만 유효.
 *               sort_type/filter_condition_json 은 resolve 가 보지 않는다 → UI 에서 감춘다.
 *   condition : filter 4키(badge/category_id/min_discount/in_stock) + sort_type 6종만 유효.
 *               product_group_item 은 resolve 가 보지 않는다 → UI 에서 감춘다.
 *   `product_group_item.is_fixed` 는 resolve 가 읽지 않는 죽은 컬럼이다 → 노출하지 않는다.
 *
 * ── 참조 무결성 ──
 *   `page_section.data_source_id` 에는 FK 가 없다. 게다가 `getById` 가
 *   `WHERE is_active = 1` 이므로 **삭제뿐 아니라 비활성화만으로도** 그 그룹을 쓰는 섹션이
 *   조용히 빈 목록이 된다. 그래서 삭제와 비활성화 양쪽에 가드를 건다.
 */


/** resolve() 의 ORDER_MAP 과 1:1 로 맞춘다. 여기에 없는 값은 저장되지 않는다. */
const SORT_TYPES = [
    { value: 'newest', label: '최신순' },
    { value: 'discount', label: '할인율 높은순' },
    { value: 'price_asc', label: '가격 낮은순' },
    { value: 'price_desc', label: '가격 높은순' },
    { value: 'views', label: '조회수순' },
    { value: 'manual', label: '등록순 (최신순과 동일)' },
];

/** products.product_badge 는 SET 타입이다. resolve 는 FIND_IN_SET 으로 매칭한다. */
const BADGES = ['BEST', 'NEW', 'RECOMMEND', 'DEADLINE_SALE', 'GREENHUB_SPECIAL'];

const GROUP_TYPES = ['manual', 'condition'];

/** 이 그룹을 데이터 소스로 쓸 수 있는 섹션 타입 */
const GROUP_SECTION_TYPES = Object.keys(sectionRegistry)
    .filter(k => sectionRegistry[k].dataSource === 'product_group');

/*
 * 메뉴 쇼케이스 상품 풀 — 그룹에 menu_code 가 걸려 있으면 상품 피커 후보를 그 풀로 좁힌다.
 * "특가 중 선택 / 베스트 중 선택 / 신상품 중 선택" 이 요구사항이라, 전체 상품 피커로는 안 된다.
 *
 * 특가 풀은 **아직 끝나지 않은 특가**에 등록된 상품으로 잡는다 — 지금 이 순간 노출 조건
 * (시간창·요일·선착순 수량)까지 걸면 저녁 타임특가 상품을 낮에 고를 수 없다.
 */
/** 베스트 풀로 인정할 순위 상한 */
const BEST_POOL_RANK = 50;

const POOL_PREDICATES = {
    deal: mallId => ({
        sql: `p.id IN (
                SELECT di.product_id FROM deal_item di
                JOIN deal d ON d.id = di.deal_id
                JOIN deal_category dc ON dc.id = d.deal_category_id
                WHERE d.is_active = 1 AND dc.is_active = 1 AND NOW() <= d.ends_at AND d.mall_id = ?
              )`,
        params: [mallId],
    }),
    /*
     * 베스트 풀 = '전체' 탭 일간 랭킹 상위 BEST_POOL_RANK 위.
     * best_ranking 은 카테고리·브랜드 탭까지 합쳐 사실상 전 상품에 순위를 매기므로,
     * 조건 없이 IN 하면 후보가 전체 상품과 다를 게 없어져 "베스트 중 선택"이 무의미해진다.
     */
    best: mallId => ({
        sql: `p.id IN (
                SELECT b.product_id FROM best_ranking b
                JOIN best_group g ON g.id = b.group_id AND g.group_type = 'ALL'
                WHERE b.mall_id = ? AND b.period = 'DAILY' AND b.gender = 'ALL'
                  AND b.age_band = 'ALL' AND b.rank_no <= ?
              )`,
        params: [mallId, BEST_POOL_RANK],
    }),
    // 신상품 판정은 services/catalog/newArrival 이 단독 정의한다(판매 시작일 N일 이내 OR NEW 뱃지).
    new: () => newArrival.newProductPredicate('p'),
};

const POOL_LABELS = {
    deal: '특가 상품',
    best: '베스트 상품',
    new: '신상품',
};

/** 그룹의 menu_code → 상품 풀 키 (없으면 null = 전체 상품) */
function poolForGroup(group) {
    return group && group.menu_code
        ? (menuShowcaseService.PRODUCT_POOLS[group.menu_code] || null)
        : null;
}

/** 그룹을 참조 중인 섹션들 (삭제·비활성 가드용) */
async function findReferencingSections(conn, groupId) {
    if (GROUP_SECTION_TYPES.length === 0) return [];
    const ph = GROUP_SECTION_TYPES.map(() => '?').join(',');
    const [rows] = await (conn || pool).query(`
        SELECT ps.id, ps.section_type, ps.is_active, ps.page_id
        FROM page_section ps
        WHERE ps.data_source_id = ? AND ps.section_type IN (${ph})
        ORDER BY ps.id
    `, [groupId, ...GROUP_SECTION_TYPES]);
    return rows.map(r => Object.assign({}, r, {
        label: (sectionRegistry[r.section_type] || {}).label || r.section_type,
    }));
}

function parseCond(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return {}; }
}

/**
 * 폼 값 → filter_condition_json.
 *
 * 기존 JSON 을 읽어 **UI 가 관리하는 키만** 갱신한다. `seed_key` 처럼 UI 밖에서 쓰는 키를
 * 통째로 덮어쓰면 `scripts/seed_ct_sections.js` 가 그룹을 못 찾아 중복 생성한다.
 */
function buildFilterJson(existingJson, body) {
    const next = Object.assign({}, parseCond(existingJson));
    const UI_KEYS = ['badge', 'category_id', 'min_discount', 'in_stock'];
    UI_KEYS.forEach(k => delete next[k]);

    const badge = String(body.badge || '').trim();
    if (BADGES.includes(badge)) next.badge = badge;

    const categoryId = Number.parseInt(body.category_id, 10);
    if (Number.isFinite(categoryId) && categoryId > 0) next.category_id = categoryId;

    const minDiscount = Number.parseInt(body.min_discount, 10);
    if (Number.isFinite(minDiscount) && minDiscount > 0) next.min_discount = Math.min(minDiscount, 100);

    if (body.in_stock) next.in_stock = true;

    return Object.keys(next).length ? JSON.stringify(next) : null;
}

function normalizeGroupType(v) {
    return GROUP_TYPES.includes(String(v)) ? String(v) : 'manual';
}

function normalizeSortType(v) {
    return SORT_TYPES.some(s => s.value === v) ? String(v) : 'newest';
}

/**
 * 메뉴 쇼케이스 지정 값 정규화.
 * 목록에 없는 코드는 무시한다(노출될 곳 없는 그룹이 생긴다).
 * @returns {Promise<{menuCode: string|null, showcaseTitle: string|null}>}
 */
async function normalizeMenuShowcase(body, mallId) {
    const code = String(body.menu_code || '').trim();
    if (!code) return { menuCode: null, showcaseTitle: null };

    const targets = await menuShowcaseService.getMenuTargets(mallId);
    const target = targets.find(t => t.key === code);
    if (!target) return { menuCode: null, showcaseTitle: null };

    const title = String(body.showcase_title || '').trim();
    return { menuCode: code, showcaseTitle: title ? title.slice(0, 100) : null };
}

/** UNIQUE(mall_id, menu_code) 충돌 — 한 메뉴에는 쇼케이스 그룹 하나만 걸 수 있다. */
function menuConflictMessage(err) {
    return err && err.code === 'ER_DUP_ENTRY'
        ? '이 메뉴에는 이미 다른 상품 그룹이 걸려 있습니다. 기존 그룹의 메뉴 지정을 먼저 해제하세요.'
        : null;
}

/** GET /admin/product-groups */
exports.getList = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const [groups] = await pool.query(`
            SELECT g.*,
                   (SELECT COUNT(*) FROM product_group_item i WHERE i.product_group_id = g.id) AS item_count
            FROM product_group g
            WHERE g.mall_id = ?
            ORDER BY g.id ASC
        `, [MALL_ID]);

        for (const g of groups) {
            g.refs = await findReferencingSections(null, g.id);
            g.cond = parseCond(g.filter_condition_json);
        }

        res.render('admin/product-groups/list', {
            layout: 'layouts/admin_layout',
            title: '상품 그룹 관리',
            groups,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[productGroup] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 편집 화면(신규/수정 공용) */
async function renderForm(res, group, mallId, extra = {}) {
    const [categories] = await pool.query(
        "SELECT id, name FROM categories WHERE type = 'NORMAL' AND mall_id IN (0, ?) ORDER BY display_order, id", [mallId]
    );
    // 수동 선택 팝업의 브랜드 필터용 — 상품의 brand_category_id 는 type='BRAND' 카테고리를 가리킨다.
    const [brands] = await pool.query(
        "SELECT id, name FROM categories WHERE type = 'BRAND' AND mall_id IN (0, ?) ORDER BY display_order, id", [mallId]
    );

    let items = [];
    let preview = [];
    if (group.id) {
        if (group.group_type === 'manual') {
            const [rows] = await pool.query(`
                SELECT i.id AS item_id, i.sort_order, p.id, p.name, p.main_image, p.price, p.status, p.product_badge
                FROM product_group_item i
                JOIN products p ON p.id = i.product_id
                WHERE i.product_group_id = ?
                ORDER BY i.sort_order ASC, i.id ASC
            `, [group.id]);
            items = rows;
        }
        // 미리보기는 스토어프론트와 같은 경로로 뽑는다 — condition 그룹이 실제 무엇을 고르는지 보여준다.
        // resolve 는 is_active=1 인 그룹만 getById 로 찾으므로, 여기서는 그룹 객체를 직접 넘긴다.
        preview = await productGroupService.resolve(group, { hasUser: false, limit: 12 });
    }

    const poolKey = poolForGroup(group);

    res.render('admin/product-groups/edit', Object.assign({
        layout: 'layouts/admin_layout',
        title: group.id ? '상품 그룹 수정' : '상품 그룹 등록',
        group,
        cond: parseCond(group.filter_condition_json),
        items,
        preview,
        categories,
        brands,
        sortTypes: SORT_TYPES,
        badges: BADGES,
        // 메뉴 쇼케이스 — 이 그룹을 어느 GNB 메뉴 상단 캐러셀로 쓸지
        menuTargets: await menuShowcaseService.getMenuTargets(mallId),
        poolLabel: poolKey ? POOL_LABELS[poolKey] : null,
        refs: group.id ? await findReferencingSections(null, group.id) : [],
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/product-groups/new */
exports.getNew = async (req, res) => {
    try {
        await renderForm(res, {
            id: null, name: '', menu_code: '', showcase_title: '',
            group_type: 'manual', sort_type: 'newest',
            filter_condition_json: null, is_active: 1,
        }, req.adminMallId || 1, { error: req.query.error || null });
    } catch (err) {
        console.error('[productGroup] getNew:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/product-groups/:id */
exports.getEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const [[group]] = await pool.query('SELECT * FROM product_group WHERE id = ? AND mall_id = ?', [req.params.id, MALL_ID]);
        if (!group) return res.redirect('/admin/product-groups?error=' + encodeURIComponent('그룹을 찾을 수 없습니다.'));

        await renderForm(res, group, MALL_ID, {
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[productGroup] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/product-groups — 생성 */
exports.postCreate = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const name = String(req.body.name || '').trim();
        if (!name) return res.redirect('/admin/product-groups/new');

        const groupType = normalizeGroupType(req.body.group_type);
        const { menuCode, showcaseTitle } = await normalizeMenuShowcase(req.body, MALL_ID);

        const [r] = await pool.query(`
            INSERT INTO product_group (mall_id, name, menu_code, showcase_title, group_type, sort_type, filter_condition_json, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            MALL_ID, name.slice(0, 200), menuCode, showcaseTitle, groupType,
            groupType === 'condition' ? normalizeSortType(req.body.sort_type) : 'manual',
            groupType === 'condition' ? buildFilterJson(null, req.body) : null,
            req.body.is_active ? 1 : 0,
        ]);

        res.redirect(`/admin/product-groups/${r.insertId}?saved=1`);
    } catch (err) {
        console.error('[productGroup] postCreate:', err.message);
        const conflict = menuConflictMessage(err);
        if (conflict) return res.redirect('/admin/product-groups/new?error=' + encodeURIComponent(conflict));
        res.status(500).send('Server Error');
    }
};

/** POST /admin/product-groups/:id — 수정 */
exports.postUpdate = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const [[group]] = await pool.query('SELECT * FROM product_group WHERE id = ? AND mall_id = ?', [id, MALL_ID]);
        if (!group) return res.redirect('/admin/product-groups?error=' + encodeURIComponent('그룹을 찾을 수 없습니다.'));

        const name = String(req.body.name || '').trim();
        if (!name) return res.redirect(`/admin/product-groups/${id}?error=` + encodeURIComponent('그룹명을 입력하세요.'));

        const nextActive = req.body.is_active ? 1 : 0;

        // 비활성화도 삭제와 같은 결과를 낳는다 — resolve 가 is_active=1 그룹만 찾기 때문에
        // 참조하던 섹션이 조용히 빈 목록이 된다.
        if (group.is_active && !nextActive) {
            const refs = (await findReferencingSections(null, id)).filter(r => r.is_active);
            if (refs.length) {
                const msg = `활성 섹션 ${refs.length}개가 이 그룹을 사용 중입니다. 비활성화하면 해당 섹션이 빈 상태로 노출됩니다. 먼저 섹션의 데이터 소스를 바꾸세요. (섹션 #${refs.map(r => r.id).join(', #')})`;
                return res.redirect(`/admin/product-groups/${id}?error=` + encodeURIComponent(msg));
            }
        }

        const groupType = normalizeGroupType(req.body.group_type);
        const { menuCode, showcaseTitle } = await normalizeMenuShowcase(req.body, MALL_ID);

        if (groupType === 'condition') {
            // seed_key 등 UI 밖 키를 보존하며 필터를 갱신한다.
            await pool.query(`
                UPDATE product_group
                   SET name = ?, menu_code = ?, showcase_title = ?, group_type = 'condition',
                       sort_type = ?, filter_condition_json = ?, is_active = ?
                 WHERE id = ? AND mall_id = ?
            `, [
                name.slice(0, 200), menuCode, showcaseTitle, normalizeSortType(req.body.sort_type),
                buildFilterJson(group.filter_condition_json, req.body),
                nextActive, id, MALL_ID,
            ]);
        } else {
            // manual 은 filter_condition_json 을 쓰지 않는다. **컬럼을 건드리지 않고 그대로 둔다** —
            // 나중에 condition 으로 되돌릴 때 조건과 seed_key 가 살아 있어야 하고,
            // mysql2 가 JSON 컬럼을 객체로 돌려주므로 그 값을 그대로 다시 바인딩하면
            // '[object Object]' 가 되어 Invalid JSON 오류가 난다.
            await pool.query(`
                UPDATE product_group
                   SET name = ?, menu_code = ?, showcase_title = ?, group_type = 'manual',
                       sort_type = 'manual', is_active = ?
                 WHERE id = ? AND mall_id = ?
            `, [name.slice(0, 200), menuCode, showcaseTitle, nextActive, id, MALL_ID]);
        }

        res.redirect(`/admin/product-groups/${id}?saved=1`);
    } catch (err) {
        console.error('[productGroup] postUpdate:', err.message);
        const conflict = menuConflictMessage(err);
        if (conflict) return res.redirect(`/admin/product-groups/${id}?error=` + encodeURIComponent(conflict));
        res.status(500).send('Server Error');
    }
};

/** POST /admin/product-groups/:id/delete */
exports.postDelete = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id;
    try {
        // data_source_id 에 FK 가 없어 DB 가 막아주지 않는다. 지우면 섹션이 고아 참조를 든 채 빈다.
        const refs = await findReferencingSections(null, id);
        if (refs.length) {
            const msg = `섹션 ${refs.length}개가 이 그룹을 사용 중이라 삭제할 수 없습니다. 먼저 해당 섹션을 지우거나 데이터 소스를 바꾸세요. (섹션 #${refs.map(r => r.id).join(', #')})`;
            return res.redirect(`/admin/product-groups?error=` + encodeURIComponent(msg));
        }

        // product_group_item 은 ON DELETE CASCADE 로 함께 지워진다.
        await pool.query('DELETE FROM product_group WHERE id = ? AND mall_id = ?', [id, MALL_ID]);
        res.redirect('/admin/product-groups?saved=1');
    } catch (err) {
        console.error('[productGroup] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ── manual 그룹의 상품 아이템 ────────────────────────────── */

/** POST /admin/product-groups/:id/items — 상품 추가 */
exports.postAddItem = async (req, res) => {
    const id = req.params.id;
    const MALL_ID = req.adminMallId || 1;
    try {
        const productId = Number.parseInt(req.body.product_id, 10);
        if (!Number.isFinite(productId)) return res.redirect(`/admin/product-groups/${id}`);

        // P5: 다른 몰 상품을 이 몰의 그룹에 담지 못하게 한다(요청 위조 차단).
        const [[prod]] = await pool.query('SELECT id FROM products WHERE id = ? AND mall_id = ?', [productId, MALL_ID]);
        if (!prod) return res.redirect(`/admin/product-groups/${id}?error=` + encodeURIComponent('이 몰의 상품이 아닙니다.'));

        const [[dup]] = await pool.query(
            'SELECT id FROM product_group_item WHERE product_group_id = ? AND product_id = ?', [id, productId]
        );
        if (dup) return res.redirect(`/admin/product-groups/${id}?error=` + encodeURIComponent('이미 담긴 상품입니다.'));

        const [[maxRow]] = await pool.query(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM product_group_item WHERE product_group_id = ?', [id]
        );
        await pool.query(
            'INSERT INTO product_group_item (product_group_id, product_id, sort_order) VALUES (?, ?, ?)',
            [id, productId, maxRow.next_order]
        );
        res.redirect(`/admin/product-groups/${id}?saved=1`);
    } catch (err) {
        console.error('[productGroup] postAddItem:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/product-groups/:id/items/:itemId/delete */
exports.postRemoveItem = async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query('DELETE FROM product_group_item WHERE id = ? AND product_group_id = ?', [req.params.itemId, id]);
        res.redirect(`/admin/product-groups/${id}?saved=1`);
    } catch (err) {
        console.error('[productGroup] postRemoveItem:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/product-groups/:id/items/reorder — AJAX */
exports.postReorderItems = async (req, res) => {
    const id = req.params.id;
    const order = Array.isArray(req.body.order) ? req.body.order : null;
    if (!order) return res.status(400).json({ success: false });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (let i = 0; i < order.length; i++) {
            await conn.query(
                'UPDATE product_group_item SET sort_order = ? WHERE id = ? AND product_group_id = ?',
                [i + 1, order[i], id]
            );
        }
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        console.error('[productGroup] postReorderItems:', err.message);
        res.status(500).json({ success: false });
    } finally {
        conn.release();
    }
};

/**
 * GET /admin/product-groups/:id/product-search — AJAX (필터형 상품 조회 팝업)
 *
 * 검색어는 선택이다. 카테고리/브랜드/재고/노출 필터만으로도 조회할 수 있어야 하므로
 * "검색어 없으면 빈 결과" 가드를 두지 않는다. 필터는 모두 AND 로 결합한다.
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

        // P5: 이 몰의 상품만 후보로 제시한다.
        const where = ['p.mall_id = ?'];
        const params = [MALL_ID];

        if (q) { where.push('(p.name LIKE ? OR p.product_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (Number.isFinite(categoryId) && categoryId > 0) { where.push('p.category_id = ?'); params.push(categoryId); }
        if (Number.isFinite(brandId) && brandId > 0) { where.push('p.brand_category_id = ?'); params.push(brandId); }
        if (inStock === 'y') where.push('p.stock > 0');
        else if (inStock === 'n') where.push('p.stock <= 0');
        if (VISIBILITIES.includes(visibility)) { where.push('p.visibility = ?'); params.push(visibility); }

        // 메뉴 쇼케이스 그룹이면 후보를 그 메뉴의 상품 풀로 좁힌다(특가/베스트/신상품 중 선택).
        const [[group]] = await pool.query(
            'SELECT menu_code FROM product_group WHERE id = ? AND mall_id = ?', [req.params.id, MALL_ID]
        );
        const poolKey = poolForGroup(group);
        if (poolKey && POOL_PREDICATES[poolKey]) {
            const pred = POOL_PREDICATES[poolKey](MALL_ID);
            where.push(pred.sql);
            params.push(...pred.params);
        }

        // 이미 이 그룹에 담긴 상품은 후보에서 제외
        where.push('p.id NOT IN (SELECT product_id FROM product_group_item WHERE product_group_id = ?)');
        params.push(req.params.id);

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.product_code, p.main_image, p.price, p.stock, p.status, p.visibility, p.product_badge
            FROM products p
            WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC
            LIMIT 100
        `, params);

        res.json({
            products,
            limited: products.length >= 100,
            pool: poolKey ? POOL_LABELS[poolKey] : null,
        });
    } catch (err) {
        console.error('[productGroup] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};

/**
 * POST /admin/product-groups/:id/items/bulk — 여러 상품 한번에 담기 (AJAX)
 * body: { product_ids: number[] }. 이미 담긴 것·타 몰 상품은 조용히 건너뛴다.
 */
exports.postAddItems = async (req, res) => {
    const id = req.params.id;
    const MALL_ID = req.adminMallId || 1;

    const raw = Array.isArray(req.body.product_ids) ? req.body.product_ids : [];
    const ids = [...new Set(raw.map(n => Number.parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ success: false, added: 0 });

    const conn = await pool.getConnection();
    try {
        // 이 몰 소유 상품만 (요청 위조 차단)
        const ph = ids.map(() => '?').join(',');
        const [owned] = await conn.query(`SELECT id FROM products WHERE mall_id = ? AND id IN (${ph})`, [MALL_ID, ...ids]);
        const ownedIds = new Set(owned.map(r => r.id));

        // 이미 담긴 상품 제외
        const [existing] = await conn.query('SELECT product_id FROM product_group_item WHERE product_group_id = ?', [id]);
        const have = new Set(existing.map(r => r.product_id));

        const toAdd = ids.filter(pid => ownedIds.has(pid) && !have.has(pid));

        if (toAdd.length) {
            await conn.beginTransaction();
            const [[maxRow]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS m FROM product_group_item WHERE product_group_id = ?', [id]
            );
            let order = maxRow.m;
            for (const pid of toAdd) {
                order += 1;
                await conn.query(
                    'INSERT INTO product_group_item (product_group_id, product_id, sort_order) VALUES (?, ?, ?)',
                    [id, pid, order]
                );
            }
            await conn.commit();
        }
        res.json({ success: true, added: toAdd.length, skipped: ids.length - toAdd.length });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 미시작 */ }
        console.error('[productGroup] postAddItems:', err.message);
        res.status(500).json({ success: false });
    } finally {
        conn.release();
    }
};
