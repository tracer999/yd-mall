/*
 * 신상품 · 신규 입점 브랜드 판정 — 단일 진실 공급원
 * (설계: docs/사이트개선/new_arrivals_dev_plan.md)
 *
 * 이전에는 "신상품" 정의가 세 벌로 갈라져 있었다(NEW 뱃지 / 테마 카테고리 6 / RSS 최신순).
 * 판정 규칙을 바꾸려면 반드시 이 파일만 고치고, 소비처는 여기서 만든 술어를 재사용한다.
 *
 * 규칙
 *   상품: 판매 시작일이 오늘 이전 & N일 이내   (자동)
 *         OR  product_badge 에 'NEW'           (관리자 강제 노출 — 기간 무관)
 *   브랜드: 입점일이 오늘 이전 & M일 이내
 *
 * created_at(적재 시각)이 아니라 sale_start_date(판매 시작일)를 앵커로 쓴다.
 * created_at 으로 자르면 대량 임포트 몰 전체가 신상품이 되기 때문이다.
 * 미래 날짜(예약 발매)는 아직 판매 전이므로 신상품에서 제외한다.
 *
 * 뱃지를 다시 써넣는(materialize) 방식을 쓰지 않는 이유: 동적 술어로 계산해야
 * 기간이 지난 상품이 배치 없이 자동으로 빠지고, 관리자가 기간 설정을 바꾸면 즉시 반영된다.
 */

const DEFAULT_PRODUCT_DAYS = 100;
const DEFAULT_BRAND_DAYS = 180;

function readDays(key, fallback) {
    const raw = global.systemSettings ? global.systemSettings[key] : null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function newProductDays() {
    return readDays('new_product_days', DEFAULT_PRODUCT_DAYS);
}

function newBrandDays() {
    return readDays('new_brand_days', DEFAULT_BRAND_DAYS);
}

/**
 * 신상품 SQL 술어.
 *
 * ⚠️ sql 조각과 params 는 **반드시 같은 지점에서 함께** 삽입해야 한다.
 * 소비처들이 문자열 이어붙이기 + params.push() 방식이라, 넣는 순서가 어긋나면
 * 에러 없이 조용히 틀린 결과가 나온다.
 *
 *   const np = newArrival.newProductPredicate('p');
 *   query += ` AND ${np.sql}`;  params.push(...np.params);
 *
 * @param {string} alias products 테이블 별칭 ('' 이면 별칭 없이)
 */
function newProductPredicate(alias = 'p') {
    const c = alias ? `${alias}.` : '';
    return {
        sql: `((${c}sale_start_date IS NOT NULL
                AND ${c}sale_start_date <= CURDATE()
                AND ${c}sale_start_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY))
               OR FIND_IN_SET('NEW', ${c}product_badge))`,
        params: [newProductDays()],
    };
}

/** 신규 입점 브랜드 SQL 술어 (categories, type=BRAND 를 이미 걸고 있다고 가정) */
function newBrandPredicate(alias = 'c') {
    const c = alias ? `${alias}.` : '';
    return {
        sql: `(${c}onboarded_at IS NOT NULL
               AND ${c}onboarded_at <= CURDATE()
               AND ${c}onboarded_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY))`,
        params: [newBrandDays()],
    };
}

/** 신상품 정렬 — 판매 시작일 최신순. 미지정(NULL)은 뒤로. */
const NEW_PRODUCT_ORDER = 'sale_start_date IS NULL ASC, sale_start_date DESC, id DESC';

function daysAgo(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
}

function toDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? new Date(v) : new Date(String(v));
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

/** 뷰에서 NEW 뱃지를 그릴지 판단. SQL 술어와 같은 규칙이어야 한다. */
function isNewProduct(product) {
    if (!product) return false;

    const badges = String(product.product_badge || '').split(',');
    if (badges.includes('NEW')) return true;

    const start = toDate(product.sale_start_date);
    if (!start) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return start <= today && start >= daysAgo(newProductDays());
}

/** 브랜드 카드에 '신규 입점' 라벨을 그릴지 판단. */
function isNewBrand(brand) {
    if (!brand) return false;
    const at = toDate(brand.onboarded_at);
    if (!at) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return at <= today && at >= daysAgo(newBrandDays());
}

module.exports = {
    newProductPredicate,
    newBrandPredicate,
    isNewProduct,
    isNewBrand,
    newProductDays,
    newBrandDays,
    NEW_PRODUCT_ORDER,
};
