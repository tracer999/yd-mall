const pool = require('../../config/db');

/*
 * ── B2B 가격 리졸버 (단순화판) ──
 *
 * services/deal/dealService.js 의 원칙을 그대로 계승한다:
 * **어떤 테이블에도 가격을 write 하지 않는다.** 읽는 시점에 계산해 덮는 read-time 리졸버다.
 * 개발 DB = 운영 DB 인 이 프로젝트에서 B2B 가격이 products.price 를 건드리면
 * 소스 오브 트루스가 오염된다.
 *
 * 가격은 **금액이 아니라 할인율**로만 정한다. 판매가가 바뀌면 전용가도 따라 움직인다.
 *
 *      전용가 = 판매가 × (1 − (상품 할인율 + 거래처 추가 할인율) / 100)
 *
 * 층이 둘뿐이고 **단순 합산**이다. 상품 30% + 거래처 5% = 35% 할인.
 * 수량 구간가·등급가·계약가 같은 층은 두지 않는다 — 수량이나 거래 조건에 따라 값이
 * 달라져야 하면 **견적 단계에서 담당자가 협의**한다.
 *
 * ⚠️ 확정 견적가는 이 리졸버를 타지 않는다. 견적은 "그때 합의한 값"이 절대적이라
 *    현재 할인율로 다시 계산하면 안 된다(설계 §8.3, §17.3). 주문 라인에 이미
 *    source_type 이 박혀 있으면(견적·특가 등) 건드리지 않는다.
 */

/** 할인율 상한 — 합산 결과가 이 값을 넘지 않게 자른다(0원·음수 단가 방지). */
const MAX_DISCOUNT_RATE = 99;

/**
 * 컨텍스트가 B2B 전용가를 볼 자격이 있는가.
 * 승인된 사업자만 본다. 심사 중·반려·개인 구매 모드는 일반 판매가로 산다.
 */
function hasBusinessContext(b2b) {
    return !!(b2b && b2b.active === true);
}

/** 수량이 최소 주문수량을 만족하는지. 실패 사유를 돌려준다(없으면 null). */
function validateQuantity(setting, quantity) {
    const qty = Number(quantity) || 0;
    const moq = Number(setting.min_order_qty) || 1;
    if (qty < moq) return `최소 주문수량은 ${moq}개입니다`;
    return null;
}

/**
 * 상품 여러 건의 B2B 설정을 한 번에 읽는다. 쿼리 1회.
 * @returns {Promise<Map<number, object>>} B2B 판매를 켜지 않은 상품은 없다.
 */
async function loadSettings(productIds) {
    const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const [rows] = await pool.query(
        `SELECT s.product_id, s.is_b2b_sale, s.discount_rate, s.min_order_qty,
                p.price AS list_price, p.tax_type
           FROM product_b2b_setting s
           JOIN products p ON p.id = s.product_id
          WHERE s.product_id IN (?) AND s.is_b2b_sale = 1`,
        [ids]
    );
    const map = new Map();
    for (const r of rows) map.set(Number(r.product_id), r);
    return map;
}

/**
 * 한 상품의 전용가를 계산한다.
 *
 * @returns {{
 *   unitPrice:number, listPrice:number, discountRate:number,
 *   productRate:number, extraRate:number, priceSource:string,
 *   taxType:string, minOrderQty:number
 * }}
 */
function computePrice(setting, b2b) {
    const listPrice = Number(setting.list_price) || 0;
    const productRate = Number(setting.discount_rate) || 0;
    const extraRate = Number(b2b.extraDiscountRate) || 0;

    const total = Math.min(MAX_DISCOUNT_RATE, Math.max(0, productRate + extraRate));
    const unitPrice = total > 0 ? Math.floor(listPrice * (1 - total / 100)) : listPrice;

    return {
        unitPrice,
        listPrice,
        discountRate: total,
        productRate,
        extraRate,
        priceSource: total > 0 ? 'B2B_DISCOUNT' : 'B2C_FALLBACK',
        taxType: setting.tax_type || 'TAXABLE',
        minOrderQty: Number(setting.min_order_qty) || 1,
    };
}

/** 목록·카드용. 상품 N건을 쿼리 1회로. */
async function resolveForProducts(b2b, productIds) {
    if (!hasBusinessContext(b2b)) return new Map();
    const loaded = await loadSettings(productIds);
    const out = new Map();
    for (const [pid, setting] of loaded) out.set(pid, computePrice(setting, b2b));
    return out;
}

/** 상품 상세용 단건. B2B 판매를 안 하는 상품이면 null. */
async function resolveForProduct({ b2b, productId }) {
    if (!hasBusinessContext(b2b)) return null;
    const loaded = await loadSettings([productId]);
    const setting = loaded.get(Number(productId));
    return setting ? computePrice(setting, b2b) : null;
}

/**
 * 목록 행에 전용가를 얹는다. 카드 컴포넌트(views/partials/product_card.ejs)가 이 필드를 본다.
 * 비활성 컨텍스트면 **아무 필드도 붙이지 않는다** → 카드는 예전과 똑같이 product.price 를 그린다.
 */
async function decorateProducts(b2b, rows) {
    if (!hasBusinessContext(b2b) || !Array.isArray(rows) || rows.length === 0) return rows;
    const priced = await resolveForProducts(b2b, rows.map((r) => Number(r.id || r.product_id)));
    if (priced.size === 0) return rows;

    for (const row of rows) {
        const info = priced.get(Number(row.id || row.product_id));
        if (!info || info.priceSource === 'B2C_FALLBACK') continue;
        row.b2b_unit_price = info.unitPrice;
        row.b2b_list_price = info.listPrice;
        row.b2b_discount_rate = info.discountRate;
        row.b2b_min_qty = info.minOrderQty;
    }
    return rows;
}

/**
 * 주문 라인에 전용가를 적용한다. dealService.applyToScopeItems 와 같은 시그니처다.
 *
 * ⚠️ **dealSvc.applyToScopeItems 보다 먼저** 호출해야 한다. 여기서 찍는 source_type='B2B' 를
 *    특가 리졸버가 보고 그 라인을 건너뛴다(dealService.js:172). 그래야 전용가 레인과
 *    프로모션 레인이 섞이지 않는다 — 특가 코드는 한 줄도 고치지 않는다.
 *
 * source_type 이 이미 있는 라인(확정 견적가 등)은 건드리지 않는다.
 * 비활성 컨텍스트면 items 를 그대로 돌려준다 — B2C 경로에 회귀를 만들지 않는다.
 */
async function applyToScopeItems(b2b, items) {
    if (!hasBusinessContext(b2b)) return items;
    const targets = (items || []).filter((i) => i && !i.source_type);
    if (targets.length === 0) return items;

    const loaded = await loadSettings(targets.map((i) => i.product_id));
    if (loaded.size === 0) return items;

    for (const item of targets) {
        const setting = loaded.get(Number(item.product_id));
        if (!setting) continue;
        const priced = computePrice(setting, b2b);
        if (priced.priceSource === 'B2C_FALLBACK') continue;   // 할인율 0 이면 아무것도 안 한 것과 같다
        item.price = priced.unitPrice;
        item.source_type = 'B2B';
        item.price_source = priced.priceSource;
        item.list_price = priced.listPrice;
        item.tax_type = priced.taxType;
    }
    return items;
}

/**
 * 주문 직전 최소 주문수량 재검증. 위반 라인의 사유 목록을 돌려준다.
 * @returns {Promise<Array<{productId:number, reason:string}>>}
 */
async function validateOrderItems(b2b, items) {
    if (!hasBusinessContext(b2b)) return [];
    const loaded = await loadSettings((items || []).map((i) => i.product_id));
    const errors = [];
    for (const item of items || []) {
        const setting = loaded.get(Number(item.product_id));
        if (!setting) continue;
        const reason = validateQuantity(setting, item.quantity);
        if (reason) errors.push({ productId: item.product_id, reason });
    }
    return errors;
}

module.exports = {
    MAX_DISCOUNT_RATE,
    hasBusinessContext,
    validateQuantity,
    resolveForProducts,
    resolveForProduct,
    decorateProducts,
    applyToScopeItems,
    validateOrderItems,
};
