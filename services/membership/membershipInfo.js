/*
 * 멤버십 제도 정보 — 정적 상수
 *
 * 등급을 **산정하지 않는다.** `users` 에 등급 컬럼이 없고(`points_balance` 뿐), 주문 데이터도
 * 등급을 매길 만큼 쌓이지 않았다. 지금은 "제도가 이렇습니다" 를 안내하는 단계다.
 * 실제 등급 시스템(user_grade 테이블 + 산정 배치)은 2차다. 그래서 테이블 없이 상수로 둔다.
 *
 * 두 곳에서 쓴다 — 두 벌로 갈라지지 않도록 여기 한 곳에 둔다:
 *   /membership        멤버십 안내 페이지 (routes/feature.js)
 *   /event             이벤트&혜택 페이지의 '멤버십 혜택' 섹션 (controllers/eventController.js)
 *
 * 멤버십은 GNB 에서 내려왔다(2026-07 사용자 결정). 이벤트&혜택 하위 섹션으로 노출하고,
 * 상세는 /membership 이 계속 받는다 — 라우트를 없애면 기존 링크가 죽는다.
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
