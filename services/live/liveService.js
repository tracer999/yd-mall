const pool = require('../../config/db');

/*
 * 쇼핑라이브 서비스 — 관리자·고객·주문 공용
 *
 * 설계: docs/사이트개선/live sales.md
 *
 * ── 본질 (§0) ─────────────────────────────────────────
 *   라이브 플랫폼이 아니다. "영상이 붙은 상품 판매 랜딩 페이지" 다.
 *   스트리밍은 YouTube/Vimeo 에 외주하고 우리는 상품·가격·쿠폰·공지·구매 동선만 만든다.
 *
 * ── 상태 (§3) ─────────────────────────────────────────
 *   status 는 **수동**이다. DRAFT | SCHEDULED | ON_AIR | ENDED | CANCELLED
 *   공동구매는 기간에서 phase 를 파생하지만, 라이브는 그러면 안 된다 —
 *   외부 URL 임베드 방식에서는 실제 방송 시작을 알 수 없기 때문이다.
 *   시간은 "곧 시작" 같은 **표시 보정**에만 쓴다. 코드가 status 를 바꾸지 않는다.
 *
 * ── 가격 (§5) ─────────────────────────────────────────
 *   프론트가 보낸 가격은 표시용이다. 결제 단가는 `resolveLine()` 이
 *   live_show_product.live_price 로 다시 계산한다.
 *
 * ── 영상 (§8) ─────────────────────────────────────────
 *   iframe HTML 을 저장하지 않는다. provider + video_id 만 저장하고
 *   embed URL 은 `embedUrl()` 이 조립한다. XSS 통로를 원천 차단한다.
 */

const STATUSES = [
    { value: 'DRAFT', label: '임시저장' },
    { value: 'SCHEDULED', label: '방송 예정' },
    { value: 'ON_AIR', label: '방송 중' },
    { value: 'ENDED', label: '방송 종료' },
    { value: 'CANCELLED', label: '방송 취소' },
];

/** 고객에게 보이는 상태 (DRAFT·CANCELLED 는 목록에서 빠진다) */
const PUBLIC_STATUSES = ['SCHEDULED', 'ON_AIR', 'ENDED'];

const ENDED_PURCHASE_POLICIES = [
    { value: 'DISALLOW', label: '구매 차단 (방송 중에만 판매)' },
    { value: 'ALLOW', label: '구매 허용 (라이브가 유지)' },
];

const ENDED_ACCESS_POLICIES = [
    { value: 'ALLOW', label: '접근 허용 (다시보기)' },
    { value: 'DISALLOW', label: '접근 차단 (404)' },
];

const PROVIDERS = [
    { value: 'YOUTUBE', label: 'YouTube' },
    { value: 'VIMEO', label: 'Vimeo' },
];

const PRODUCT_ROLES = [
    { value: 'MAIN', label: '대표 상품' },
    { value: 'RELATED', label: '함께 판매' },
];

const NOTICE_LEVELS = [
    { value: 'NORMAL', label: '일반' },
    { value: 'IMPORTANT', label: '중요' },
];

const NOTICE_LOCATIONS = [
    { value: 'NOTICE_TAB', label: '공지 탭' },
    { value: 'UNDER_VIDEO', label: '영상 아래 고정' },
    { value: 'BUY_PANEL', label: '구매 패널 하단' },
];

const STATUS_LABELS = STATUSES.reduce((m, s) => Object.assign(m, { [s.value]: s.label }), {});

/** 고객 목록 상태 필터 */
const LIST_FILTERS = [
    { value: 'all', label: '전체' },
    { value: 'ON_AIR', label: '방송 중' },
    { value: 'SCHEDULED', label: '방송 예정' },
    { value: 'ENDED', label: '지난 방송' },
];

const values = (defs) => defs.map(d => d.value);
const pick = (defs, v, fallback) => (values(defs).includes(String(v)) ? String(v) : fallback);

/* ── 영상 URL 파싱 · 검증 (§8-1) ─────────────────────── */

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];
const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_RE = /^\d{6,12}$/;

/**
 * 관리자가 넣은 값(URL 이든 video id 든)에서 video id 를 뽑는다.
 *
 * 허용 호스트가 아니거나 id 형식이 아니면 **거부**한다. iframe/script 가 섞여 들어오는
 * 경로를 막는 지점이 여기 하나다 — 저장 전에 반드시 통과시킬 것.
 *
 * @returns {{ ok: true, videoId: string }} 또는 {{ ok: false, reason: string }}
 */
function parseVideoId(provider, raw) {
    const input = String(raw || '').trim();
    if (!input) return { ok: false, reason: '영상 ID 또는 URL 을 입력하세요.' };

    // HTML 을 통째로 붙여넣은 경우를 먼저 걷어낸다.
    if (/[<>]/.test(input)) return { ok: false, reason: 'iframe/HTML 은 넣을 수 없습니다. 영상 URL 또는 ID 만 입력하세요.' };

    const p = String(provider || '').toUpperCase();
    if (!values(PROVIDERS).includes(p)) return { ok: false, reason: '지원하지 않는 영상 플랫폼입니다.' };

    const idRe = p === 'YOUTUBE' ? YOUTUBE_ID_RE : VIMEO_ID_RE;

    // 1) 순수 id 를 그대로 넣은 경우
    if (idRe.test(input)) return { ok: true, videoId: input };

    // 2) URL 인 경우 — 허용 호스트만 파싱한다
    let url;
    try {
        url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
        return { ok: false, reason: '영상 URL 형식이 아닙니다.' };
    }

    const host = url.hostname.toLowerCase();
    const allowed = p === 'YOUTUBE' ? YOUTUBE_HOSTS : VIMEO_HOSTS;
    if (!allowed.includes(host)) {
        return { ok: false, reason: `${p === 'YOUTUBE' ? 'YouTube' : 'Vimeo'} 주소가 아닙니다. (허용: ${allowed.slice(0, 3).join(', ')})` };
    }

    let candidate = '';
    if (p === 'YOUTUBE') {
        if (host.endsWith('youtu.be')) {
            candidate = url.pathname.split('/').filter(Boolean)[0] || '';
        } else if (url.searchParams.get('v')) {
            candidate = url.searchParams.get('v');
        } else {
            // /live/{id} · /embed/{id} · /shorts/{id}
            const parts = url.pathname.split('/').filter(Boolean);
            const keyed = parts.findIndex(s => ['live', 'embed', 'shorts', 'v'].includes(s));
            candidate = keyed >= 0 ? (parts[keyed + 1] || '') : '';
        }
    } else {
        // vimeo.com/{id} · player.vimeo.com/video/{id}
        const parts = url.pathname.split('/').filter(Boolean);
        candidate = parts[parts.length - 1] || '';
    }

    if (!idRe.test(candidate)) return { ok: false, reason: '영상 ID 를 찾지 못했습니다. 주소를 확인하세요.' };
    return { ok: true, videoId: candidate };
}

/**
 * 저장된 provider + video_id 로 embed URL 을 조립한다 (§8-2).
 * 화면은 이 함수가 만든 URL 만 iframe src 에 넣는다.
 */
function embedUrl(provider, videoId) {
    const id = String(videoId || '').trim();
    if (!id) return null;

    if (String(provider).toUpperCase() === 'VIMEO') {
        if (!VIMEO_ID_RE.test(id)) return null;
        return `https://player.vimeo.com/video/${id}?playsinline=1`;
    }
    if (!YOUTUBE_ID_RE.test(id)) return null;
    // enablejsapi 는 쓰지 않는다 — JS 로 제어할 게 없다.
    return `https://www.youtube.com/embed/${id}?autoplay=0&controls=1&playsinline=1&rel=0&modestbranding=1`;
}

/* ── 파생 계산 ───────────────────────────────────────── */

/** 할인율(%). 정상가가 없거나 더 싸면 0. */
function calcDiscountRate(normalPrice, livePrice) {
    const normal = Number(normalPrice) || 0;
    const live = Number(livePrice) || 0;
    if (normal <= 0 || live <= 0 || live >= normal) return 0;
    return Math.round(((normal - live) / normal) * 100);
}

/**
 * 목록·상세가 함께 쓰는 파생 필드.
 *
 * status 를 **바꾸지 않는다**. 시간은 표시 보정에만 쓴다(§3-1).
 *   startingSoon : 예정인데 시작 시각이 지났다 → "곧 시작합니다"
 *   overdue      : 방송 중인데 종료 시각이 지났다 → 관리자 목록에서 경고
 */
function decorate(row, now = new Date()) {
    if (!row) return row;

    const status = row.status;
    const start = row.start_at ? new Date(row.start_at) : null;
    const end = row.end_at ? new Date(row.end_at) : null;

    const purchasable = Boolean(row.purchase_enabled) && (
        status === 'ON_AIR'
        || (status === 'ENDED' && row.ended_purchase_policy === 'ALLOW')
    );

    const isReplay = status === 'ENDED' && Boolean(row.replay_enabled);
    const replayProvider = row.replay_provider || row.provider;
    const replayVideoId = row.replay_video_id || row.video_id;

    return Object.assign({}, row, {
        statusLabel: STATUS_LABELS[status] || status,
        detailPath: `/live/${encodeURIComponent(row.slug)}`,
        purchasable,
        isLive: status === 'ON_AIR',
        isReplay,
        // 화면에 실제로 박을 iframe src. 상태에 따라 방송용/다시보기용이 갈린다.
        playerUrl: status === 'ON_AIR'
            ? embedUrl(row.provider, row.video_id)
            : (isReplay ? embedUrl(replayProvider, replayVideoId) : null),
        startingSoon: status === 'SCHEDULED' && start ? now >= start : false,
        overdue: status === 'ON_AIR' && end ? now > end : false,
        startsAtMs: start ? start.getTime() : null,
        endsAtMs: end ? end.getTime() : null,
    });
}

/** slug 정규화. 한글은 남긴다(상세 URL 은 encodeURIComponent 로 감싼다). */
function normalizeSlug(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200);
}

/** (mall_id, slug) 유니크를 지키도록 접미사를 붙인다. */
async function ensureUniqueSlug(mallId, desired, excludeId = null) {
    let base = normalizeSlug(desired);
    if (!base) base = `live-${Date.now()}`;

    for (let i = 0; i < 50; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`.slice(0, 200);
        const [rows] = await pool.query(
            'SELECT id FROM live_show WHERE mall_id = ? AND slug = ? AND id <> ? LIMIT 1',
            [mallId, candidate, excludeId || 0]
        );
        if (!rows.length) return candidate;
    }
    return `${base}-${Date.now()}`.slice(0, 200);
}

/* ── 고객 읽기 경로 ──────────────────────────────────── */

/**
 * 대표 상품 한 건을 붙이는 서브셀렉트.
 * JOIN 으로 붙이면 상품을 아직 안 건 라이브가 목록에서 사라진다 → LEFT JOIN.
 */
const MAIN_PRODUCT_JOIN = `
    LEFT JOIN live_show_product lsp
           ON lsp.id = (SELECT x.id
                          FROM live_show_product x
                          JOIN products xp ON xp.id = x.product_id
                         WHERE x.live_show_id = l.id AND x.visible = 1
                           AND xp.visibility = 'PUBLIC' AND xp.status <> 'OFF'
                         ORDER BY x.role = 'MAIN' DESC, x.sort_order ASC, x.id ASC
                         LIMIT 1)
    LEFT JOIN products p ON p.id = lsp.product_id
`;

const MAIN_PRODUCT_COLS = `
    lsp.id               AS main_mapping_id,
    lsp.product_id       AS main_product_id,
    lsp.normal_price     AS main_normal_price,
    lsp.live_price       AS main_live_price,
    lsp.discount_rate    AS main_discount_rate,
    lsp.badge_text       AS main_badge_text,
    lsp.purchase_enabled AS main_purchase_enabled,
    p.name               AS main_product_name,
    p.main_image         AS main_product_image,
    p.price              AS main_product_price,
    p.slug               AS main_product_slug,
    p.stock              AS main_product_stock,
    p.status             AS main_product_status
`;

const PUBLIC_WHERE = `l.mall_id = ? AND l.status IN ('SCHEDULED','ON_AIR','ENDED') AND l.list_visible = 1`;

/** 고객에게 보일 라이브가 1건이라도 있는가 (0건 → 준비중 랜딩 폴백). */
async function hasAnyPublic(mallId) {
    const [[r]] = await pool.query(
        `SELECT COUNT(*) AS n FROM live_show l WHERE ${PUBLIC_WHERE}`,
        [mallId]
    );
    return r.n > 0;
}

/**
 * 고객 목록.
 * 기본 정렬은 "방송 중 → 예정 → 종료". 방송 중이 항상 맨 위여야 한다.
 */
const LIST_ORDER = `
    FIELD(l.status, 'ON_AIR', 'SCHEDULED', 'ENDED') ASC,
    CASE WHEN l.status = 'SCHEDULED' THEN l.start_at END ASC,
    CASE WHEN l.status <> 'SCHEDULED' THEN l.start_at END DESC,
    l.id DESC
`;

async function getPublicList(mallId, { filter = 'all', page = 1, limit = 12 } = {}) {
    const size = Math.min(Math.max(Number(limit) || 12, 1), 60);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;

    const f = pick(LIST_FILTERS, filter, 'all');
    const params = [mallId];
    let where = PUBLIC_WHERE;
    if (f !== 'all') {
        where += ' AND l.status = ?';
        params.push(f);
    }

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM live_show l WHERE ${where}`, params);
    const [rows] = await pool.query(`
        SELECT l.*, ${MAIN_PRODUCT_COLS}
          FROM live_show l
          ${MAIN_PRODUCT_JOIN}
         WHERE ${where}
         ORDER BY ${LIST_ORDER}
         LIMIT ? OFFSET ?
    `, params.concat([size, offset]));

    const now = new Date();
    const total = Number(countRow.total);
    return {
        items: rows.map(r => decorate(r, now)),
        total,
        page: Math.max(Number(page) || 1, 1),
        limit: size,
        totalPages: Math.max(Math.ceil(total / size), 1),
        filter: f,
    };
}

/** 방송 중인 라이브 (목록 히어로용) */
async function getOnAir(mallId, limit = 3) {
    const [rows] = await pool.query(`
        SELECT l.*, ${MAIN_PRODUCT_COLS}
          FROM live_show l
          ${MAIN_PRODUCT_JOIN}
         WHERE l.mall_id = ? AND l.status = 'ON_AIR' AND l.list_visible = 1
         ORDER BY l.start_at DESC
         LIMIT ?
    `, [mallId, Math.max(1, Number(limit) || 3)]);
    const now = new Date();
    return rows.map(r => decorate(r, now));
}

/** slug 로 조회. DRAFT·CANCELLED 는 고객에게 안 보인다(컨트롤러가 404). */
async function getPublicBySlug(mallId, slug) {
    const [[row]] = await pool.query(
        `SELECT * FROM live_show WHERE mall_id = ? AND slug = ? AND status IN ('SCHEDULED','ON_AIR','ENDED') LIMIT 1`,
        [mallId, String(slug)]
    );
    return row ? decorate(row) : null;
}

/** 라이브 판매 상품. 판매중지·비공개 상품은 감춘다(공동구매와 같은 규칙). */
async function getProducts(liveShowId, { publicOnly = true } = {}) {
    const [rows] = await pool.query(`
        SELECT lsp.*,
               p.name, p.provider, p.main_image, p.price AS product_price, p.original_price,
               p.stock, p.status AS product_status, p.slug AS product_slug
          FROM live_show_product lsp
          JOIN products p ON p.id = lsp.product_id
         WHERE lsp.live_show_id = ?
           ${publicOnly ? "AND lsp.visible = 1 AND p.visibility = 'PUBLIC' AND p.status <> 'OFF'" : ''}
         ORDER BY lsp.role = 'MAIN' DESC, lsp.sort_order ASC, lsp.id ASC
    `, [liveShowId]);

    return rows.map(r => {
        const normal = Number(r.normal_price) || Number(r.product_price) || 0;
        const sale = Number(r.live_price) || Number(r.product_price) || 0;
        return Object.assign({}, r, {
            effectiveNormalPrice: normal,
            effectiveSalePrice: sale,
            effectiveDiscountRate: Number(r.discount_rate) || calcDiscountRate(normal, sale),
            soldOut: r.product_status === 'SOLD_OUT' || Number(r.stock) <= 0,
        });
    });
}

/**
 * 연결 쿠폰. 다운로드 여부까지 붙여서 준다.
 *
 * 쿠폰 엔진은 재사용한다 — 다운로드는 기존 POST /coupon/:id/claim 이 처리한다(§4-3).
 * 여기서는 "받을 수 있는가 / 이미 받았는가" 만 판정한다.
 */
async function getCoupons(liveShowId, userId = null) {
    const [rows] = await pool.query(`
        SELECT lsc.id AS mapping_id, lsc.is_primary, lsc.sort_order,
               c.*,
               ${userId ? 'cd.created_at AS downloaded_at' : 'NULL AS downloaded_at'}
          FROM live_show_coupon lsc
          JOIN coupons c ON c.id = lsc.coupon_id
          ${userId ? 'LEFT JOIN coupon_download cd ON cd.coupon_id = c.id AND cd.user_id = ?' : ''}
         WHERE lsc.live_show_id = ? AND lsc.is_active = 1
           AND c.is_active = 1 AND c.status = 'ACTIVE'
         ORDER BY lsc.is_primary DESC, lsc.sort_order ASC, lsc.id ASC
    `, userId ? [userId, liveShowId] : [liveShowId]);

    const now = new Date();
    return rows.map(c => {
        const downloadOpen = (!c.download_start_at || new Date(c.download_start_at) <= now)
            && (!c.download_end_at || new Date(c.download_end_at) >= now);
        const soldOut = c.issue_limit != null && Number(c.issued_count) >= Number(c.issue_limit);
        return Object.assign({}, c, {
            downloaded: Boolean(c.downloaded_at),
            // 'DOWNLOAD' 발급이 아닌 쿠폰(자동가입·관리자지급)은 받기 버튼을 띄우지 않는다.
            claimable: c.issue_method === 'DOWNLOAD' && downloadOpen && !soldOut,
            exhausted: soldOut,
        });
    });
}

/** 방송 공지. 노출 기간이 지난 것은 뺀다. */
async function getNotices(liveShowId, { location = null } = {}) {
    const params = [liveShowId];
    let extra = '';
    if (location) {
        extra = 'AND n.display_location = ?';
        params.push(location);
    }
    const [rows] = await pool.query(`
        SELECT n.* FROM live_show_notice n
         WHERE n.live_show_id = ? AND n.is_active = 1 ${extra}
           AND (n.visible_start_at IS NULL OR n.visible_start_at <= NOW())
           AND (n.visible_end_at   IS NULL OR n.visible_end_at   >= NOW())
         ORDER BY n.notice_level = 'IMPORTANT' DESC, n.sort_order ASC, n.id ASC
    `, params);
    return rows;
}

/** 다른 라이브 (상세 하단) */
async function getRelated(mallId, excludeId, limit = 4) {
    const [rows] = await pool.query(`
        SELECT l.*, ${MAIN_PRODUCT_COLS}
          FROM live_show l
          ${MAIN_PRODUCT_JOIN}
         WHERE ${PUBLIC_WHERE} AND l.id <> ?
         ORDER BY ${LIST_ORDER}
         LIMIT ?
    `, [mallId, Number(excludeId), Math.max(1, Number(limit) || 4)]);
    const now = new Date();
    return rows.map(r => decorate(r, now));
}

/** 조회수 +1. 실패해도 화면은 떠야 하므로 호출부가 await 하지 않는다. */
async function incrementViewCount(mallId, id) {
    try {
        await pool.query('UPDATE live_show SET view_count = view_count + 1 WHERE id = ? AND mall_id = ?', [id, mallId]);
    } catch (err) {
        console.warn('[live] view_count 증가 실패:', err.message);
    }
}

/* ── 주문 연동 (§5) ──────────────────────────────────── */

/**
 * 라이브 구매 가능 여부 + 결제 단가를 서버가 확정한다.
 *
 * checkoutController 가 폼/주문 생성 양쪽에서 이 함수 하나만 부른다.
 * 프론트가 보낸 price 는 절대 신뢰하지 않는다.
 *
 * @returns {{ ok:true, liveShow, product, unitPrice, quantity }}
 *          | {{ ok:false, reason:string, slug:string|null }}
 *          reason: notfound|closed|disabled|soldout|min|max|stock
 */
async function resolveLine(mallId, liveShowId, productId, rawQuantity) {
    const fail = (reason, slug = null, extra = {}) => Object.assign({ ok: false, reason, slug }, extra);

    const id = Number.parseInt(liveShowId, 10);
    const pid = Number.parseInt(productId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(pid)) return fail('notfound');

    const [[ls]] = await pool.query(
        `SELECT * FROM live_show WHERE id = ? AND mall_id = ? AND status IN ('ON_AIR','ENDED') LIMIT 1`,
        [id, mallId]
    );
    if (!ls) return fail('notfound');

    const liveShow = decorate(ls);
    const slug = liveShow.slug;
    // ON_AIR 이거나, ENDED + ended_purchase_policy='ALLOW' 일 때만 산다.
    if (!liveShow.purchasable) return fail('closed', slug);

    const [[row]] = await pool.query(`
        SELECT lsp.*, p.name, p.price AS product_price, p.stock,
               p.status AS product_status, p.slug AS product_slug
          FROM live_show_product lsp
          JOIN products p ON p.id = lsp.product_id
         WHERE lsp.live_show_id = ? AND lsp.product_id = ?
           AND lsp.visible = 1 AND p.mall_id = ?
           AND p.visibility = 'PUBLIC'
         LIMIT 1
    `, [id, pid, mallId]);
    if (!row) return fail('notfound', slug);
    if (!row.purchase_enabled) return fail('disabled', slug);
    if (row.product_status !== 'ON') return fail('soldout', slug);

    const stock = Number(row.stock) > 0 ? Number(row.stock) : 0;
    if (stock <= 0) return fail('soldout', slug);

    const qty = Math.max(1, Number.parseInt(rawQuantity, 10) || 1);
    const min = Number(row.min_order_quantity) || 1;
    const max = Number(row.max_order_quantity) || null;
    if (qty < min) return fail('min', slug, { min });
    if (max && qty > max) return fail('max', slug, { max });
    if (qty > stock) return fail('stock', slug, { stock });

    // 라이브가가 없으면 상품 원가로 판다. 폼이 보낸 금액은 쓰지 않는다.
    const unitPrice = Number(row.live_price) || Number(row.product_price) || 0;
    if (unitPrice <= 0) return fail('disabled', slug);

    return { ok: true, liveShow, product: row, unitPrice, quantity: qty };
}

module.exports = {
    STATUSES,
    PUBLIC_STATUSES,
    ENDED_PURCHASE_POLICIES,
    ENDED_ACCESS_POLICIES,
    PROVIDERS,
    PRODUCT_ROLES,
    NOTICE_LEVELS,
    NOTICE_LOCATIONS,
    STATUS_LABELS,
    LIST_FILTERS,
    values,
    pick,
    parseVideoId,
    embedUrl,
    calcDiscountRate,
    decorate,
    normalizeSlug,
    ensureUniqueSlug,
    hasAnyPublic,
    getPublicList,
    getOnAir,
    getPublicBySlug,
    getProducts,
    getCoupons,
    getNotices,
    getRelated,
    incrementViewCount,
    resolveLine,
};
