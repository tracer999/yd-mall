/*
 * 신규 몰 기본 멤버십 등급 — **단일 정의**
 *
 * 몰 빌더가 몰을 찍어낼 때 심는 기본 리소스다(mallProvisioner → membershipSeeder).
 * 값은 설계 §18 권장 초기 정책이며 scripts/seed_membership.sql 과 같은 세트다.
 *
 * ⚠️ 여기가 유일한 출처여야 한다. 이 값은 두 곳에서 쓰인다.
 *   1) membershipSeeder — 신규 몰에 실제 DB 행(등급·혜택·평가정책·기준)으로 삽입
 *   2) membershipInfo   — 등급이 0건인 몰의 스토어프론트 폴백 표
 * 둘이 갈라지면 "안내 화면에 적힌 혜택"과 "실제 적용되는 혜택"이 어긋난다.
 *
 * 적립률 주의: 기존 시스템은 point_accumulate_rate(기본 5%)를 전 회원에게 준다.
 * 등급 적립은 이를 **대체하지 않고(ADD)** 가산한다 — 기존 동작 회귀를 막기 위함.
 */

/**
 * 등급 4종. 컬럼명은 DB 그대로 둔다(시더가 그대로 INSERT 하고, toTier 가 그대로 읽는다).
 * rank_order 는 작을수록 상위.
 */
const DEFAULT_GRADES = [
    {
        grade_code: 'BASIC', grade_name: '베이직', rank_order: 40, is_default: 1, color: '#9ca3af',
        description: '가입 시 기본 등급',
        mypage_note: '구매 실적을 쌓으면 상위 등급으로 승급됩니다.',
        benefit: {
            discount_rate: 0, max_discount_amount: null, min_order_amount: 0,
            point_rate: null, point_rate_mode: 'ADD',
            free_shipping: 0, free_ship_threshold: null,
        },
        criterion: { entry_amount_min: 0, entry_order_count_min: 0, retention_amount_min: null },
    },
    {
        grade_code: 'SILVER', grade_name: '실버', rank_order: 30, is_default: 0, color: '#94a3b8',
        description: '누적 구매 실적 실버 등급',
        mypage_note: '실버 등급 혜택이 적용됩니다.',
        benefit: {
            discount_rate: 0, max_discount_amount: null, min_order_amount: 0,
            point_rate: 0.5, point_rate_mode: 'ADD',
            free_shipping: 0, free_ship_threshold: null,
        },
        criterion: { entry_amount_min: 300000, entry_order_count_min: 3, retention_amount_min: 200000 },
    },
    {
        grade_code: 'GOLD', grade_name: '골드', rank_order: 20, is_default: 0, color: '#f59e0b',
        description: '누적 구매 실적 골드 등급',
        mypage_note: '골드 등급 할인·적립·배송 혜택이 적용됩니다.',
        benefit: {
            discount_rate: 2, max_discount_amount: 30000, min_order_amount: 0,
            point_rate: 1, point_rate_mode: 'ADD',
            free_shipping: 0, free_ship_threshold: 30000,
        },
        criterion: { entry_amount_min: 1000000, entry_order_count_min: 8, retention_amount_min: 800000 },
    },
    {
        grade_code: 'VIP', grade_name: 'VIP', rank_order: 10, is_default: 0, color: '#7c3aed',
        description: '최상위 등급',
        mypage_note: 'VIP 전용 혜택이 적용됩니다.',
        benefit: {
            discount_rate: 5, max_discount_amount: 100000, min_order_amount: 0,
            point_rate: 2, point_rate_mode: 'ADD',
            free_shipping: 1, free_ship_threshold: null,
        },
        criterion: { entry_amount_min: 3000000, entry_order_count_min: 15, retention_amount_min: 2500000 },
    },
];

/** 몰별 ACTIVE 평가 정책 1건 (설계 §18) */
const DEFAULT_POLICY = {
    policy_name: '기본 등급 평가 정책',
    version: 1,
    status: 'ACTIVE',
    performance_period_months: 12,
    evaluation_cycle: 'MONTHLY',
    amount_basis: 'B_NET',
    condition_operator: 'OR',
    upgrade_mode: 'IMMEDIATE',   // 승급은 빠르게
    downgrade_mode: 'SCHEDULED', // 강등은 정기 평가에서
    new_member_protect_days: 0,
    min_holding_days: 0,
};

module.exports = { DEFAULT_GRADES, DEFAULT_POLICY };
