/*
 * 쿠폰 할인 계산기 (쿠폰 문서 §5-3 · P3 · P4 · P9)
 *
 * ── 혜택 유형 4종
 *      FIXED           정액 할인
 *      PERCENT         정률 할인. `max_discount_amount` 상한이 **필수**다
 *      SHIPPING_FREE   배송비 전액
 *      SHIPPING_FIXED  배송비 정액
 *
 * ── 두 상한을 코드로 강제한다 (배송비 문서 §4)
 *      상품 할인 ≤ 쿠폰 대상 상품금액
 *      배송비 할인 ≤ shipping_fee          ← 배송비보다 많이 깎을 수 없다
 *
 * ── 조합 그룹은 benefit_type 에서 파생한다 (§6-1)
 *      SHIPPING_*  → SHIPPING 그룹 → orders.shipping_coupon_id
 *      그 외       → ORDER 그룹    → orders.user_coupon_id
 *    주문 쿠폰 1장 + 배송비 쿠폰 1장. 3장 이상은 3차.
 */

const SHIPPING_BENEFITS = new Set(['SHIPPING_FREE', 'SHIPPING_FIXED']);

/** 절사 단위 (§12 미결 5). 1원 절사 = 원 단위 그대로. */
const ROUND_UNIT = 1;

function floorTo(amount, unit = ROUND_UNIT) {
    if (unit <= 1) return Math.floor(amount);
    return Math.floor(amount / unit) * unit;
}

/** 이 쿠폰은 배송비 쿠폰인가. */
function isShippingCoupon(coupon) {
    return SHIPPING_BENEFITS.has(coupon.benefit_type);
}

/** 조합 그룹. 같은 그룹의 쿠폰은 한 주문에 한 장만 붙는다. */
function combinationGroup(coupon) {
    return isShippingCoupon(coupon) ? 'SHIPPING' : 'ORDER';
}

/*
 * ── scope_json 판정 (P4)
 *
 * { "include": { "categoryIds": [10, 20], "brandIds": [100] },
 *   "exclude": { "productIds": [10001], "badges": ["DEADLINE_SALE"] } }
 *
 * include 가 있으면 그 조건을 만족하는 상품만 대상이다. exclude 는 언제나 이긴다.
 * scope 가 없으면 전 상품이 대상 — 현행 동작이다.
 */
function parseScope(coupon) {
    if (!coupon.scope_json) return null;
    if (typeof coupon.scope_json === 'object') return coupon.scope_json;
    try {
        return JSON.parse(coupon.scope_json);
    } catch {
        return null; // 깨진 JSON 은 "범위 제한 없음"으로 본다. 할인이 안 되는 것보다 낫다
    }
}

const hasAny = (list) => Array.isArray(list) && list.length > 0;

/**
 * 장바구니 한 줄이 쿠폰 적용 대상인가.
 * @param {object} item  { product_id, category_id, brand_id, badges: string[] }
 */
function itemInScope(item, scope) {
    if (!scope) return true;

    const exclude = scope.exclude || {};
    if (hasAny(exclude.productIds) && exclude.productIds.includes(item.product_id)) return false;
    if (hasAny(exclude.categoryIds) && exclude.categoryIds.includes(item.category_id)) return false;
    if (hasAny(exclude.brandIds) && exclude.brandIds.includes(item.brand_id)) return false;
    if (hasAny(exclude.badges) && (item.badges || []).some((b) => exclude.badges.includes(b))) return false;

    const include = scope.include || {};
    const hasInclude = hasAny(include.productIds) || hasAny(include.categoryIds)
        || hasAny(include.brandIds) || hasAny(include.badges);
    if (!hasInclude) return true;

    if (hasAny(include.productIds) && include.productIds.includes(item.product_id)) return true;
    if (hasAny(include.categoryIds) && include.categoryIds.includes(item.category_id)) return true;
    if (hasAny(include.brandIds) && include.brandIds.includes(item.brand_id)) return true;
    if (hasAny(include.badges) && (item.badges || []).some((b) => include.badges.includes(b))) return true;
    return false;
}

/** 쿠폰이 적용될 상품 금액 합계. scope 가 없으면 전체 상품금액과 같다. */
function couponableAmount(items, coupon) {
    const scope = parseScope(coupon);
    if (!scope) return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return items
        .filter((i) => itemInScope(i, scope))
        .reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/**
 * 주문 쿠폰(ORDER 그룹) 할인액.
 *
 * @param {object} coupon
 * @param {number} couponable  쿠폰 적용 대상 상품금액
 * @returns {number} 할인액. 대상 금액을 넘지 않는다
 */
function calcOrderDiscount(coupon, couponable) {
    if (couponable <= 0) return 0;

    if (coupon.benefit_type === 'PERCENT') {
        const rate = Number(coupon.discount_rate) || 0;
        if (rate <= 0) return 0;
        let discount = floorTo((couponable * rate) / 100);
        // 정률 쿠폰에 상한이 없으면 고액 주문에서 할인이 무한정 커진다. 관리자 폼이 필수로 막지만
        // 과거 데이터·직접 INSERT 를 신뢰하지 않는다.
        if (coupon.max_discount_amount != null) {
            discount = Math.min(discount, Number(coupon.max_discount_amount));
        }
        return Math.min(discount, couponable);
    }

    // FIXED
    return Math.min(Number(coupon.discount_amount) || 0, couponable);
}

/**
 * 배송비 쿠폰(SHIPPING 그룹) 할인액. **shipping_fee 를 초과할 수 없다** (P9).
 */
function calcShippingDiscount(coupon, shippingFee) {
    const fee = Math.max(0, Number(shippingFee) || 0);
    if (fee === 0) return 0;

    if (coupon.benefit_type === 'SHIPPING_FREE') return fee;
    if (coupon.benefit_type === 'SHIPPING_FIXED') {
        return Math.min(Number(coupon.discount_amount) || 0, fee);
    }
    return 0;
}

/** 최소 주문금액 충족 여부. 기준은 쿠폰 대상 상품금액이다. */
function meetsMinOrder(coupon, couponable) {
    return couponable >= (Number(coupon.min_order_amount) || 0);
}

/** 화면 표시용 혜택 문구. */
function benefitLabel(coupon) {
    switch (coupon.benefit_type) {
        case 'PERCENT':
            return coupon.max_discount_amount
                ? `${Number(coupon.discount_rate)}% (최대 ${Number(coupon.max_discount_amount).toLocaleString('ko-KR')}원)`
                : `${Number(coupon.discount_rate)}%`;
        case 'SHIPPING_FREE':
            return '무료배송';
        case 'SHIPPING_FIXED':
            return `배송비 ${Number(coupon.discount_amount).toLocaleString('ko-KR')}원 할인`;
        default:
            return `${Number(coupon.discount_amount).toLocaleString('ko-KR')}원 할인`;
    }
}

module.exports = {
    isShippingCoupon,
    combinationGroup,
    parseScope,
    itemInScope,
    couponableAmount,
    calcOrderDiscount,
    calcShippingDiscount,
    meetsMinOrder,
    benefitLabel,
    floorTo,
    ROUND_UNIT,
};
