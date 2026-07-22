/*
 * facetExtractor — 기존 상품에서 속성값을 자동으로 뽑아 검수 대기로 넣는다.
 * 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §9(경로 C·D), §10(Phase 8)
 *
 * 왜 필요한가: 필터 정의를 아무리 잘 만들어도 product_attribute 가 비어 있으면
 * 고객 화면에 아무것도 안 걸린다. 기존 9,700여 건을 사람이 다 입력할 수는 없다.
 *
 * 어디서 뽑는가 (신뢰도 순)
 *   1. 공급사 원본  supplier_product.manufacturer / model_name / size_text / country
 *   2. 옵션값       product_option_value.value_name  ("...캐리어20인치(블랙)")
 *   3. 상품명       products.name
 *
 * ⚠ 자동 추출은 틀린다. 전부 `is_searchable = 0`(검수 대기)으로 넣는다.
 *   관리자가 승인해야 1 이 되어 고객 필터에 걸린다. 이 2단 구조가 이 모듈의 핵심이다.
 */

const pool = require('../../config/db');
const facetAdminService = require('./facetAdminService');

// 한 번에 훑을 상품 수 상한. 화면 요청 안에서 끝나야 하므로 넉넉하되 무한하지 않게.
const MAX_PRODUCTS = 2000;
// 너무 짧은 별칭은 오탐만 만든다("면" 이 "면세" 에 걸리는 식).
const MIN_TOKEN_LEN = 2;

/**
 * facet 값 사전. display_name + meta_json.aliases 를 소문자 토큰으로 편다.
 * 긴 것부터 맞춰야 "로즈골드" 가 "골드" 보다 먼저 잡힌다.
 */
function buildDictionary(formDefs) {
    return formDefs.map((f) => ({
        attrName: f.source_key,
        isMulti: f.is_multi,
        values: f.values
            .map((v) => {
                const meta = v.meta_json || {};
                const aliases = Array.isArray(meta.aliases) ? meta.aliases : [];
                const tokens = [v.display_name, ...aliases]
                    .filter(Boolean)
                    .map((t) => String(t).toLowerCase().trim())
                    .filter((t) => t.length >= MIN_TOKEN_LEN);
                return { code: v.value_code, tokens: [...new Set(tokens)] };
            })
            .filter((v) => v.tokens.length)
            // 긴 토큰을 가진 값을 먼저 검사한다.
            .sort((a, b) => Math.max(...b.tokens.map((t) => t.length)) - Math.max(...a.tokens.map((t) => t.length))),
    })).filter((f) => f.values.length);
}

/** 사전을 텍스트에 적용 → { attrName: [code, ...] } */
function matchText(dict, haystack) {
    const text = String(haystack || '').toLowerCase();
    if (!text) return {};
    const out = {};
    dict.forEach((f) => {
        const hits = [];
        f.values.forEach((v) => {
            if (v.tokens.some((t) => text.includes(t))) hits.push(v.code);
        });
        if (hits.length) out[f.attrName] = f.isMulti ? hits : [hits[0]];
    });
    return out;
}

/** 상품 하나가 참고할 텍스트 뭉치(상품명 + 옵션값 + 공급사 원본). */
async function gatherText(productIds, conn = pool) {
    const map = new Map(productIds.map((id) => [id, []]));
    if (!productIds.length) return map;
    const ph = productIds.map(() => '?').join(',');

    const [prods] = await conn.query(`SELECT id, name FROM products WHERE id IN (${ph})`, productIds);
    prods.forEach((p) => map.get(p.id).push(p.name));

    const [opts] = await conn.query(
        `SELECT po.product_id, pov.value_name
           FROM product_option po JOIN product_option_value pov ON pov.product_option_id = po.id
          WHERE po.product_id IN (${ph})`, productIds
    );
    opts.forEach((o) => { if (map.has(o.product_id)) map.get(o.product_id).push(o.value_name); });

    const [sup] = await conn.query(
        `SELECT mall_product_id, manufacturer, model_name, size_text, country
           FROM supplier_product WHERE mall_product_id IN (${ph})`, productIds
    );
    sup.forEach((s) => {
        if (!map.has(s.mall_product_id)) return;
        map.get(s.mall_product_id).push([s.manufacturer, s.model_name, s.size_text, s.country].filter(Boolean).join(' '));
    });

    return map;
}

/**
 * 카테고리(하위 포함) 상품에서 속성을 추출해 검수 대기로 적재.
 *
 * @param {number} mallId
 * @param {number|null} categoryId 없으면 몰 전체
 * @returns {Promise<{scanned:number, matched:number, inserted:number, byAttr:object}>}
 */
async function extract(mallId, categoryId) {
    // 대상 상품 — 카테고리 하위(최대 3뎁스)까지
    const where = categoryId
        ? `AND (p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?)
                OR p.category_id IN (SELECT id FROM categories WHERE parent_id IN
                     (SELECT id FROM categories WHERE parent_id = ?)))`
        : '';
    const params = categoryId ? [mallId, categoryId, categoryId, categoryId] : [mallId];
    const [products] = await pool.query(
        `SELECT p.id, p.category_id FROM products p
          WHERE p.mall_id = ? AND p.category_id IS NOT NULL ${where}
          ORDER BY p.id LIMIT ${MAX_PRODUCTS}`,
        params
    );
    if (!products.length) return { scanned: 0, matched: 0, inserted: 0, byAttr: {} };

    // 카테고리별 사전은 재사용한다(카테고리 수는 적고 상품은 많다).
    const dictCache = new Map();
    async function dictFor(catId) {
        if (!dictCache.has(catId)) {
            const defs = await facetAdminService.getProductAttributeForm(catId);
            dictCache.set(catId, buildDictionary(defs));
        }
        return dictCache.get(catId);
    }

    const textMap = await gatherText(products.map((p) => p.id));

    let matched = 0;
    let inserted = 0;
    const byAttr = {};
    for (const p of products) {
        const dict = await dictFor(p.category_id);
        if (!dict.length) continue;
        const hits = matchText(dict, (textMap.get(p.id) || []).join(' '));
        const names = Object.keys(hits);
        if (!names.length) continue;
        matched += 1;

        for (const name of names) {
            for (let i = 0; i < hits[name].length; i += 1) {
                // 이미 승인된 값이 있으면 건드리지 않는다(사람이 정한 것이 우선).
                const [r] = await pool.query(
                    `INSERT IGNORE INTO product_attribute (product_id, attr_name, attr_value, is_searchable, display_order)
                     VALUES (?, ?, ?, 0, ?)`,
                    [p.id, name, hits[name][i], i]
                );
                if (r.affectedRows) {
                    inserted += 1;
                    byAttr[name] = (byAttr[name] || 0) + 1;
                }
            }
        }
    }
    return { scanned: products.length, matched, inserted, byAttr };
}

/** 검수 대기 목록 — 속성·값 단위로 묶어 건수와 예시 상품을 보여 준다. */
async function getPending(mallId, limit = 200) {
    const [rows] = await pool.query(
        `SELECT pa.attr_name, pa.attr_value, COUNT(*) AS cnt,
                MIN(p.name) AS sample_name, MIN(p.id) AS sample_id
           FROM product_attribute pa
           JOIN products p ON p.id = pa.product_id
          WHERE pa.is_searchable = 0 AND p.mall_id = ?
          GROUP BY pa.attr_name, pa.attr_value
          ORDER BY cnt DESC, pa.attr_name, pa.attr_value
          LIMIT ?`,
        [mallId, Number(limit) || 200]
    );
    return rows;
}

/** 승인 → 고객 필터에 걸리게 한다. */
async function approve(mallId, pairs) {
    let n = 0;
    for (const p of pairs || []) {
        const [r] = await pool.query(
            `UPDATE product_attribute pa JOIN products pr ON pr.id = pa.product_id
                SET pa.is_searchable = 1
              WHERE pa.is_searchable = 0 AND pr.mall_id = ? AND pa.attr_name = ? AND pa.attr_value = ?`,
            [mallId, p.attr_name, p.attr_value]
        );
        n += r.affectedRows;
    }
    return { updated: n };
}

/** 반려 → 대기 행을 지운다(승인된 값은 건드리지 않는다). */
async function reject(mallId, pairs) {
    let n = 0;
    for (const p of pairs || []) {
        const [r] = await pool.query(
            `DELETE pa FROM product_attribute pa JOIN products pr ON pr.id = pa.product_id
              WHERE pa.is_searchable = 0 AND pr.mall_id = ? AND pa.attr_name = ? AND pa.attr_value = ?`,
            [mallId, p.attr_name, p.attr_value]
        );
        n += r.affectedRows;
    }
    return { deleted: n };
}

module.exports = { extract, getPending, approve, reject, buildDictionary, matchText };
