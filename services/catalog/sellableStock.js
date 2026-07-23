/*
 * sellableStock — "판매 가능 재고" 의 단일 정의
 *
 * 재고의 소스 오브 트루스는 product_sku 다. products.stock 은 단일상품에서만 대표 SKU 와
 * 미러되고 옵션상품에서는 갱신되지 않아 stale 하다(skuService.js 헤더의 전환기 방침).
 *
 * 그래서 "팔 수 있는가" 판정이 세 곳에서 서로 달랐다.
 *
 *   프론트 카드    products.stock > 0             → 옵션상품은 재고가 있어도 무조건 SOLD OUT
 *   관리자 필터    sku.stock > 0 (status 무시)    → 전 SKU 가 OFF 인 상품도 "재고 있음" 으로 잡힘
 *   결제·옵션선택  sku.status='ON' AND stock > 0  → 실제로 살 수 있는 기준
 *
 * 결제가 쓰는 기준이 정답이므로(그걸 통과해야 실제로 팔린다) 그 정의를 여기 한 곳에 두고
 * 세 경로가 모두 이 모듈을 통해서만 판정하게 한다.
 *
 *      판매가능재고 = SUM(sku.stock) WHERE sku.status = 'ON' AND sku.stock_managed = 1
 *
 * stock_managed = 0 은 재고를 자기가 들고 있지 않은 SKU(복합상품 등)라 합에서 뺀다.
 * 복합상품의 가용수량은 구성에서 파생하므로 compositeService.getAvailableQty() 가 따로 낸다.
 *
 * 값을 어느 테이블에도 write 하지 않는다 — dealService·b2bPricingService 와 같은
 * read-time 리졸버다. products.stock 을 SKU 합의 미러로 유지하는 방식도 검토했으나,
 * SKU 를 건드리는 쓰기 경로 8곳(옵션 저장·일괄 상태변경·결제 차감·주문취소 복원·B2B 주문·
 * 임포터·Shopify 웹훅·상품폼)에 재계산을 심어야 하고 이 버그를 낳은 drift 위험을
 * 그대로 안게 되어 택하지 않았다.
 *
 * 쓰는 법은 둘이고, 아래 SELLABLE_COND 라는 같은 조건식을 공유한다.
 *   1) SELECT 절을 고칠 수 있는 쿼리 → sellableStockSql() / inStockSql() 을 쿼리에 박는다.
 *      쿼리 자체가 값을 실어 오므로 "decorate 호출을 깜빡" 할 수가 없다.
 *   2) SELECT 절을 못 고치는 쿼리 → decorate() 로 후처리한다.
 *      상품 목록·카테고리 베스트는 `SELECT *` 를 `SELECT COUNT(*)` 로 문자열 치환해
 *      카운트를 내기 때문에(productController.js §27 주석) SELECT 절에 컬럼을 못 붙인다.
 */

const pool = require('../../config/db');

/**
 * 판매 가능 SKU 의 조건. 이 파일의 모든 판정이 이 한 줄에서 나온다.
 * @param {string} s product_sku 별칭('' 이면 별칭 없이)
 */
const sellableCond = (s = '') => {
    const q = s ? `${s}.` : '';
    return `${q}status = 'ON' AND ${q}stock_managed = 1`;
};

/**
 * SELECT 절에 넣을 판매가능재고 스칼라 서브쿼리.
 * product_sku.idx_sku_product 를 타므로 카드 쿼리(LIMIT 수십 건)에서 비용은 무시할 수준이다.
 *
 * 별칭을 `stock` 으로 두면 뷰(product_card.ejs 등)가 손대지 않고 판매가능재고를 읽는다.
 *   SELECT p.id, ${sellableStockSql('p')} AS stock FROM products p ...
 *
 * @param {string} alias products 테이블 별칭
 */
function sellableStockSql(alias = 'p') {
    return `(SELECT COALESCE(SUM(_ss.stock), 0) FROM product_sku _ss
              WHERE _ss.product_id = ${alias}.id AND ${sellableCond('_ss')})`;
}

/**
 * WHERE 절용 — 살 수 있는 SKU 가 하나라도 있는가.
 *   ... WHERE ${inStockSql('p')}
 * 부정은 호출부에서 `NOT ${inStockSql('p')}` 로 쓴다.
 *
 * @param {string} alias products 테이블 별칭
 */
function inStockSql(alias = 'p') {
    return `EXISTS (SELECT 1 FROM product_sku _si
                     WHERE _si.product_id = ${alias}.id
                       AND ${sellableCond('_si')}
                       AND _si.stock > 0)`;
}

/**
 * 상품 여러 건의 판매가능재고를 한 번에 읽는다. 쿼리 1회.
 * @param {Array<number>} productIds
 * @returns {Promise<Map<number, number>>} SKU 가 하나도 없는 상품은 Map 에 없다.
 */
async function loadSellableStock(productIds, conn = pool) {
    const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return new Map();

    // 조건을 WHERE 가 아니라 SUM(CASE ...) 로 건다. WHERE 로 거르면 **전 SKU 가 OFF 인 상품은
    // 그룹 자체가 안 생겨** Map 에서 빠지고, decorate 가 이를 "SKU 없음" 으로 오해해
    // stale 한 products.stock 을 그대로 둔다(= 못 파는 상품이 판매중으로 보인다).
    // SKU 행이 하나라도 있으면 항상 엔트리를 만들어(전 OFF 면 0) sellableStockSql() 과 값이 같아진다.
    const [rows] = await conn.query(
        `SELECT product_id,
                COALESCE(SUM(CASE WHEN ${sellableCond()} THEN stock ELSE 0 END), 0) AS sellable_stock
           FROM product_sku
          WHERE product_id IN (?)
          GROUP BY product_id`,
        [ids]
    );
    return new Map(rows.map((r) => [Number(r.product_id), Number(r.sellable_stock)]));
}

/**
 * 이미 읽어 온 상품 행들에 판매가능재고를 덮어쓴다(SELECT 절을 못 고치는 쿼리용).
 *
 * `stock` 을 덮어써야 뷰·JSON-LD 가 고쳐지지 않은 채로 맞는 값을 읽는다.
 * 원본이 필요하면 `raw_stock` 에 남겨 둔다.
 *
 * SKU 행이 하나도 없으면 **재고 0** 이다. 예전엔 products.stock 으로 폴백했는데,
 * 재고의 소스 오브 트루스가 SKU 인 이상 "SKU 가 없다 = 팔 물건이 없다" 로 읽는 게 맞다.
 * 모든 상품은 대표 SKU 를 갖게 되어(skuService) 이 분기는 사실상 방어선이다.
 *
 * @param {Array<object>|object} rows 상품 행(배열 또는 단건)
 * @param {{idKey?: string}} [opts] 상품 id 가 담긴 키(장바구니·히어로 슬라이드는 'product_id')
 */
async function decorate(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
    if (list.length === 0) return rows;

    const idKey = opts.idKey || 'id';
    const stockMap = await loadSellableStock(list.map((r) => r && r[idKey]));

    for (const row of list) {
        if (!row) continue;
        const sellable = stockMap.get(Number(row[idKey])) ?? 0; // SKU 없음 → 재고 0
        row.raw_stock = row.stock;
        row.stock = sellable;
        row.sellable_stock = sellable;
    }
    return rows;
}

module.exports = { sellableCond, sellableStockSql, inStockSql, loadSellableStock, decorate };
