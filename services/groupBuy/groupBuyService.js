const pool = require('../../config/db');
const { sellableStockSql } = require('../catalog/sellableStock');

/*
 * 공동구매 서비스 — 관리자·고객·주문 공용
 *
 * 설계: docs/사이트개선/group_buy_design_and_development.md
 *
 * ── 1차 범위 (§13) ────────────────────────────────────
 *   단순 공동구매형. 사용자는 공동구매가로 즉시 결제하고 일반 주문이 만들어진다.
 *   목표 달성형(결제 보류·미달 환불)과 단계별 가격형은 2·3차다.
 *
 * ── 상태 모델 (§3) ────────────────────────────────────
 *   group_buy.status  운영자가 정하는 상태 : DRAFT | PUBLISHED | HIDDEN
 *   phase                                  : start_at·end_at 에서 **파생**. 컬럼이 없다.
 *                                            SCHEDULED | ACTIVE | CLOSING | ENDED
 *
 * 기간과 상태를 둘 다 저장하면 반드시 어긋난다. status 는 "발행했는가",
 * phase 는 "지금 어느 구간인가" 로 책임이 갈린다.
 *
 * ── 가격 (§9-2) ───────────────────────────────────────
 *   프론트가 보낸 가격은 표시용이다. 결제 금액은 반드시 `resolveLine()` 이
 *   group_buy_product.group_buy_price 로 다시 계산한다.
 */

const STATUSES = [
    { value: 'DRAFT', label: '임시저장' },
    { value: 'PUBLISHED', label: '발행' },
    { value: 'HIDDEN', label: '숨김' },
];

const ENDED_PURCHASE_POLICIES = [
    { value: 'DISALLOW', label: '구매 차단' },
    { value: 'ALLOW', label: '구매 허용(일반가 아님, 공동구매가 유지)' },
];

const PHASE_LABELS = {
    SCHEDULED: '예정',
    ACTIVE: '진행중',
    CLOSING: '마감임박',
    ENDED: '종료',
};

/** 고객 목록 상태 필터 (§2-1) */
const LIST_PHASES = [
    { value: 'all', label: '전체' },
    { value: 'ACTIVE', label: '진행중' },
    { value: 'CLOSING', label: '마감임박' },
    { value: 'SCHEDULED', label: '예정' },
    { value: 'ENDED', label: '종료' },
];

/** 고객 목록 정렬 (§2-1) */
const LIST_SORTS = [
    { value: 'ending_soon', label: '마감임박순' },
    { value: 'popular', label: '인기순' },
    { value: 'participants', label: '참여자순' },
    { value: 'discount', label: '할인율순' },
    { value: 'latest', label: '최신순' },
];

const values = (defs) => defs.map(d => d.value);
const pick = (defs, v, fallback) => (values(defs).includes(String(v)) ? String(v) : fallback);

/* ── 파생 계산 ───────────────────────────────────────── */

/**
 * 기간에서 phase 를 파생한다. 저장하지 않는다.
 * CLOSING 은 ACTIVE 의 부분집합 — 종료 `closing_hours` 시간 전부터.
 */
function derivePhase(row, now = new Date()) {
    if (!row || !row.start_at || !row.end_at) return 'ACTIVE';
    const start = new Date(row.start_at);
    const end = new Date(row.end_at);
    if (now < start) return 'SCHEDULED';
    if (now > end) return 'ENDED';

    const closingHours = Number(row.closing_hours) || 24;
    const msLeft = end.getTime() - now.getTime();
    return msLeft <= closingHours * 3600 * 1000 ? 'CLOSING' : 'ACTIVE';
}

/** 할인율(%). 정상가가 없거나 더 싸면 0. */
function calcDiscountRate(normalPrice, groupBuyPrice) {
    const normal = Number(normalPrice) || 0;
    const gb = Number(groupBuyPrice) || 0;
    if (normal <= 0 || gb <= 0 || gb >= normal) return 0;
    return Math.round(((normal - gb) / normal) * 100);
}

/** 목록·상세가 함께 쓰는 파생 필드를 붙인다. */
function decorate(row, now = new Date()) {
    if (!row) return row;
    const phase = derivePhase(row, now);
    const purchasable = phase === 'ACTIVE' || phase === 'CLOSING'
        || (phase === 'ENDED' && row.ended_purchase_policy === 'ALLOW');

    const target = Number(row.target_quantity) || 0;
    const current = Number(row.current_quantity) || 0;

    return Object.assign({}, row, {
        phase,
        phaseLabel: PHASE_LABELS[phase],
        detailPath: `/group-buy/${encodeURIComponent(row.slug)}`,
        purchasable,
        // 진행률은 100% 를 넘겨 표시하지 않는다(막대가 넘친다). 실제 수량은 따로 보여준다.
        progressRate: (row.target_enabled && target > 0)
            ? Math.min(100, Math.round((current / target) * 100))
            : null,
        targetReached: Boolean(row.target_enabled && target > 0 && current >= target),
        // 남은 시간은 클라이언트 타이머가 매초 다시 그린다. 서버는 기준 시각만 준다.
        endsAtMs: row.end_at ? new Date(row.end_at).getTime() : null,
    });
}

/**
 * slug 정규화. 한글은 남긴다(상세 URL 은 encodeURIComponent 로 감싼다).
 * 결과가 비면 호출부가 폴백 slug 를 만든다.
 */
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
    if (!base) base = `group-buy-${Date.now()}`;

    for (let i = 0; i < 50; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`.slice(0, 200);
        const [rows] = await pool.query(
            'SELECT id FROM group_buy WHERE mall_id = ? AND slug = ? AND id <> ? LIMIT 1',
            [mallId, candidate, excludeId || 0]
        );
        if (!rows.length) return candidate;
    }
    return `${base}-${Date.now()}`.slice(0, 200);
}

/* ── 고객 읽기 경로 ──────────────────────────────────── */

/**
 * phase 필터를 SQL 조건으로. phase 는 컬럼이 아니라 기간 식이라 여기서 조립한다.
 * CLOSING 은 "진행중이면서 종료까지 closing_hours 이하" 다.
 */
function phaseClause(phase) {
    switch (phase) {
        case 'SCHEDULED':
            return 'AND g.start_at > NOW()';
        case 'ENDED':
            return 'AND g.end_at < NOW()';
        case 'CLOSING':
            return `AND g.start_at <= NOW() AND g.end_at >= NOW()
                    AND g.end_at <= DATE_ADD(NOW(), INTERVAL g.closing_hours HOUR)`;
        case 'ACTIVE':
            // 목록 필터의 '진행중' 은 마감임박을 포함한다(사용자에겐 둘 다 진행중이다).
            return 'AND g.start_at <= NOW() AND g.end_at >= NOW()';
        default:
            return '';
    }
}

const LIST_ORDER = {
    // 종료된 건 뒤로, 그 안에서 마감 가까운 순.
    ending_soon: 'g.end_at < NOW() ASC, g.end_at ASC, g.id DESC',
    popular: 'g.view_count DESC, g.id DESC',
    participants: 'g.participant_count DESC, g.id DESC',
    discount: 'main_discount_rate DESC, g.id DESC',
    latest: 'g.start_at DESC, g.id DESC',
};

/**
 * 대표 상품(role='MAIN') 한 건을 붙이는 서브셀렉트.
 *
 * JOIN 으로 붙이면 대표 상품이 없는 공동구매가 목록에서 사라진다. 관리자가 상품을
 * 연결하기 전에 발행할 수 있으므로, LEFT JOIN 으로 붙이고 뷰에서 방어한다.
 */
const MAIN_PRODUCT_JOIN = `
    LEFT JOIN group_buy_product gbp
           ON gbp.id = (SELECT gp.id
                          FROM group_buy_product gp
                          JOIN products pp ON pp.id = gp.product_id
                         WHERE gp.group_buy_id = g.id AND gp.visible = 1
                           AND pp.visibility = 'PUBLIC' AND pp.status <> 'OFF'
                         ORDER BY gp.role = 'MAIN' DESC, gp.sort_order ASC, gp.id ASC
                         LIMIT 1)
    LEFT JOIN products p ON p.id = gbp.product_id
`;

const MAIN_PRODUCT_COLS = `
    gbp.id              AS main_mapping_id,
    gbp.product_id      AS main_product_id,
    gbp.normal_price    AS main_normal_price,
    gbp.group_buy_price AS main_group_buy_price,
    gbp.discount_rate   AS main_discount_rate,
    gbp.purchase_enabled AS main_purchase_enabled,
    p.name              AS main_product_name,
    p.main_image        AS main_product_image,
    p.price             AS main_product_price,
    p.slug              AS main_product_slug,
    ${sellableStockSql('p')} AS main_product_stock,
    p.status            AS main_product_status
`;

/** 발행 + 목록노출 인 공동구매가 1건이라도 있는가 (0건 폴백 판정용). */
async function hasAnyPublic(mallId) {
    const [[r]] = await pool.query(
        "SELECT COUNT(*) AS n FROM group_buy WHERE mall_id = ? AND status = 'PUBLISHED' AND list_visible = 1",
        [mallId]
    );
    return r.n > 0;
}

/** 고객 목록 (§2-1). 예정·종료도 남기고 배지로 구분한다. */
async function getPublicList(mallId, { phase = 'all', sort = 'ending_soon', page = 1, limit = 12 } = {}) {
    const order = LIST_ORDER[sort] || LIST_ORDER.ending_soon;
    const size = Math.min(Math.max(Number(limit) || 12, 1), 60);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;

    const where = `g.mall_id = ? AND g.status = 'PUBLISHED' AND g.list_visible = 1 ${phaseClause(phase)}`;

    const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM group_buy g WHERE ${where}`, [mallId]
    );
    const [rows] = await pool.query(`
        SELECT g.*, ${MAIN_PRODUCT_COLS}
          FROM group_buy g
          ${MAIN_PRODUCT_JOIN}
         WHERE ${where}
         ORDER BY ${order}
         LIMIT ? OFFSET ?
    `, [mallId, size, offset]);

    const now = new Date();
    const total = Number(countRow.total);
    return {
        items: rows.map(r => decorate(r, now)),
        total,
        page: Math.max(Number(page) || 1, 1),
        limit: size,
        totalPages: Math.max(Math.ceil(total / size), 1),
    };
}

/** slug 로 발행 공동구매 조회. 몰 스코프 유니크이므로 mall_id 가 반드시 붙는다. */
async function getPublicBySlug(mallId, slug) {
    const [[row]] = await pool.query(
        "SELECT * FROM group_buy WHERE mall_id = ? AND slug = ? AND status = 'PUBLISHED' LIMIT 1",
        [mallId, String(slug)]
    );
    return row ? decorate(row) : null;
}

/** id → slug 301 리다이렉트용. 커스텀 메뉴가 숫자 id 를 들고 있을 때. */
async function getPublicSlugById(mallId, id) {
    const [[row]] = await pool.query(
        "SELECT slug FROM group_buy WHERE mall_id = ? AND id = ? AND status = 'PUBLISHED' LIMIT 1",
        [mallId, Number(id)]
    );
    return row ? row.slug : null;
}

/** 공동구매 대상 상품. 판매중지·비공개 상품은 감춘다(기획전과 같은 규칙). */
async function getProducts(groupBuyId, { publicOnly = true } = {}) {
    const [rows] = await pool.query(`
        SELECT gbp.*,
               p.name, p.provider, p.main_image, p.price AS product_price, p.original_price,
               ${sellableStockSql('p')} AS stock, p.status AS product_status, p.slug AS product_slug,
               p.description AS product_description
          FROM group_buy_product gbp
          JOIN products p ON p.id = gbp.product_id
         WHERE gbp.group_buy_id = ?
           ${publicOnly ? "AND gbp.visible = 1 AND p.visibility = 'PUBLIC' AND p.status <> 'OFF'" : ''}
         ORDER BY gbp.role = 'MAIN' DESC, gbp.sort_order ASC, gbp.id ASC
    `, [groupBuyId]);

    return rows.map(r => Object.assign({}, r, {
        // 정상가를 안 넣었으면 상품가를 비교 기준으로 쓴다.
        effectiveNormalPrice: Number(r.normal_price) || Number(r.product_price) || 0,
        soldOut: r.product_status === 'SOLD_OUT' || Number(r.stock) <= 0,
    }));
}

/** 같은 몰의 다른 진행중 공동구매 (§2-3 관련 공동구매) */
async function getRelated(mallId, excludeId, limit = 4) {
    const [rows] = await pool.query(`
        SELECT g.*, ${MAIN_PRODUCT_COLS}
          FROM group_buy g
          ${MAIN_PRODUCT_JOIN}
         WHERE g.mall_id = ? AND g.status = 'PUBLISHED' AND g.list_visible = 1
           AND g.id <> ? AND g.start_at <= NOW() AND g.end_at >= NOW()
         ORDER BY g.end_at ASC
         LIMIT ?
    `, [mallId, Number(excludeId), Math.max(1, Number(limit) || 4)]);

    const now = new Date();
    return rows.map(r => decorate(r, now));
}

/** 조회수 +1. 실패해도 화면은 떠야 하므로 호출부에서 await 하지 않는다. */
async function incrementViewCount(mallId, id) {
    try {
        await pool.query('UPDATE group_buy SET view_count = view_count + 1 WHERE id = ? AND mall_id = ?', [id, mallId]);
    } catch (err) {
        console.warn('[group-buy] view_count 증가 실패:', err.message);
    }
}

/* ── 주문 연동 (§9) ──────────────────────────────────── */

/**
 * 공동구매 구매 가능 여부 + 결제 단가를 서버가 확정한다 (§9-2).
 *
 * checkoutController 가 폼/주문 생성 양쪽에서 이 함수 하나만 부른다.
 * 프론트가 보낸 price 는 절대 신뢰하지 않는다.
 *
 * 실패해도 `slug` 를 함께 돌려준다 — 호출부가 사용자를 원래 상세로 되돌려야 하는데,
 * 공동구매를 못 찾은 경우가 아니면 slug 는 알고 있기 때문이다.
 *
 * @returns {{ ok: true, groupBuy, product, unitPrice, quantity }} 또는
 *          {{ ok: false, reason: string, slug: string|null }}
 *          reason: notfound|closed|disabled|soldout|min|max|stock
 */
async function resolveLine(mallId, groupBuyId, productId, rawQuantity) {
    const fail = (reason, slug = null, extra = {}) => Object.assign({ ok: false, reason, slug }, extra);

    const id = Number.parseInt(groupBuyId, 10);
    const pid = Number.parseInt(productId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(pid)) return fail('notfound');

    const [[gb]] = await pool.query(
        "SELECT * FROM group_buy WHERE id = ? AND mall_id = ? AND status = 'PUBLISHED' LIMIT 1",
        [id, mallId]
    );
    if (!gb) return fail('notfound');

    const groupBuy = decorate(gb);
    const slug = groupBuy.slug;
    if (!groupBuy.purchasable) return fail('closed', slug);

    const [[row]] = await pool.query(`
        SELECT gbp.*, p.name, ${sellableStockSql('p')} AS stock, p.status AS product_status, p.slug AS product_slug
          FROM group_buy_product gbp
          JOIN products p ON p.id = gbp.product_id
         WHERE gbp.group_buy_id = ? AND gbp.product_id = ?
           AND gbp.visible = 1 AND p.mall_id = ?
           AND p.visibility = 'PUBLIC'
         LIMIT 1
    `, [id, pid, mallId]);
    if (!row) return fail('notfound', slug);
    if (!row.purchase_enabled) return fail('disabled', slug);
    // 상품 상태는 일반 구매(status='ON')와 같은 기준으로 막는다.
    if (row.product_status !== 'ON') return fail('soldout', slug);

    const stock = Number(row.stock) > 0 ? Number(row.stock) : 0;
    if (stock <= 0) return fail('soldout', slug);

    const qty = Math.max(1, Number.parseInt(rawQuantity, 10) || 1);
    const min = Number(row.min_order_quantity) || 1;
    const max = Number(row.max_order_quantity) || null;
    if (qty < min) return fail('min', slug, { min });
    if (max && qty > max) return fail('max', slug, { max });
    if (qty > stock) return fail('stock', slug, { stock });

    return {
        ok: true,
        groupBuy,
        product: row,
        unitPrice: Number(row.group_buy_price),
        quantity: qty,
    };
}

/**
 * 결제 확정된 주문에서 공동구매 참여를 기록한다 (§9-1).
 *
 * checkoutController.completeOrderWithStockAndPaid 의 트랜잭션 안에서 호출한다.
 * 그래야 "결제는 됐는데 참여 수량이 안 올라간" 상태가 생기지 않는다.
 *
 * 재실행 안전: `uk_gb_participation_order_item` 이 있고 INSERT IGNORE 를 쓴다.
 * 참여 카운터는 실제로 INSERT 된 행에 대해서만 올린다(affectedRows 로 판정).
 *
 * @param {import('mysql2/promise').PoolConnection} conn 진행 중인 트랜잭션 커넥션
 * @param {number} orderId
 */
async function recordParticipation(conn, orderId) {
    const [items] = await conn.query(
        `SELECT id, product_id, quantity, product_price, source_id
           FROM order_items
          WHERE order_id = ? AND source_type = 'GROUP_BUY' AND source_id IS NOT NULL`,
        [orderId]
    );
    if (!items.length) return 0;

    const [[order]] = await conn.query('SELECT user_id FROM orders WHERE id = ?', [orderId]);
    const userId = (order && order.user_id) || null;

    let recorded = 0;
    for (const item of items) {
        const [r] = await conn.query(
            `INSERT IGNORE INTO group_buy_participation
                (group_buy_id, user_id, order_id, order_item_id, product_id, quantity, unit_price, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PAID')`,
            [item.source_id, userId, orderId, item.id, item.product_id, item.quantity, item.product_price]
        );
        // INSERT IGNORE 가 유니크 충돌로 건너뛰면 affectedRows = 0. 이미 센 주문이므로 다시 세지 않는다.
        if (!r.affectedRows) continue;

        await conn.query(
            'UPDATE group_buy SET current_quantity = current_quantity + ?, participant_count = participant_count + 1 WHERE id = ?',
            [item.quantity, item.source_id]
        );
        recorded += 1;
    }
    return recorded;
}

module.exports = {
    STATUSES,
    ENDED_PURCHASE_POLICIES,
    PHASE_LABELS,
    LIST_PHASES,
    LIST_SORTS,
    values,
    pick,
    derivePhase,
    calcDiscountRate,
    decorate,
    normalizeSlug,
    ensureUniqueSlug,
    hasAnyPublic,
    getPublicList,
    getPublicBySlug,
    getPublicSlugById,
    getProducts,
    getRelated,
    incrementViewCount,
    resolveLine,
    recordParticipation,
};
