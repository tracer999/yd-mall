const pool = require('../../config/db');
const dealSvc = require('../deal/dealService');

/*
 * 기획전 서비스 — 관리자·고객 공용 읽기 경로
 *
 * 설계: docs/사이트개선/exhibition_design_and_development.md
 *
 * ── 상태 모델 (§7-1) ──────────────────────────────────
 *   exhibition.status  운영자가 정하는 상태 : DRAFT | PUBLISHED | HIDDEN
 *   phase(예정/진행중/종료)                 : start_at·end_at 에서 **파생**. 컬럼이 없다.
 *
 * 기간과 상태를 둘 다 저장하면 반드시 어긋난다. status 는 "발행했는가",
 * phase 는 "지금 기간 안인가" 로 책임이 갈린다.
 *
 * ── 고객 노출 규칙 ────────────────────────────────────
 *   목록 : status='PUBLISHED' AND list_visible=1
 *          (예정·종료 기획전도 목록에 남기고 배지로만 구분한다. 상태 필터는 2차)
 *   상세 : status='PUBLISHED'
 *          종료 + ended_access_policy='BLOCK' 이면 접근 차단
 *
 * 모든 쿼리는 몰 스코프다(§8-3). slug 는 (mall_id, slug) 유니크이므로
 * slug 만으로는 행이 특정되지 않는다.
 */

const STATUSES = [
    { value: 'DRAFT', label: '임시저장' },
    { value: 'PUBLISHED', label: '발행' },
    { value: 'HIDDEN', label: '숨김' },
];

/*
 * exhibition_type. 'SPECIALTY'(전문관)만 성격이 다르다 —
 * 나머지는 기간이 있는 행사고, 전문관은 종료일 없이 상시 운영되는 매장이다.
 * 그래서 목록이 갈린다(/exhibition 은 제외, /specialty 는 이것만).
 * 설계: docs/사이트개선/recommend_specialty_design_and_development.md §5
 */
const SPECIALTY_TYPE = 'SPECIALTY';

const TYPES = [
    { value: 'THEME', label: '테마' },
    { value: 'BRAND', label: '브랜드' },
    { value: 'SEASON', label: '시즌' },
    { value: 'CATEGORY', label: '카테고리' },
    { value: 'COLLAB', label: '콜라보' },
    { value: 'BROADCAST', label: '방송연계' },
    { value: SPECIALTY_TYPE, label: '전문관 (상시 · 종료일 비움)' },
];

/** 1차는 TAB_SHOP 만 전용 렌더를 갖는다. 나머지는 TAB_SHOP 으로 폴백(2차에서 구현). */
const TEMPLATES = [
    { value: 'TAB_SHOP', label: '기본 탭형' },
    { value: 'STORY', label: '이미지 스토리형 (2차)' },
    { value: 'CATEGORY_SHOP', label: '카테고리 매장형 (2차)' },
    { value: 'BRAND_SHOP', label: '브랜드관형 (2차)' },
];

const SECTION_TYPES = [
    { value: 'PRODUCT_GRID', label: '상품 그리드' },
    { value: 'PRODUCT_CAROUSEL', label: '상품 캐러셀' },
    { value: 'HTML', label: '자유 HTML' },
];

const ENDED_ACCESS_POLICIES = [
    { value: 'ALLOW', label: '접근 허용' },
    { value: 'NOTICE', label: '종료 안내 표시' },
    { value: 'BLOCK', label: '접근 차단' },
];

const ENDED_PURCHASE_POLICIES = [
    { value: 'ALLOW', label: '구매 허용' },
    { value: 'BLOCK', label: '구매 차단' },
];

const PHASE_LABELS = { UPCOMING: '예정', ONGOING: '진행중', ENDED: '종료' };

const LIST_SORTS = [
    { value: 'latest', label: '최신순' },
    { value: 'ending_soon', label: '종료임박순' },
    { value: 'popular', label: '인기순' },
];

const values = (defs) => defs.map(d => d.value);
const pick = (defs, v, fallback) => (values(defs).includes(String(v)) ? String(v) : fallback);

/** 기간에서 노출 상태를 파생한다. 저장하지 않는다. */
function derivePhase(row, now = new Date()) {
    if (!row || !row.start_at) return 'ONGOING';
    const start = new Date(row.start_at);
    if (now < start) return 'UPCOMING';
    if (row.end_at && now > new Date(row.end_at)) return 'ENDED';
    return 'ONGOING';
}

/** 목록·상세 렌더가 함께 쓰는 파생 필드를 붙인다. */
function decorate(row, now = new Date()) {
    if (!row) return row;
    const phase = derivePhase(row, now);
    const isSpecialty = row.exhibition_type === SPECIALTY_TYPE;
    return Object.assign({}, row, {
        phase,
        phaseLabel: PHASE_LABELS[phase],
        isSpecialty,
        /*
         * 정규 URL 은 유형에서 파생한다. 전문관과 기획전이 같은 slug 공간을 쓰지만
         * 노출 경로는 하나여야 한다(SEO 중복 방지). /exhibition/{전문관-slug} 로 들어오면
         * exhibitionController 가 301 로 여기로 보낸다.
         */
        detailPath: isSpecialty
            ? `/specialty/${encodeURIComponent(row.slug)}`
            : `/exhibition/${encodeURIComponent(row.slug)}`,
        // 종료 + 구매차단이면 카드의 구매 동선을 끊는다.
        purchaseBlocked: phase === 'ENDED' && row.ended_purchase_policy === 'BLOCK',
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

/**
 * (mall_id, slug) 유니크를 지키도록 접미사를 붙인다.
 * @param {number} mallId
 * @param {string} desired 정규화된 slug (빈 문자열이면 폴백 생성)
 * @param {number|null} excludeId 수정 중인 자기 자신
 */
async function ensureUniqueSlug(mallId, desired, excludeId = null) {
    let base = normalizeSlug(desired);
    if (!base) base = `exhibition-${Date.now()}`;

    for (let i = 0; i < 50; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`.slice(0, 200);
        const [rows] = await pool.query(
            'SELECT id FROM exhibition WHERE mall_id = ? AND slug = ? AND id <> ? LIMIT 1',
            [mallId, candidate, excludeId || 0]
        );
        if (!rows.length) return candidate;
    }
    return `${base}-${Date.now()}`.slice(0, 200);
}

function parseJson(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return {}; }
}

/* ── 고객 읽기 경로 ──────────────────────────────────── */

const LIST_ORDER = {
    // end_at IS NULL(무기한) 은 종료임박순에서 맨 뒤로 보낸다.
    ending_soon: 'e.end_at IS NULL ASC, e.end_at ASC, e.id DESC',
    popular: 'e.view_count DESC, e.id DESC',
    latest: 'e.start_at DESC, e.id DESC',
};

/**
 * 고객 목록. 발행 + 목록노출 인 기획전 전부(예정·종료 포함).
 * 단 '종료 + 접근차단' 은 클릭해도 못 들어가므로 목록에서도 감춘다.
 *
 * @param {string[]} [opts.types]        이 유형만 (전문관 목록)
 * @param {string[]} [opts.excludeTypes] 이 유형 제외 (기획전 목록에서 전문관 빼기)
 *
 * 유형 필터를 걸지 않으면 전문관이 기획전 목록에 "종료일 없는 이상한 기획전"으로 섞인다.
 */
async function getPublicList(mallId, { sort = 'latest', page = 1, limit = 12, types = null, excludeTypes = null } = {}) {
    const order = LIST_ORDER[sort] || LIST_ORDER.latest;
    const size = Math.min(Math.max(Number(limit) || 12, 1), 60);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;

    const params = [mallId];
    let typeClause = '';
    if (Array.isArray(types) && types.length) {
        typeClause += ` AND e.exhibition_type IN (${types.map(() => '?').join(',')})`;
        params.push(...types);
    }
    if (Array.isArray(excludeTypes) && excludeTypes.length) {
        typeClause += ` AND e.exhibition_type NOT IN (${excludeTypes.map(() => '?').join(',')})`;
        params.push(...excludeTypes);
    }

    const where = `
        e.mall_id = ?
          AND e.status = 'PUBLISHED'
          AND e.list_visible = 1
          AND NOT (e.ended_access_policy = 'BLOCK' AND e.end_at IS NOT NULL AND e.end_at < NOW())
          ${typeClause}
    `;

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM exhibition e WHERE ${where}`, params);
    const [rows] = await pool.query(`
        SELECT e.*,
               (SELECT COUNT(*)
                  FROM exhibition_product ep
                  JOIN products p ON p.id = ep.product_id
                 WHERE ep.exhibition_id = e.id AND ep.visible = 1
                   AND p.visibility = 'PUBLIC' AND p.status <> 'OFF') AS product_count
          FROM exhibition e
         WHERE ${where}
         ORDER BY ${order}
         LIMIT ? OFFSET ?
    `, [...params, size, offset]);

    const now = new Date();
    return {
        items: rows.map(r => decorate(r, now)),
        total: Number(countRow.total),
        page: Math.max(Number(page) || 1, 1),
        limit: size,
        totalPages: Math.max(Math.ceil(Number(countRow.total) / size), 1),
    };
}

/** slug 로 발행 기획전 조회. 몰 스코프 유니크이므로 mall_id 가 반드시 붙는다. */
async function getPublicBySlug(mallId, slug) {
    const [[row]] = await pool.query(
        "SELECT * FROM exhibition WHERE mall_id = ? AND slug = ? AND status = 'PUBLISHED' LIMIT 1",
        [mallId, String(slug)]
    );
    return row ? decorate(row) : null;
}

/** id → slug 301 리다이렉트용. 커스텀 메뉴(link_target)가 id 만 들고 있다(§3). */
async function getPublicSlugById(mallId, id) {
    const [[row]] = await pool.query(
        "SELECT slug FROM exhibition WHERE mall_id = ? AND id = ? AND status = 'PUBLISHED' LIMIT 1",
        [mallId, Number(id)]
    );
    return row ? row.slug : null;
}

/** 활성 섹션. is_tab=1 인 것만 내부 탭으로 그린다. */
async function getSections(exhibitionId, { activeOnly = true } = {}) {
    const [rows] = await pool.query(`
        SELECT * FROM exhibition_section
         WHERE exhibition_id = ? ${activeOnly ? 'AND is_active = 1' : ''}
         ORDER BY sort_order ASC, id ASC
    `, [exhibitionId]);
    return rows.map(r => Object.assign({}, r, { config: parseJson(r.display_config_json) }));
}

/**
 * 전시 상품. product_card.ejs 가 요구하는 컬럼을 그대로 뽑는다.
 *
 * 판매중지(status='OFF')·비공개 상품은 기획전에서 감춘다 —
 * 카드의 '판매중지' 오버레이는 상품 상세로 들어온 사용자를 위한 것이지,
 * 큐레이션 화면에 굳이 남길 이유가 없다.
 */
async function getProducts(exhibitionId, { hideSoldOut = false } = {}) {
    const [rows] = await pool.query(`
        SELECT p.id, p.name, p.provider, p.main_image, p.price, p.original_price,
               p.discount_rate, p.status, p.stock, p.slug, p.product_badge, p.distribution_badge,
               ep.id AS mapping_id, ep.section_id, ep.sort_order, ep.is_fixed,
               ep.display_badge, ep.display_comment, ep.purchase_enabled
          FROM exhibition_product ep
          JOIN products p ON p.id = ep.product_id
         WHERE ep.exhibition_id = ? AND ep.visible = 1
           AND p.visibility = 'PUBLIC' AND p.status <> 'OFF'
           ${hideSoldOut ? "AND p.status <> 'SOLD_OUT' AND p.stock > 0" : ''}
         ORDER BY ep.is_fixed DESC, ep.sort_order ASC, ep.id ASC
    `, [exhibitionId]);
    // 기획전 카드도 활성 특가가로 표시한다.
    return await dealSvc.applyDeals(rows);
}

/** 조회수 +1. 실패해도 화면은 떠야 하므로 호출부에서 await 하지 않는다. */
async function incrementViewCount(mallId, id) {
    try {
        await pool.query('UPDATE exhibition SET view_count = view_count + 1 WHERE id = ? AND mall_id = ?', [id, mallId]);
    } catch (err) {
        console.warn('[exhibition] view_count 증가 실패:', err.message);
    }
}

module.exports = {
    STATUSES,
    TYPES,
    SPECIALTY_TYPE,
    TEMPLATES,
    SECTION_TYPES,
    ENDED_ACCESS_POLICIES,
    ENDED_PURCHASE_POLICIES,
    PHASE_LABELS,
    LIST_SORTS,
    values,
    pick,
    derivePhase,
    decorate,
    normalizeSlug,
    ensureUniqueSlug,
    parseJson,
    getPublicList,
    getPublicBySlug,
    getPublicSlugById,
    getSections,
    getProducts,
    incrementViewCount,
};
