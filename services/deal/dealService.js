const pool = require('../../config/db');

/*
 * ── 쇼핑특가 (docs/사이트개선/shopping_deal_design.md) ──
 *
 * 특가는 **어떤 테이블에도 가격을 write 하지 않는다.** 읽는 시점에 활성 여부를 계산하고
 * 가격을 덮어쓰는 read-time 리졸버다. 스케줄러·배치가 없다.
 *
 * 그렇게 한 이유(§2.1):
 *  · 개발 DB = 운영 DB 다. 타이머가 products.price(소스 오브 트루스)를 상시 write 하면
 *    로컬 개발 서버가 운영 상품 원가를 오염시킨다.
 *  · 타임특가는 20:00 정각 경계가 존재 이유다. 1분 틱 스케줄러는 그 경계를 못 지킨다.
 *  · 특가 중 관리자가 상품가를 수정하면, 종료 시 원가 복원이 그 편집을 덮거나 포기해야 한다.
 *
 * 활성 판정의 유일한 근거는 `deal` 행의 실제 컬럼 값이다. deal_category.schedule_type 은
 * 관리자 폼 UX 용일 뿐 판정에 관여하지 않는다.
 *
 * MySQL 서버 타임존은 SYSTEM = KST 로 실측 확인했다. NOW()/CURTIME() 을 그대로 쓴다.
 */

/**
 * 활성 특가 조건.
 *
 * WEEKDAY() 는 0=월 … 6=일 이라 +1 해서 1=월 … 7=일 로 맞춘다(weekdays 컬럼의 표기).
 * daily_start/end 가 NULL 이면 기간 내 상시 특가다.
 */
const ACTIVE_WHERE = `
    d.is_active = 1
    AND NOW() BETWEEN d.starts_at AND d.ends_at
    AND (d.daily_start_time IS NULL OR CURTIME() BETWEEN d.daily_start_time AND d.daily_end_time)
    AND (d.weekdays IS NULL OR d.weekdays = '' OR FIND_IN_SET(WEEKDAY(NOW()) + 1, d.weekdays))
    AND (di.qty_limit IS NULL OR di.sold_qty < di.qty_limit)
`;

/*
 * 한 상품에 활성 특가가 여럿이면 하나만 이긴다: priority 큰 것 → 싼 것 → 먼저 만든 것.
 * ROW_NUMBER() 로 상품당 1행만 남긴다(MySQL 8.4).
 */
const WINNER_SQL = `
    SELECT di.product_id, di.id AS deal_item_id, di.deal_id, di.deal_price,
           di.qty_limit, di.sold_qty,
           d.title AS deal_title, d.ends_at, d.daily_start_time, d.daily_end_time,
           dc.name AS category_name, dc.code AS category_code,
           dc.badge_text, dc.badge_color,
           ROW_NUMBER() OVER (
               PARTITION BY di.product_id
               ORDER BY d.priority DESC, di.deal_price ASC, di.id ASC
           ) AS rn
      FROM deal_item di
      JOIN deal d ON d.id = di.deal_id
      JOIN deal_category dc ON dc.id = d.deal_category_id
     WHERE ${ACTIVE_WHERE} AND dc.is_active = 1
`;

/**
 * 정렬이 필요한 쿼리에 끼워 넣는 JOIN 프래그먼트.
 * 애플리케이션 후처리로는 ORDER BY effective_price 를 만들 수 없어서 필요하다.
 *
 * 사용:
 *   SELECT p.*, COALESCE(ad.deal_price, p.price) AS effective_price
 *     FROM products p ${dealJoinSql()}
 *    ORDER BY effective_price ASC
 */
function dealJoinSql(productAlias = 'p') {
    return `LEFT JOIN (${WINNER_SQL}) ad
                   ON ad.product_id = ${productAlias}.id AND ad.rn = 1`;
}

/** 오늘 날짜에 daily_end_time 을 붙여 카운트다운용 종료 시각을 만든다. */
function todayAt(timeStr) {
    if (!timeStr) return null;
    const now = new Date();
    const [h, m, s] = String(timeStr).split(':').map(Number);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, s || 0);
    return d;
}

/** DB 행 → 뷰가 쓰는 deal 객체. */
function toDealInfo(row) {
    const remainQty = row.qty_limit == null ? null : Math.max(0, row.qty_limit - row.sold_qty);
    // 타임특가는 오늘의 종료 시각이, 상시 특가는 캠페인 종료일이 카운트다운 기준이다.
    const closesAt = row.daily_end_time ? todayAt(row.daily_end_time) : new Date(row.ends_at);
    return {
        dealItemId: row.deal_item_id,
        dealId: row.deal_id,
        dealPrice: row.deal_price,
        title: row.deal_title,
        categoryName: row.category_name,
        categoryCode: row.category_code,
        badgeText: row.badge_text || row.category_name,
        badgeColor: row.badge_color || 'rose',
        isTimeDeal: !!row.daily_end_time,
        closesAt,
        closesAtEpoch: closesAt ? closesAt.getTime() : null,
        qtyLimit: row.qty_limit,
        soldQty: row.sold_qty,
        remainQty,
    };
}

/**
 * 상품 id 목록 → 활성 특가 맵 (product_id → dealInfo).
 * 특가가 없는 상품은 맵에 없다.
 */
async function resolveForProducts(productIds, conn = pool) {
    const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const [rows] = await conn.query(
        `SELECT * FROM (${WINNER_SQL}) w WHERE w.rn = 1 AND w.product_id IN (?)`,
        [ids]
    );
    return new Map(rows.map((r) => [r.product_id, toDealInfo(r)]));
}

/**
 * 표시 경로 전반에서 쓰는 후처리.
 *
 * 상품 행 배열의 price/original_price/discount_rate 를 특가로 덮고 row.deal 을 붙인다.
 * **SELECT 절을 건드리지 않는다** — productController 의 카운트 쿼리가
 * `query.replace('SELECT *', 'SELECT COUNT(*)…')` 문자열 치환이라, SELECT 절에 컬럼을
 * 추가하면 그 쿼리가 깨진다. 그래서 JOIN 이 아니라 후처리다.
 *
 * 리졸버를 빠뜨린 화면은 정가(= 더 비싼 값)를 보여준다 — 노출 누락이지 금전 사고가 아니다.
 */
async function applyDeals(rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
    if (list.length === 0) return rows;

    const idKey = opts.idKey || 'id';
    const dealMap = await resolveForProducts(list.map((r) => r && r[idKey]));
    if (dealMap.size === 0) return rows;

    for (const row of list) {
        if (!row) continue;
        const deal = dealMap.get(row[idKey]);
        if (!deal) continue;

        const basePrice = Number(row.price) || 0;
        const baseList = Number(row.original_price) || 0;
        // 취소선 기준가: 정가가 없거나 판매가보다 낮게 잘못 들어간 경우 판매가를 기준으로 삼는다.
        const listPrice = Math.max(baseList, basePrice);

        row.price = deal.dealPrice;
        row.original_price = listPrice;
        row.discount_rate = listPrice > 0
            ? Math.round((1 - deal.dealPrice / listPrice) * 100)
            : 0;
        row.deal = deal;
    }
    return rows;
}

/**
 * 결제 경로용. checkoutController 의 items[] 를 특가가로 덮고 출처를 부착한다.
 *
 * 공동구매 라인(source_type='GROUP_BUY')은 건너뛴다 — 공동구매가가 특가를 이긴다(설계 §1).
 *
 * source_type/source_id 를 여기서 박아두면 order_items 가 그대로 저장하고(:659-662),
 * 결제 확정 트랜잭션이 **특가를 재조회하지 않고** 그 id 로만 수량을 소진한다.
 * 재조회하면 주문 생성과 결제 승인 사이에 타임특가 시간창이 닫혔을 때,
 * 고객은 특가로 결제했는데 소진 카운터는 건너뛰는 버그가 난다.
 */
async function applyToScopeItems(items) {
    const targets = (items || []).filter((i) => i && !i.source_type);
    if (targets.length === 0) return items;

    const dealMap = await resolveForProducts(targets.map((i) => i.product_id));
    if (dealMap.size === 0) return items;

    for (const item of targets) {
        const deal = dealMap.get(item.product_id);
        if (!deal) continue;
        item.price = deal.dealPrice;
        item.source_type = 'DEAL';
        item.source_id = deal.dealItemId;
    }
    return items;
}

/**
 * 선착순 수량 소진. 결제 확정 트랜잭션 안에서 호출한다.
 *
 * order_items 에 기록된 deal_item 별 수량을 조건부 UPDATE 로 원자적으로 깎는다.
 * 한도를 넘으면 affectedRows = 0 → false 를 리턴하고, 호출부가 롤백 + 결제 취소한다
 * (재고 부족과 동일한 실패 경로).
 *
 * @returns {boolean} false 면 선착순 소진 — 주문을 확정하면 안 된다.
 */
async function consumeDealQuota(conn, orderId) {
    const [rows] = await conn.query(
        `SELECT source_id AS deal_item_id, SUM(quantity) AS qty
           FROM order_items
          WHERE order_id = ? AND source_type = 'DEAL' AND source_id IS NOT NULL
          GROUP BY source_id`,
        [orderId]
    );
    if (rows.length === 0) return true;

    for (const r of rows) {
        const qty = Number(r.qty) || 0;
        const [result] = await conn.query(
            `UPDATE deal_item
                SET sold_qty = sold_qty + ?
              WHERE id = ?
                AND (qty_limit IS NULL OR sold_qty + ? <= qty_limit)`,
            [qty, r.deal_item_id, qty]
        );
        if (result.affectedRows === 0) return false;   // 선착순 소진
    }
    return true;
}

/**
 * 주문 취소 시 소진 수량 복원. 재고 복원과 같은 트랜잭션에서 호출한다.
 * sold_qty 가 음수로 내려가지 않도록 GREATEST 로 바닥을 친다.
 */
async function restoreDealQuota(conn, orderId) {
    const [rows] = await conn.query(
        `SELECT source_id AS deal_item_id, SUM(quantity) AS qty
           FROM order_items
          WHERE order_id = ? AND source_type = 'DEAL' AND source_id IS NOT NULL
          GROUP BY source_id`,
        [orderId]
    );
    for (const r of rows) {
        await conn.query(
            'UPDATE deal_item SET sold_qty = GREATEST(0, sold_qty - ?) WHERE id = ?',
            [Number(r.qty) || 0, r.deal_item_id]
        );
    }
}

/**
 * /deals 쇼핑특가 페이지용. 활성 특가를 카테고리별로 묶어서 돌려준다.
 *
 * @param {number} mallId
 * @param {string} [categoryCode] 지정하면 그 카테고리만
 * @returns {Array<{ id, code, name, description, badgeText, badgeColor, products: [] }>}
 */
async function getActiveDealsByCategory(mallId = 1, categoryCode = null) {
    const params = [mallId];
    let codeClause = '';
    if (categoryCode) {
        codeClause = 'AND dc.code = ?';
        params.push(categoryCode);
    }

    const [rows] = await pool.query(
        `SELECT dc.id AS category_id, dc.code AS category_code, dc.name AS category_name,
                dc.description AS category_description, dc.badge_text, dc.badge_color,
                dc.sort_order AS category_sort,
                d.id AS deal_id, d.title AS deal_title, d.subtitle AS deal_subtitle,
                d.ends_at, d.daily_start_time, d.daily_end_time, d.sort_order AS deal_sort,
                di.id AS deal_item_id, di.deal_price, di.qty_limit, di.sold_qty,
                di.sort_order AS item_sort,
                p.id AS product_id, p.name, p.slug, p.main_image, p.thumbnail_image,
                p.price AS base_price, p.original_price, p.status, p.stock
           FROM deal_item di
           JOIN deal d ON d.id = di.deal_id
           JOIN deal_category dc ON dc.id = d.deal_category_id
           JOIN products p ON p.id = di.product_id
          WHERE ${ACTIVE_WHERE}
            AND dc.is_active = 1 AND d.mall_id = ?
            AND p.status = 'ON' AND p.visibility = 'PUBLIC'
            ${codeClause}
          ORDER BY dc.sort_order ASC, dc.id ASC, d.sort_order ASC, di.sort_order ASC, di.id ASC`,
        params
    );

    const byCategory = new Map();
    for (const r of rows) {
        if (!byCategory.has(r.category_id)) {
            byCategory.set(r.category_id, {
                id: r.category_id,
                code: r.category_code,
                name: r.category_name,
                description: r.category_description,
                badgeText: r.badge_text || r.category_name,
                badgeColor: r.badge_color || 'rose',
                products: [],
            });
        }
        const deal = toDealInfo({
            deal_item_id: r.deal_item_id, deal_id: r.deal_id, deal_price: r.deal_price,
            qty_limit: r.qty_limit, sold_qty: r.sold_qty, deal_title: r.deal_title,
            ends_at: r.ends_at, daily_start_time: r.daily_start_time, daily_end_time: r.daily_end_time,
            category_name: r.category_name, category_code: r.category_code,
            badge_text: r.badge_text, badge_color: r.badge_color,
        });
        const listPrice = Math.max(Number(r.original_price) || 0, Number(r.base_price) || 0);
        byCategory.get(r.category_id).products.push({
            id: r.product_id,
            name: r.name,
            slug: r.slug,
            main_image: r.main_image,
            thumbnail_image: r.thumbnail_image,
            status: r.status,
            stock: r.stock,
            price: r.deal_price,
            original_price: listPrice,
            discount_rate: listPrice > 0 ? Math.round((1 - r.deal_price / listPrice) * 100) : 0,
            deal,
            deal_subtitle: r.deal_subtitle,
        });
    }
    return [...byCategory.values()];
}

/**
 * 아직 열리지 않은 오늘의 타임특가 (시작 시간 전). "20:00 오픈" 안내용.
 * 기간·요일 조건은 만족하지만 지금이 시간창 이전인 것만 고른다.
 */
async function getUpcomingTimeDeals(mallId = 1) {
    const [rows] = await pool.query(
        `SELECT DISTINCT d.id, d.title, d.daily_start_time, d.daily_end_time,
                dc.name AS category_name, dc.code AS category_code, dc.badge_color
           FROM deal d
           JOIN deal_category dc ON dc.id = d.deal_category_id
           JOIN deal_item di ON di.deal_id = d.id
          WHERE d.is_active = 1 AND dc.is_active = 1 AND d.mall_id = ?
            AND NOW() BETWEEN d.starts_at AND d.ends_at
            AND d.daily_start_time IS NOT NULL
            AND CURTIME() < d.daily_start_time
            AND (d.weekdays IS NULL OR d.weekdays = '' OR FIND_IN_SET(WEEKDAY(NOW()) + 1, d.weekdays))
          ORDER BY d.daily_start_time ASC`,
        [mallId]
    );
    return rows.map((r) => ({
        ...r,
        opensAtEpoch: todayAt(r.daily_start_time) ? todayAt(r.daily_start_time).getTime() : null,
    }));
}

/** 활성 특가가 걸린 상품 수 (GNB 노출 판단·관리자 요약용). */
async function countActiveDealProducts(mallId = 1) {
    const [[row]] = await pool.query(
        `SELECT COUNT(DISTINCT di.product_id) AS c
           FROM deal_item di
           JOIN deal d ON d.id = di.deal_id
           JOIN deal_category dc ON dc.id = d.deal_category_id
          WHERE ${ACTIVE_WHERE} AND dc.is_active = 1 AND d.mall_id = ?`,
        [mallId]
    );
    return Number(row && row.c) || 0;
}

module.exports = {
    ACTIVE_WHERE,
    dealJoinSql,
    resolveForProducts,
    applyDeals,
    applyToScopeItems,
    consumeDealQuota,
    restoreDealQuota,
    getActiveDealsByCategory,
    getUpcomingTimeDeals,
    countActiveDealProducts,
};
