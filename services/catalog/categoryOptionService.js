/*
 * categoryOptionService — 카테고리별 추천 옵션 템플릿 + 상속
 *
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §7·§8·§10·§11
 *
 * 카테고리-옵션 매핑은 **강제 규칙이 아니라 상품 등록을 돕는 추천 템플릿**이다(§7).
 * 상위 카테고리 옵션은 하위로 상속되며(§8), 상품에 확정 저장되면 그 시점 스냅샷이라
 * 이후 템플릿 변경이 기존 상품에 자동 반영되지 않는다(§11 — product_option 이 별도).
 */

const pool = require('../../config/db');

/** 옵션 정의의 추천 옵션값(표준 사전). */
async function _recommendedValues(optionDefinitionId, conn) {
    const [rows] = await conn.query(
        'SELECT value_code, display_name FROM option_value_definition WHERE option_definition_id = ? ORDER BY display_order, id',
        [optionDefinitionId]
    );
    return rows.map((r) => r.display_name);
}

/** 카테고리 자신의 옵션 매핑(상속 제외). */
async function getCategoryOptions(categoryId, conn = pool) {
    const [rows] = await conn.query(
        `SELECT co.*, od.option_code, od.option_name
           FROM category_option co
           JOIN option_definition od ON od.id = co.option_definition_id
          WHERE co.category_id = ?
          ORDER BY co.display_order, co.id`,
        [categoryId]
    );
    return rows;
}

/** categoryId 의 조상 체인(자신 제외, 가까운 부모부터). depth ≤3 이라 최대 2개. */
async function _ancestors(categoryId, conn) {
    const chain = [];
    let cur = categoryId;
    for (let i = 0; i < 5; i++) { // 순환 방지 상한
        const [[row]] = await conn.query('SELECT parent_id FROM categories WHERE id = ?', [cur]);
        if (!row || !row.parent_id) break;
        chain.push(row.parent_id);
        cur = row.parent_id;
    }
    return chain;
}

/**
 * 상품 등록화면용 — 카테고리에 상속까지 반영한 추천 옵션 목록.
 * 자신의 매핑이 조상 매핑을 이긴다(option_definition_id 기준). 조상은 inherit_to_children=1 만 내려온다.
 * @returns {Array<{option_definition_id, option_code, option_name, is_required, is_recommended, allow_custom_value, source, recommendedValues:string[]}>}
 */
async function getInheritedOptions(categoryId, conn = pool) {
    const merged = new Map(); // option_definition_id → row(+source)

    // 조상(먼 조상 먼저 넣고 가까운 것이 덮도록 역순 적용)
    const ancestors = await _ancestors(categoryId, conn);
    for (const ancId of ancestors.slice().reverse()) {
        const rows = await getCategoryOptions(ancId, conn);
        for (const r of rows) {
            if (r.inherit_to_children) merged.set(r.option_definition_id, { ...r, source: 'inherited' });
        }
    }
    // 자신(최우선)
    const own = await getCategoryOptions(categoryId, conn);
    for (const r of own) merged.set(r.option_definition_id, { ...r, source: 'own' });

    const result = [];
    for (const r of merged.values()) {
        result.push({
            option_definition_id: r.option_definition_id,
            option_code: r.option_code,
            option_name: r.option_name,
            is_required: !!r.is_required,
            is_recommended: !!r.is_recommended,
            allow_custom_value: !!r.allow_custom_value,
            source: r.source,
            recommendedValues: await _recommendedValues(r.option_definition_id, conn),
        });
    }
    // 추천/필수 먼저 노출
    result.sort((a, b) => (b.is_required - a.is_required) || (b.is_recommended - a.is_recommended));
    return result;
}

/** 카테고리 옵션 매핑 저장(전체 재구성). */
async function setCategoryOptions(categoryId, list, conn = pool) {
    const items = (Array.isArray(list) ? list : [])
        .map((x) => ({
            option_definition_id: Number(x.option_definition_id),
            is_required: x.is_required ? 1 : 0,
            is_recommended: x.is_recommended ? 1 : 0,
            allow_custom_value: x.allow_custom_value === false ? 0 : 1,
            inherit_to_children: x.inherit_to_children === false ? 0 : 1,
        }))
        .filter((x) => x.option_definition_id);

    await conn.query('DELETE FROM category_option WHERE category_id = ?', [categoryId]);
    let order = 0;
    for (const it of items) {
        await conn.query(
            `INSERT INTO category_option
                (category_id, option_definition_id, is_required, is_recommended, allow_custom_value, inherit_to_children, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [categoryId, it.option_definition_id, it.is_required, it.is_recommended, it.allow_custom_value, it.inherit_to_children, order++]
        );
    }
    return { count: order };
}

/** mall 의 표준 옵션 사전(관리 화면 후보). */
async function getOptionDictionary(mallId, conn = pool) {
    const [rows] = await conn.query(
        'SELECT id, option_code, option_name FROM option_definition WHERE mall_id = ? AND is_active = 1 ORDER BY display_order, id',
        [mallId]
    );
    return rows;
}

module.exports = {
    getCategoryOptions,
    getInheritedOptions,
    setCategoryOptions,
    getOptionDictionary,
};
