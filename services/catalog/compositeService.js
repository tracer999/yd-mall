/*
 * compositeService — 복합상품(묶음/세트/기획) 구성·가용수량
 *
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §13~15, §20, §26.8
 *
 * 복합상품은 자기 자신의 대표 SKU(is_default=1, stock_managed=0)를 가져 장바구니·주문 경로를
 * 일반 상품과 동일하게 태운다. 재고는 보유하지 않고 구성 SKU 에서 파생한다(skuService 가 차감).
 */

const pool = require('../../config/db');

const COMPOSITE_TYPES = ['BUNDLE', 'SET', 'GIFT_SET', 'BUILD_SET'];

/** 복합상품 구성 목록(구성 SKU 정보 포함). */
async function getComponents(productId, conn = pool) {
    const [rows] = await conn.query(
        `SELECT cc.id, cc.component_sku_id, cc.quantity, cc.is_optional, cc.display_order,
                s.sku_code, s.price AS sku_price, s.stock AS sku_stock, s.product_id AS component_product_id,
                p.name AS component_product_name
           FROM composite_component cc
           JOIN product_sku s ON s.id = cc.component_sku_id
           JOIN products p ON p.id = s.product_id
          WHERE cc.composite_product_id = ?
          ORDER BY cc.display_order, cc.id`,
        [productId]
    );
    // 구성 SKU 의 옵션 라벨(있으면)
    for (const r of rows) {
        const [labels] = await conn.query(
            `SELECT pov.value_name FROM sku_option_value sov
               JOIN product_option_value pov ON pov.id = sov.product_option_value_id
              WHERE sov.sku_id = ?`,
            [r.component_sku_id]
        );
        r.option_label = labels.length ? labels.map((l) => l.value_name).join(' / ') : null;
    }
    return rows;
}

/** 복합상품 가용수량 = min over 구성(필수) floor(구성재고 / 필요수량). 구성 없으면 0. */
async function getAvailableQty(productId, conn = pool) {
    const [rows] = await conn.query(
        `SELECT cc.quantity, cc.is_optional, s.stock
           FROM composite_component cc JOIN product_sku s ON s.id = cc.component_sku_id
          WHERE cc.composite_product_id = ?`,
        [productId]
    );
    const required = rows.filter((r) => !r.is_optional);
    if (!required.length) return 0;
    let min = Infinity;
    for (const r of required) {
        const q = Math.max(1, Number(r.quantity) || 1);
        const avail = Math.floor(Math.max(0, Number(r.stock) || 0) / q);
        if (avail < min) min = avail;
    }
    return min === Infinity ? 0 : min;
}

/**
 * 관리자 구성 SKU 검색. 상품명·SKU코드로 찾아 후보를 돌려준다.
 * 복합상품 자신은 제외(자기참조 방지), 다른 복합상품의 대표 SKU 도 제외(중첩 방지).
 */
async function searchComponentSkus(mallId, query, excludeProductId, conn = pool) {
    const like = `%${String(query || '').trim()}%`;
    const [rows] = await conn.query(
        `SELECT s.id AS sku_id, s.sku_code, s.price, s.stock, s.is_default, s.stock_managed,
                p.id AS product_id, p.name AS product_name, p.product_type
           FROM product_sku s JOIN products p ON p.id = s.product_id
          WHERE p.mall_id = ? AND s.stock_managed = 1
            AND p.id <> ?
            AND (p.name LIKE ? OR s.sku_code LIKE ?)
          ORDER BY p.name, s.id
          LIMIT 30`,
        [mallId, excludeProductId || 0, like, like]
    );
    // 옵션 라벨 부여
    for (const r of rows) {
        const [labels] = await conn.query(
            `SELECT pov.value_name FROM sku_option_value sov
               JOIN product_option_value pov ON pov.id = sov.product_option_value_id
              WHERE sov.sku_id = ?`,
            [r.sku_id]
        );
        r.option_label = labels.length ? labels.map((l) => l.value_name).join(' / ') : null;
    }
    return rows;
}

/**
 * 복합상품 구성 저장(전체 재구성). 트랜잭션 커넥션 필수.
 * @param {object} conn
 * @param {number} productId
 * @param {number} mallId
 * @param {{type:string, components:Array<{sku_id:number, quantity:number, is_optional?:boolean}>}} payload
 */
async function saveComposite(conn, productId, mallId, payload) {
    const type = COMPOSITE_TYPES.includes(payload.type) ? payload.type : 'SET';
    const components = (Array.isArray(payload.components) ? payload.components : [])
        .map((c) => ({ sku_id: Number(c.sku_id), quantity: Math.max(1, Number(c.quantity) || 1), is_optional: c.is_optional ? 1 : 0 }))
        .filter((c) => c.sku_id);

    // 기존 구성 제거
    await conn.query('DELETE FROM composite_component WHERE composite_product_id = ?', [productId]);

    if (!components.length) {
        // 구성 없으면 단일상품으로 되돌린다(대표 SKU 를 재고관리형으로 복원).
        await conn.query('UPDATE products SET product_type = ? WHERE id = ?', ['SINGLE', productId]);
        await conn.query('UPDATE product_sku SET stock_managed = 1 WHERE product_id = ? AND is_default = 1', [productId]);
        return { type: 'SINGLE', componentCount: 0 };
    }

    // 대표 SKU 확보(옵션상품이었다면 옵션 SKU 는 제거) → stock_managed=0 로 전환
    const [[defSku]] = await conn.query('SELECT id FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1', [productId]);
    if (!defSku) {
        // 옵션상품(대표 SKU 없음) → 옵션 SKU 정리 후 대표 SKU 생성
        await conn.query('DELETE FROM product_sku WHERE product_id = ?', [productId]);
        const [[p]] = await conn.query('SELECT mall_id, price FROM products WHERE id = ?', [productId]);
        await conn.query(
            `INSERT INTO product_sku (mall_id, product_id, price, stock, stock_managed, status, is_default)
             VALUES (?, ?, ?, 0, 0, 'ON', 1)`,
            [p.mall_id || mallId, productId, Number(p.price) || 0]
        );
    } else {
        await conn.query('UPDATE product_sku SET stock_managed = 0 WHERE id = ?', [defSku.id]);
    }

    // 구성 삽입 (자기참조·중복 방지)
    let order = 0;
    for (const c of components) {
        // 대표 SKU 자기참조 차단
        const [[own]] = await conn.query('SELECT id FROM product_sku WHERE id = ? AND product_id = ?', [c.sku_id, productId]);
        if (own) continue;
        await conn.query(
            `INSERT INTO composite_component (composite_product_id, component_sku_id, quantity, is_optional, display_order)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), is_optional = VALUES(is_optional), display_order = VALUES(display_order)`,
            [productId, c.sku_id, c.quantity, c.is_optional, order++]
        );
    }

    await conn.query('UPDATE products SET product_type = ? WHERE id = ?', [type, productId]);
    return { type, componentCount: order };
}

module.exports = {
    COMPOSITE_TYPES,
    getComponents,
    getAvailableQty,
    searchComponentSkus,
    saveComposite,
};
