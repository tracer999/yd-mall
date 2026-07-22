/*
 * 카테고리·브랜드 상품 목록의 필터(facet) 해석·조립.
 * 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §6
 *
 * 하는 일 두 가지.
 *   1) 카테고리에 어떤 필터를 보여줄지 정한다      → getFacetsForCategory()
 *   2) 선택된 필터를 SQL 조각으로 바꾼다            → buildPredicates()
 *
 * ⚠ 반드시 EXISTS / IN 서브쿼리만 쓴다. FROM 에 JOIN 을 추가하면 안 된다.
 *   controllers/productController.js 가 카운트 쿼리를
 *   query.replace('SELECT *', 'SELECT COUNT(*) as total') 로 만들기 때문에
 *   JOIN 을 붙이면 카운트가 조용히 깨진다(설계 §1.3).
 */

const pool = require('../../config/db');

// 필터 키로 쓸 수 없는 쿼리스트링 이름. facet_code 소문자와 충돌하면 안 된다.
const RESERVED_KEYS = new Set([
    'sort', 'page', 'perpage', 'q', 'view', 'mall',
    'categoryid', 'brandid', 'filter',
    // 아래 둘은 기존 컨트롤러가 이미 단일 선택으로 처리한다. 이중 처리하지 않는다.
    'badge', 'distributionbadge',
]);

// 이 facet 들은 기존 컨트롤러 코드가 담당하므로 여기서 술어를 만들지 않는다.
const HANDLED_ELSEWHERE = new Set(['CATEGORY', 'BADGE', 'CHANNEL', 'RATING']);

/** facet_code → 쿼리스트링 키 */
function facetKey(facetCode) {
    return String(facetCode).toLowerCase();
}

/** 'a,b,c' → ['a','b','c'] (빈 값 제거, 중복 제거, 최대 30개) */
function splitValues(raw) {
    if (raw == null) return [];
    return [...new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 30);
}

/**
 * 카테고리 조상 체인(자신 → 부모 → 조부모). categories 는 최대 3뎁스다.
 * @returns {Promise<number[]>} 가까운 것부터
 */
async function getAncestorChain(categoryId) {
    const chain = [];
    let cur = Number(categoryId) || 0;
    for (let i = 0; i < 3 && cur > 0; i += 1) {
        chain.push(cur);
        const [rows] = await pool.query('SELECT parent_id FROM categories WHERE id = ? LIMIT 1', [cur]);
        if (!rows.length || !rows[0].parent_id) break;
        cur = rows[0].parent_id;
    }
    return chain;
}

/**
 * 카테고리에 적용할 필터 목록.
 *
 * 상속 규칙은 category_option 과 같다(services/catalog/categoryOptionService.js:53-84).
 *   - 조상에서 inherit_to_children=1 이면 하위로 전파
 *   - 하위에 같은 facet 행이 있으면 하위가 이긴다(is_visible=0 이면 숨김)
 *   - Tier 0 은 행이 없어도 항상 붙는다. 단 is_visible=0 오버라이드가 있으면 빠진다.
 *
 * @param {number|null} categoryId 없으면 Tier 0 만
 * @returns {Promise<Array>} facet 정의 + values + 소속 정보
 */
async function getFacetsForCategory(categoryId) {
    const chain = categoryId ? await getAncestorChain(categoryId) : [];

    const [defs] = await pool.query(
        `SELECT id, facet_code, facet_name, tier, ui_type, value_source, source_key,
                data_type, unit, is_multi, meta_json, display_order, is_primary_default
           FROM facet_definition
          WHERE is_active = 1
          ORDER BY display_order, id`
    );

    // 카테고리 매핑을 "가까운 조상이 이기도록" 머지한다.
    const overrides = new Map(); // facet_id → row
    if (chain.length) {
        const [rows] = await pool.query(
            `SELECT category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order, meta_json
               FROM category_facet
              WHERE category_id IN (${chain.map(() => '?').join(',')})`,
            chain
        );
        // chain 은 가까운 것부터. 먼 조상부터 덮어써야 가까운 쪽이 최종 승자가 된다.
        for (let i = chain.length - 1; i >= 0; i -= 1) {
            const isSelf = i === 0;
            rows.filter((r) => r.category_id === chain[i])
                .forEach((r) => {
                    // 조상 행은 inherit_to_children=1 일 때만 내려온다.
                    if (!isSelf && !r.inherit_to_children) return;
                    overrides.set(r.facet_id, r);
                });
        }
    }

    const selected = defs.filter((d) => {
        const ov = overrides.get(d.id);
        if (ov) return !!ov.is_visible;
        return d.tier === 0; // 매핑이 없으면 Tier 0 만 자동 노출
    });
    if (!selected.length) return [];

    const ids = selected.map((d) => d.id);
    const [values] = await pool.query(
        `SELECT facet_id, value_code, display_name, meta_json, display_order
           FROM facet_value_definition
          WHERE facet_id IN (${ids.map(() => '?').join(',')})
          ORDER BY display_order, id`,
        ids
    );
    const valueMap = new Map();
    values.forEach((v) => {
        if (!valueMap.has(v.facet_id)) valueMap.set(v.facet_id, []);
        valueMap.get(v.facet_id).push(v);
    });

    return selected
        .map((d) => {
            const ov = overrides.get(d.id) || null;
            // 카테고리 오버라이드(meta_json)가 있으면 기본 정의를 덮는다(가격 구간 프리셋 등).
            const meta = (ov && ov.meta_json) || d.meta_json || null;
            return {
                ...d,
                key: facetKey(d.facet_code),
                meta,
                values: valueMap.get(d.id) || [],
                isPrimary: ov ? !!ov.is_primary : !!d.is_primary_default,
                order: ov ? ov.display_order : d.display_order,
            };
        })
        .sort((a, b) => (a.tier - b.tier) || (a.order - b.order));
}

/** meta_json 의 preset 배열에서 code 로 구간을 찾는다. */
function findPreset(meta, code) {
    const list = meta && Array.isArray(meta.preset) ? meta.preset : [];
    return list.find((p) => p.code === code) || null;
}

/**
 * 'PRICE' 술어. 세 가지 입력을 다 받는다.
 *   price=P1,P3            프리셋 코드
 *   price=30000-50000      직접 구간(열린 구간은 30000- / -50000)
 *   price_min=&price_max=  직접 입력 폼(JS 없이 GET 으로 그대로 넘어온다)
 */
function pricePredicate(facet, raw, q, alias) {
    const parts = splitValues(raw);

    const ranges = [];

    // 직접 입력 폼이 먼저다 — 사용자가 방금 친 값이 프리셋보다 구체적이다.
    const fMin = q && q.price_min !== undefined && q.price_min !== '' ? Number(q.price_min) : null;
    const fMax = q && q.price_max !== undefined && q.price_max !== '' ? Number(q.price_max) : null;
    if (Number.isFinite(fMin) || Number.isFinite(fMax)) {
        ranges.push({
            min: Number.isFinite(fMin) ? fMin : null,
            max: Number.isFinite(fMax) ? fMax : null,
        });
    }

    if (!parts.length && !ranges.length) return null;
    parts.forEach((p) => {
        const m = /^(\d*)-(\d*)$/.exec(p);
        if (m) {
            const min = m[1] === '' ? null : Number(m[1]);
            const max = m[2] === '' ? null : Number(m[2]);
            if (min !== null || max !== null) ranges.push({ min, max });
            return;
        }
        const preset = findPreset(facet.meta, p);
        if (preset) ranges.push({ min: preset.min ?? null, max: preset.max ?? null });
    });
    if (!ranges.length) return null;

    const sqls = [];
    const params = [];
    ranges.forEach((r) => {
        const conds = [];
        if (r.min != null) { conds.push(`${alias}.price >= ?`); params.push(r.min); }
        if (r.max != null) { conds.push(`${alias}.price < ?`); params.push(r.max); }
        if (conds.length) sqls.push(`(${conds.join(' AND ')})`);
    });
    return sqls.length ? { sql: `(${sqls.join(' OR ')})`, params } : null;
}

/** 'DISCOUNT' 술어 — 선택된 것 중 가장 낮은 하한만 쓴다(10%↑ 와 30%↑ 를 함께 고르면 10%↑). */
function discountPredicate(facet, raw, alias) {
    const mins = splitValues(raw)
        .map((c) => findPreset(facet.meta, c))
        .filter(Boolean)
        .map((p) => Number(p.min))
        .filter((n) => Number.isFinite(n));
    if (!mins.length) return null;
    return { sql: `${alias}.discount_rate >= ?`, params: [Math.min(...mins)] };
}

/** 혜택(쿠폰·딜·아웃렛) — 전부 EXISTS 서브쿼리 */
function benefitPredicate(raw, alias) {
    const picked = splitValues(raw);
    if (!picked.length) return null;
    const sqls = [];
    if (picked.includes('DEAL')) {
        sqls.push(`EXISTS (SELECT 1 FROM deal_item di JOIN deal d ON d.id = di.deal_id
                            WHERE di.product_id = ${alias}.id AND d.is_active = 1
                              AND NOW() BETWEEN d.starts_at AND d.ends_at)`);
    }
    if (picked.includes('OUTLET')) {
        sqls.push(`EXISTS (SELECT 1 FROM outlet_product op
                            WHERE op.product_id = ${alias}.id AND op.is_visible = 1)`);
    }
    // 쿠폰은 상품 단위 매핑 테이블이 없어 보류한다(전체 적용 쿠폰만 존재).
    return sqls.length ? { sql: `(${sqls.join(' OR ')})`, params: [] } : null;
}

/** 속성(EAV) 술어 — facet 간 AND, facet 내 값은 OR */
function attributePredicate(facet, raw, alias) {
    const vals = splitValues(raw);
    if (!vals.length) return null;
    return {
        sql: `EXISTS (SELECT 1 FROM product_attribute pa
                       WHERE pa.product_id = ${alias}.id
                         AND pa.attr_name = ?
                         AND pa.attr_value IN (${vals.map(() => '?').join(',')})
                         AND pa.is_searchable = 1)`,
        params: [facet.source_key || facet.facet_code, ...vals],
    };
}

/**
 * 쿼리스트링 → WHERE 에 덧붙일 SQL 조각.
 *
 * 호출부는 `query += ' AND ' + sql` 형태로 붙이면 된다(FROM 은 건드리지 않는다).
 *
 * @param {Array} facets getFacetsForCategory() 결과
 * @param {object} q 병합된 쿼리스트링
 * @param {{exclude?: string[], excludeSources?: string[]}} [opts]
 *        특정 facet(exclude) 또는 특정 value_source 전체(excludeSources)를 빼고 만든다.
 *        파셋 카운트를 낼 때 쓴다 — 자기 자신을 조건에 넣으면 다른 값이 전부 0 으로 보인다.
 * @returns {{sql:string, params:Array, selected:object}}
 */
function buildPredicates(facets, q, opts) {
    const clauses = [];
    const params = [];
    const selected = {};
    const exclude = new Set((opts && opts.exclude) || []);
    const excludeSources = new Set((opts && opts.excludeSources) || []);
    // 목록 쿼리의 products 테이블 별칭. 브랜드관은 `p` 로 조인한다.
    const alias = (opts && opts.alias) || 'products';

    facets.forEach((facet) => {
        if (HANDLED_ELSEWHERE.has(facet.facet_code)) return;
        if (RESERVED_KEYS.has(facet.key)) return;
        if (exclude.has(facet.facet_code)) return;
        if (excludeSources.has(facet.value_source)) return;

        const raw = q[facet.key];
        // 가격은 price_min/price_max 로도 들어오므로 raw 가 비어도 통과시킨다.
        const isPrice = facet.facet_code === 'PRICE';
        if (!isPrice && (raw == null || raw === '')) return;

        let piece = null;
        if (isPrice) piece = pricePredicate(facet, raw, q, alias);
        else if (facet.facet_code === 'DISCOUNT') piece = discountPredicate(facet, raw, alias);
        else if (facet.facet_code === 'BENEFIT') piece = benefitPredicate(raw, alias);
        else if (facet.facet_code === 'STOCK') {
            piece = { sql: `(${alias}.stock > 0 AND ${alias}.status <> 'SOLD_OUT')`, params: [] };
        } else if (facet.facet_code === 'BRAND') {
            const ids = splitValues(raw).map(Number).filter(Boolean);
            if (ids.length) piece = { sql: `${alias}.brand_category_id IN (${ids.map(() => '?').join(',')})`, params: ids };
        } else if (facet.facet_code === 'DELIVERY') {
            // 무료배송·오늘출발은 상품 단위 데이터가 아직 없다. 값이 생기면 여기에 채운다.
            piece = null;
        } else if (facet.value_source === 'ATTRIBUTE') {
            piece = attributePredicate(facet, raw, alias);
        }

        if (piece) {
            clauses.push(piece.sql);
            params.push(...piece.params);
            const picked = splitValues(raw);
            if (picked.length) selected[facet.key] = picked;
        }
    });

    return { sql: clauses.join(' AND '), params, selected };
}

/**
 * 몰에 **실제로 값이 있는** 속성 이름·값 목록.
 *
 * product_attribute 가 아직 비어 있으므로, 이걸 보지 않고 속성 필터를 그리면
 * 무조건 0건이 나오는 필터가 화면을 가득 채운다. 값이 쌓이는 만큼만 노출한다(설계 §11 R-1).
 *
 * @returns {Promise<Map<string, Set<string>>>} attr_name → 값 집합
 */
async function getAttributeAvailability(mallId) {
    const [rows] = await pool.query(
        `SELECT pa.attr_name, pa.attr_value
           FROM product_attribute pa
          WHERE pa.is_searchable = 1
            AND EXISTS (SELECT 1 FROM products p
                         WHERE p.id = pa.product_id AND p.mall_id = ?
                           AND p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK'))
          GROUP BY pa.attr_name, pa.attr_value`,
        [mallId]
    );
    const map = new Map();
    rows.forEach((r) => {
        if (!map.has(r.attr_name)) map.set(r.attr_name, new Set());
        map.get(r.attr_name).add(r.attr_value);
    });
    return map;
}

/**
 * 값이 없는 속성 필터를 걷어낸다. 값 목록도 실제 있는 것만 남긴다.
 * ATTRIBUTE 가 아닌 필터(가격·브랜드·할인 등)는 그대로 둔다.
 *
 * @param {Map<string, Map<string, number>>} [counts] 값별 건수(있으면 값에 붙이고 0 건은 뺀다)
 */
function pruneUnavailable(facets, availability, counts) {
    const cntOf = (name, code) => {
        if (!counts) return undefined;
        const m = counts.get(name);
        return m ? m.get(code) : undefined;
    };
    return facets
        .filter((f) => {
            if (f.value_source !== 'ATTRIBUTE') return true;
            return availability.has(f.source_key || f.facet_code);
        })
        .map((f) => {
            if (f.value_source !== 'ATTRIBUTE') return f;
            const name = f.source_key || f.facet_code;
            const have = availability.get(name);
            // 값 정의가 없는 열린 집합(저자·출판사 등)은 실제 값을 그대로 쓴다.
            const base = f.values.length
                ? f.values.filter((v) => have.has(v.value_code))
                : [...have].sort().map((v) => ({ value_code: v, display_name: v, meta_json: null }));
            const withCount = base
                .map((v) => {
                    const c = cntOf(name, v.value_code);
                    return c === undefined ? v : { ...v, count: c };
                })
                // 카운트를 아는데 0 이면 고를 이유가 없다(설계 §8).
                .filter((v) => v.count === undefined || v.count > 0);
            return { ...f, values: withCount };
        })
        .filter((f) => f.value_source !== 'ATTRIBUTE' || f.values.length > 0);
}

/**
 * 현재 결과 범위에서 속성 값별 상품 수.
 *
 * ⚠ 속성 필터 조건은 **전부 뺀 상태**로 센다. 자기 자신을 넣으면 같은 그룹의 다른 값이
 *   모두 0 으로 접히기 때문이다. 그룹 간에는 약간 과대 집계되지만, facet 마다 쿼리를
 *   따로 도는 비용(속성 10종이면 10회)을 치르는 것보다 낫다.
 *
 * @param {string} idQuery `SELECT id FROM products WHERE ...` 형태의 범위 쿼리
 * @returns {Promise<Map<string, Map<string, number>>>} attr_name → (value_code → cnt)
 */
async function getAttributeCounts(idQuery, params) {
    const [rows] = await pool.query(
        `SELECT pa.attr_name, pa.attr_value, COUNT(DISTINCT pa.product_id) AS cnt
           FROM product_attribute pa
          WHERE pa.is_searchable = 1
            AND pa.product_id IN (${idQuery})
          GROUP BY pa.attr_name, pa.attr_value`,
        params
    );
    const map = new Map();
    rows.forEach((r) => {
        if (!map.has(r.attr_name)) map.set(r.attr_name, new Map());
        map.get(r.attr_name).set(r.attr_value, r.cnt);
    });
    return map;
}

module.exports = {
    getFacetsForCategory,
    getAttributeAvailability,
    getAttributeCounts,
    pruneUnavailable,
    buildPredicates,
    facetKey,
    splitValues,
    RESERVED_KEYS,
};
