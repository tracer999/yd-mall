const pool = require('../../config/db');
const svc = require('../../services/groupBuy/groupBuyService');
const navigationService = require('../../services/menu/navigationService');
const { sanitize } = require('../../services/display/htmlSanitizer');

/*
 * 공동구매 관리 (1차)
 *
 * 설계: docs/사이트개선/group_buy_design_and_development.md §5, §7-2
 *
 * 이 저장소 관리자 표준을 따른다 — 폼 POST + EJS + res.redirect.
 * JSON 을 돌려주는 것은 상품 검색(모달) 하나뿐이다.
 * (설계서 §7-2 는 REST JSON API 를 그렸지만, 이 저장소의 관리자는 전부 SSR 폼이다.
 *  거기에 혼자 JSON API 를 얹으면 인증·CSRF·에러 렌더가 전부 갈라진다.)
 *
 * ── 몰 스코프 ──
 * 모든 쿼리에 `mall_id = req.adminMallId` 를 건다. 하위 테이블(group_buy_product)은
 * mall_id 컬럼이 없으므로, 반드시 부모 group_buy 를 몰 스코프로 먼저 확인한 뒤 손댄다.
 *
 * ── 참여 현황 ──
 * group_buy.current_quantity / participant_count 는 비정규화 카운터다.
 * 결제 확정 시 groupBuyService.recordParticipation 만 갱신한다. 관리자는 읽기만 한다.
 */

const BASE = '/admin/group-buys';

/** multer 가 처리할 이미지 필드 ↔ group_buy 컬럼 */
const IMAGE_FIELDS = [
    { field: 'gb_list_thumbnail', column: 'list_thumbnail_url' },
    { field: 'gb_pc_hero_image', column: 'pc_hero_image_url' },
    { field: 'gb_mobile_hero_image', column: 'mobile_hero_image_url' },
];

const redirectWith = (res, path, key, msg) =>
    res.redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

/** `datetime-local` 값 → MySQL datetime. 빈 값은 null. */
function toDateTime(raw) {
    const v = String(raw || '').trim();
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return v.replace('T', ' ').slice(0, 19) + (v.length === 16 ? ':00' : '');
}

/** MySQL datetime → `datetime-local` 입력값 */
function toLocalInput(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 업로드된 파일 → `/uploads/...` 경로. 없으면 기존 값 유지, `*_clear` 체크 시 null. */
function resolveImage(req, field, currentValue) {
    const file = req.files && req.files[field] && req.files[field][0];
    if (file) return file.path.replace(/^public/, '').replace(/\\/g, '/');
    if (req.body[`${field}_clear`]) return null;
    return currentValue === undefined ? null : currentValue;
}

/** 양수 정수 또는 null. 빈 문자열·0·음수·NaN 은 전부 null. */
function toPositiveInt(raw) {
    const n = Number.parseInt(String(raw ?? '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** 이 몰의 공동구매인지 확인하고 행을 돌려준다. 아니면 null. */
async function findOwned(mallId, id) {
    const [[row]] = await pool.query('SELECT * FROM group_buy WHERE id = ? AND mall_id = ?', [id, mallId]);
    return row || null;
}

/** 기본정보 폼 → 컬럼 값 */
function buildFields(req) {
    const b = req.body;
    const targetEnabled = b.target_enabled ? 1 : 0;
    return {
        title: String(b.title || '').trim().slice(0, 200),
        summary: String(b.summary || '').trim().slice(0, 500) || null,
        // 운영자 입력 HTML — 저장 시 새니타이즈(렌더 시 한 번 더 통과시킨다)
        description: sanitize(String(b.description || '')) || null,
        notice: sanitize(String(b.notice || '')) || null,
        status: svc.pick(svc.STATUSES, b.status, 'DRAFT'),
        start_at: toDateTime(b.start_at),
        end_at: toDateTime(b.end_at),
        closing_hours: toPositiveInt(b.closing_hours) || 24,
        list_visible: b.list_visible ? 1 : 0,
        search_visible: b.search_visible ? 1 : 0,
        target_enabled: targetEnabled,
        // 목표 수량을 끄면 값도 지운다. 남겨두면 다시 켰을 때 옛 목표가 되살아난다.
        target_quantity: targetEnabled ? toPositiveInt(b.target_quantity) : null,
        participant_count_visible: b.participant_count_visible ? 1 : 0,
        quantity_count_visible: b.quantity_count_visible ? 1 : 0,
        progress_visible: b.progress_visible ? 1 : 0,
        ended_purchase_policy: svc.pick(svc.ENDED_PURCHASE_POLICIES, b.ended_purchase_policy, 'DISALLOW'),
        delivery_note: String(b.delivery_note || '').trim().slice(0, 200) || null,
    };
}

/** 필수값·기간 검증. 통과하면 null, 아니면 오류 메시지. */
function validate(fields) {
    if (!fields.title) return '공동구매명을 입력하세요.';
    if (!fields.start_at) return '시작일시를 입력하세요.';
    if (!fields.end_at) return '종료일시를 입력하세요. 공동구매는 기간이 필수입니다.';
    if (fields.end_at <= fields.start_at) return '종료일시가 시작일시보다 빠르거나 같습니다.';
    if (fields.target_enabled && !fields.target_quantity) return '목표 수량을 사용하려면 목표 수량을 입력하세요.';
    return null;
}

/* ── 목록 (§5-1) ─────────────────────────────────────── */

/** GET /admin/group-buys */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        const status = svc.values(svc.STATUSES).includes(req.query.status) ? req.query.status : '';

        const where = ['g.mall_id = ?'];
        const params = [mallId];
        if (q) { where.push('(g.title LIKE ? OR g.slug LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (status) { where.push('g.status = ?'); params.push(status); }

        /*
         * 주문 수·매출은 group_buy_participation 에서 집계한다(§5-1).
         * CANCELLED/REFUNDED 는 매출에서 뺀다.
         */
        const [rows] = await pool.query(`
            SELECT g.*,
                   (SELECT gp.group_buy_price FROM group_buy_product gp
                     WHERE gp.group_buy_id = g.id
                     ORDER BY gp.role = 'MAIN' DESC, gp.sort_order ASC, gp.id ASC LIMIT 1) AS main_price,
                   (SELECT p.name FROM group_buy_product gp JOIN products p ON p.id = gp.product_id
                     WHERE gp.group_buy_id = g.id
                     ORDER BY gp.role = 'MAIN' DESC, gp.sort_order ASC, gp.id ASC LIMIT 1) AS main_product_name,
                   (SELECT COUNT(*) FROM group_buy_product gp WHERE gp.group_buy_id = g.id) AS product_count,
                   (SELECT COUNT(*) FROM group_buy_participation gpa
                     WHERE gpa.group_buy_id = g.id AND gpa.status IN ('PAID','CONFIRMED')) AS order_count,
                   (SELECT COALESCE(SUM(gpa.quantity * gpa.unit_price), 0) FROM group_buy_participation gpa
                     WHERE gpa.group_buy_id = g.id AND gpa.status IN ('PAID','CONFIRMED')) AS revenue
              FROM group_buy g
             WHERE ${where.join(' AND ')}
             ORDER BY g.id DESC
        `, params);

        const now = new Date();
        res.render('admin/group-buys/list', {
            layout: 'layouts/admin_layout',
            title: '공동구매 관리',
            subtitle: '기간·목표 수량·공동구매가가 있는 조건부 판매 캠페인을 관리합니다.',
            groupBuys: rows.map(r => svc.decorate(r, now)),
            statuses: svc.STATUSES,
            q,
            status,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[group-buy] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ── 등록·수정 폼 (§5-2) ─────────────────────────────── */

async function renderForm(req, res, groupBuy, extra = {}) {
    const isNew = !groupBuy.id;

    let products = [];
    let participants = [];
    if (!isNew) {
        // 관리자에겐 비공개·판매중지 상품도 보여준다(왜 고객 화면에서 빠졌는지 알아야 한다).
        products = await svc.getProducts(groupBuy.id, { publicOnly: false });

        const [rows] = await pool.query(`
            SELECT gpa.*, o.order_number, o.status AS order_status, u.name AS user_name, u.email AS user_email
              FROM group_buy_participation gpa
              LEFT JOIN orders o ON o.id = gpa.order_id
              LEFT JOIN users u  ON u.id = gpa.user_id
             WHERE gpa.group_buy_id = ?
             ORDER BY gpa.id DESC
             LIMIT 100
        `, [groupBuy.id]);
        participants = rows;
    }

    res.render('admin/group-buys/edit', Object.assign({
        layout: 'layouts/admin_layout',
        title: isNew ? '공동구매 등록' : '공동구매 수정',
        subtitle: isNew ? null : groupBuy.title,
        groupBuy: Object.assign({}, groupBuy, {
            start_at_input: toLocalInput(groupBuy.start_at),
            end_at_input: toLocalInput(groupBuy.end_at),
        }),
        products,
        participants,
        phase: isNew ? null : svc.derivePhase(groupBuy),
        phaseLabels: svc.PHASE_LABELS,
        statuses: svc.STATUSES,
        endedPurchasePolicies: svc.ENDED_PURCHASE_POLICIES,
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/group-buys/add */
exports.getAdd = async (req, res) => {
    try {
        const now = new Date();
        const weekLater = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
        await renderForm(req, res, {
            id: null, title: '', slug: '', summary: '', description: '', notice: '',
            status: 'DRAFT',
            start_at: now, end_at: weekLater, closing_hours: 24,
            list_visible: 1, search_visible: 1,
            target_enabled: 0, target_quantity: null,
            participant_count_visible: 1, quantity_count_visible: 1, progress_visible: 1,
            current_quantity: 0, participant_count: 0,
            ended_purchase_policy: 'DISALLOW', delivery_note: null,
            view_count: 0,
            list_thumbnail_url: null, pc_hero_image_url: null, mobile_hero_image_url: null,
        });
    } catch (err) {
        console.error('[group-buy] getAdd:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/group-buys/add */
exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const fields = buildFields(req);
        const invalid = validate(fields);
        if (invalid) return redirectWith(res, `${BASE}/add`, 'error', invalid);

        const slug = await svc.ensureUniqueSlug(mallId, req.body.slug || fields.title);

        const images = {};
        IMAGE_FIELDS.forEach(({ field, column }) => { images[column] = resolveImage(req, field, null); });

        const cols = Object.keys(fields).concat(Object.keys(images));
        const vals = Object.values(fields).concat(Object.values(images));
        const [r] = await pool.query(
            `INSERT INTO group_buy (mall_id, slug, ${cols.join(', ')})
             VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
            [mallId, slug, ...vals]
        );

        // 공개 공동구매 수가 바뀌면 GNB 노출 판정도 바뀐다. 캐시를 비워 즉시 반영한다.
        navigationService.invalidateContentGate(mallId);
        res.redirect(`${BASE}/${r.insertId}/edit?saved=1`);
    } catch (err) {
        console.error('[group-buy] postAdd:', err.message);
        redirectWith(res, `${BASE}/add`, 'error', '저장 중 오류가 발생했습니다.');
    }
};

/** GET /admin/group-buys/:id/edit */
exports.getEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const groupBuy = await findOwned(mallId, req.params.id);
        if (!groupBuy) return redirectWith(res, BASE, 'error', '공동구매를 찾을 수 없습니다.');

        await renderForm(req, res, groupBuy, {
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[group-buy] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/group-buys/:id/edit */
exports.postEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const current = await findOwned(mallId, id);
        if (!current) return redirectWith(res, BASE, 'error', '공동구매를 찾을 수 없습니다.');

        const fields = buildFields(req);
        const invalid = validate(fields);
        if (invalid) return redirectWith(res, back, 'error', invalid);

        const slug = await svc.ensureUniqueSlug(mallId, req.body.slug || fields.title, id);

        const images = {};
        IMAGE_FIELDS.forEach(({ field, column }) => { images[column] = resolveImage(req, field, current[column]); });

        const assigns = Object.keys(fields).concat(Object.keys(images)).map(k => `${k} = ?`);
        await pool.query(
            `UPDATE group_buy SET slug = ?, ${assigns.join(', ')} WHERE id = ? AND mall_id = ?`,
            [slug, ...Object.values(fields), ...Object.values(images), id, mallId]
        );

        // status·list_visible 이 바뀌면 공개 건수가 달라진다.
        navigationService.invalidateContentGate(mallId);
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[group-buy] postEdit:', err.message);
        redirectWith(res, back, 'error', '저장 중 오류가 발생했습니다.');
    }
};

/** POST /admin/group-buys/:id/delete */
exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        /*
         * 참여(결제) 기록이 있으면 삭제하지 않는다.
         * group_buy_participation 은 ON DELETE CASCADE 라 함께 지워지는데,
         * 그 안에 결제된 주문의 출처가 들어 있다. 지우면 CS 때 추적이 끊긴다.
         */
        const [[part]] = await pool.query(
            'SELECT COUNT(*) AS c FROM group_buy_participation WHERE group_buy_id = ?', [id]
        );
        if (Number(part.c) > 0) {
            return redirectWith(res, BASE, 'error',
                `참여(결제) 기록 ${part.c}건이 있어 삭제할 수 없습니다. 대신 '숨김' 으로 바꾸세요.`);
        }

        // group_buy_product 는 ON DELETE CASCADE 로 함께 지워진다.
        await pool.query('DELETE FROM group_buy WHERE id = ? AND mall_id = ?', [id, mallId]);
        navigationService.invalidateContentGate(mallId);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        console.error('[group-buy] postDelete:', err.message);
        redirectWith(res, BASE, 'error', '삭제 중 오류가 발생했습니다.');
    }
};

/* ── 상품/가격 매핑 (§5-2) ───────────────────────────── */

/**
 * POST /admin/group-buys/:id/products/add — 대상 상품 담기
 *
 * 1차는 대표 상품 1개가 기준이다. 첫 상품은 role='MAIN', 이후는 'SUB'.
 * 공동구매가는 상품가에서 시작하도록 넣어두고 운영자가 고친다.
 */
exports.postAddProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const groupBuy = await findOwned(mallId, id);
        if (!groupBuy) return redirectWith(res, BASE, 'error', '공동구매를 찾을 수 없습니다.');

        const productId = Number.parseInt(req.body.product_id, 10);
        if (!Number.isFinite(productId)) return res.redirect(back);

        // 다른 몰 상품을 이 몰의 공동구매에 담지 못하게 한다(요청 위조 차단).
        const [[prod]] = await pool.query(
            'SELECT id, price, original_price FROM products WHERE id = ? AND mall_id = ?', [productId, mallId]
        );
        if (!prod) return redirectWith(res, back, 'error', '이 몰의 상품이 아닙니다.');

        const [[existing]] = await pool.query(
            'SELECT COUNT(*) AS c FROM group_buy_product WHERE group_buy_id = ?', [id]
        );
        const isFirst = Number(existing.c) === 0;

        const normalPrice = Number(prod.original_price) || Number(prod.price) || 0;
        const groupBuyPrice = Number(prod.price) || 0;

        await pool.query(`
            INSERT INTO group_buy_product
                (group_buy_id, product_id, role, sort_order, normal_price, group_buy_price, discount_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            id, productId,
            isFirst ? 'MAIN' : 'SUB',
            Number(existing.c) + 1,
            normalPrice || null,
            groupBuyPrice,
            svc.calcDiscountRate(normalPrice, groupBuyPrice),
        ]);

        res.redirect(`${back}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '이미 담긴 상품입니다.');
        }
        console.error('[group-buy] postAddProduct:', err.message);
        redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '상품 추가 중 오류가 발생했습니다.');
    }
};

/**
 * POST /admin/group-buys/:id/products — 매핑 일괄 저장
 * 가격·수량 제한·노출·구매 여부를 한 번에 갱신한다. 할인율은 서버가 계산한다.
 */
exports.postSaveProducts = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;

    const conn = await pool.getConnection();
    try {
        const groupBuy = await findOwned(mallId, id);
        if (!groupBuy) { conn.release(); return redirectWith(res, BASE, 'error', '공동구매를 찾을 수 없습니다.'); }

        const raw = req.body.products;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];

        await conn.beginTransaction();
        for (let i = 0; i < rows.length; i++) {
            const p = rows[i] || {};
            const mappingId = Number.parseInt(p.mapping_id, 10);
            if (!Number.isFinite(mappingId)) continue;

            const groupBuyPrice = toPositiveInt(p.group_buy_price);
            // 공동구매가가 없으면 결제 금액을 정할 수 없다. 그 행은 건너뛴다.
            if (!groupBuyPrice) continue;

            const normalPrice = toPositiveInt(p.normal_price);
            const minQty = toPositiveInt(p.min_order_quantity) || 1;
            const maxQty = toPositiveInt(p.max_order_quantity);
            // 최대가 최소보다 작으면 아무 수량도 살 수 없다. 최대를 없앤다.
            const safeMaxQty = (maxQty && maxQty < minQty) ? null : maxQty;

            await conn.query(`
                UPDATE group_buy_product
                   SET role = ?, sort_order = ?, normal_price = ?, group_buy_price = ?, discount_rate = ?,
                       min_order_quantity = ?, max_order_quantity = ?, per_user_limit_quantity = ?,
                       purchase_enabled = ?, visible = ?
                 WHERE id = ? AND group_buy_id = ?
            `, [
                p.role === 'MAIN' ? 'MAIN' : 'SUB',
                Number.parseInt(p.sort_order, 10) || i + 1,
                normalPrice,
                groupBuyPrice,
                svc.calcDiscountRate(normalPrice, groupBuyPrice),
                minQty,
                safeMaxQty,
                toPositiveInt(p.per_user_limit_quantity),
                p.purchase_enabled ? 1 : 0,
                p.visible ? 1 : 0,
                mappingId, id,
            ]);
        }
        await conn.commit();
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[group-buy] postSaveProducts:', err.message);
        redirectWith(res, back, 'error', '상품 저장 중 오류가 발생했습니다.');
    } finally {
        conn.release();
    }
};

/** POST /admin/group-buys/:id/products/:mappingId/delete */
exports.postRemoveProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const groupBuy = await findOwned(mallId, id);
        if (!groupBuy) return redirectWith(res, BASE, 'error', '공동구매를 찾을 수 없습니다.');

        await pool.query('DELETE FROM group_buy_product WHERE id = ? AND group_buy_id = ?', [req.params.mappingId, id]);
        res.redirect(`${BASE}/${id}/edit?saved=1`);
    } catch (err) {
        console.error('[group-buy] postRemoveProduct:', err.message);
        redirectWith(res, `${BASE}/${id}/edit`, 'error', '상품 삭제 중 오류가 발생했습니다.');
    }
};

/**
 * GET /admin/group-buys/product-search?q= — AJAX (상품 선택 모달)
 * exhibitionController.getProductSearch 의 응답 형태를 따른다.
 */
exports.getProductSearch = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ products: [] });

        const [products] = await pool.query(`
            SELECT p.id, p.name, p.main_image, p.price, p.original_price, p.status
              FROM products p
             WHERE p.mall_id = ? AND p.name LIKE ?
             ORDER BY p.created_at DESC
             LIMIT 20
        `, [mallId, `%${q}%`]);

        res.json({ products });
    } catch (err) {
        console.error('[group-buy] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};
