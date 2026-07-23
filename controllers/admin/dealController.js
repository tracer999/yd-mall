const pool = require('../../config/db');
const { usedCategoryOptions } = require('../../services/catalog/categoryScope');
const { inStockSql, sellableStockSql } = require('../../services/catalog/sellableStock');

/*
 * 쇼핑특가 관리 (쇼핑특가 §7)
 * 설계: docs/사이트개선/shopping_deal_design.md §3.2 · §3.3
 *
 * ── 여기서 저장하는 값은 곧바로 결제 금액이 된다 ──
 *   특가는 read-time 리졸버(`services/deal/dealService.js`)가 읽는 순간 활성이 되고,
 *   `checkoutController` 가 그 값으로 단가를 확정한다. 스케줄러도, 승인 단계도 없다.
 *   따라서 `deal_price` 는 **컨트롤러가 마지막 방어선**이다:
 *     · deal_price > 0            (0 이면 공짜 상품)
 *     · deal_price < products.price  (정가보다 비싼 "특가" 거부)
 *   이 두 조건은 저장 시점에 상품 정가를 다시 읽어 검증한다. 폼 값만 믿지 않는다.
 *
 * ── 상품 담기의 초기 deal_price 는 정가다 ──
 *   `deal_item` 에는 행별 활성 플래그가 없다. 진행 중인 특가에 상품을 담으면 **즉시 판매가**가
 *   된다. 그래서 초기값을 정가(할인 0%)로 둔다 — 실패 방향이 "할인이 안 걸린다"(노출 누락)여야지
 *   "의도 없이 싸게 판다"(금전 사고)여서는 안 된다. 대신 그 상태로는 인라인 저장이 통과하지
 *   않으므로(deal_price < price), 운영자가 반드시 특가를 명시해야 한다.
 *
 * ── 목록의 상태 뱃지는 기간 기준이다 ──
 *   시간창·요일은 별도 컬럼으로 보여준다. 뱃지가 "지금 이 순간 팔리는가"까지 답하려 하면
 *   타임특가가 하루 23시간 "종료"로 보인다. 뱃지는 캠페인의 생애주기만 말한다.
 */

const BASE = '/admin/deals';

const redirectWith = (res, path, key, msg) =>
    res.redirect(`${path}?${key}=` + encodeURIComponent(msg));

const WEEKDAYS = [
    { value: 1, label: '월' }, { value: 2, label: '화' }, { value: 3, label: '수' },
    { value: 4, label: '목' }, { value: 5, label: '금' }, { value: 6, label: '토' },
    { value: 7, label: '일' },
];

const VISIBILITIES = ['PUBLIC', 'HIDDEN', 'MEMBER_ONLY'];

const nullIfBlank = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
};

/** `datetime-local` → MySQL DATETIME. 빈 값은 null. */
function toDateTime(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const v = s.replace('T', ' ');
    return v.length === 16 ? `${v}:00` : v;
}

/** MySQL DATETIME → `datetime-local` 입력값. */
function toLocalInput(v) {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** TIME 컬럼('20:00:00') → `<input type=time>` 값('20:00'). */
function toTimeInput(v) {
    if (!v) return '';
    return String(v).slice(0, 5);
}

/** '20:00' → '20:00:00'. 빈 값은 null. */
function toSqlTime(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    return s.length === 5 ? `${s}:00` : s;
}

/** 'HH:MM(:SS)' → 비교 가능한 분 단위 정수. */
function timeToMinutes(t) {
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/**
 * 체크박스 배열 → '1,3,5' CSV.
 * 전부 선택 == 미선택 == '매일' 이므로 둘 다 NULL 로 저장한다(리졸버의 NULL 분기와 일치).
 */
function normalizeWeekdays(raw) {
    const list = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]);
    const set = [...new Set(
        list.map((v) => Number.parseInt(v, 10)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    )].sort((a, b) => a - b);
    if (set.length === 0 || set.length === 7) return null;
    return set.join(',');
}

const toIntOrNull = (v) => {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
};

/**
 * 특가 폼 → 저장값 + 검증.
 * @param {object} body
 * @param {object} category 선택된 deal_category 행 (schedule_type 확인용)
 * @returns {{error:string}|{value:object}}
 */
function normalizeForm(body, category) {
    const title = String(body.title ?? '').trim();
    if (!title) return { error: '특가 제목을 입력하세요.' };

    const startsAt = toDateTime(body.starts_at);
    const endsAt = toDateTime(body.ends_at);
    if (!startsAt || !endsAt) return { error: '시작일시와 종료일시를 모두 입력하세요.' };
    if (new Date(endsAt.replace(' ', 'T')) <= new Date(startsAt.replace(' ', 'T'))) {
        return { error: '종료일시는 시작일시보다 뒤여야 합니다.' };
    }

    const dailyStart = toSqlTime(body.daily_start_time);
    const dailyEnd = toSqlTime(body.daily_end_time);

    // 한쪽만 채우면 리졸버가 `CURTIME() BETWEEN start AND NULL` → NULL(=false) 로 평가해
    // 특가가 영원히 안 걸린다. 조용히 죽는 대신 거부한다.
    if (!!dailyStart !== !!dailyEnd) {
        return { error: '시간창은 시작시각과 종료시각을 둘 다 입력하거나 둘 다 비워야 합니다.' };
    }
    if (dailyStart && dailyEnd) {
        if (timeToMinutes(dailyEnd) <= timeToMinutes(dailyStart)) {
            return { error: '종료시각은 시작시각보다 뒤여야 합니다. 자정을 넘는 시간창(예: 22:00~02:00)은 지원하지 않습니다.' };
        }
    }
    if (category && category.schedule_type === 'TIME' && !dailyStart) {
        return { error: `"${category.name}" 은(는) 타임 특가 카테고리입니다. 시간창(시작·종료 시각)을 입력하세요.` };
    }

    const priority = Number.parseInt(body.priority, 10);
    const sortOrder = Number.parseInt(body.sort_order, 10);

    return {
        value: {
            deal_category_id: category.id,
            title: title.slice(0, 100),
            subtitle: nullIfBlank(body.subtitle) ? String(body.subtitle).trim().slice(0, 200) : null,
            starts_at: startsAt,
            ends_at: endsAt,
            daily_start_time: dailyStart,
            daily_end_time: dailyEnd,
            weekdays: normalizeWeekdays(body.weekdays),
            priority: Number.isFinite(priority) ? priority : 0,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
            is_active: body.is_active ? 1 : 0,
        },
    };
}

async function findOwned(mallId, id) {
    const [[row]] = await pool.query('SELECT * FROM deal WHERE id = ? AND mall_id = ?', [id, mallId]);
    return row || null;
}

async function loadCategories(mallId) {
    const [rows] = await pool.query(
        'SELECT id, code, name, schedule_type, is_active FROM deal_category WHERE mall_id = ? ORDER BY sort_order ASC, id ASC',
        [mallId]
    );
    return rows;
}

/** 폼이 넘긴 카테고리가 이 몰의 것인지 확인한다(요청 위조 차단). */
async function findCategory(mallId, categoryId) {
    const id = Number.parseInt(categoryId, 10);
    if (!Number.isFinite(id)) return null;
    const [[row]] = await pool.query(
        'SELECT * FROM deal_category WHERE id = ? AND mall_id = ?', [id, mallId]
    );
    return row || null;
}

/** GET /admin/deals */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const categoryId = Number.parseInt(req.query.category_id, 10);

        const where = ['d.mall_id = ?'];
        const params = [mallId];
        if (Number.isFinite(categoryId) && categoryId > 0) {
            where.push('d.deal_category_id = ?');
            params.push(categoryId);
        }

        // 상태는 DB 의 NOW()(=KST) 로 판정한다. 앱 서버 시계와 어긋나지 않게 하기 위해서다.
        const [deals] = await pool.query(`
            SELECT d.*,
                   dc.name AS category_name, dc.code AS category_code,
                   dc.schedule_type, dc.is_active AS category_active,
                   (SELECT COUNT(*) FROM deal_item di WHERE di.deal_id = d.id) AS item_count,
                   (SELECT COALESCE(SUM(di.sold_qty), 0) FROM deal_item di WHERE di.deal_id = d.id) AS sold_total,
                   CASE
                       WHEN d.is_active = 0 THEN 'INACTIVE'
                       WHEN NOW() < d.starts_at THEN 'SCHEDULED'
                       WHEN NOW() > d.ends_at THEN 'ENDED'
                       ELSE 'RUNNING'
                   END AS status
              FROM deal d
              JOIN deal_category dc ON dc.id = d.deal_category_id
             WHERE ${where.join(' AND ')}
             ORDER BY d.priority DESC, d.sort_order ASC, d.id DESC
        `, params);

        res.render('admin/deals/list', {
            layout: 'layouts/admin_layout',
            title: '쇼핑특가 관리',
            deals,
            categories: await loadCategories(mallId),
            filterCategoryId: Number.isFinite(categoryId) ? categoryId : null,
            weekdayList: WEEKDAYS,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[deal] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** 등록/수정 공용 폼 렌더 */
async function renderForm(res, deal, mallId, extra = {}) {
    const categories = await loadCategories(mallId);

    let items = [];
    if (deal.id) {
        const [rows] = await pool.query(`
            SELECT di.id AS item_id, di.deal_price, di.qty_limit, di.sold_qty, di.sort_order,
                   p.id AS product_id, p.name, p.main_image, p.price, p.original_price,
                   p.status, ${sellableStockSql('p')} AS stock
              FROM deal_item di
              JOIN products p ON p.id = di.product_id
             WHERE di.deal_id = ?
             ORDER BY di.sort_order ASC, di.id ASC
        `, [deal.id]);
        items = rows;
    }

    // 상품 조회 팝업의 카테고리 필터 — 이 몰이 실제로 쓰는 카테고리만.
    // 브랜드는 검색형 위젯(partials/admin/brand_picker)이 /admin/brands/search.json 으로 직접 받는다.
    const productCategories = await usedCategoryOptions(mallId);

    res.render('admin/deals/form', Object.assign({
        layout: 'layouts/admin_layout',
        title: deal.id ? '특가 수정' : '특가 등록',
        deal,
        form: {
            starts_at: toLocalInput(deal.starts_at),
            ends_at: toLocalInput(deal.ends_at),
            daily_start_time: toTimeInput(deal.daily_start_time),
            daily_end_time: toTimeInput(deal.daily_end_time),
            weekdays: String(deal.weekdays || '').split(',').map(Number).filter(Boolean),
        },
        categories,
        items,
        productCategories,
        weekdayList: WEEKDAYS,
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/deals/new */
exports.getNew = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        await renderForm(res, {
            id: null, deal_category_id: null, title: '', subtitle: '',
            starts_at: null, ends_at: null, daily_start_time: null, daily_end_time: null,
            weekdays: null, priority: 0, sort_order: 0, is_active: 1,
        }, mallId, { error: req.query.error || null });
    } catch (err) {
        console.error('[deal] getNew:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/deals/:id */
exports.getEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const deal = await findOwned(mallId, req.params.id);
        if (!deal) return redirectWith(res, BASE, 'error', '특가를 찾을 수 없습니다.');

        await renderForm(res, deal, mallId, {
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[deal] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/deals — 생성 */
exports.postCreate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const category = await findCategory(mallId, req.body.deal_category_id);
        if (!category) return redirectWith(res, `${BASE}/new`, 'error', '특가 카테고리를 선택하세요.');

        const out = normalizeForm(req.body, category);
        if (out.error) return redirectWith(res, `${BASE}/new`, 'error', out.error);
        const v = out.value;

        const [r] = await pool.query(`
            INSERT INTO deal
                (mall_id, deal_category_id, title, subtitle, starts_at, ends_at,
                 daily_start_time, daily_end_time, weekdays, priority, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            mallId, v.deal_category_id, v.title, v.subtitle, v.starts_at, v.ends_at,
            v.daily_start_time, v.daily_end_time, v.weekdays, v.priority, v.sort_order, v.is_active,
        ]);

        res.redirect(`${BASE}/${r.insertId}?saved=1`);
    } catch (err) {
        console.error('[deal] postCreate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/deals/:id — 수정 */
exports.postUpdate = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}`;
    try {
        const deal = await findOwned(mallId, id);
        if (!deal) return redirectWith(res, BASE, 'error', '특가를 찾을 수 없습니다.');

        const category = await findCategory(mallId, req.body.deal_category_id);
        if (!category) return redirectWith(res, back, 'error', '특가 카테고리를 선택하세요.');

        const out = normalizeForm(req.body, category);
        if (out.error) return redirectWith(res, back, 'error', out.error);
        const v = out.value;

        await pool.query(`
            UPDATE deal
               SET deal_category_id = ?, title = ?, subtitle = ?, starts_at = ?, ends_at = ?,
                   daily_start_time = ?, daily_end_time = ?, weekdays = ?,
                   priority = ?, sort_order = ?, is_active = ?
             WHERE id = ? AND mall_id = ?
        `, [
            v.deal_category_id, v.title, v.subtitle, v.starts_at, v.ends_at,
            v.daily_start_time, v.daily_end_time, v.weekdays,
            v.priority, v.sort_order, v.is_active,
            id, mallId,
        ]);

        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[deal] postUpdate:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/deals/:id/delete — deal_item 은 ON DELETE CASCADE 로 함께 지워진다. */
exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        await pool.query('DELETE FROM deal WHERE id = ? AND mall_id = ?', [req.params.id, mallId]);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        console.error('[deal] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ── 상품 큐레이션 ─────────────────────────────────────── */

/**
 * GET /admin/deals/:id/product-search — AJAX (필터형 상품 조회 팝업)
 * productGroupController.getProductSearch 와 같은 응답 형태.
 */
exports.getProductSearch = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        const categoryId = Number.parseInt(req.query.category_id, 10);
        const brandId = Number.parseInt(req.query.brand_id, 10);
        const inStock = String(req.query.in_stock || '');
        const visibility = String(req.query.visibility || '');

        const where = ['p.mall_id = ?'];
        const params = [mallId];

        if (q) { where.push('(p.name LIKE ? OR p.product_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (Number.isFinite(categoryId) && categoryId > 0) { where.push('p.category_id = ?'); params.push(categoryId); }
        if (Number.isFinite(brandId) && brandId > 0) { where.push('p.brand_category_id = ?'); params.push(brandId); }
        if (inStock === 'y') where.push(inStockSql('p'));
        else if (inStock === 'n') where.push(`NOT ${inStockSql('p')}`);
        if (VISIBILITIES.includes(visibility)) { where.push('p.visibility = ?'); params.push(visibility); }

        where.push('p.id NOT IN (SELECT product_id FROM deal_item WHERE deal_id = ?)');
        params.push(req.params.id);

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.product_code, p.main_image, p.price, p.original_price,
                   ${sellableStockSql('p')} AS stock, p.status, p.visibility
              FROM products p
             WHERE ${where.join(' AND ')}
             ORDER BY p.created_at DESC
             LIMIT 100
        `, params);

        res.json({ products, limited: products.length >= 100 });
    } catch (err) {
        console.error('[deal] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};

/**
 * POST /admin/deals/:id/items — 상품 1건 담기
 * deal_price 초기값은 정가다(할인 0%). 파일 헤드 주석 참고.
 */
exports.postAddItem = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}`;
    try {
        const deal = await findOwned(mallId, id);
        if (!deal) return redirectWith(res, BASE, 'error', '특가를 찾을 수 없습니다.');

        const productId = Number.parseInt(req.body.product_id, 10);
        if (!Number.isFinite(productId)) return res.redirect(back);

        const [[prod]] = await pool.query(
            'SELECT id, price FROM products WHERE id = ? AND mall_id = ?', [productId, mallId]
        );
        if (!prod) return redirectWith(res, back, 'error', '이 몰의 상품이 아닙니다.');

        const [[maxRow]] = await pool.query(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM deal_item WHERE deal_id = ?', [id]
        );
        await pool.query(
            'INSERT INTO deal_item (deal_id, product_id, deal_price, qty_limit, sort_order) VALUES (?, ?, ?, NULL, ?)',
            [id, productId, Number(prod.price) || 0, maxRow.next_order]
        );
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return redirectWith(res, `${BASE}/${req.params.id}`, 'error', '이미 담긴 상품입니다.');
        }
        console.error('[deal] postAddItem:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * POST /admin/deals/:id/items/bulk — 여러 상품 한번에 담기 (AJAX)
 * 담긴 직후의 deal_price 는 정가다 → 할인 0%. 운영자가 특가를 명시해야 인라인 저장이 통과한다.
 */
exports.postAddItems = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;

    const raw = Array.isArray(req.body.product_ids) ? req.body.product_ids : [];
    const ids = [...new Set(raw.map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ success: false, added: 0 });

    const conn = await pool.getConnection();
    try {
        const deal = await findOwned(mallId, id);
        if (!deal) { conn.release(); return res.status(404).json({ success: false }); }

        // 이 몰 소유 상품만 (요청 위조 차단)
        const ph = ids.map(() => '?').join(',');
        const [owned] = await conn.query(
            `SELECT id, price FROM products WHERE mall_id = ? AND id IN (${ph})`, [mallId, ...ids]
        );
        const priceById = new Map(owned.map((r) => [r.id, Number(r.price) || 0]));

        const [existing] = await conn.query('SELECT product_id FROM deal_item WHERE deal_id = ?', [id]);
        const have = new Set(existing.map((r) => r.product_id));

        const toAdd = ids.filter((pid) => priceById.has(pid) && !have.has(pid));

        if (toAdd.length) {
            await conn.beginTransaction();
            const [[maxRow]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS m FROM deal_item WHERE deal_id = ?', [id]
            );
            let order = maxRow.m;
            for (const pid of toAdd) {
                order += 1;
                await conn.query(
                    'INSERT INTO deal_item (deal_id, product_id, deal_price, qty_limit, sort_order) VALUES (?, ?, ?, NULL, ?)',
                    [id, pid, priceById.get(pid), order]
                );
            }
            await conn.commit();
        }
        res.json({ success: true, added: toAdd.length, skipped: ids.length - toAdd.length });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 미시작 */ }
        console.error('[deal] postAddItems:', err.message);
        res.status(500).json({ success: false });
    } finally {
        conn.release();
    }
};

/**
 * POST /admin/deals/:id/items — 인라인 저장 (deal_price · qty_limit 일괄)
 *
 * **한 행이라도 검증에 걸리면 전부 롤백한다.** group-buy 처럼 잘못된 행을 조용히 건너뛰면
 * 운영자는 "저장됨"을 보고 떠나는데 가격은 그대로다 — 돈이 걸린 필드에선 그게 사고다.
 * 정가는 폼 값이 아니라 DB(products.price)에서 다시 읽는다.
 */
exports.postSaveItems = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}`;

    const conn = await pool.getConnection();
    try {
        const deal = await findOwned(mallId, id);
        if (!deal) { conn.release(); return redirectWith(res, BASE, 'error', '특가를 찾을 수 없습니다.'); }

        const raw = req.body.items;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
        if (!rows.length) return res.redirect(`${back}?saved=1`);

        // 이 특가에 실제로 담긴 행 + 상품 정가 (요청 위조·정가 조작 차단)
        const [current] = await conn.query(`
            SELECT di.id, di.product_id, p.name, p.price
              FROM deal_item di
              JOIN products p ON p.id = di.product_id
             WHERE di.deal_id = ?
        `, [id]);
        const byId = new Map(current.map((r) => [r.id, r]));

        const updates = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i] || {};
            const itemId = Number.parseInt(r.item_id, 10);
            if (!Number.isFinite(itemId) || !byId.has(itemId)) continue;

            const target = byId.get(itemId);
            const listPrice = Number(target.price) || 0;

            const dealPrice = toIntOrNull(r.deal_price);
            if (dealPrice === null || dealPrice <= 0) {
                return redirectWith(res, back, 'error', `"${target.name}" 의 특가를 1원 이상으로 입력하세요.`);
            }
            if (listPrice > 0 && dealPrice >= listPrice) {
                return redirectWith(res, back, 'error',
                    `"${target.name}" 의 특가(${dealPrice.toLocaleString('ko-KR')}원)가 정가(${listPrice.toLocaleString('ko-KR')}원) 이상입니다. 정가보다 싸게 입력하세요.`);
            }

            const qtyLimit = toIntOrNull(r.qty_limit);
            if (qtyLimit !== null && qtyLimit < 1) {
                return redirectWith(res, back, 'error', `"${target.name}" 의 한정 수량은 1 이상이거나 비워 두어야 합니다(비우면 무제한).`);
            }

            const sortOrder = Number.parseInt(r.sort_order, 10);
            updates.push([dealPrice, qtyLimit, Number.isFinite(sortOrder) ? sortOrder : i + 1, itemId, id]);
        }

        await conn.beginTransaction();
        for (const u of updates) {
            await conn.query(
                'UPDATE deal_item SET deal_price = ?, qty_limit = ?, sort_order = ? WHERE id = ? AND deal_id = ?',
                u
            );
        }
        await conn.commit();
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 미시작 */ }
        console.error('[deal] postSaveItems:', err.message);
        redirectWith(res, back, 'error', '상품 저장 중 오류가 발생했습니다.');
    } finally {
        conn.release();
    }
};

/** POST /admin/deals/:id/items/reorder — AJAX */
exports.postReorderItems = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const order = Array.isArray(req.body.order) ? req.body.order : null;
    if (!order) return res.status(400).json({ success: false });

    const conn = await pool.getConnection();
    try {
        const deal = await findOwned(mallId, id);
        if (!deal) { conn.release(); return res.status(404).json({ success: false }); }

        await conn.beginTransaction();
        for (let i = 0; i < order.length; i++) {
            await conn.query(
                'UPDATE deal_item SET sort_order = ? WHERE id = ? AND deal_id = ?',
                [i + 1, order[i], id]
            );
        }
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { /* 미시작 */ }
        console.error('[deal] postReorderItems:', err.message);
        res.status(500).json({ success: false });
    } finally {
        conn.release();
    }
};

/** POST /admin/deals/:id/items/:itemId/delete */
exports.postRemoveItem = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const deal = await findOwned(mallId, id);
        if (!deal) return redirectWith(res, BASE, 'error', '특가를 찾을 수 없습니다.');

        await pool.query('DELETE FROM deal_item WHERE id = ? AND deal_id = ?', [req.params.itemId, id]);
        res.redirect(`${BASE}/${id}?saved=1`);
    } catch (err) {
        console.error('[deal] postRemoveItem:', err.message);
        res.status(500).send('Server Error');
    }
};
