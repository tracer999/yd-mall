/*
 * 주문 등급혜택 계산 (설계 §7, §10.4)
 *
 * 결제 계산 지점에서 회원의 현재 등급 혜택(정률할인·적립률·무료배송)을 산출한다.
 * 비회원(userId 없음)·등급/혜택 미설정이면 무혜택(0)을 돌려준다 — 호출부는 항상 안전하게 쓴다.
 */

const membershipService = require('./membershipService');

const ZERO = {
    gradeId: null, gradeCode: null, gradeName: null,
    discountRate: 0, discountAmount: 0, maxDiscountAmount: null, minOrderAmount: 0,
    pointRate: null, pointRateMode: 'ADD',
    freeShipping: false, freeShipThreshold: null,
};

/**
 * 등급 적립률을 기본 적립률과 합산/대체해 유효 적립률(%)을 구한다.
 * @param {number} baseRate 기본 적립률(system_settings.point_accumulate_rate)
 * @param {{pointRate:number|null, pointRateMode:string}} benefit
 */
function effectivePointRate(baseRate, benefit) {
    const base = Number(baseRate) || 0;
    if (!benefit || benefit.pointRate == null) return base;
    const gradeRate = Number(benefit.pointRate) || 0;
    return benefit.pointRateMode === 'REPLACE' ? gradeRate : base + gradeRate;
}

/**
 * 주문의 등급 혜택을 계산한다.
 * @param {object} p { userId, mallId, subtotalAmount }
 * @returns {Promise<typeof ZERO>}
 */
async function getOrderBenefits({ userId, mallId, subtotalAmount }) {
    if (!userId || !mallId) return { ...ZERO };
    const m = await membershipService.ensureMembership(userId, mallId);
    const full = await membershipService.getMembershipWithGrade(userId, mallId);
    if (!full || !full.current_grade_id) return { ...ZERO };

    const subtotal = Math.max(0, Number(subtotalAmount) || 0);

    // 혜택별 사용여부(enabled) — "사용"인 혜택만 적용한다. 컬럼이 없으면(구 데이터) 기본 사용.
    const discountEnabled = full.discount_enabled == null ? true : Number(full.discount_enabled) === 1;
    const pointEnabled = full.point_enabled == null ? true : Number(full.point_enabled) === 1;
    const shippingEnabled = full.shipping_enabled == null ? true : Number(full.shipping_enabled) === 1;

    const discountRate = Number(full.discount_rate) || 0;
    const minOrder = Number(full.min_order_amount) || 0;
    const maxDiscount = full.max_discount_amount != null ? Number(full.max_discount_amount) : null;

    let discountAmount = 0;
    if (discountEnabled && discountRate > 0 && subtotal >= minOrder) {
        discountAmount = Math.floor((subtotal * discountRate) / 100);
        if (maxDiscount != null && discountAmount > maxDiscount) discountAmount = maxDiscount;
    }

    return {
        gradeId: full.current_grade_id,
        gradeCode: full.grade_code || null,
        gradeName: full.grade_name || null,
        discountRate: discountEnabled ? discountRate : 0,
        discountAmount,
        maxDiscountAmount: maxDiscount,
        minOrderAmount: minOrder,
        // 적립 혜택 미사용이면 등급 적립률을 주지 않는다(null → 기본 적립률만 적용).
        pointRate: (pointEnabled && full.point_rate != null) ? Number(full.point_rate) : null,
        pointRateMode: full.point_rate_mode || 'ADD',
        // 배송 혜택 미사용이면 무료배송/문턱 override 를 적용하지 않는다.
        freeShipping: shippingEnabled && Number(full.free_shipping) === 1,
        freeShipThreshold: (shippingEnabled && full.free_ship_threshold != null) ? Number(full.free_ship_threshold) : null,
        _membershipEnsured: !!m,
    };
}

module.exports = {
    ZERO,
    effectivePointRate,
    getOrderBenefits,
};
