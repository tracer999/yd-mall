/*
 * 카테고리·브랜드 글로벌화 (설계: docs/사이트개선/카테고리_브랜드_글로벌화_설계.md)
 *
 * NORMAL·BRAND 카테고리는 전 몰 공통(글로벌) 한 벌. 몰 스코핑 대신 이 sentinel mall_id.
 * (THEME·OUTLET 은 기존대로 몰별)
 *
 * 각 몰 스토어프론트의 "유효 카테고리" = 그 몰에 상품이 있는 카테고리(+조상).
 * products.mall_id 기준으로 파생한다(validCategoryIdSet).
 */
const pool = require('../../config/db');

const GLOBAL_CATEGORY_MALL_ID = 0;

/**
 * 몰에 상품이 있는 (유효) 카테고리/브랜드 id 집합(+조상 포함).
 * 스토어프론트가 "무관 카테고리"를 노출하지 않도록 이 집합으로 거른다.
 * @param {number} mallId
 * @param {{brand?:boolean}} opts brand=true 면 brand_category_id 기준
 * @returns {Promise<Set<number>>}
 */
async function validCategoryIdSet(mallId, { brand = false } = {}) {
    const col = brand ? 'brand_category_id' : 'category_id';
    const [rows] = await pool.query(
        `SELECT DISTINCT ${col} AS id FROM products WHERE mall_id = ? AND ${col} IS NOT NULL`,
        [mallId]
    );
    const set = new Set();
    if (!rows.length) return set;
    const [cats] = await pool.query('SELECT id, parent_id FROM categories');
    const parentOf = new Map(cats.map((c) => [c.id, c.parent_id || null]));
    for (const r of rows) {
        let cur = r.id;
        while (cur && !set.has(cur)) { set.add(cur); cur = parentOf.get(cur); }
    }
    return set;
}

/**
 * 몰별 "숨김" override 집합(mall_category_visibility, hidden=1).
 * 스토어프론트 노출 = valid MINUS hidden. 카테고리·브랜드 공용(둘 다 categories.id).
 * @param {number} mallId
 * @returns {Promise<Set<number>>}
 */
async function hiddenCategoryIdSet(mallId) {
    const set = new Set();
    try {
        const [rows] = await pool.query(
            'SELECT category_id FROM mall_category_visibility WHERE mall_id = ? AND hidden = 1',
            [mallId]
        );
        for (const r of rows) set.add(r.category_id);
    } catch (e) {
        // 테이블 미생성 등 — 숨김 없음으로 폴백(전환 안전).
        if (e.code !== 'ER_NO_SUCH_TABLE') console.error('[categoryScope] hiddenCategoryIdSet:', e.message);
    }
    return set;
}

/**
 * 스토어프론트에 실제로 노출할 카테고리/브랜드 id 집합 = valid − hidden.
 * @param {number} mallId
 * @param {{brand?:boolean}} opts
 * @returns {Promise<Set<number>>}
 */
async function visibleCategoryIdSet(mallId, { brand = false } = {}) {
    const [valid, hidden] = await Promise.all([
        validCategoryIdSet(mallId, { brand }),
        hiddenCategoryIdSet(mallId),
    ]);
    for (const id of hidden) valid.delete(id);
    return valid;
}

module.exports = { GLOBAL_CATEGORY_MALL_ID, validCategoryIdSet, hiddenCategoryIdSet, visibleCategoryIdSet };
