const pool = require('../../config/db');

/*
 * ── B2B 가격 리졸버 (설계 §4) ──
 *
 * services/deal/dealService.js 의 원칙을 그대로 계승한다:
 * **어떤 테이블에도 가격을 write 하지 않는다.** 읽는 시점에 계산해 덮는 read-time 리졸버다.
 * 개발 DB = 운영 DB 인 이 프로젝트에서 B2B 가격이 products.price 를 건드리면
 * 소스 오브 트루스가 오염된다.
 *
 * 우선순위 (설계 §4.2) — 위가 이긴다:
 *      1. 확정 견적가    quote_item.final_unit_price  (주문 전환 시 quoteConvertService 가 직접 박는다)
 *      2. 거래처 계약가  b2b_price_item (policy_type=CUSTOMER_CONTRACT)
 *      3. 등급가        b2b_price_item (policy_type=TIER)
 *      4. 수량 구간가    b2b_volume_price
 *      5. 기본 B2B가    product_b2b_setting.b2b_price
 *      ─ 폴백 ─         products.price (B2C 판매가)
 *
 * 1은 이 리졸버를 타지 않는다 — 견적은 "그때 합의한 값"이 절대적이라 현재가를 다시 계산하면
 * 안 된다(설계 §8.3, §17.3). 주문 라인에 확정가가 이미 박혀 있으면 그대로 둔다.
 *
 * ⚠️ 가격을 **올려서** 덮지 않는다. dealService 가 `deal_price < price` 가드를 둔 것과 같은
 *    이유다 — 관리자가 나중에 판매가를 B2B가보다 낮추면, 가드가 없을 때 리졸버가 더 비싼
 *    값을 청구한다.
 */

/**
 * 컨텍스트가 B2B 가격을 조회할 자격이 있는가.
 * 사업자 프로필이 없거나(NONE), 로그인 시 '개인 구매'로 들어왔으면(PERSONAL_MODE) 전부 스킵한다.
 */
function hasBusinessContext(b2b) {
    return !!(b2b && b2b.state && b2b.state !== 'NONE' && b2b.state !== 'PERSONAL_MODE');
}

/**
 * 이 상품의 B2B 가격을 **보여줄** 수 있는가.
 *   APPROVED_ONLY (기본) — 승인된 사업자만
 *   PUBLIC              — 승인 전 사업자에게도 (심사 중 가격 안내)
 *   HIDDEN              — 아무에게도. "가격 문의" 로 표기한다
 * 일반 회원·비로그인은 어느 경우에도 B2B 가격을 보지 못한다(설계 §17.2).
 */
function canSeePrice(b2b, setting) {
    if (!hasBusinessContext(b2b)) return false;
    const vis = setting.price_visibility || 'APPROVED_ONLY';
    if (vis === 'HIDDEN') return false;
    if (vis === 'PUBLIC') return true;
    return b2b.active === true;
}

/** 수량이 MOQ·주문단위를 만족하는지. 실패 사유를 돌려준다(없으면 null). */
function validateQuantity(setting, quantity) {
    const qty = Number(quantity) || 0;
    const moq = Number(setting.min_order_qty) || 1;
    const unit = Number(setting.order_unit) || 1;
    const max = setting.max_order_qty != null ? Number(setting.max_order_qty) : null;

    if (qty < moq) return `최소 주문수량은 ${moq}개입니다`;
    if (unit > 1 && (qty - moq) % unit !== 0) return `${moq}개부터 ${unit}개 단위로 주문할 수 있습니다`;
    if (max != null && qty > max) return `최대 주문수량은 ${max}개입니다`;
    return null;
}

/** 이 수량에 견적이 필요한가 (상품 거래방식 + 견적필수 수량). */
function requiresQuote(setting, quantity) {
    if (setting.transaction_mode === 'QUOTE_REQUIRED') return true;
    const threshold = setting.quote_required_qty != null ? Number(setting.quote_required_qty) : null;
    return threshold != null && Number(quantity) >= threshold;
}

/**
 * 수량 구간 목록에서 이 수량에 맞는 단가를 고른다.
 * 같은 min_quantity 면 등급 전용(tier_id 있음)이 공통(NULL)을 이긴다.
 */
function pickVolumeTier(tiers, quantity) {
    const qty = Number(quantity) || 0;
    let best = null;
    for (const t of tiers) {
        if (Number(t.min_quantity) > qty) continue;
        if (!best) { best = t; continue; }
        const byQty = Number(t.min_quantity) - Number(best.min_quantity);
        if (byQty > 0) { best = t; continue; }
        if (byQty === 0 && t.tier_id != null && best.tier_id == null) best = t;
    }
    return best;
}

/**
 * 상품 여러 건의 B2B 판매 설정·수량가를 한 번에 읽는다. 쿼리 2회.
 * @returns {Promise<Map<number, {setting:object, tiers:Array}>>}
 */
async function loadSettings(b2b, productIds) {
    const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const [settings] = await pool.query(
        `SELECT s.*, p.price AS list_price, p.tax_type
           FROM product_b2b_setting s
           JOIN products p ON p.id = s.product_id
          WHERE s.product_id IN (?) AND s.is_b2b_sale = 1`,
        [ids]
    );
    if (settings.length === 0) return new Map();

    const settledIds = settings.map((s) => s.product_id);
    const [volumes] = await pool.query(
        `SELECT product_id, sku_id, tier_id, min_quantity, unit_price
           FROM b2b_volume_price
          WHERE product_id IN (?) AND (tier_id IS NULL OR tier_id = ?)
          ORDER BY product_id, min_quantity ASC`,
        [settledIds, b2b.tierId || 0]
    );

    /*
     * 정책가(등급가·계약가). 유효기간과 status 를 통과한 것만 읽는다.
     * 거래처 전용 계약(CUSTOMER_CONTRACT)은 business_profile.price_policy_id 가 가리키는
     * 정책 하나뿐이다 — 등급가보다 앞순위다.
     */
    const [policies] = await pool.query(
        `SELECT pi.product_id, pi.sku_id, pi.fixed_price, pi.discount_rate,
                pp.id AS policy_id, pp.policy_type, pp.priority
           FROM b2b_price_item pi
           JOIN b2b_price_policy pp ON pp.id = pi.price_policy_id
          WHERE pi.product_id IN (?)
            AND pp.status = 'ACTIVE'
            AND (pp.valid_from IS NULL OR pp.valid_from <= CURDATE())
            AND (pp.valid_to   IS NULL OR pp.valid_to   >= CURDATE())
            AND (
                  (pp.policy_type = 'CUSTOMER_CONTRACT' AND pp.id = ?)
               OR (pp.policy_type = 'TIER' AND pp.tier_id = ?)
            )
          ORDER BY pp.priority DESC, pp.id ASC`,
        [settledIds, b2b.pricePolicyId || 0, b2b.tierId || 0]
    );

    const map = new Map();
    for (const s of settings) map.set(Number(s.product_id), { setting: s, tiers: [], policies: [] });
    for (const v of volumes) {
        const entry = map.get(Number(v.product_id));
        if (entry) entry.tiers.push(v);
    }
    for (const pol of policies) {
        const entry = map.get(Number(pol.product_id));
        if (entry) entry.policies.push(pol);
    }
    return map;
}

/**
 * 정책 목록에서 이 층(CUSTOMER_CONTRACT 또는 TIER)의 단가를 구한다.
 * fixed_price 가 있으면 그것을, 없으면 판매가 대비 할인율로 계산한다.
 */
function policyPrice(policies, type, listPrice) {
    const hit = policies.find((p) => p.policy_type === type);
    if (!hit) return null;
    if (hit.fixed_price != null) return Number(hit.fixed_price);
    if (hit.discount_rate != null) {
        return Math.floor(listPrice * (1 - Number(hit.discount_rate) / 100));
    }
    return null;
}

/**
 * 한 상품의 최종 단가를 계산한다.
 *
 * @returns {{
 *   unitPrice:number, listPrice:number, priceSource:string, discountRate:number,
 *   visible:boolean, taxType:string,
 *   minOrderQty:number, orderUnit:number, maxOrderQty:number|null,
 *   transactionMode:string, quoteRequired:boolean, tiers:Array
 * }}
 */
function computePrice({ setting, tiers, policies = [] }, b2b, quantity) {
    const listPrice = Number(setting.list_price) || 0;
    const qty = Math.max(1, Number(quantity) || Number(setting.min_order_qty) || 1);

    let unitPrice = listPrice;
    let priceSource = 'B2C_FALLBACK';

    /*
     * 우선순위대로 **먼저 잡히는 층이 이긴다.** 더 싼 값을 고르는 게 아니다.
     *
     * 이게 중요한 이유: 거래처와 개별 합의한 계약가가 있는데 수량 구간가가 더 싸다고 그쪽을
     * 자동 적용하면, 합의한 마진이 조용히 무너진다. 계약가는 "이 거래처에는 이 값" 이라는
     * 약속이므로 다른 층이 끼어들면 안 된다(설계 §4.2).
     *
     * 단, 어느 층이 이기든 **B2C 판매가보다 비싸면 적용하지 않는다.** 관리자가 나중에
     * 판매가를 전용가보다 낮게 인하했을 때 리졸버가 더 비싼 값을 청구하는 것을 막는다.
     */
    const candidates = [
        // 2. 거래처 계약가
        ['CUSTOMER_CONTRACT', policyPrice(policies, 'CUSTOMER_CONTRACT', listPrice)],
        // 3. 등급가
        ['TIER', policyPrice(policies, 'TIER', listPrice)],
        // 4. 수량 구간가
        ['VOLUME', (() => { const v = pickVolumeTier(tiers, qty); return v ? Number(v.unit_price) : null; })()],
        // 5. 기본 B2B가
        ['B2B_DEFAULT', setting.b2b_price != null ? Number(setting.b2b_price) : null],
    ];

    for (const [source, candidate] of candidates) {
        if (candidate == null || !(candidate > 0)) continue;
        if (candidate >= listPrice) continue;   // 판매가보다 비싼 전용가는 적용하지 않는다
        unitPrice = candidate;
        priceSource = source;
        break;                                   // 앞순위가 잡혔으면 뒷순위는 보지 않는다
    }

    return {
        unitPrice,
        listPrice,
        priceSource,
        discountRate: listPrice > 0 ? Math.round(((listPrice - unitPrice) / listPrice) * 100) : 0,
        visible: canSeePrice(b2b, setting),
        taxType: setting.tax_type || 'TAXABLE',
        minOrderQty: Number(setting.min_order_qty) || 1,
        orderUnit: Number(setting.order_unit) || 1,
        maxOrderQty: setting.max_order_qty != null ? Number(setting.max_order_qty) : null,
        transactionMode: setting.transaction_mode || 'QUOTE_OPTIONAL',
        quoteRequired: requiresQuote(setting, qty),
        priceVisibility: setting.price_visibility || 'APPROVED_ONLY',
        salesChannel: setting.sales_channel || 'BOTH',
        // 상세 화면의 "수량별 가격" 표. 등급 전용가가 있으면 그것만 남긴다.
        tiers: tiers.map((t) => ({ minQuantity: Number(t.min_quantity), unitPrice: Number(t.unit_price) })),
    };
}

/**
 * 목록·카드용. 상품 N건을 쿼리 2회로 해결한다.
 * @returns {Promise<Map<number, object>>} B2B 설정이 없는 상품은 Map 에 없다.
 */
async function resolveForProducts(b2b, productIds) {
    if (!hasBusinessContext(b2b)) return new Map();
    const loaded = await loadSettings(b2b, productIds);
    const out = new Map();
    for (const [pid, entry] of loaded) {
        out.set(pid, computePrice(entry, b2b, entry.setting.min_order_qty));
    }
    return out;
}

/**
 * 목록 행에 B2B 가격을 얹는다. 카드 컴포넌트(views/partials/product_card.ejs)가 이 필드를 본다.
 *
 * 비활성 컨텍스트면 **아무 필드도 붙이지 않는다** → 카드는 예전과 똑같이 product.price 를 그린다.
 * 목록마다 컨트롤러가 조건을 다시 짜지 않도록 이 한 곳에서만 얹는다.
 *
 * @param {object} b2b req.b2b
 * @param {Array<object>} rows products 행 배열 (id 또는 product_id 필드 필요)
 */
async function decorateProducts(b2b, rows) {
    if (!hasBusinessContext(b2b) || !Array.isArray(rows) || rows.length === 0) return rows;
    const ids = rows.map((r) => Number(r.id || r.product_id)).filter(Boolean);
    const priced = await resolveForProducts(b2b, ids);
    if (priced.size === 0) return rows;

    for (const row of rows) {
        const info = priced.get(Number(row.id || row.product_id));
        if (!info || !info.visible || info.priceSource === 'B2C_FALLBACK') continue;
        row.b2b_unit_price = info.unitPrice;
        row.b2b_list_price = info.listPrice;
        row.b2b_discount_rate = info.discountRate;
        row.b2b_min_qty = info.minOrderQty;
    }
    return rows;
}

/**
 * 목록 쿼리에 붙일 판매채널 필터.
 *
 * B2B 전용 상품은 일반 사용자에게 존재하지 않아야 하고, B2C 전용 상품은 사업자에게도 보인다
 * (다만 전용가 없이 일반가로). 그래서 차단은 한 방향뿐이다.
 *
 * @param {object} b2b req.b2b
 * @param {string} alias products 테이블 별칭
 * @returns {string} AND 로 이어 붙일 수 있는 술어. 사업자면 빈 문자열.
 */
function salesChannelFilter(b2b, alias = 'p') {
    if (b2b && b2b.active) return '';
    return ` AND NOT EXISTS (SELECT 1 FROM product_b2b_setting pbs
             WHERE pbs.product_id = ${alias}.id AND pbs.sales_channel = 'B2B_ONLY')`;
}

/** 상품 상세용 단건. 없으면 null. */
async function resolveForProduct({ b2b, productId, quantity = null }) {
    if (!hasBusinessContext(b2b)) return null;
    const loaded = await loadSettings(b2b, [productId]);
    const entry = loaded.get(Number(productId));
    if (!entry) return null;
    return computePrice(entry, b2b, quantity != null ? quantity : entry.setting.min_order_qty);
}

/**
 * 주문 라인에 B2B 단가를 적용한다. dealService.applyToScopeItems 와 같은 시그니처다.
 *
 * ⚠️ **dealSvc.applyToScopeItems 보다 먼저** 호출해야 한다. 여기서 찍는 source_type='B2B' 를
 *    특가 리졸버가 보고 그 라인을 건너뛴다(dealService.js:172). 그래야 계약가 레인과
 *    프로모션 레인이 섞이지 않는다 — 특가 코드는 한 줄도 고치지 않는다.
 *
 * 비활성 컨텍스트면 items 를 **그대로** 돌려준다. B2C 경로에 회귀를 만들지 않는다.
 */
async function applyToScopeItems(b2b, items) {
    if (!b2b || !b2b.active) return items;
    /*
     * source_type 이 이미 있는 라인은 건너뛴다. 여기에는 확정 견적가 라인(source_type='QUOTE')도
     * 포함된다 — 합의된 단가를 현재 정책으로 다시 계산하면 안 된다(설계 §8.3).
     */
    const targets = (items || []).filter((i) => i && !i.source_type);
    if (targets.length === 0) return items;

    const loaded = await loadSettings(b2b, targets.map((i) => i.product_id));
    if (loaded.size === 0) return items;

    for (const item of targets) {
        const entry = loaded.get(Number(item.product_id));
        if (!entry) continue;
        const priced = computePrice(entry, b2b, item.quantity);
        // 가격 노출 권한이 없거나 전용가가 없으면 B2C 가로 둔다(= 아무것도 안 한 것과 같다).
        if (!priced.visible || priced.priceSource === 'B2C_FALLBACK') continue;
        item.price = priced.unitPrice;
        item.source_type = 'B2B';
        item.price_source = priced.priceSource;
        item.list_price = priced.listPrice;
        item.tax_type = priced.taxType;
    }
    return items;
}

/**
 * 주문 직전 수량 규칙 재검증 (설계 §7.6). 위반 라인의 사유 목록을 돌려준다.
 * @returns {Promise<Array<{productId:number, reason:string}>>}
 */
async function validateOrderItems(b2b, items) {
    if (!b2b || !b2b.active) return [];
    const loaded = await loadSettings(b2b, (items || []).map((i) => i.product_id));
    const errors = [];
    for (const item of items || []) {
        const entry = loaded.get(Number(item.product_id));
        if (!entry) continue;
        const reason = validateQuantity(entry.setting, item.quantity);
        if (reason) errors.push({ productId: item.product_id, reason });
        else if (requiresQuote(entry.setting, item.quantity)) {
            errors.push({ productId: item.product_id, reason: '이 수량은 견적 요청이 필요합니다' });
        }
    }
    return errors;
}

module.exports = {
    hasBusinessContext,
    canSeePrice,
    validateQuantity,
    requiresQuote,
    resolveForProducts,
    resolveForProduct,
    decorateProducts,
    salesChannelFilter,
    applyToScopeItems,
    validateOrderItems,
};
