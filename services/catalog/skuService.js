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
 * status 규칙: 두 값은 **서로 다른 것을 뜻하며 전파하지 않는다.**
 *   products.status  상품 자체의 판매 여부. 노출(목록)·장바구니·결제를 막는 유일한 게이트다
 *                    (productController 목록 쿼리 / cartController / checkoutController).
 *   sku.status       옵션 선택 셀렉트 박스에 그 옵션을 띄울지 말지(detail.ejs 의 sellable 판정).
 *
 *   그래서 상품을 판매중지해도 SKU 는 건드리지 않는다 — 상품 게이트가 이미 막고,
 *   SKU 까지 내리면 상품을 다시 켤 때 고를 수 있는 옵션이 하나도 없는 상태가 된다.
 *   판매 상태·노출은 **상품 마스터에서만** 갱신한다.
 */

const pool = require('../../config/db');

/**
 * 상품의 대표 SKU 를 products 값으로 맞춘다(없으면 생성).
 * 단일상품·전환기 동기화용. price/stock/purchase_price 를 다룬다.
 *
 * status 는 미러하지 않는다 — 상품 판매중지는 products.status 게이트가 담당하고
 * sku.status 는 옵션 노출 설정이라 별개다(파일 헤더). 새로 만드는 SKU 는 항상 ON.
 * fields.status 를 넘겨도 무시하므로 호출부는 그대로 둬도 된다.
 *
 * `fields.stock` 이 undefined 면 재고를 건드리지 않는다(신규 생성 시에만 0). 재고의 편집
 * 창구는 옵션·SKU 화면이라, 상품 폼 저장이 그 값을 덮어쓰면 안 된다.
 *
 * @param {number} productId
 * @param {{mall_id?:number, price:number, stock:number, purchase_price?:number, sku_code?:string}} fields
 * @param {object} [conn] 트랜잭션 커넥션(없으면 pool)
 */
async function syncDefaultSkuFromProduct(productId, fields, conn = pool) {
    /*
     * 옵션상품은 대표 SKU 를 두지 않는다(optionService 헤더). 그런데 상품 편집 폼은
     * product_type 을 보지 않고 이 함수를 부르기 때문에, 옵션상품을 폼에서 한 번만
     * 저장해도 대표 SKU 가 되살아났다. 그러면 sellableStock 이 옵션 SKU 합에
     * 폼의 products.stock 을 한 번 더 더해 **판매가능재고가 이중 계상**된다.
     * 가드를 호출부가 아니라 여기 두는 이유: 호출부가 늘어도 규칙이 새지 않는다.
     */
    const [[prow]] = await conn.query('SELECT product_type FROM products WHERE id = ?', [productId]);
    if (prow && prow.product_type === 'OPTION') return null;

    const price = Number(fields.price) || 0;
    const purchasePrice = Number(fields.purchase_price) || 0;
    const touchStock = fields.stock !== undefined && fields.stock !== null;
    const stock = touchStock ? (Number(fields.stock) || 0) : 0;

    const [rows] = await conn.query(
        'SELECT id FROM product_sku WHERE product_id = ? AND is_default = 1 LIMIT 1',
        [productId]
    );

    if (rows.length) {
        // sku_code 는 예전엔 INSERT 에서만 넣어, 상품 폼에서 상품코드를 바꿔도 대표 SKU 는
        // 옛 코드를 들고 있었다(외부몰 발행 시 sellerManagerCode 가 어긋난다).
        // 다만 빈 값으로 덮어 지우지는 않는다 — COALESCE 로 값이 있을 때만 갱신.
        const sets = ['price = ?', 'purchase_price = ?', 'sku_code = COALESCE(?, sku_code)'];
        const vals = [price, purchasePrice, fields.sku_code || null];
        if (touchStock) { sets.splice(1, 0, 'stock = ?'); vals.splice(1, 0, stock); }
        vals.push(rows[0].id);
        await conn.query(`UPDATE product_sku SET ${sets.join(', ')} WHERE id = ?`, vals);
        return rows[0].id;
    }

    const [result] = await conn.query(
        `INSERT INTO product_sku
            (mall_id, product_id, sku_code, purchase_price, price, stock, stock_managed, status, is_default)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'ON', 1)`,
        [fields.mall_id || 1, productId, fields.sku_code || null, purchasePrice, price, stock]
    );
    return result.insertId;
}

/*
 * syncSkuStatusForProducts 는 제거했다.
 *
 * 상품 상태를 SKU 로 전파하던 함수인데, 전파 자체가 잘못된 전제였다. 상품 판매중지는
 * products.status 게이트만으로 노출·장바구니·결제가 전부 막히므로 SKU 를 내릴 이유가 없고,
 * 내려 두면 다시 켤 때 옵션이 전부 품절로 보여 살 수 있는 조합이 하나도 없었다.
 * 판매 상태·노출은 상품 마스터에서만 갱신하고, SKU 의 on/off 는 옵션·SKU 화면이 관장한다.
 */

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
        `SELECT oi.id AS order_item_id, oi.product_id, oi.product_name, oi.quantity,
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

/**
 * 주문의 **일부 품목만** 재고를 되돌린다(부분 취소·부분 반품).
 * 전건 복원(restoreStockForOrder)과 같은 규칙을 쓰되 수량만 지정분으로 바꾼다 —
 * 복합상품이면 구성 SKU 를 `되돌릴수량 × 구성수량` 만큼 되돌리는 것도 그대로다.
 *
 * @param {Map<number, number>} qtyByItemId order_items.id → 되돌릴 수량
 */
async function restoreStockForItems(conn, orderId, qtyByItemId) {
    const lines = await getOrderLineSkus(conn, orderId);
    for (const line of lines) {
        const qty = Number(qtyByItemId.get(Number(line.order_item_id))) || 0;
        if (qty <= 0 || !line.sku_id) continue;

        const [[sku]] = await conn.query(
            'SELECT id, product_id, is_default, stock_managed FROM product_sku WHERE id = ? FOR UPDATE',
            [line.sku_id]
        );
        if (!sku) continue;

        if (sku.stock_managed === 0) {
            const comps = await getComponentsOfComposite(conn, sku.product_id);
            for (const c of comps) {
                const [[cs]] = await conn.query('SELECT id, product_id, is_default FROM product_sku WHERE id = ? FOR UPDATE', [c.component_sku_id]);
                if (cs) await _restoreSku(conn, cs, qty * c.quantity);
            }
        } else {
            await _restoreSku(conn, sku, qty);
        }
    }
}

module.exports = {
    syncDefaultSkuFromProduct,
    getDefaultSku,
    getSkusByProduct,
    resolveSkuForLine,
    getOrderLineSkus,
    validateStockForOrder,
    deductStockForOrder,
    restoreStockForOrder,
    restoreStockForItems,
};
