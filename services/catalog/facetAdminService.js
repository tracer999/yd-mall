/*
 * facetAdminService — 관리자용 필터(facet) 관리.
 * 설계: docs/사이트개선/카테고리_브랜드_상품필터_설계.md §6, §9, §10(Phase 5·6)
 *
 * 고객 화면 쪽 해석은 services/catalog/facetService.js 가 한다. 여기는 쓰기·관리 전용.
 *
 * 상속 규칙은 categoryOptionService 와 같다(services/catalog/categoryOptionService.js:53-84).
 *   조상에서 inherit_to_children=1 이면 하위로 내려오고, 하위에 같은 facet 행이 있으면 하위가 이긴다.
 *   is_visible=0 은 "상속받았지만 여기서는 끈다" 는 뜻이다(도서의 브랜드, 여가의 배송·재고).
 */

const pool = require('../../config/db');

/** categoryId 의 조상 체인(자신 제외, 가까운 부모부터). 카테고리는 최대 3뎁스다. */
async function ancestorsOf(categoryId, conn = pool) {
    const chain = [];
    let cur = Number(categoryId) || 0;
    for (let i = 0; i < 5 && cur > 0; i += 1) { // 순환 방지 상한
        const [[row]] = await conn.query('SELECT parent_id FROM categories WHERE id = ? LIMIT 1', [cur]);
        if (!row || !row.parent_id) break;
        chain.push(row.parent_id);
        cur = row.parent_id;
    }
    return chain;
}

/**
 * 관리 화면용 행렬 — 전체 facet 정의 + 이 카테고리의 자기 설정 + 상속받은 설정.
 *
 * @returns {Promise<Array>} facet 정의에 own / inherited 를 붙인 목록
 */
async function getFacetMatrix(categoryId, conn = pool) {
    const [defs] = await conn.query(
        `SELECT id, facet_code, facet_name, tier, ui_type, value_source, source_key,
                unit, is_multi, is_active, is_primary_default, display_order,
                (SELECT COUNT(*) FROM facet_value_definition v WHERE v.facet_id = facet_definition.id) AS value_count
           FROM facet_definition
          ORDER BY tier, display_order, id`
    );
    if (!categoryId) return defs.map((d) => ({ ...d, own: null, inherited: null }));

    const [ownRows] = await conn.query(
        'SELECT * FROM category_facet WHERE category_id = ?', [categoryId]
    );
    const ownMap = new Map(ownRows.map((r) => [r.facet_id, r]));

    // 상속: 먼 조상부터 덮어써서 가까운 조상이 최종 승자가 되게 한다.
    const inheritedMap = new Map();
    const ancestors = await ancestorsOf(categoryId, conn);
    for (const ancId of ancestors.slice().reverse()) {
        const [rows] = await conn.query(
            'SELECT * FROM category_facet WHERE category_id = ? AND inherit_to_children = 1', [ancId]
        );
        rows.forEach((r) => inheritedMap.set(r.facet_id, r));
    }

    return defs.map((d) => ({
        ...d,
        own: ownMap.get(d.id) || null,
        inherited: inheritedMap.get(d.id) || null,
    }));
}

/**
 * 카테고리 facet 매핑 저장(전체 재구성).
 *
 * list 항목: { facet_id, state: 'use'|'hide', is_primary, inherit_to_children }
 *   state 가 없거나 'inherit' 이면 행을 만들지 않는다(= 상속·기본에 맡긴다).
 *
 * ⚠ meta_json(가격 구간 프리셋 등)은 여기서 건드리지 않는다.
 *   화면에서 다루지 않는 값을 재구성 과정에서 날려 버리면 안 되기 때문에 기존 값을 보존한다.
 */
async function setCategoryFacets(categoryId, list, conn = pool) {
    const items = (Array.isArray(list) ? list : [])
        .map((x) => ({
            facet_id: Number(x.facet_id),
            is_visible: x.state === 'hide' ? 0 : 1,
            is_primary: x.is_primary ? 1 : 0,
            inherit_to_children: x.inherit_to_children === false ? 0 : 1,
        }))
        .filter((x) => x.facet_id);

    // 기존 meta_json 보존용 스냅샷
    const [prev] = await conn.query(
        'SELECT facet_id, meta_json FROM category_facet WHERE category_id = ?', [categoryId]
    );
    const metaMap = new Map(prev.map((r) => [r.facet_id, r.meta_json]));

    await conn.query('DELETE FROM category_facet WHERE category_id = ?', [categoryId]);
    let order = 0;
    for (const it of items) {
        await conn.query(
            `INSERT INTO category_facet
                (category_id, facet_id, is_primary, is_visible, inherit_to_children, display_order, meta_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [categoryId, it.facet_id, it.is_primary, it.is_visible, it.inherit_to_children,
             order++, metaMap.get(it.facet_id) ? JSON.stringify(metaMap.get(it.facet_id)) : null]
        );
    }
    return { count: order };
}

/* ------------------------------------------------------------------ *
 * 상품 속성 입력 (Phase 6 — 값 적재의 주 경로)
 * ------------------------------------------------------------------ */

/**
 * 상품 등록·수정 화면에 그릴 속성 입력 폼 정의.
 *
 * 카테고리에 부여된 facet 중 **속성(EAV)으로 저장되는 것**만 대상이다.
 * 가격·브랜드·할인처럼 products 컬럼에서 바로 오는 필터는 입력받을 필요가 없다.
 *
 * @returns {Promise<Array>} [{ facet_code, facet_name, ui_type, is_multi, unit, values:[...] }]
 */
async function getProductAttributeForm(categoryId, conn = pool) {
    if (!categoryId) return [];
    const matrix = await getFacetMatrix(categoryId, conn);

    const applicable = matrix.filter((d) => {
        if (!d.is_active) return false;
        if (d.value_source !== 'ATTRIBUTE') return false;
        const eff = d.own || d.inherited;
        return !!(eff && eff.is_visible);
    });
    if (!applicable.length) return [];

    const ids = applicable.map((d) => d.id);
    const [values] = await conn.query(
        // meta_json 은 자동 추출(facetExtractor)이 별칭 사전으로 쓴다.
        `SELECT facet_id, value_code, display_name, meta_json
           FROM facet_value_definition
          WHERE facet_id IN (${ids.map(() => '?').join(',')})
          ORDER BY display_order, id`,
        ids
    );
    const byFacet = new Map();
    values.forEach((v) => {
        if (!byFacet.has(v.facet_id)) byFacet.set(v.facet_id, []);
        byFacet.get(v.facet_id).push({
            value_code: v.value_code, display_name: v.display_name, meta_json: v.meta_json,
        });
    });

    return applicable.map((d) => ({
        facet_id: d.id,
        facet_code: d.facet_code,
        facet_name: d.facet_name,
        ui_type: d.ui_type,
        is_multi: !!d.is_multi,
        unit: d.unit,
        source_key: d.source_key || d.facet_code,
        values: byFacet.get(d.id) || [],
    }));
}

/** 상품의 현재 속성값. { attr_name: [value, ...] } */
async function getProductAttributes(productId, conn = pool) {
    const [rows] = await conn.query(
        'SELECT attr_name, attr_value, is_searchable FROM product_attribute WHERE product_id = ? ORDER BY display_order, id',
        [productId]
    );
    const map = {};
    rows.forEach((r) => {
        if (!map[r.attr_name]) map[r.attr_name] = [];
        map[r.attr_name].push(r.attr_value);
    });
    return map;
}

/**
 * 상품 속성 저장.
 *
 * 관리자가 화면에서 고른 값이므로 `is_searchable = 1`(바로 필터에 걸림)로 넣는다.
 * 자동 추출값(Phase 8)은 0 으로 들어가 검수를 거친다.
 *
 * @param {object} values { COLOR: ['BLACK','WHITE'], SIZE_ALPHA: 'M', ... }
 * @param {Array} formDefs getProductAttributeForm() 결과 — 이 목록에 있는 것만 저장한다
 */
async function saveProductAttributes(productId, values, formDefs, conn = pool) {
    const allowed = new Map((formDefs || []).map((f) => [f.source_key, f]));
    if (!allowed.size) return { count: 0 };

    // 관리자 입력분만 지운다. 자동 추출 대기값(is_searchable=0)은 건드리지 않는다.
    await conn.query(
        `DELETE FROM product_attribute
          WHERE product_id = ? AND is_searchable = 1
            AND attr_name IN (${[...allowed.keys()].map(() => '?').join(',')})`,
        [productId, ...allowed.keys()]
    );

    let count = 0;
    for (const [name, def] of allowed) {
        let picked = values ? values[name] : null;
        if (picked == null || picked === '') continue;
        if (!Array.isArray(picked)) picked = [picked];
        // 정의된 값만 받는다. 자유 텍스트가 섞이면 필터가 무너진다(설계 §11 R-3).
        const codes = new Set(def.values.map((v) => v.value_code));
        const valid = [...new Set(picked.map(String))].filter((v) => codes.size === 0 || codes.has(v));
        const finals = def.is_multi ? valid : valid.slice(0, 1);
        for (let i = 0; i < finals.length; i += 1) {
            await conn.query(
                `INSERT INTO product_attribute (product_id, attr_name, attr_value, is_searchable, display_order)
                 VALUES (?, ?, ?, 1, ?)`,
                [productId, name, finals[i], i]
            );
            count += 1;
        }
    }
    return { count };
}

module.exports = {
    getFacetMatrix,
    setCategoryFacets,
    getProductAttributeForm,
    getProductAttributes,
    saveProductAttributes,
    ancestorsOf,
};
