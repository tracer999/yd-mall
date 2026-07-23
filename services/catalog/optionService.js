/*
 * optionService — 옵션상품(Variant) 정의·SKU 생성·해석
 *
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §5, §11, §26.5·26.6
 *
 * 데이터 모델:
 *   product_option (상품 확정 옵션명) — product_option_value (옵션값)
 *   product_sku (옵션 조합별 SKU) — sku_option_value (SKU ↔ 옵션값 매핑)
 *
 * 옵션상품은 대표 SKU(is_default)를 두지 않는다. 구매는 항상 선택 SKU(sku_id)로 이뤄진다.
 * 단일상품 대표 SKU 관리는 skuService.syncDefaultSkuFromProduct 가 담당한다(별개 경로).
 */

const pool = require('../../config/db');
const skuService = require('./skuService');

/**
 * 상품의 옵션 + SKU 조합을 조회한다(관리자 편집/고객 표시 공용).
 *
 * 기본(대표) SKU 는 옵션 조합이 아니라서 기본적으로 제외한다 — 고객 상세의 옵션 셀렉트에
 * 조합 아닌 행이 섞이면 안 된다. 관리자 편집기만 `includeDefault` 로 함께 받아
 * 단일상품의 기본 SKU 를 화면에 띄운다.
 *
 * @param {number} productId
 * @param {object} [conn]
 * @param {{includeDefault?: boolean}} [opts]
 * @returns {{options: Array, skus: Array, defaultSku: object|null}}
 *   options: [{id, option_name, values:[{id, value_name}]}]
 *   skus: [{id, sku_code, price, stock, status, valueIds:[product_option_value_id...]}]
 *   defaultSku: 대표 SKU 1행(없으면 null) — includeDefault 일 때만 채운다
 */
async function getProductOptionsAndSkus(productId, conn = pool, opts = {}) {
    const [options] = await conn.query(
        'SELECT id, option_name, display_order FROM product_option WHERE product_id = ? ORDER BY display_order, id',
        [productId]
    );
    const optIds = options.map((o) => o.id);
    let values = [];
    if (optIds.length) {
        [values] = await conn.query(
            'SELECT id, product_option_id, value_name, display_order FROM product_option_value WHERE product_option_id IN (?) ORDER BY display_order, id',
            [optIds]
        );
    }
    for (const o of options) {
        o.values = values.filter((v) => v.product_option_id === o.id);
    }

    const [skus] = await conn.query(
        'SELECT id, sku_code, barcode, price, stock, status FROM product_sku WHERE product_id = ? AND is_default = 0 ORDER BY display_order, id',
        [productId]
    );
    if (skus.length) {
        const [links] = await conn.query(
            `SELECT sov.sku_id, sov.product_option_value_id
               FROM sku_option_value sov
               JOIN product_sku s ON s.id = sov.sku_id
              WHERE s.product_id = ?`,
            [productId]
        );
        for (const s of skus) {
            s.valueIds = links.filter((l) => l.sku_id === s.id).map((l) => l.product_option_value_id);
        }
    }

    let defaultSku = null;
    if (opts.includeDefault) {
        const [drows] = await conn.query(
            'SELECT id, sku_code, barcode, price, stock, status FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1',
            [productId]
        );
        defaultSku = drows[0] || null;
    }
    return { options, skus, defaultSku };
}

/**
 * 옵션상품 저장(전체 재구성). 트랜잭션 커넥션 필수.
 *
 * @param {object} conn 트랜잭션 커넥션
 * @param {number} productId
 * @param {number} mallId
 * @param {{options: Array<{name:string, values:string[]}>,
 *          skus: Array<{valueNames:string[], price:number, stock:number, sku_code?:string, barcode?:string, status?:string}>,
 *          defaultSku?: {price:number, stock:number, sku_code?:string, barcode?:string, status?:string}}} payload
 *
 * 기존 **옵션 SKU** 는 지우고 새로 만든다(order_items.sku_id 는 FK 없는 스냅샷이라 이력 보존).
 * 기본(대표) SKU 는 지우지 않는다 — 화면에서 삭제할 수 없는 행이고, 단일상품의 재고·가격이
 * 여기 있다. payload.defaultSku 가 오면 그 값으로 갱신한다.
 * composite_component 가 참조하는 SKU 는 FK RESTRICT 로 보호되므로, 세트 구성 중인 SKU 가
 * 있으면 삭제가 막혀 예외가 난다(호출측이 롤백).
 */
/**
 * 화면에서 편집한 기본(대표) SKU 값을 반영한다. 대표 SKU 가 없으면 아무것도 하지 않는다
 * (옵션상품은 대표 SKU 를 두지 않으므로 이 경로로 새로 만들지 않는다).
 *
 * products.price/stock 으로도 되쓴다. 상품 폼이 저장될 때 products → 대표 SKU 로
 * 단방향 미러가 일어나므로(skuService), 여기서 되써 두지 않으면 폼 저장 한 번에
 * 이 화면에서 고친 값이 옛 값으로 되돌아간다.
 */
async function applyDefaultSku(conn, productId, mallId, ds) {
    if (!ds) return null;
    const [drows] = await conn.query(
        'SELECT id FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1',
        [productId]
    );
    if (!drows.length) return null;

    const price = Number(ds.price) || 0;
    const stock = Number(ds.stock) || 0;
    await conn.query(
        `UPDATE product_sku
            SET price = ?, stock = ?, sku_code = ?, barcode = ?, status = ?
          WHERE id = ?`,
        [price, stock, ds.sku_code || null, ds.barcode || null,
         ds.status === 'OFF' ? 'OFF' : 'ON', drows[0].id]
    );
    await conn.query('UPDATE products SET price = ?, stock = ? WHERE id = ?', [price, stock, productId]);
    return drows[0].id;
}

async function saveOptionProduct(conn, productId, mallId, payload) {
    const options = Array.isArray(payload.options) ? payload.options.filter((o) => o.name && o.values && o.values.length) : [];
    const skus = Array.isArray(payload.skus) ? payload.skus : [];

    // 1) 기존 옵션·옵션SKU 제거. 기본 SKU 는 남긴다(is_default = 0 조건).
    await conn.query('DELETE FROM product_option WHERE product_id = ?', [productId]); // value 는 CASCADE
    await conn.query('DELETE FROM product_sku WHERE product_id = ? AND is_default = 0', [productId]); // sku_option_value 는 CASCADE

    if (options.length) {
        /*
         * 옵션상품이 되면 기본 SKU 를 없앤다. 화면에서 "삭제 불가" 인 것은 사용자가 그 행만
         * 지우는 조작을 막는다는 뜻이고, 단일 → 옵션 전환은 상품 구조 자체가 바뀌는 것이다.
         * 남겨 두면 어떤 옵션 조합에도 매핑되지 않은 SKU 가 sellableStock 합에 그대로 더해져
         * **판매가능재고가 이중 계상**된다(옵션상품은 대표 SKU 를 두지 않는다 — 이 파일 헤더).
         */
        await conn.query('DELETE FROM product_sku WHERE product_id = ? AND is_default = 1', [productId]);
    } else {
        // 2) 기본 SKU 갱신 — 이 화면이 단일상품 재고·가격의 편집 창구다.
        //    products.price/stock 으로 미러백하지 않으면 상품 폼을 저장할 때 옛 값으로 되돌아간다.
        await applyDefaultSku(conn, productId, mallId, payload.defaultSku);
    }

    if (!options.length) {
        // 옵션이 없으면 단일상품으로 되돌린다.
        await conn.query('UPDATE products SET product_type = ? WHERE id = ?', ['SINGLE', productId]);
        /*
         * 대표 SKU 가 아직 없으면 여기서 즉시 만든다. 관리자가 상품 폼을 다시 저장하기
         * 전까지 SKU 0 행으로 남으면 재고가 0 으로 판정된다(sellableStock).
         * 모든 상품은 항상 SKU 를 1행 이상 갖는다는 규칙을 이 경로에서도 지킨다.
         */
        const [[p]] = await conn.query(
            'SELECT mall_id, price, stock, purchase_price, product_code FROM products WHERE id = ?',
            [productId]
        );
        if (p) {
            await skuService.syncDefaultSkuFromProduct(productId, {
                mall_id: p.mall_id || mallId,
                price: p.price,
                stock: p.stock,
                purchase_price: p.purchase_price,
                sku_code: p.product_code,
            }, conn);
        }
        return { optionCount: 0, skuCount: 0 };
    }

    // 2) 옵션명·옵션값 생성 → 이름→value_id 조회 맵
    const valueIdByKey = new Map(); // `${optIdx}::${valueName}` → product_option_value_id
    for (let oi = 0; oi < options.length; oi++) {
        const opt = options[oi];
        const [optRes] = await conn.query(
            'INSERT INTO product_option (product_id, option_name, display_order) VALUES (?, ?, ?)',
            [productId, String(opt.name).trim().slice(0, 50), oi]
        );
        const optionId = optRes.insertId;
        const seen = new Set();
        let vi = 0;
        for (const raw of opt.values) {
            const name = String(raw).trim().slice(0, 100);
            if (!name || seen.has(name)) continue;
            seen.add(name);
            const [vRes] = await conn.query(
                'INSERT INTO product_option_value (product_option_id, value_name, display_order) VALUES (?, ?, ?)',
                [optionId, name, vi++]
            );
            valueIdByKey.set(`${oi}::${name}`, vRes.insertId);
        }
    }

    // 3) SKU 조합 생성 + sku_option_value 링크
    let skuCount = 0;
    for (let si = 0; si < skus.length; si++) {
        const s = skus[si];
        const valueNames = Array.isArray(s.valueNames) ? s.valueNames : [];
        // 조합 유효성: 옵션 수만큼 값이 있어야 하고, 각 값이 실제 정의된 값이어야 한다.
        if (valueNames.length !== options.length) continue;
        const valueIds = [];
        let valid = true;
        for (let oi = 0; oi < options.length; oi++) {
            const vid = valueIdByKey.get(`${oi}::${String(valueNames[oi]).trim().slice(0, 100)}`);
            if (!vid) { valid = false; break; }
            valueIds.push(vid);
        }
        if (!valid) continue;

        const [skuRes] = await conn.query(
            `INSERT INTO product_sku
                (mall_id, product_id, sku_code, barcode, price, stock, stock_managed, status, is_default, display_order)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?)`,
            [mallId, productId, s.sku_code || null, s.barcode || null,
             Number(s.price) || 0, Number(s.stock) || 0,
             s.status === 'OFF' ? 'OFF' : 'ON', si]
        );
        const skuId = skuRes.insertId;
        for (let oi = 0; oi < valueIds.length; oi++) {
            // product_option_id 도 필요 → 값에서 역참조
            const [[vrow]] = await conn.query('SELECT product_option_id FROM product_option_value WHERE id = ?', [valueIds[oi]]);
            await conn.query(
                'INSERT INTO sku_option_value (sku_id, product_option_id, product_option_value_id) VALUES (?, ?, ?)',
                [skuId, vrow.product_option_id, valueIds[oi]]
            );
        }
        skuCount++;
    }

    await conn.query('UPDATE products SET product_type = ? WHERE id = ?', ['OPTION', productId]);
    return { optionCount: options.length, skuCount };
}

/**
 * 선택된 옵션값 id 조합 → SKU 해석(고객 구매 시).
 * @param {number} productId
 * @param {number[]} valueIds 선택한 product_option_value_id 들(옵션 개수만큼)
 * @returns {object|null} product_sku 행
 */
async function resolveSkuByOptionValueIds(productId, valueIds, conn = pool) {
    if (!Array.isArray(valueIds) || !valueIds.length) return null;
    // 상품의 옵션 개수
    const [[{ optCount }]] = await conn.query(
        'SELECT COUNT(*) AS optCount FROM product_option WHERE product_id = ?', [productId]
    );
    if (Number(optCount) !== valueIds.length) return null;

    // 선택 값 전부를 매핑한 SKU 를 찾는다(정확히 일치하는 조합).
    const [rows] = await conn.query(
        `SELECT s.id
           FROM product_sku s
           JOIN sku_option_value sov ON sov.sku_id = s.id
          WHERE s.product_id = ? AND s.is_default = 0 AND sov.product_option_value_id IN (?)
          GROUP BY s.id
         HAVING COUNT(DISTINCT sov.product_option_value_id) = ?`,
        [productId, valueIds, valueIds.length]
    );
    if (!rows.length) return null;
    const [[sku]] = await conn.query('SELECT * FROM product_sku WHERE id = ?', [rows[0].id]);
    return sku;
}

/**
 * SKU 의 옵션 조합 라벨(예: "블랙 / M"). 옵션 SKU 가 아니면 null.
 * 주문 스냅샷(order_items.option_snapshot)·주문내역 표기용.
 */
async function getSkuOptionLabel(skuId, conn = pool) {
    const [rows] = await conn.query(
        `SELECT pov.value_name
           FROM sku_option_value sov
           JOIN product_option_value pov ON pov.id = sov.product_option_value_id
           JOIN product_option po ON po.id = sov.product_option_id
          WHERE sov.sku_id = ?
          ORDER BY po.display_order, po.id`,
        [skuId]
    );
    return rows.length ? rows.map((r) => r.value_name).join(' / ') : null;
}

module.exports = {
    getProductOptionsAndSkus,
    saveOptionProduct,
    resolveSkuByOptionValueIds,
    getSkuOptionLabel,
};
