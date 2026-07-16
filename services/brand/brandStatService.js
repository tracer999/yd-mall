const pool = require('../../config/db');

/**
 * brand_stat / brand_category_stat 재계산.
 *
 * 브랜드 홈의 6개 섹션이 매 요청마다 상품 9,677건에 조인하면 화면이 죽는다
 * (같은 이유로 /admin/categories 가 브랜드 1,354개에서 이미 터진 전례가 있다).
 * 집계를 미리 구워두고 화면은 brand_stat 만 읽는다.
 */

/** 전시 가능한 상품 */
const P_LIVE = "p.status IN ('ON','SOLD_OUT','COMING_SOON','RESTOCK') AND p.visibility <> 'HIDDEN'";
/** 판매로 인정하는 주문 상태 (bestRankingService 와 동일 기준) */
const O_PAID = "o.status IN ('PAID','PREPARING','SHIPPED','DELIVERED')";

const NEW_DAYS = 30;

/** 카테고리 id → 루트 카테고리 id */
async function buildRootMap(mallId) {
    const [cats] = await pool.query(
        'SELECT id, parent_id FROM categories WHERE mall_id IN (0, ?) AND type = ?', [mallId, 'NORMAL']
    );
    const parentOf = new Map(cats.map(c => [c.id, c.parent_id]));
    const rootOf = new Map();
    for (const c of cats) {
        let cur = c.id;
        const seen = new Set();
        while (parentOf.get(cur) && !seen.has(cur)) { // 순환 가드
            seen.add(cur);
            cur = parentOf.get(cur);
        }
        rootOf.set(c.id, cur);
    }
    return rootOf;
}

/** 진행 중 혜택을 가진 브랜드 → 혜택 수 */
async function loadBenefitCounts(mallId) {
    const counts = new Map();
    const bump = (bid, n = 1) => counts.set(bid, (counts.get(bid) || 0) + n);

    // 쿠폰 — coupons.scope_json = {"include":{"brandIds":[11]}}
    const [coupons] = await pool.query(`
        SELECT scope_json FROM coupons
        WHERE (mall_id = ? OR mall_id IS NULL)
          AND status = 'ACTIVE' AND is_active = 1
          AND valid_from <= NOW() AND valid_to >= NOW()
          AND scope_json IS NOT NULL
    `, [mallId]);
    for (const c of coupons) {
        const scope = typeof c.scope_json === 'string' ? JSON.parse(c.scope_json) : c.scope_json;
        const ids = scope?.include?.brandIds;
        if (Array.isArray(ids)) ids.forEach(id => bump(Number(id)));
    }

    // 기획전 — 브랜드 귀속(brand_category_id) 또는 편성 상품의 브랜드로 역추적.
    // SPECIALTY(전문관)는 뺀다. 전문관은 브랜드 행사가 아니라 카테고리 축이라,
    // 넣으면 '뷰티관' 하나가 브랜드 9개의 혜택으로 잡힌다. (benefitService 와 동일 기준)
    const [exs] = await pool.query(`
        SELECT DISTINCT COALESCE(e.brand_category_id, p.brand_category_id) AS bid
        FROM exhibition e
        LEFT JOIN exhibition_product ep ON ep.exhibition_id = e.id AND ep.visible = 1
        LEFT JOIN products p ON p.id = ep.product_id
        WHERE e.mall_id = ? AND e.status = 'PUBLISHED'
          AND e.exhibition_type <> 'SPECIALTY'
          AND (e.end_at IS NULL OR e.end_at >= NOW())
          AND (
                (e.brand_category_id IS NOT NULL AND e.start_at <= DATE_ADD(NOW(), INTERVAL 14 DAY))
             OR (p.brand_category_id IS NOT NULL AND e.start_at <= NOW())
              )
          AND COALESCE(e.brand_category_id, p.brand_category_id) IS NOT NULL
    `, [mallId]);
    exs.forEach(r => bump(r.bid));

    // 쇼핑특가 — deal_item 의 상품에서 브랜드 역추적
    const [deals] = await pool.query(`
        SELECT DISTINCT p.brand_category_id AS bid
        FROM deal d
        JOIN deal_item di ON di.deal_id = d.id
        JOIN products p ON p.id = di.product_id
        WHERE d.mall_id = ? AND d.is_active = 1
          AND d.starts_at <= NOW() AND d.ends_at >= NOW()
          AND p.brand_category_id IS NOT NULL
    `, [mallId]);
    deals.forEach(r => bump(r.bid));

    // 공동구매
    const [gbs] = await pool.query(`
        SELECT DISTINCT p.brand_category_id AS bid
        FROM group_buy g
        JOIN group_buy_product gp ON gp.group_buy_id = g.id
        JOIN products p ON p.id = gp.product_id
        WHERE g.mall_id = ? AND g.status = 'PUBLISHED'
          AND g.start_at <= NOW() AND g.end_at >= NOW()
          AND p.brand_category_id IS NOT NULL
    `, [mallId]);
    gbs.forEach(r => bump(r.bid));

    return counts;
}

async function recalcMall(mallId) {
    const [[cfg]] = await pool.query(
        'SELECT weight_sales, weight_like, weight_view FROM best_score_config WHERE mall_id = ?', [mallId]
    );
    const wSales = cfg?.weight_sales ?? 5;
    const wLike = cfg?.weight_like ?? 3;
    // 상품 랭킹은 조회수 노이즈를 빼려고 weight_view=0 을 쓰지만, 브랜드에서는 조회수가
    // 사실상 유일하게 살아있는 신호다(주문 22건·찜 11건). 0 이면 최소 1 로 승격한다.
    const wView = (cfg?.weight_view ?? 0) || 1;

    const [brands] = await pool.query(
        'SELECT id FROM categories WHERE type = ? AND mall_id IN (0, ?)', ['BRAND', mallId]
    );
    if (!brands.length) return { brands: 0 };

    // 상품 집계
    const [prod] = await pool.query(`
        SELECT p.brand_category_id AS bid,
               COUNT(*) AS product_count,
               SUM(p.created_at >= NOW() - INTERVAL ? DAY) AS new_count,
               MIN(p.price) AS min_price,
               MAX(p.price) AS max_price,
               SUM(p.view_count) AS view_score,
               MAX(p.created_at) AS last_product_at
        FROM products p
        WHERE p.mall_id = ? AND p.brand_category_id IS NOT NULL AND ${P_LIVE}
        GROUP BY p.brand_category_id
    `, [NEW_DAYS, mallId]);

    // 대표 상품 4개 (타일 썸네일 모자이크용) — 로고 없는 몰2를 살리는 재료
    const [reps] = await pool.query(`
        SELECT bid, id FROM (
            SELECT p.brand_category_id AS bid, p.id,
                   ROW_NUMBER() OVER (PARTITION BY p.brand_category_id
                                      ORDER BY p.view_count DESC, p.created_at DESC) AS rn
            FROM products p
            WHERE p.mall_id = ? AND p.brand_category_id IS NOT NULL AND ${P_LIVE}
              AND p.main_image IS NOT NULL AND p.main_image <> ''
        ) t WHERE rn <= 4
    `, [mallId]);
    const repOf = new Map();
    for (const r of reps) {
        if (!repOf.has(r.bid)) repOf.set(r.bid, []);
        repOf.get(r.bid).push(r.id);
    }

    // 브랜드 × 카테고리 (다대다는 매핑 테이블 없이 products 조인으로 도출된다)
    const [bcs] = await pool.query(`
        SELECT p.brand_category_id AS bid, p.category_id AS cat_id, COUNT(*) AS c
        FROM products p
        WHERE p.mall_id = ? AND p.brand_category_id IS NOT NULL
          AND p.category_id IS NOT NULL AND ${P_LIVE}
        GROUP BY p.brand_category_id, p.category_id
    `, [mallId]);

    const rootOf = await buildRootMap(mallId);
    const topCatOf = new Map(); // 최빈 카테고리
    for (const r of bcs) {
        const cur = topCatOf.get(r.bid);
        if (!cur || r.c > cur.c) topCatOf.set(r.bid, { cat: r.cat_id, c: r.c });
    }

    // 행동 지표
    const [sales] = await pool.query(`
        SELECT p.brand_category_id AS bid, SUM(oi.quantity) AS n
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE p.mall_id = ? AND p.brand_category_id IS NOT NULL AND ${O_PAID}
        GROUP BY p.brand_category_id
    `, [mallId]);
    const [likes] = await pool.query(`
        SELECT p.brand_category_id AS bid, COUNT(*) AS n
        FROM likes l JOIN products p ON p.id = l.product_id
        WHERE p.mall_id = ? AND p.brand_category_id IS NOT NULL
        GROUP BY p.brand_category_id
    `, [mallId]);
    const [carts] = await pool.query(`
        SELECT p.brand_category_id AS bid, COUNT(*) AS n
        FROM carts ct JOIN products p ON p.id = ct.product_id
        WHERE p.mall_id = ? AND p.brand_category_id IS NOT NULL
        GROUP BY p.brand_category_id
    `, [mallId]);
    const [blikes] = await pool.query(`
        SELECT bl.category_id AS bid, COUNT(*) AS n
        FROM brand_likes bl JOIN categories c ON c.id = bl.category_id
        WHERE c.mall_id = ? GROUP BY bl.category_id
    `, [mallId]);

    const num = (rows) => new Map(rows.map(r => [r.bid, Number(r.n) || 0]));
    const salesOf = num(sales), likeOf = num(likes), cartOf = num(carts), blikeOf = num(blikes);
    const benefitOf = await loadBenefitCounts(mallId);

    const now = new Date();
    const rows = [];
    for (const p of prod) {
        const sales_count = salesOf.get(p.bid) || 0;
        const like_count = likeOf.get(p.bid) || 0;
        const cart_count = cartOf.get(p.bid) || 0;
        const brand_like_count = blikeOf.get(p.bid) || 0;
        const view_score = Number(p.view_score) || 0;

        // 브랜드 찜은 상품 찜보다 강한 신호다(가중치 2배). 장바구니는 1점.
        const score = wSales * sales_count
                    + wLike * (like_count + brand_like_count * 2)
                    + wView * view_score
                    + cart_count;

        rows.push([
            p.bid, mallId,
            Number(p.product_count) || 0,
            Number(p.new_count) || 0,
            topCatOf.get(p.bid)?.cat ?? null,
            p.min_price, p.max_price,
            view_score, sales_count, like_count, brand_like_count, cart_count,
            score,
            benefitOf.get(p.bid) || 0,
            JSON.stringify(repOf.get(p.bid) || []),
            p.last_product_at,
            now
        ]);
    }

    // 상품이 0건인 브랜드는 brand_stat 에서 지운다 (탐색 대상이 아니다)
    await pool.query('DELETE FROM brand_stat WHERE mall_id = ?', [mallId]);
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await pool.query(`
            INSERT INTO brand_stat
                (category_id, mall_id, product_count, new_count, top_category_id,
                 min_price, max_price, view_score, sales_count, like_count,
                 brand_like_count, cart_count, popularity_score, benefit_count,
                 rep_product_ids, last_product_at, calculated_at)
            VALUES ?
        `, [chunk]);
    }

    // brand_category_stat 재적재
    await pool.query('DELETE FROM brand_category_stat WHERE mall_id = ?', [mallId]);
    const bcsRows = bcs
        .filter(r => rootOf.has(r.cat_id))
        .map(r => [mallId, r.bid, r.cat_id, rootOf.get(r.cat_id), Number(r.c)]);
    for (let i = 0; i < bcsRows.length; i += 500) {
        await pool.query(`
            INSERT INTO brand_category_stat (mall_id, category_id, cat_id, root_cat_id, product_count)
            VALUES ?
        `, [bcsRows.slice(i, i + 500)]);
    }

    return { brands: rows.length, categories: bcsRows.length };
}

module.exports = { recalcMall };
