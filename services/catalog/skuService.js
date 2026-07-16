/*
 * skuService — 상품 SKU 읽기·미러 유틸
 *
 * 설계: docs/사이트개선/쇼핑몰_상품_옵션_세트_묶음_관리구조_정리.md §26.2, §29
 *
 * 전환기(Phase 2) 방침:
 *   - 모든 상품은 대표 SKU(is_default=1) 1행을 가진다.
 *   - 아직 SKU 편집 UI 가 없으므로 이 시점의 유일한 쓰기 주체는 상품 폼(products 컬럼)이다.
 *     따라서 상품 저장 시 products → 대표 SKU 로 **단방향 동기화**한다.
 *   - Phase 3 에서 SKU 가 원천이 되면 방향을 뒤집는다(SKU → products 미러).
 *
 * status 규칙: products.status 는 생명주기(ON/OFF/SOLD_OUT/COMING_SOON/RESTOCK).
 *   SKU.status 는 on/off 2값뿐 → OFF 만 OFF, 나머지는 ON. 구매가능 판정은
 *   products.status 게이트 + SKU 재고/on-off 의 합성으로 별도 처리한다.
 */

const pool = require('../../config/db');

/** products.status(5값) → sku.status(on/off) */
function mapProductStatusToSku(status) {
    return status === 'OFF' ? 'OFF' : 'ON';
}

/**
 * 상품의 대표 SKU 를 products 값으로 맞춘다(없으면 생성).
 * 단일상품·전환기 동기화용. price/stock/purchase_price/status 만 다룬다.
 *
 * @param {number} productId
 * @param {{mall_id?:number, price:number, stock:number, purchase_price?:number, status?:string, sku_code?:string}} fields
 * @param {object} [conn] 트랜잭션 커넥션(없으면 pool)
 */
async function syncDefaultSkuFromProduct(productId, fields, conn = pool) {
    const price = Number(fields.price) || 0;
    const stock = Number(fields.stock) || 0;
    const purchasePrice = Number(fields.purchase_price) || 0;
    const skuStatus = mapProductStatusToSku(fields.status);

    const [rows] = await conn.query(
        'SELECT id FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1',
        [productId]
    );

    if (rows.length) {
        await conn.query(
            `UPDATE product_sku
                SET price = ?, stock = ?, purchase_price = ?, status = ?
              WHERE id = ?`,
            [price, stock, purchasePrice, skuStatus, rows[0].id]
        );
        return rows[0].id;
    }

    const [result] = await conn.query(
        `INSERT INTO product_sku
            (mall_id, product_id, sku_code, purchase_price, price, stock, stock_managed, status, is_default)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1)`,
        [fields.mall_id || 1, productId, fields.sku_code || null, purchasePrice, price, stock, skuStatus]
    );
    return result.insertId;
}

/** 대표 SKU 상태만 동기화(일괄 상태 변경용). products.status → sku.status */
async function syncDefaultSkuStatus(productIds, productStatus, conn = pool) {
    const ids = Array.isArray(productIds) ? productIds : [productIds];
    if (!ids.length) return;
    await conn.query(
        'UPDATE product_sku SET status = ? WHERE product_id IN (?) AND is_default = 1',
        [mapProductStatusToSku(productStatus), ids]
    );
}

/** 상품의 대표 SKU 1행(가격·재고·상태). 없으면 null. */
async function getDefaultSku(productId, conn = pool) {
    const [rows] = await conn.query(
        'SELECT * FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1',
        [productId]
    );
    return rows[0] || null;
}

/** 상품의 전체 SKU 목록(옵션상품). display_order 순. */
async function getSkusByProduct(productId, conn = pool) {
    const [rows] = await conn.query(
        'SELECT * FROM product_sku WHERE product_id = ? ORDER BY is_default DESC, display_order, id',
        [productId]
    );
    return rows;
}

/**
 * 주문 라인의 실제 판매 SKU 를 해석한다.
 * skuId 가 주어지면 그 SKU(해당 상품 소속 확인), 없으면 대표 SKU.
 * @returns {object|null} product_sku 행
 */
async function resolveSkuForLine(productId, skuId, conn = pool) {
    if (skuId) {
        const [rows] = await conn.query(
            'SELECT * FROM product_sku WHERE id = ? AND product_id = ? LIMIT 1',
            [skuId, productId]
        );
        if (rows[0]) return rows[0];
    }
    const [rows] = await conn.query(
        'SELECT * FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1',
        [productId]
    );
    return rows[0] || null;
}

/**
 * 주문 라인 + 유효 SKU id(COALESCE(oi.sku_id, 대표 SKU)) 목록.
 * 배포 전 생성된 in-flight 주문은 sku_id 가 NULL 이므로 대표 SKU 로 폴백한다.
 */
async function getOrderLineSkus(conn, orderId) {
    const [rows] = await conn.query(
        `SELECT oi.product_id, oi.product_name, oi.quantity,
                COALESCE(oi.sku_id, ds.id) AS sku_id
           FROM order_items oi
           LEFT JOIN product_sku ds ON ds.product_id = oi.product_id AND ds.is_default = 1
          WHERE oi.order_id = ?`,
        [orderId]
    );
    return rows;
}

/** 복합상품 대표 SKU 의 구성 목록. 비복합이면 []. */
async function getComponentsOfComposite(conn, compositeProductId) {
    const [rows] = await conn.query(
        'SELECT component_sku_id, quantity FROM composite_component WHERE composite_product_id = ?',
        [compositeProductId]
    );
    return rows;
}

/**
 * 주문 재고 검증(차감 전). 유효 SKU 재고 기준.
 * 복합상품(대표 SKU stock_managed=0)은 구성 SKU 각각을 `수량×구성수량` 으로 검증.
 * @returns {{ok:boolean, productName?:string, available?:number}}
 */
async function validateStockForOrder(conn, orderId) {
    const lines = await getOrderLineSkus(conn, orderId);
    for (const line of lines) {
        if (!line.sku_id) return { ok: false, productName: line.product_name, available: 0 };
        const [[sku]] = await conn.query('SELECT id, product_id, stock, stock_managed FROM product_sku WHERE id = ?', [line.sku_id]);
        if (!sku) return { ok: false, productName: line.product_name, available: 0 };

        if (sku.stock_managed === 0) {
            const comps = await getComponentsOfComposite(conn, sku.product_id);
            if (!comps.length) return { ok: false, productName: line.product_name, available: 0 };
            for (const c of comps) {
                const need = line.quantity * c.quantity;
                const [[cs]] = await conn.query('SELECT stock FROM product_sku WHERE id = ?', [c.component_sku_id]);
                const cstock = (cs && cs.stock >= 0) ? cs.stock : 0;
                if (need > cstock) {
                    return { ok: false, productName: line.product_name, available: Math.floor(cstock / c.quantity) };
                }
            }
        } else {
            const available = (sku.stock != null && sku.stock >= 0) ? sku.stock : 0;
            if (line.quantity > available) return { ok: false, productName: line.product_name, available };
        }
    }
    return { ok: true };
}

/** 한 SKU 라인 차감(대표 SKU 면 products 미러 동반). FOR UPDATE 로 잠근 sku 행을 받는다. */
async function _deductSku(conn, sku, qty) {
    await conn.query('UPDATE product_sku SET stock = stock - ? WHERE id = ?', [qty, sku.id]);
    if (sku.is_default) await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, sku.product_id]);
}
async function _restoreSku(conn, sku, qty) {
    await conn.query('UPDATE product_sku SET stock = stock + ? WHERE id = ?', [qty, sku.id]);
    if (sku.is_default) await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, sku.product_id]);
}

/**
 * 주문 재고 차감(SKU 기준, FOR UPDATE). 대표 SKU 면 products.stock 미러도 같이 깎는다.
 * 복합상품(stock_managed=0)은 대표 SKU 를 건드리지 않고 구성 SKU 각각을 `수량×구성수량` 차감.
 * @returns {{ok:boolean}} 재고 부족 시 ok:false (호출측이 롤백)
 */
async function deductStockForOrder(conn, orderId) {
    const lines = await getOrderLineSkus(conn, orderId);
    for (const line of lines) {
        if (!line.sku_id) return { ok: false };
        const [[sku]] = await conn.query(
            'SELECT id, product_id, stock, is_default, stock_managed FROM product_sku WHERE id = ? FOR UPDATE',
            [line.sku_id]
        );
        if (!sku) return { ok: false };

        if (sku.stock_managed === 0) {
            const comps = await getComponentsOfComposite(conn, sku.product_id);
            if (!comps.length) return { ok: false };
            for (const c of comps) {
                const need = line.quantity * c.quantity;
                const [[cs]] = await conn.query('SELECT id, product_id, stock, is_default FROM product_sku WHERE id = ? FOR UPDATE', [c.component_sku_id]);
                const cstock = (cs && cs.stock >= 0) ? cs.stock : 0;
                if (!cs || need > cstock) return { ok: false };
                await _deductSku(conn, cs, need);
            }
        } else {
            const stock = (sku.stock != null && sku.stock >= 0) ? sku.stock : 0;
            if (line.quantity > stock) return { ok: false };
            await _deductSku(conn, sku, line.quantity);
        }
    }
    return { ok: true };
}

/**
 * 주문 재고 복원(SKU 기준). 차감과 대칭. 복합상품은 구성 SKU 각각을 되돌린다.
 * 멱등 가드는 호출측(orderCancelService)이 책임진다.
 */
async function restoreStockForOrder(conn, orderId) {
    const lines = await getOrderLineSkus(conn, orderId);
    for (const line of lines) {
        if (!line.sku_id) continue;
        const [[sku]] = await conn.query(
            'SELECT id, product_id, is_default, stock_managed FROM product_sku WHERE id = ? FOR UPDATE',
            [line.sku_id]
        );
        if (!sku) continue;

        if (sku.stock_managed === 0) {
            const comps = await getComponentsOfComposite(conn, sku.product_id);
            for (const c of comps) {
                const [[cs]] = await conn.query('SELECT id, product_id, is_default FROM product_sku WHERE id = ? FOR UPDATE', [c.component_sku_id]);
                if (cs) await _restoreSku(conn, cs, line.quantity * c.quantity);
            }
        } else {
            await _restoreSku(conn, sku, line.quantity);
        }
    }
}

module.exports = {
    mapProductStatusToSku,
    syncDefaultSkuFromProduct,
    syncDefaultSkuStatus,
    getDefaultSku,
    getSkusByProduct,
    resolveSkuForLine,
    getOrderLineSkus,
    validateStockForOrder,
    deductStockForOrder,
    restoreStockForOrder,
};
