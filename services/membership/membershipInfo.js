/*
 * 멤버십 제도 정보 — 정적 상수 (**폴백 전용**)
 *
 * ⚠️ 2026-07: 실제 등급 시스템이 구현됐다(membership_grade 등 9테이블 + 평가 배치 + 결제 연동,
 *    설계: docs/사이트개선/membership_grade_admin_design.md 부록 B). 등급표는 이제
 *    `evaluationService.getPublicTiers(mallId)` 가 **DB 등급**에서 만든다.
 *    이 상수는 **활성 등급이 하나도 없을 때의 폴백**으로만 남는다(신규 몰·시드 전 상태).
 *
 * 소비처(둘 다 getPublicTiers 경유, 폴백으로만 이 상수 사용):
 *   /membership   멤버십 안내 페이지 (routes/feature.js)
 *   /event        이벤트&혜택 페이지의 '멤버십 혜택' 섹션 (controllers/eventController.js)
 */

const TIERS = [
    { code: 'WELCOME', name: '웰컴', threshold: '가입 시', rate: '1%', perks: ['기본 적립'] },
    { code: 'SILVER', name: '실버', threshold: '누적 10만원 이상', rate: '2%', perks: ['기본 적립 상향'] },
    { code: 'GOLD', name: '골드', threshold: '누적 50만원 이상', rate: '3%', perks: ['적립 상향', '무료배송'], accent: true },
    { code: 'VIP', name: 'VIP', threshold: '누적 200만원 이상', rate: '5%', perks: ['최고 적립', '무료배송', '전용 쿠폰'] },
];

const BENEFITS = [
    { icon: 'bi-coin', title: '구매 적립', desc: '등급별 적립률로 구매 금액을 적립금으로 돌려드립니다.' },
    { icon: 'bi-truck', title: '배송 혜택', desc: '골드 등급부터 무료배송 혜택이 적용됩니다.' },
    { icon: 'bi-gift', title: '생일 쿠폰', desc: '생일·기념일에 전용 쿠폰을 드립니다.' },
];

module.exports = { TIERS, BENEFITS };
