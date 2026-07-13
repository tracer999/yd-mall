const pool = require('../../config/db');
const svc = require('../../services/live/liveService');
const { sanitize } = require('../../services/display/htmlSanitizer');

/*
 * 쇼핑라이브 관리 (1차)
 *
 * 설계: docs/사이트개선/live sales.md §7-2
 *
 * 이 저장소 관리자 표준을 따른다 — 폼 POST + EJS + res.redirect.
 * JSON 을 돌려주는 것은 상품·쿠폰 검색(모달) 둘뿐이다.
 * (설계서 초안은 REST JSON API 를 그렸지만 이 저장소의 관리자는 전부 SSR 폼이다.
 *  거기에 혼자 JSON API 를 얹으면 인증·에러 렌더가 갈라진다. 공동구매와 같은 판단.)
 *
 * ── 몰 스코프 ──
 * 모든 쿼리에 `mall_id = req.adminMallId`. 하위 테이블(live_show_product/coupon/notice)은
 * mall_id 가 없으므로 반드시 부모 live_show 를 몰 스코프로 확인한 뒤 손댄다.
 *
 * ── 영상 ──
 * iframe HTML 을 저장하지 않는다. liveService.parseVideoId() 로 video id 만 뽑아 저장한다.
 * 이 파일이 그 검증을 통과시키는 유일한 지점이다.
 *
 * ── 상태 ──
 * status 는 운영자가 직접 바꾼다(§3-1). 시간이 지났다고 코드가 ON_AIR→ENDED 로 넘기지 않는다.
 * 외부 URL 임베드 방식에서는 실제 방송 시작·종료를 알 수 없기 때문이다.
 */

const BASE = '/admin/lives';

/** multer 필드 ↔ live_show 컬럼 (필드명 `ls_` 접두어 — 기획전/공동구매와 폴더가 섞이지 않게) */
const IMAGE_FIELDS = [
    { field: 'ls_list_thumbnail', column: 'list_thumbnail_url' },
    { field: 'ls_pc_hero_image', column: 'pc_hero_image_url' },
    { field: 'ls_mobile_hero_image', column: 'mobile_hero_image_url' },
];

const redirectWith = (res, path, key, msg) =>
    res.redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

/** `datetime-local` → MySQL datetime */
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

function resolveImage(req, field, currentValue) {
    const file = req.files && req.files[field] && req.files[field][0];
    if (file) return file.path.replace(/^public/, '').replace(/\\/g, '/');
    if (req.body[`${field}_clear`]) return null;
    return currentValue === undefined ? null : currentValue;
}

/** 양수 정수 또는 null */
function toPositiveInt(raw) {
    const n = Number.parseInt(String(raw ?? '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

async function findOwned(mallId, id) {
    const [[row]] = await pool.query('SELECT * FROM live_show WHERE id = ? AND mall_id = ?', [id, mallId]);
    return row || null;
}

/**
 * 기본정보 폼 → 컬럼 값.
 * 영상 id 파싱이 실패하면 `_videoError` 에 사유를 담아 돌려준다(호출부가 저장을 막는다).
 */
function buildFields(req, current = {}) {
    const b = req.body;

    const provider = svc.pick(svc.PROVIDERS, b.provider, 'YOUTUBE');
    const replayProvider = svc.pick(svc.PROVIDERS, b.replay_provider, provider);

    const fields = {
        title: String(b.title || '').trim().slice(0, 200),
        summary: String(b.summary || '').trim().slice(0, 500) || null,
        // 운영자 입력 HTML — 저장 시 새니타이즈(렌더 시 한 번 더 통과시킨다)
        description: sanitize(String(b.description || '')) || null,
        notice: sanitize(String(b.notice || '')) || null,

        provider,
        video_id: null,
        replay_provider: null,
        replay_video_id: null,

        status: svc.pick(svc.STATUSES, b.status, 'DRAFT'),
        start_at: toDateTime(b.start_at),
        end_at: toDateTime(b.end_at),

        purchase_enabled: b.purchase_enabled ? 1 : 0,
        ended_purchase_policy: svc.pick(svc.ENDED_PURCHASE_POLICIES, b.ended_purchase_policy, 'DISALLOW'),
        ended_access_policy: svc.pick(svc.ENDED_ACCESS_POLICIES, b.ended_access_policy, 'ALLOW'),
        replay_enabled: b.replay_enabled ? 1 : 0,

        list_visible: b.list_visible ? 1 : 0,
        search_visible: b.search_visible ? 1 : 0,
        share_enabled: b.share_enabled ? 1 : 0,
    };

    // 영상 — URL 이든 id 든 받아서 id 만 저장한다. 허용 호스트·형식이 아니면 거부(§8-1).
    const rawVideo = String(b.video_input || '').trim();
    if (rawVideo) {
        const parsed = svc.parseVideoId(provider, rawVideo);
        if (!parsed.ok) return Object.assign(fields, { _videoError: `방송 영상: ${parsed.reason}` });
        fields.video_id = parsed.videoId;
    }

    const rawReplay = String(b.replay_input || '').trim();
    if (rawReplay) {
        const parsed = svc.parseVideoId(replayProvider, rawReplay);
        if (!parsed.ok) return Object.assign(fields, { _videoError: `다시보기 영상: ${parsed.reason}` });
        fields.replay_provider = replayProvider;
        fields.replay_video_id = parsed.videoId;
    }

    return fields;
}

/** 필수값 검증. 통과하면 null. */
function validate(fields) {
    if (fields._videoError) return fields._videoError;
    if (!fields.title) return '방송명을 입력하세요.';
    if (!fields.start_at) return '방송 시작 일시를 입력하세요.';
    if (fields.end_at && fields.end_at <= fields.start_at) return '종료 일시가 시작 일시보다 빠르거나 같습니다.';

    // 방송을 켜려면 영상이 있어야 한다. 빈 iframe 을 고객에게 보이지 않는다.
    if (fields.status === 'ON_AIR' && !fields.video_id) {
        return '방송 중으로 두려면 방송 영상 URL(또는 ID)이 필요합니다.';
    }
    return null;
}

/** DB 에 넣을 컬럼만 남긴다(`_videoError` 같은 내부 키 제거). */
function dbFields(fields) {
    const out = Object.assign({}, fields);
    delete out._videoError;
    return out;
}

/* ── 목록 ────────────────────────────────────────────── */

/** GET /admin/lives */
exports.getList = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const q = String(req.query.q || '').trim();
        const status = svc.values(svc.STATUSES).includes(req.query.status) ? req.query.status : '';

        const where = ['l.mall_id = ?'];
        const params = [mallId];
        if (q) { where.push('(l.title LIKE ? OR l.slug LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (status) { where.push('l.status = ?'); params.push(status); }

        /*
         * 주문 수·매출은 order_items.source_type='LIVE_SHOW' 에서 집계한다(§5-1).
         * 별도 참여 테이블을 두지 않았으므로 주문 라인이 유일한 성과 소스다.
         * 취소·환불 주문은 뺀다.
         */
        const [rows] = await pool.query(`
            SELECT l.*,
                   (SELECT COUNT(*) FROM live_show_product x WHERE x.live_show_id = l.id) AS product_count,
                   (SELECT COUNT(*) FROM live_show_coupon  x WHERE x.live_show_id = l.id) AS coupon_count,
                   (SELECT COUNT(*) FROM live_show_notice  x WHERE x.live_show_id = l.id) AS notice_count,
                   (SELECT p.name FROM live_show_product x JOIN products p ON p.id = x.product_id
                     WHERE x.live_show_id = l.id
                     ORDER BY x.role = 'MAIN' DESC, x.sort_order ASC, x.id ASC LIMIT 1) AS main_product_name,
                   (SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi
                      JOIN orders o ON o.id = oi.order_id
                     WHERE oi.source_type = 'LIVE_SHOW' AND oi.source_id = l.id
                       AND o.status NOT IN ('PENDING','CANCELLED','REFUNDED')) AS order_count,
                   (SELECT COALESCE(SUM(oi.total_price), 0) FROM order_items oi
                      JOIN orders o ON o.id = oi.order_id
                     WHERE oi.source_type = 'LIVE_SHOW' AND oi.source_id = l.id
                       AND o.status NOT IN ('PENDING','CANCELLED','REFUNDED')) AS revenue
              FROM live_show l
             WHERE ${where.join(' AND ')}
             ORDER BY FIELD(l.status,'ON_AIR','SCHEDULED','DRAFT','ENDED','CANCELLED') ASC, l.id DESC
        `, params);

        const now = new Date();
        res.render('admin/lives/list', {
            layout: 'layouts/admin_layout',
            title: '쇼핑라이브 관리',
            subtitle: '영상 방송과 함께 파는 상품·쿠폰·공지를 관리합니다.',
            lives: rows.map(r => svc.decorate(r, now)),
            statuses: svc.STATUSES,
            q,
            status,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[live] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/* ── 등록·수정 폼 ────────────────────────────────────── */

async function renderForm(req, res, live, extra = {}) {
    const isNew = !live.id;

    let products = [];
    let coupons = [];
    let notices = [];
    let availableCoupons = [];

    if (!isNew) {
        // 관리자에겐 비공개·판매중지 상품도 보여준다(왜 고객 화면에서 빠졌는지 알아야 한다).
        products = await svc.getProducts(live.id, { publicOnly: false });

        const [couponRows] = await pool.query(`
            SELECT lsc.id AS mapping_id, lsc.is_primary, lsc.sort_order, lsc.is_active,
                   c.id, c.name, c.code, c.benefit_type, c.discount_amount, c.discount_rate,
                   c.issue_method, c.status, c.issue_limit, c.issued_count, c.valid_to
              FROM live_show_coupon lsc
              JOIN coupons c ON c.id = lsc.coupon_id
             WHERE lsc.live_show_id = ?
             ORDER BY lsc.is_primary DESC, lsc.sort_order ASC, lsc.id ASC
        `, [live.id]);
        coupons = couponRows;

        const [noticeRows] = await pool.query(
            'SELECT * FROM live_show_notice WHERE live_show_id = ? ORDER BY sort_order ASC, id ASC', [live.id]
        );
        notices = noticeRows.map(n => Object.assign({}, n, {
            visible_start_at_input: toLocalInput(n.visible_start_at),
            visible_end_at_input: toLocalInput(n.visible_end_at),
        }));

        /*
         * 연결할 수 있는 쿠폰 — 이 몰 쿠폰 + 전몰 공용(mall_id IS NULL).
         * 이미 연결된 것은 뺀다. 라이브는 쿠폰을 만들지 않는다. 연결만 한다(§4-3).
         */
        const [avail] = await pool.query(`
            SELECT c.id, c.name, c.code, c.issue_method, c.status, c.benefit_type,
                   c.discount_amount, c.discount_rate, c.valid_to
              FROM coupons c
             WHERE (c.mall_id = ? OR c.mall_id IS NULL)
               AND c.is_active = 1 AND c.status IN ('ACTIVE','DRAFT','PAUSED')
               AND c.id NOT IN (SELECT coupon_id FROM live_show_coupon WHERE live_show_id = ?)
             ORDER BY c.id DESC
             LIMIT 200
        `, [req.adminMallId || 1, live.id]);
        availableCoupons = avail;
    }

    res.render('admin/lives/edit', Object.assign({
        layout: 'layouts/admin_layout',
        title: isNew ? '쇼핑라이브 등록' : '쇼핑라이브 수정',
        subtitle: isNew ? null : live.title,
        live: Object.assign({}, live, {
            start_at_input: toLocalInput(live.start_at),
            end_at_input: toLocalInput(live.end_at),
            playerUrl: svc.embedUrl(live.provider, live.video_id),
        }),
        products,
        coupons,
        notices,
        availableCoupons,
        statuses: svc.STATUSES,
        providers: svc.PROVIDERS,
        productRoles: svc.PRODUCT_ROLES,
        noticeLevels: svc.NOTICE_LEVELS,
        noticeLocations: svc.NOTICE_LOCATIONS,
        endedPurchasePolicies: svc.ENDED_PURCHASE_POLICIES,
        endedAccessPolicies: svc.ENDED_ACCESS_POLICIES,
        saved: false,
        error: null,
    }, extra));
}

/** GET /admin/lives/add */
exports.getAdd = async (req, res) => {
    try {
        const now = new Date();
        const later = new Date(now.getTime() + 2 * 3600 * 1000);
        await renderForm(req, res, {
            id: null, title: '', slug: '', summary: '', description: '', notice: '',
            provider: 'YOUTUBE', video_id: null, replay_provider: null, replay_video_id: null,
            status: 'DRAFT',
            start_at: now, end_at: later,
            purchase_enabled: 1,
            ended_purchase_policy: 'DISALLOW',
            ended_access_policy: 'ALLOW',
            replay_enabled: 1,
            list_visible: 1, search_visible: 1, share_enabled: 1,
            view_count: 0,
            list_thumbnail_url: null, pc_hero_image_url: null, mobile_hero_image_url: null,
        });
    } catch (err) {
        console.error('[live] getAdd:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/lives/add */
exports.postAdd = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const fields = buildFields(req);
        const invalid = validate(fields);
        if (invalid) return redirectWith(res, `${BASE}/add`, 'error', invalid);

        const slug = await svc.ensureUniqueSlug(mallId, req.body.slug || fields.title);

        const images = {};
        IMAGE_FIELDS.forEach(({ field, column }) => { images[column] = resolveImage(req, field, null); });

        const cols = Object.keys(dbFields(fields)).concat(Object.keys(images));
        const vals = Object.values(dbFields(fields)).concat(Object.values(images));
        const [r] = await pool.query(
            `INSERT INTO live_show (mall_id, slug, ${cols.join(', ')})
             VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
            [mallId, slug, ...vals]
        );

        res.redirect(`${BASE}/${r.insertId}/edit?saved=1`);
    } catch (err) {
        console.error('[live] postAdd:', err.message);
        redirectWith(res, `${BASE}/add`, 'error', '저장 중 오류가 발생했습니다.');
    }
};

/** GET /admin/lives/:id/edit */
exports.getEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    try {
        const live = await findOwned(mallId, req.params.id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        await renderForm(req, res, live, {
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[live] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/lives/:id/edit */
exports.postEdit = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const current = await findOwned(mallId, id);
        if (!current) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        const fields = buildFields(req, current);

        /*
         * 영상 입력을 비운 채 저장하면 기존 영상을 유지한다.
         * 방송 중에 실수로 폼을 저장해 영상이 날아가는 사고를 막는다.
         * 영상을 정말 지우려면 `video_clear` 체크박스를 쓴다.
         */
        if (!fields.video_id && !req.body.video_clear) fields.video_id = current.video_id;
        if (!fields.replay_video_id && !req.body.replay_clear) {
            fields.replay_provider = current.replay_provider;
            fields.replay_video_id = current.replay_video_id;
        }

        const invalid = validate(fields);
        if (invalid) return redirectWith(res, back, 'error', invalid);

        const slug = await svc.ensureUniqueSlug(mallId, req.body.slug || fields.title, id);

        const images = {};
        IMAGE_FIELDS.forEach(({ field, column }) => { images[column] = resolveImage(req, field, current[column]); });

        const f = dbFields(fields);
        const assigns = Object.keys(f).concat(Object.keys(images)).map(k => `${k} = ?`);
        await pool.query(
            `UPDATE live_show SET slug = ?, ${assigns.join(', ')} WHERE id = ? AND mall_id = ?`,
            [slug, ...Object.values(f), ...Object.values(images), id, mallId]
        );

        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[live] postEdit:', err.message);
        redirectWith(res, back, 'error', '저장 중 오류가 발생했습니다.');
    }
};

/**
 * POST /admin/lives/:id/status — 상태만 바꾼다 (§3-1)
 *
 * 목록에서 방송 시작/종료를 한 번에 누를 수 있어야 한다. 폼 전체를 다시 저장하게 하면
 * 방송 중에 다른 값이 함께 바뀌는 사고가 난다.
 */
exports.postStatus = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = req.body.back === 'edit' ? `${BASE}/${id}/edit` : BASE;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        const status = svc.pick(svc.STATUSES, req.body.status, null);
        if (!status) return redirectWith(res, back, 'error', '알 수 없는 상태입니다.');

        if (status === 'ON_AIR' && !live.video_id) {
            return redirectWith(res, back, 'error', '방송 영상이 없어 방송 중으로 바꿀 수 없습니다.');
        }

        await pool.query('UPDATE live_show SET status = ? WHERE id = ? AND mall_id = ?', [status, id, mallId]);
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[live] postStatus:', err.message);
        redirectWith(res, back, 'error', '상태 변경 중 오류가 발생했습니다.');
    }
};

/** POST /admin/lives/:id/delete */
exports.postDelete = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        /*
         * 이 라이브에서 나온 주문이 있으면 지우지 않는다.
         * order_items.source_id 가 이 id 를 가리키고 있어, 지우면 CS 때 출처 추적이 끊긴다.
         * (order_items 에는 FK 가 없어 DB 가 막아주지 않는다 — 여기서 막는다)
         */
        const [[o]] = await pool.query(
            "SELECT COUNT(*) AS c FROM order_items WHERE source_type = 'LIVE_SHOW' AND source_id = ?", [id]
        );
        if (Number(o.c) > 0) {
            return redirectWith(res, BASE, 'error',
                `이 라이브에서 발생한 주문 ${o.c}건이 있어 삭제할 수 없습니다. 대신 '방송 취소' 또는 목록 숨김을 쓰세요.`);
        }

        // 하위 테이블(상품·쿠폰·공지)은 ON DELETE CASCADE 로 함께 지워진다.
        await pool.query('DELETE FROM live_show WHERE id = ? AND mall_id = ?', [id, mallId]);
        res.redirect(`${BASE}?saved=1`);
    } catch (err) {
        console.error('[live] postDelete:', err.message);
        redirectWith(res, BASE, 'error', '삭제 중 오류가 발생했습니다.');
    }
};

/* ── 상품 ────────────────────────────────────────────── */

/** POST /admin/lives/:id/products/add — 상품 담기 */
exports.postAddProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        const productId = Number.parseInt(req.body.product_id, 10);
        if (!Number.isFinite(productId)) return res.redirect(back);

        // 다른 몰 상품을 이 몰 라이브에 담지 못하게 한다(요청 위조 차단).
        const [[prod]] = await pool.query(
            'SELECT id, price, original_price FROM products WHERE id = ? AND mall_id = ?', [productId, mallId]
        );
        if (!prod) return redirectWith(res, back, 'error', '이 몰의 상품이 아닙니다.');

        // 첫 상품이 대표(MAIN). 대표는 1개뿐이므로 이미 있으면 RELATED 로 담는다.
        const [[mainRow]] = await pool.query(
            "SELECT COUNT(*) AS c FROM live_show_product WHERE live_show_id = ? AND role = 'MAIN'", [id]
        );
        const [[allRow]] = await pool.query(
            'SELECT COUNT(*) AS c FROM live_show_product WHERE live_show_id = ?', [id]
        );

        const normalPrice = Number(prod.original_price) || Number(prod.price) || 0;
        const livePrice = Number(prod.price) || 0;

        await pool.query(`
            INSERT INTO live_show_product
                (live_show_id, product_id, role, sort_order, normal_price, live_price, discount_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            id, productId,
            Number(mainRow.c) === 0 ? 'MAIN' : 'RELATED',
            Number(allRow.c) + 1,
            normalPrice || null,
            livePrice || null,
            svc.calcDiscountRate(normalPrice, livePrice),
        ]);

        res.redirect(`${back}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '이미 담긴 상품입니다.');
        }
        console.error('[live] postAddProduct:', err.message);
        redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '상품 추가 중 오류가 발생했습니다.');
    }
};

/**
 * POST /admin/lives/:id/products — 매핑 일괄 저장
 * 라이브가·수량 제한·노출·구매 여부를 한 번에 갱신한다. 할인율은 서버가 계산한다.
 */
exports.postSaveProducts = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;

    const conn = await pool.getConnection();
    try {
        const live = await findOwned(mallId, id);
        if (!live) { conn.release(); return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.'); }

        const raw = req.body.products;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];

        await conn.beginTransaction();

        let mainSeen = false;
        for (let i = 0; i < rows.length; i++) {
            const p = rows[i] || {};
            const mappingId = Number.parseInt(p.mapping_id, 10);
            if (!Number.isFinite(mappingId)) continue;

            // 대표 상품은 1개뿐이다. 두 번째부터는 RELATED 로 내린다(DB 로는 못 거는 제약).
            let role = p.role === 'MAIN' ? 'MAIN' : 'RELATED';
            if (role === 'MAIN') {
                if (mainSeen) role = 'RELATED';
                else mainSeen = true;
            }

            const normalPrice = toPositiveInt(p.normal_price);
            // 라이브가가 비면 상품 원가로 판다(NULL 허용). 공동구매와 다른 점이다.
            const livePrice = toPositiveInt(p.live_price);

            const minQty = toPositiveInt(p.min_order_quantity) || 1;
            const maxQty = toPositiveInt(p.max_order_quantity);
            // 최대가 최소보다 작으면 아무 수량도 못 산다. 최대를 없앤다.
            const safeMaxQty = (maxQty && maxQty < minQty) ? null : maxQty;

            await conn.query(`
                UPDATE live_show_product
                   SET role = ?, sort_order = ?, badge_text = ?,
                       normal_price = ?, live_price = ?, discount_rate = ?,
                       min_order_quantity = ?, max_order_quantity = ?, per_user_limit_quantity = ?,
                       purchase_enabled = ?, visible = ?
                 WHERE id = ? AND live_show_id = ?
            `, [
                role,
                Number.parseInt(p.sort_order, 10) || i + 1,
                String(p.badge_text || '').trim().slice(0, 100) || null,
                normalPrice,
                livePrice,
                svc.calcDiscountRate(normalPrice, livePrice),
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
        console.error('[live] postSaveProducts:', err.message);
        redirectWith(res, back, 'error', '상품 저장 중 오류가 발생했습니다.');
    } finally {
        conn.release();
    }
};

/** POST /admin/lives/:id/products/:mappingId/delete */
exports.postRemoveProduct = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        await pool.query('DELETE FROM live_show_product WHERE id = ? AND live_show_id = ?', [req.params.mappingId, id]);
        res.redirect(`${BASE}/${id}/edit?saved=1`);
    } catch (err) {
        console.error('[live] postRemoveProduct:', err.message);
        redirectWith(res, `${BASE}/${id}/edit`, 'error', '상품 삭제 중 오류가 발생했습니다.');
    }
};

/* ── 쿠폰 (연결만 한다 — §4-3) ───────────────────────── */

/** POST /admin/lives/:id/coupons/add */
exports.postAddCoupon = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        const couponId = Number.parseInt(req.body.coupon_id, 10);
        if (!Number.isFinite(couponId)) return res.redirect(back);

        // 이 몰 쿠폰이거나 전몰 공용(mall_id IS NULL)만 연결할 수 있다.
        const [[c]] = await pool.query(
            'SELECT id FROM coupons WHERE id = ? AND (mall_id = ? OR mall_id IS NULL)', [couponId, mallId]
        );
        if (!c) return redirectWith(res, back, 'error', '이 몰에서 쓸 수 없는 쿠폰입니다.');

        const [[cnt]] = await pool.query(
            'SELECT COUNT(*) AS c FROM live_show_coupon WHERE live_show_id = ?', [id]
        );

        await pool.query(
            'INSERT INTO live_show_coupon (live_show_id, coupon_id, is_primary, sort_order) VALUES (?, ?, ?, ?)',
            [id, couponId, Number(cnt.c) === 0 ? 1 : 0, Number(cnt.c) + 1]
        );
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '이미 연결된 쿠폰입니다.');
        }
        console.error('[live] postAddCoupon:', err.message);
        redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '쿠폰 연결 중 오류가 발생했습니다.');
    }
};

/** POST /admin/lives/:id/coupons — 대표·순서·활성 일괄 저장 */
exports.postSaveCoupons = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;

    const conn = await pool.getConnection();
    try {
        const live = await findOwned(mallId, id);
        if (!live) { conn.release(); return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.'); }

        const raw = req.body.coupons;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
        const primaryId = Number.parseInt(req.body.primary_mapping_id, 10);

        await conn.beginTransaction();
        for (let i = 0; i < rows.length; i++) {
            const c = rows[i] || {};
            const mappingId = Number.parseInt(c.mapping_id, 10);
            if (!Number.isFinite(mappingId)) continue;

            await conn.query(
                'UPDATE live_show_coupon SET is_primary = ?, sort_order = ?, is_active = ? WHERE id = ? AND live_show_id = ?',
                [mappingId === primaryId ? 1 : 0, Number.parseInt(c.sort_order, 10) || i + 1, c.is_active ? 1 : 0, mappingId, id]
            );
        }
        await conn.commit();
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[live] postSaveCoupons:', err.message);
        redirectWith(res, back, 'error', '쿠폰 저장 중 오류가 발생했습니다.');
    } finally {
        conn.release();
    }
};

/** POST /admin/lives/:id/coupons/:mappingId/delete */
exports.postRemoveCoupon = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        await pool.query('DELETE FROM live_show_coupon WHERE id = ? AND live_show_id = ?', [req.params.mappingId, id]);
        res.redirect(`${BASE}/${id}/edit?saved=1`);
    } catch (err) {
        console.error('[live] postRemoveCoupon:', err.message);
        redirectWith(res, `${BASE}/${id}/edit`, 'error', '쿠폰 해제 중 오류가 발생했습니다.');
    }
};

/* ── 공지 ────────────────────────────────────────────── */

/** POST /admin/lives/:id/notices/add */
exports.postAddNotice = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        const title = String(req.body.title || '').trim().slice(0, 200);
        const content = sanitize(String(req.body.content || ''));
        if (!title || !content) return redirectWith(res, back, 'error', '공지 제목과 내용을 입력하세요.');

        const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM live_show_notice WHERE live_show_id = ?', [id]);

        await pool.query(`
            INSERT INTO live_show_notice
                (live_show_id, title, content, notice_level, display_location,
                 visible_start_at, visible_end_at, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
            id, title, content,
            svc.pick(svc.NOTICE_LEVELS, req.body.notice_level, 'NORMAL'),
            svc.pick(svc.NOTICE_LOCATIONS, req.body.display_location, 'NOTICE_TAB'),
            toDateTime(req.body.visible_start_at),
            toDateTime(req.body.visible_end_at),
            Number(cnt.c) + 1,
        ]);
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        console.error('[live] postAddNotice:', err.message);
        redirectWith(res, `${BASE}/${req.params.id}/edit`, 'error', '공지 등록 중 오류가 발생했습니다.');
    }
};

/** POST /admin/lives/:id/notices — 일괄 저장 */
exports.postSaveNotices = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    const back = `${BASE}/${id}/edit`;

    const conn = await pool.getConnection();
    try {
        const live = await findOwned(mallId, id);
        if (!live) { conn.release(); return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.'); }

        const raw = req.body.notices;
        const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];

        await conn.beginTransaction();
        for (let i = 0; i < rows.length; i++) {
            const n = rows[i] || {};
            const noticeId = Number.parseInt(n.notice_id, 10);
            if (!Number.isFinite(noticeId)) continue;

            const title = String(n.title || '').trim().slice(0, 200);
            const content = sanitize(String(n.content || ''));
            if (!title || !content) continue;

            await conn.query(`
                UPDATE live_show_notice
                   SET title = ?, content = ?, notice_level = ?, display_location = ?,
                       visible_start_at = ?, visible_end_at = ?, sort_order = ?, is_active = ?
                 WHERE id = ? AND live_show_id = ?
            `, [
                title, content,
                svc.pick(svc.NOTICE_LEVELS, n.notice_level, 'NORMAL'),
                svc.pick(svc.NOTICE_LOCATIONS, n.display_location, 'NOTICE_TAB'),
                toDateTime(n.visible_start_at),
                toDateTime(n.visible_end_at),
                Number.parseInt(n.sort_order, 10) || i + 1,
                n.is_active ? 1 : 0,
                noticeId, id,
            ]);
        }
        await conn.commit();
        res.redirect(`${back}?saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[live] postSaveNotices:', err.message);
        redirectWith(res, back, 'error', '공지 저장 중 오류가 발생했습니다.');
    } finally {
        conn.release();
    }
};

/** POST /admin/lives/:id/notices/:noticeId/delete */
exports.postRemoveNotice = async (req, res) => {
    const mallId = req.adminMallId || 1;
    const id = req.params.id;
    try {
        const live = await findOwned(mallId, id);
        if (!live) return redirectWith(res, BASE, 'error', '라이브를 찾을 수 없습니다.');

        await pool.query('DELETE FROM live_show_notice WHERE id = ? AND live_show_id = ?', [req.params.noticeId, id]);
        res.redirect(`${BASE}/${id}/edit?saved=1`);
    } catch (err) {
        console.error('[live] postRemoveNotice:', err.message);
        redirectWith(res, `${BASE}/${id}/edit`, 'error', '공지 삭제 중 오류가 발생했습니다.');
    }
};

/* ── 검색 (모달) ─────────────────────────────────────── */

/** GET /admin/lives/product-search?q= */
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
        console.error('[live] getProductSearch:', err.message);
        res.status(500).json({ products: [] });
    }
};
