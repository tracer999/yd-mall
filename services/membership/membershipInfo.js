/*
 * 멤버십 제도 정보 — 스토어프론트 등급표 매핑 + **폴백 전용** 상수
 *
 * 등급표는 `evaluationService.getPublicTiers(mallId)` 가 **DB 등급**에서 만든다.
 * 이 파일의 TIERS 는 활성 등급이 하나도 없을 때의 폴백이다.
 *
 * ⚠️ 2026-07: 신규 몰은 mallProvisioner 가 membershipSeeder 로 기본 등급을 심으므로
 *    폴백이 뜨는 경우는 **등급을 전부 지운 몰**뿐이다. 그래도 표가 실제 혜택과 어긋나면
 *    안 되므로, TIERS 는 시더가 심는 것과 **같은 정의**(membershipDefaults)에서 만든다.
 *    상수를 손으로 적어 두면 시드 값과 반드시 갈라진다.
 *
 * 소비처(둘 다 getPublicTiers 경유, 폴백으로만 이 상수 사용):
 *   /membership   멤버십 안내 페이지 (routes/feature.js)
 *   /event        이벤트&혜택 페이지의 '멤버십 혜택' 섹션 (controllers/eventController.js)
 */

const { DEFAULT_GRADES } = require('./membershipDefaults');

const won = (n) => `${Math.round(Number(n) / 10000).toLocaleString()}만원`;

/**
 * 등급 1건 → 뷰의 tier 형태. DB 등급(getPublicTiers)과 기본 정의(TIERS)가 같은 문구를 쓰도록
 * 매핑을 여기 한 곳에 둔다.
 *
 * @param {object} g 등급 + 혜택 평면 객체
 *        (grade_code, grade_name, is_default, discount_rate, free_shipping,
 *         free_ship_threshold, point_rate, point_rate_mode)
 * @param {number} entryAmount 승급 진입 최소 금액(기준이 없으면 0)
 * @returns {{code:string, name:string, threshold:string, rate:string, perks:string[], accent:boolean}}
 */
function toTier(g, entryAmount) {
    const entry = Number(entryAmount) || 0;
    const threshold = (Number(g.is_default) === 1 || entry <= 0) ? '가입 시' : `${won(entry)} 이상`;

    const pr = g.point_rate != null ? Number(g.point_rate) : null;
    const rate = pr != null ? (g.point_rate_mode === 'REPLACE' ? `${pr}%` : `+${pr}%`) : '기본';

    const perks = [];
    if (Number(g.discount_rate) > 0) perks.push(`상품 ${Number(g.discount_rate)}% 할인`);
    if (Number(g.free_shipping) === 1) perks.push('상시 무료배송');
    else if (g.free_ship_threshold != null) perks.push(`${won(g.free_ship_threshold)} 이상 무료배송`);
    if (pr != null) perks.push(`구매 적립 ${g.point_rate_mode === 'REPLACE' ? pr : '+' + pr}%`);
    if (!perks.length) perks.push('기본 적립');

    return { code: g.grade_code, name: g.grade_name, threshold, rate, perks, accent: g.grade_code === 'GOLD' };
}

/** 폴백 등급표 — 하위→상위 순(시더가 심는 값과 동일). */
const TIERS = [...DEFAULT_GRADES]
    .sort((a, b) => b.rank_order - a.rank_order)
    .map((g) => toTier(Object.assign({}, g, g.benefit), g.criterion.entry_amount_min));

const BENEFITS = [
    { icon: 'bi-coin', title: '구매 적립', desc: '등급별 적립률로 구매 금액을 적립금으로 돌려드립니다.' },
    { icon: 'bi-truck', title: '배송 혜택', desc: '골드 등급부터 무료배송 혜택이 적용됩니다.' },
    { icon: 'bi-gift', title: '생일 쿠폰', desc: '생일·기념일에 전용 쿠폰을 드립니다.' },
];

module.exports = { TIERS, BENEFITS, toTier };
