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

/**
 * 관리자 조회 필터·상품 선택 팝업의 카테고리/브랜드 셀렉트 옵션.
 * 그 몰의 상품이 실제로 쓰는 것(+조상)만 돌려준다.
 *
 * 카테고리·브랜드는 전 몰 공통 한 벌(NORMAL 2,348 · BRAND 1,379)이라 그대로 그리면
 * 셀렉트가 수천 줄이 되고, 그중 대부분은 이 몰에 상품이 한 건도 없어 고르면 결과가 늘 0건이다.
 * 상품 목록 필터(productController.getList)가 쓰던 기준을 그대로 공용화한 것.
 *
 * 스토어프론트 숨김(mall_category_visibility)은 빼지 않는다 — 숨긴 카테고리의 상품도
 * 관리자는 그룹·특가에 담을 수 있어야 한다.
 *
 * @param {number} mallId
 * @param {{brand?:boolean, includeIds?:Array<number|string>}} opts
 *        includeIds — 이미 저장된 선택값. 지금 상품이 없어도 목록에서 빠지면
 *        폼을 다시 저장할 때 값이 조용히 사라지므로 항상 살려 둔다.
 * @returns {Promise<Array<{id:number,name:string,parent_id:number|null,depth:number}>>}
 */
async function usedCategoryOptions(mallId, { brand = false, includeIds = [] } = {}) {
    const ids = await validCategoryIdSet(mallId, { brand });
    for (const raw of includeIds) {
        const n = Number(raw);
        if (Number.isInteger(n) && n > 0) ids.add(n);
    }
    if (!ids.size) return [];
    const [rows] = await pool.query(
        `SELECT id, name, parent_id, depth FROM categories
          WHERE type = ? AND mall_id IN (?, ?) AND id IN (?)
          ORDER BY depth ASC, display_order ASC, id ASC`,
        [brand ? 'BRAND' : 'NORMAL', GLOBAL_CATEGORY_MALL_ID, mallId, [...ids]]
    );
    return rows;
}

/**
 * 카테고리 서브트리 id 목록(자기 자신 포함).
 *
 * 부모 카테고리를 고르면 하위 뎁스에 달린 상품까지 잡아야 한다 —
 * 상품 대부분이 2·3뎁스에 붙어 있어 대분류만 비교하면 결과가 0건이 된다.
 * 관리자 조회용이라 비활성 카테고리도 포함한다.
 *
 * @param {number} mallId
 * @param {number} categoryId
 * @returns {Promise<number[]>} 잘못된 id 면 빈 배열
 */
async function categorySubtreeIds(mallId, categoryId) {
    const id = Number(categoryId);
    if (!Number.isInteger(id) || id <= 0) return [];
    const [rows] = await pool.query(`
        WITH RECURSIVE sub AS (
            SELECT id FROM categories WHERE id = ? AND mall_id IN (0, ?)
            UNION ALL
            SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id
        )
        SELECT id FROM sub
    `, [id, mallId]);
    return rows.map(r => r.id);
}

module.exports = {
    GLOBAL_CATEGORY_MALL_ID,
    validCategoryIdSet,
    hiddenCategoryIdSet,
    visibleCategoryIdSet,
    usedCategoryOptions,
    categorySubtreeIds,
};
