const pool = require('../../config/db');
const svc = require('../../services/outlet/outletService');
const navigationService = require('../../services/menu/navigationService');
const { assertDepthAllowed, wouldCreateCycle, recalcSubtreeDepth, getCategoryMaxDepth, DepthLimitError } =
    require('../../services/tree/depthGuard');

/*
 * 아울렛 관리 — 상품 / 카테고리 / 설정.
 *
 * 설계: docs/사이트개선/outlet_design_and_development.md
 *
 * 여기서 하지 않는 것:
 *   · 가격 수정. 아울렛은 진열만 한다. 할인율이 모자라면 상품 관리에서 가격을 고쳐야 한다
 *     (그래서 등록 시 최소 할인율 미달이면 막고, 상품 관리로 보내는 안내를 띄운다).
 *   · 할인율로 상품 자동 수집. 아울렛 상품은 사람이 사유를 붙여 담는다(설계서 §3-1).
 *
 * 몰 스코프는 req.adminMallId 다. 모든 쿼리에 mall_id 를 건다.
 */

const BASE = '/admin/outlet';

function toDate(raw) {
    const v = String(raw || '').trim();
    return v || null;
}

function toDateTime(raw) {
    const v = String(raw || '').trim();
    if (!v) return null;
    return v.replace('T', ' ') + (v.length === 16 ? ':00' : '');
}

function toLocalInput(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 폼 → 서비스 입력. 검증은 서비스가 한다(등록·수정이 같은 규칙을 쓰게).
function buildFields(req) {
    return {
        productId: Number(req.body.product_id) || null,
        outletCategoryId: Number(req.body.outlet_category_id) || null,
        outletType: req.body.outlet_type,
        outletReason: String(req.body.outlet_reason || '').trim() || null,
        conditionGrade: svc.GRADE_CODES.includes(req.body.condition_grade) ? req.body.condition_grade : null,
        defectDescription: String(req.body.defect_description || '').trim() || null,
        expiryAt: toDate(req.body.expiry_at),
        startedAt: toDateTime(req.body.started_at),
        endedAt: toDateTime(req.body.ended_at),
        sortOrder: Number(req.body.sort_order) || 0,
        isVisible: req.body.is_visible === '1' || req.body.is_visible === 'on',
    };
}

// ---------------------------------------------------------------------------
// 상품 목록
// ---------------------------------------------------------------------------

exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const page = Number(req.query.page) || 1;
    const type = req.query.type || '';
    const categoryId = Number(req.query.category_id) || null;
    const q = String(req.query.q || '').trim();

    const [result, categories, setting, liveCount] = await Promise.all([
        svc.getAdminList(mallId, { type, categoryId, q, page, limit: 30 }),
        svc.getCategories(mallId, { activeOnly: false }),
        svc.getSetting(mallId),
        svc.countLiveProducts(mallId),
    ]);

    res.render('admin/outlet/list', {
        title: '아울렛 관리',
        subtitle: '이월·리퍼브·전시·임박 등 할인 사유가 있는 상품을 아울렛에 진열합니다.',
        items: result.items,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        categories,
        setting,
        liveCount,
        // GNB 노출 여부를 관리자가 바로 알 수 있어야 한다 — 임계치 미달이면 메뉴가 자동으로 숨는다.
        gateOk: liveCount >= setting.min_product_count,
        outletTypes: svc.OUTLET_TYPES,
        filters: { type, categoryId, q },
        saved: req.query.saved === '1',
        error: req.query.error || null,
    });
};

// ---------------------------------------------------------------------------
// 상품 등록 · 수정
// ---------------------------------------------------------------------------

async function renderForm(req, res, item, extra = {}) {
    const mallId = req.adminMallId || 1;
    const [categories, setting] = await Promise.all([
        svc.getCategories(mallId, { activeOnly: false }),
        svc.getSetting(mallId),
    ]);

    res.render('admin/outlet/edit', {
        title: item?.id ? '아울렛 상품 수정' : '아울렛 상품 등록',
        item,
        categories,
        setting,
        outletTypes: svc.OUTLET_TYPES.filter((t) => setting.allowedTypes.includes(t.code)),
        conditionGrades: svc.CONDITION_GRADES,
        gradeRequiredTypes: svc.GRADE_REQUIRED_TYPES,
        defectRequiredGrades: svc.DEFECT_REQUIRED_GRADES,
        toLocalInput,
        toDateInput,
        error: null,
        ...extra,
    });
}

exports.getAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    let product = null;

    // 목록에서 "아울렛에 담기"로 넘어온 경우 상품이 지정돼 있다.
    if (req.query.product_id) {
        product = await svc.findProduct(mallId, Number(req.query.product_id));
    }

    await renderForm(req, res, {
        id: null,
        product_id: product?.id || null,
        name: product?.name || null,
        price: product?.price,
        original_price: product?.original_price,
        discount_rate: product?.discount_rate,
        outlet_type: '',
        is_visible: 1,
        sort_order: 0,
    });
};

exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const data = buildFields(req);

    try {
        await svc.addProduct(mallId, data);
        // 상품 수가 바뀌면 GNB 노출 판정도 바뀔 수 있다. 캐시를 비워 즉시 반영한다.
        navigationService.invalidateContentGate(mallId);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        if (!(err instanceof svc.OutletValidationError)) throw err;
        const product = data.productId ? await svc.findProduct(mallId, data.productId) : null;
        await renderForm(req, res, {
            id: null,
            product_id: data.productId,
            name: product?.name,
            price: product?.price,
            original_price: product?.original_price,
            discount_rate: product?.discount_rate,
            outlet_type: data.outletType,
            outlet_category_id: data.outletCategoryId,
            outlet_reason: data.outletReason,
            condition_grade: data.conditionGrade,
            defect_description: data.defectDescription,
            expiry_at: data.expiryAt,
            started_at: data.startedAt,
            ended_at: data.endedAt,
            sort_order: data.sortOrder,
            is_visible: data.isVisible ? 1 : 0,
        }, { error: err.message });
    }
};

exports.getEdit = async (req, res, next) => {
    const mallId = req.adminMallId || 1;
    const item = await svc.getAdminItem(mallId, req.params.id);
    if (!item) return next();
    await renderForm(req, res, item);
};

exports.postEdit = async (req, res, next) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const data = buildFields(req);

    try {
        await svc.updateProduct(mallId, id, data);
        navigationService.invalidateContentGate(mallId);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        if (!(err instanceof svc.OutletValidationError)) throw err;
        const item = await svc.getAdminItem(mallId, id);
        if (!item) return next();
        await renderForm(req, res, { ...item, ...{
            outlet_type: data.outletType,
            outlet_category_id: data.outletCategoryId,
            outlet_reason: data.outletReason,
            condition_grade: data.conditionGrade,
            defect_description: data.defectDescription,
            expiry_at: data.expiryAt,
            sort_order: data.sortOrder,
            is_visible: data.isVisible ? 1 : 0,
        } }, { error: err.message });
    }
};

exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    await svc.removeProduct(mallId, req.params.id);
    navigationService.invalidateContentGate(mallId);
    res.redirect(`${BASE}?saved=1`);
};

/*
 * 상품 검색 (AJAX).
 * 아울렛에 담을 수 있는 상품만 보여준다 — 최소 할인율 미달 상품은 애초에 뜨지 않게 해서
 * "담았더니 거부당함" 을 줄인다. 다만 검색 결과에 할인율을 같이 내려 판단 근거를 준다.
 */
exports.getProductSearch = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ products: [] });

    const setting = await svc.getSetting(mallId);
    const [rows] = await pool.query(
        `SELECT p.id, p.name, p.product_code, p.main_image, p.original_price, p.price,
                p.discount_rate, p.stock, p.status,
                (op.id IS NOT NULL) AS already_in_outlet
         FROM products p
         LEFT JOIN outlet_product op ON op.product_id = p.id AND op.mall_id = ?
         WHERE p.mall_id = ? AND (p.name LIKE ? OR p.product_code LIKE ?)
         ORDER BY p.discount_rate DESC, p.id DESC
         LIMIT 30`,
        [mallId, mallId, `%${q}%`, `%${q}%`],
    );

    res.json({
        products: rows.map((r) => ({
            ...r,
            eligible: (r.discount_rate || 0) >= setting.min_discount_rate && !r.already_in_outlet,
        })),
        minDiscountRate: setting.min_discount_rate,
    });
};

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

exports.postSetting = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const allowedTypes = Array.isArray(req.body.allowed_types)
        ? req.body.allowed_types
        : (req.body.allowed_types ? [req.body.allowed_types] : []);

    await svc.saveSetting(mallId, {
        allowedTypes,
        minDiscountRate: req.body.min_discount_rate,
        minProductCount: req.body.min_product_count,
        showInNormalList: req.body.show_in_normal_list === '1' || req.body.show_in_normal_list === 'on',
        noticeHtml: String(req.body.notice_html || '').trim() || null,
    });

    // min_product_count 가 바뀌면 노출 판정이 즉시 달라진다.
    navigationService.invalidateContentGate(mallId);
    res.redirect(`${BASE}?saved=1`);
};

// ---------------------------------------------------------------------------
// 아울렛 카테고리 — categories.type = 'OUTLET'
// 별도 테이블을 만들지 않았으므로, 모든 쿼리에 type='OUTLET' 스코프를 반드시 건다.
// 안 걸면 일반 카테고리를 아울렛 화면에서 지우는 사고가 난다.
// ---------------------------------------------------------------------------

exports.getCategories = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const categories = await svc.getCategories(mallId, { activeOnly: false });
    const maxDepth = await getCategoryMaxDepth(mallId);

    res.render('admin/outlet/categories', {
        title: '아울렛 카테고리',
        subtitle: '아울렛 안에서만 쓰는 분류입니다. 일반 상품 카테고리와 섞이지 않습니다.',
        categories,
        maxDepth,
        saved: req.query.saved === '1',
        error: req.query.error || null,
    });
};

exports.postCategoryAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const name = String(req.body.name || '').trim();
    const parentId = Number(req.body.parent_id) || null;

    if (!name) return res.redirect('/admin/outlet/categories?error=' + encodeURIComponent('카테고리명을 입력하세요.'));

    try {
        const maxDepth = await getCategoryMaxDepth(mallId);
        await assertDepthAllowed({ table: 'categories', parentId, maxDepth });

        let depth = 1;
        if (parentId) {
            const [p] = await pool.query(
                `SELECT depth FROM categories WHERE id = ? AND mall_id = ? AND type = 'OUTLET'`,
                [parentId, mallId],
            );
            if (!p.length) throw new Error('상위 카테고리를 찾을 수 없습니다.');
            depth = p[0].depth + 1;
        }

        await pool.query(
            `INSERT INTO categories (mall_id, name, parent_id, depth, type, display_order, is_active, description)
             VALUES (?, ?, ?, ?, 'OUTLET', ?, ?, ?)`,
            [
                mallId, name, parentId, depth,
                Number(req.body.display_order) || 0,
                req.body.is_active === '0' ? 0 : 1,
                String(req.body.description || '').trim() || null,
            ],
        );
        res.redirect('/admin/outlet/categories?saved=1');
    } catch (err) {
        const msg = err instanceof DepthLimitError ? err.message : (err.message || '카테고리 등록에 실패했습니다.');
        res.redirect('/admin/outlet/categories?error=' + encodeURIComponent(msg));
    }
};

exports.postCategoryEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const parentId = Number(req.body.parent_id) || null;

    try {
        const [own] = await pool.query(
            `SELECT id, parent_id FROM categories WHERE id = ? AND mall_id = ? AND type = 'OUTLET'`,
            [id, mallId],
        );
        if (!own.length) throw new Error('카테고리를 찾을 수 없습니다.');

        // 부모가 바뀌면 순환·뎁스를 UPDATE 전에 검사한다.
        // 순서를 지키지 않으면 recalcSubtreeDepth 가 DB 를 오염시킨 뒤 예외를 던진다.
        if (parentId !== own[0].parent_id) {
            if (parentId === id) throw new Error('자기 자신을 상위로 지정할 수 없습니다.');
            const maxDepth = await getCategoryMaxDepth(mallId);
            if (parentId && await wouldCreateCycle({ table: 'categories', nodeId: id, candidateParentId: parentId })) {
                throw new Error('순환 참조가 발생합니다. 하위 카테고리를 상위로 지정할 수 없습니다.');
            }
            await assertDepthAllowed({ table: 'categories', parentId, maxDepth });

            await pool.query('UPDATE categories SET parent_id = ? WHERE id = ?', [parentId, id]);
            await recalcSubtreeDepth({ table: 'categories', nodeId: id, maxDepth });
        }

        await pool.query(
            `UPDATE categories SET name = ?, display_order = ?, is_active = ?, description = ?
             WHERE id = ? AND mall_id = ? AND type = 'OUTLET'`,
            [
                name,
                Number(req.body.display_order) || 0,
                req.body.is_active === '0' ? 0 : 1,
                String(req.body.description || '').trim() || null,
                id, mallId,
            ],
        );
        res.redirect('/admin/outlet/categories?saved=1');
    } catch (err) {
        const msg = err instanceof DepthLimitError ? err.message : (err.message || '수정에 실패했습니다.');
        res.redirect('/admin/outlet/categories?error=' + encodeURIComponent(msg));
    }
};

/*
 * 삭제.
 * categories.parent_id 는 ON DELETE SET NULL 이라, 자식이 있는 부모를 지우면
 * 자식이 조용히 최상위로 승격되고 depth 가 어긋난다. 자식이 있으면 막는다.
 * 상품이 연결돼 있으면 outlet_product.outlet_category_id 가 SET NULL 되므로 상품은 살아남는다(미분류로).
 */
exports.postCategoryDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = Number(req.params.id);

    try {
        const [children] = await pool.query(
            `SELECT COUNT(*) AS cnt FROM categories WHERE parent_id = ? AND mall_id = ? AND type = 'OUTLET'`,
            [id, mallId],
        );
        if (children[0].cnt > 0) {
            throw new Error('하위 카테고리가 있어 삭제할 수 없습니다. 하위를 먼저 정리하세요.');
        }

        await pool.query(
            `DELETE FROM categories WHERE id = ? AND mall_id = ? AND type = 'OUTLET'`,
            [id, mallId],
        );
        res.redirect('/admin/outlet/categories?saved=1');
    } catch (err) {
        res.redirect('/admin/outlet/categories?error=' + encodeURIComponent(err.message));
    }
};
