/*
 * 배송비 계산기 (배송비 문서 §4)
 *
 * ── 규칙 1. 배송비는 서버가 계산한다. 요청 본문·쿼리스트링을 인자로 받지 않는다.
 *    이 파일의 함수는 mallId · subtotalAmount · receiverZipcode 만 받는다. 셋 다 서버가
 *    자기 손으로 구한 값이어야 한다(subtotal 은 장바구니에서, zipcode 는 폼이되 계산에만 쓴다).
 *    금액을 폼에서 받으면 쿠폰 문서 C3(결제 우회)와 같은 결함을 하나 더 만드는 것이다.
 *
 * ── 규칙 2. 무료배송 판정 기준은 `subtotal_amount` 다 (쿠폰·적립금 차감 전).
 *    결제액 기준이면 "쿠폰을 썼더니 배송비가 생겼다"가 된다. 쿠폰 사용을 벌하지 않는다.
 *
 * ── 규칙 3. 무료배송이어도 지역 할증은 청구한다 (§7 미결 1 → 권장안 A, 택배사 관행).
 *    무료가 되는 것은 `base_fee` 뿐이다.
 */

const pool = require('../../config/db');

const DEFAULT_POLICY = { base_fee: 3000, free_threshold: 50000, is_active: 1, jeju_extra: 3000, island_extra: 5000 };

/** 몰별 배송비 정책. 행이 없으면 고지된 기본값으로 동작한다(무배송비 상태로 새지 않게). */
async function getPolicy(mallId) {
    const [rows] = await pool.query('SELECT * FROM shipping_policy WHERE mall_id = ?', [mallId || 1]);
    return rows[0] || { ...DEFAULT_POLICY, mall_id: mallId || 1 };
}

/**
 * 우편번호 → 할증 권역. 대역 테이블에 없으면 null(할증 없음).
 * @returns {Promise<'JEJU'|'ISLAND'|null>}
 */
async function resolveZone(receiverZipcode) {
    const zip = String(receiverZipcode || '').replace(/[^0-9]/g, '');
    if (zip.length !== 5) return null;
    const [rows] = await pool.query(
        'SELECT zone_type FROM shipping_zipcode_zone WHERE ? BETWEEN zipcode_from AND zipcode_to LIMIT 1',
        [zip]
    );
    return rows.length > 0 ? rows[0].zone_type : null;
}

/**
 * 배송비를 계산한다.
 *
 * @param {{mallId:number, subtotalAmount:number, receiverZipcode?:string}} args
 * @returns {Promise<{fee:number, baseFee:number, extraFee:number, zone:string|null,
 *                    isFree:boolean, freeThreshold:number|null, remainingForFree:number}>}
 */
async function calcShippingFee({ mallId, subtotalAmount, receiverZipcode }) {
    const policy = await getPolicy(mallId);
    const subtotal = Math.max(0, Number(subtotalAmount) || 0);

    if (!policy || Number(policy.is_active) !== 1) {
        return { fee: 0, baseFee: 0, extraFee: 0, zone: null, isFree: true, freeThreshold: null, remainingForFree: 0 };
    }

    const freeThreshold = policy.free_threshold != null ? Number(policy.free_threshold) : null;
    const isFree = freeThreshold != null && subtotal >= freeThreshold;
    const baseFee = isFree ? 0 : Number(policy.base_fee) || 0;

    // 지역 할증은 무료배송이어도 청구한다.
    const zone = await resolveZone(receiverZipcode);
    let extraFee = 0;
    if (zone === 'JEJU') extraFee = Number(policy.jeju_extra) || 0;
    else if (zone === 'ISLAND') extraFee = Number(policy.island_extra) || 0;

    return {
        fee: baseFee + extraFee,
        baseFee,
        extraFee,
        zone,
        isFree,
        freeThreshold,
        remainingForFree: (freeThreshold != null && !isFree) ? freeThreshold - subtotal : 0,
    };
}

module.exports = { calcShippingFee, getPolicy, resolveZone, DEFAULT_POLICY };
