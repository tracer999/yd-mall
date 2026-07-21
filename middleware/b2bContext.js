const pool = require('../config/db');
const { getNumberSetting } = require('../config/systemSettings');

/*
 * ── B2B 거래 컨텍스트 (docs/사이트개선/b2b_사업자몰_구현설계.md §2) ──
 *
 * 이 프로젝트는 B2B 몰을 따로 만들지 않는다. 같은 몰·같은 화면·같은 상품을 쓰고,
 * **승인된 사업자 회원인지**에 따라 가격·수량규칙·주문절차만 갈라진다.
 * 그 판정을 이 미들웨어 한 곳에서만 하고, 결과를 req.b2b / res.locals.b2b 로 흘린다.
 * 컨트롤러·뷰가 각자 조건을 재조립하면 표시가와 청구가가 반드시 어긋난다.
 *
 * B2B 는 **모든 몰에서 기본 동작**한다(몰별 on/off 없음). 새로 찍어낸 몰도 아무 데이터를
 * 넣지 않은 상태에서 그대로 쓸 수 있어야 하므로, 동작 설정값은 system_settings 에 두고
 * 코드가 기본값을 갖는다 — 행이 없어도 정상 동작한다.
 *
 * 사업자 신원은 몰 스코프가 아니다. 사업자등록증으로 확인한 회사는 어느 몰에서 보든
 * 같은 회사이기 때문이다. (상품 전용가는 products 를 통해 자연히 몰 스코프를 따른다.)
 *
 * ⚠️ 로그인했다고 B2B 가 아니다(설계 §17.1). active=true 는 아래를 전부 통과해야 한다.
 *    1) 로그인  2) business_profile 존재  3) status='APPROVED'  4) 계정 활성  5) 계약기간 내
 *
 * ⚠️ 가드는 **fail-close** 다. 판정에 실패하면 B2B 를 켜지 않는다.
 *    (Shopify 가드가 fail-open 이라 스크립트가 실 API 를 때리던 사고를 반복하지 않는다.)
 */

/** 비활성 컨텍스트. 뷰가 항상 같은 모양을 보게 불변 객체 하나를 재사용한다. */
const INACTIVE = Object.freeze({
    active: false,
    state: 'NONE',          // NONE|PENDING|UNDER_REVIEW|APPROVED|SUSPENDED|REJECTED|EXPIRED
    userId: null,
    mallId: null,
    businessProfileId: null,
    companyName: null,
    businessNumber: null,
    tierId: null,
    tierCode: null,
    tierName: null,
    pricePolicyId: null,
    taxDisplay: 'INCLUSIVE',
    rejectReason: null,
    permissions: Object.freeze([]),
});

/*
 * 동작 설정 기본값. system_settings 에 같은 키가 있으면 그 값이 이긴다.
 * 관리자 화면에서 바꾸며, 행이 없어도(= 새 몰) 이 기본값으로 정상 동작한다.
 */
const DEFAULTS = {
    autoApprove: false,
    taxDisplay: 'EXCLUSIVE',       // B2B 는 공급가 별도 표기가 기본
    allowCouponStacking: false,    // 전용가는 계약가 레인 — 쿠폰·포인트와 겹치지 않는다
    freeShipThreshold: null,       // null = 기본 배송정책을 따른다
    paymentDueDays: 7,
    quoteValidDays: 14,
    bankAccountInfo: '',
};

/** system_settings 의 '0'/'false' 계열을 불리언으로. 값이 없으면 기본값. */
function boolSetting(key, fallback) {
    const raw = global.systemSettings ? global.systemSettings[key] : undefined;
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

function strSetting(key, fallback) {
    const raw = global.systemSettings ? global.systemSettings[key] : undefined;
    return (raw === undefined || raw === null || String(raw).trim() === '') ? fallback : String(raw);
}

/**
 * 현재 B2B 동작 설정. 미들웨어·컨트롤러·서비스가 모두 이걸 쓴다.
 * global.systemSettings 를 읽으므로 별도 쿼리가 없다.
 */
function getSettings() {
    const threshold = getNumberSetting('b2b_free_ship_threshold', -1);
    return {
        autoApprove: boolSetting('b2b_auto_approve', DEFAULTS.autoApprove),
        taxDisplay: strSetting('b2b_tax_display', DEFAULTS.taxDisplay) === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
        allowCouponStacking: boolSetting('b2b_allow_coupon_stacking', DEFAULTS.allowCouponStacking),
        freeShipThreshold: threshold >= 0 ? threshold : DEFAULTS.freeShipThreshold,
        paymentDueDays: getNumberSetting('b2b_payment_due_days', DEFAULTS.paymentDueDays),
        quoteValidDays: getNumberSetting('b2b_quote_valid_days', DEFAULTS.quoteValidDays),
        bankAccountInfo: strSetting('b2b_bank_account_info', DEFAULTS.bankAccountInfo),
    };
}

/**
 * DATE 값을 'YYYY-MM-DD' 로 정규화한다.
 *
 * ⚠️ mysql2 는 DATE 컬럼을 **JS Date 객체**로 준다. `String(date).slice(0,10)` 은
 *    'Wed Jan 01' 이 되어 문자열 비교가 조용히 틀린다(만료된 계약이 유효로 통과했다).
 *    toISOString() 도 UTC 로 밀려 KST 새벽에 하루 어긋난다 — 로컬 연·월·일로 조립한다.
 */
function toDateStr(value) {
    if (!value) return null;
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 계약기간 판정. from/to 가 NULL 이면 무제한이다. */
function contractLive(profile) {
    const today = toDateStr(new Date());
    const from = toDateStr(profile.contract_valid_from);
    const to = toDateStr(profile.contract_valid_to);
    if (from && today < from) return false;
    if (to && today > to) return false;
    return true;
}

/** 사업자 프로필 + 등급을 한 번에 읽는다. */
async function loadProfile(userId) {
    const [[row]] = await pool.query(
        `SELECT bp.*, t.tier_code, t.tier_name
           FROM business_profile bp
           LEFT JOIN b2b_tier t ON t.id = bp.tier_id
          WHERE bp.user_id = ?`,
        [userId]
    );
    return row || null;
}

/**
 * 프로필 → 컨텍스트. 미들웨어 밖(스크립트·서비스)에서도 재사용할 수 있게 분리했다.
 */
function buildContext(profile, user, mallId) {
    if (!profile) return INACTIVE;
    const settings = getSettings();

    const base = {
        active: false,
        state: profile.status,
        userId: user.id,
        mallId: Number(mallId) || null,
        businessProfileId: profile.id,
        companyName: profile.company_name,
        businessNumber: profile.business_number,
        tierId: profile.tier_id || null,
        tierCode: profile.tier_code || null,
        tierName: profile.tier_name || null,
        pricePolicyId: profile.price_policy_id || null,
        taxDisplay: settings.taxDisplay,
        rejectReason: profile.reject_reason || null,
        permissions: [],
    };

    if (profile.status !== 'APPROVED') return Object.freeze(base);
    if (Number(user.is_active) === 0) return Object.freeze({ ...base, state: 'SUSPENDED' });
    if (!contractLive(profile)) return Object.freeze({ ...base, state: 'EXPIRED' });

    // 1단계 권한. 견적 권한(REQUEST_QUOTE/NEGOTIATE_QUOTE)은 3단계에서 추가한다.
    return Object.freeze({
        ...base,
        active: true,
        permissions: Object.freeze(['VIEW_B2B_PRICE', 'PLACE_ORDER']),
    });
}

module.exports = async (req, res, next) => {
    req.b2b = INACTIVE;
    res.locals.b2b = INACTIVE;

    try {
        if (!req.user) return next();
        const profile = await loadProfile(req.user.id);
        const ctx = buildContext(profile, req.user, req.mallId || 1);

        /*
         * 로그인 시 고른 구매 자격을 존중한다(routes/auth.js resolveLoginMode).
         *   false  → 개인 구매로 명시 진입. 승인 사업자라도 일반가로 산다.
         *   그 외  → 사업자 자격을 그대로 적용(소셜 로그인·기존 세션 호환).
         * 자격 자체(승인 상태·계약기간)는 buildContext 가 이미 판정했다. 여기서는 **끄기만** 한다 —
         * 세션 값으로 없는 자격을 만들어 낼 수는 없다.
         */
        const personalMode = req.session && req.session.b2bMode === false;
        const applied = (personalMode && ctx.active)
            ? Object.freeze({ ...ctx, active: false, state: 'PERSONAL_MODE', permissions: Object.freeze([]) })
            : ctx;

        req.b2b = applied;
        res.locals.b2b = applied;
        // 화면이 "지금 어느 자격인지 / 전환할 수 있는지" 를 판단하는 값
        res.locals.b2bCanSwitch = ctx.active;
        res.locals.b2bPersonalMode = personalMode && ctx.active;
    } catch (err) {
        // fail-close — 판정에 실패하면 B2B 를 켜지 않는다. 화면은 B2C 로 정상 동작한다.
        console.warn('[b2bContext] 컨텍스트 해석 실패, B2B 비활성:', err.message);
    }
    next();
};

module.exports.INACTIVE = INACTIVE;
module.exports.DEFAULTS = DEFAULTS;
module.exports.getSettings = getSettings;
module.exports.loadProfile = loadProfile;
module.exports.buildContext = buildContext;
