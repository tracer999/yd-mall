const pool = require('../../config/db');

/*
 * 아울렛(Outlet) — 몰 안의 몰.
 *
 * 설계: docs/사이트개선/outlet_design_and_development.md
 *
 * 이 모듈이 지키는 두 가지 불변식:
 *
 *   1) 가격을 만들지 않는다. products.original_price / price / discount_rate 를 그대로 읽는다.
 *      아울렛 전용 가격을 두면 장바구니·주문·결제 검증이 전부 딸려온다.
 *
 *   2) 아울렛 상품은 '할인율이 높은 상품'이 아니라 '할인 사유(outlet_type)가 있는 상품'이다.
 *      discount_rate 로 상품을 긁어오는 방식은 2026-07-11 구현했다가 되돌렸다(설계서 §3-1).
 *      여기서 상품을 뽑는 유일한 경로는 outlet_product 매핑이다.
 */

// 할인 사유. 아울렛의 유일한 필수 분류축이다.
const OUTLET_TYPES = [
    { code: 'SEASON_OFF',     label: '시즌오프',   hint: '지난 시즌 이월상품',       needsGrade: false },
    { code: 'DISCONTINUED',   label: '단종·구형',  hint: '단종 예정·구형 모델',      needsGrade: false },
    { code: 'OVERSTOCK',      label: '재고정리',   hint: '재고 과다 소진',           needsGrade: false },
    { code: 'DISPLAY',        label: '전시상품',   hint: '매장·행사 전시품',         needsGrade: true  },
    { code: 'REFURBISHED',    label: '리퍼브',     hint: '점검·수리 후 재판매',      needsGrade: true  },
    { code: 'PACKAGE_DAMAGE', label: '포장훼손',   hint: '외부 포장 손상, 제품 정상', needsGrade: true  },
    { code: 'EXPIRY_SOON',    label: '임박상품',   hint: '유통기한 임박',            needsGrade: false },
];
const TYPE_CODES = OUTLET_TYPES.map((t) => t.code);
const TYPE_MAP = new Map(OUTLET_TYPES.map((t) => [t.code, t]));

// needsGrade 인 사유는 상태 등급·하자 고지를 요구한다. 이걸 빼먹으면 교환·반품 분쟁이 난다.
const GRADE_REQUIRED_TYPES = OUTLET_TYPES.filter((t) => t.needsGrade).map((t) => t.code);

const CONDITION_GRADES = [
    { code: 'A', label: 'A급 — 미개봉·새제품 수준' },
    { code: 'B', label: 'B급 — 경미한 사용·외관 하자' },
    { code: 'C', label: 'C급 — 눈에 띄는 하자 있음' },
];
const GRADE_CODES = CONDITION_GRADES.map((g) => g.code);

// 하자 고지가 반드시 있어야 하는 등급
const DEFECT_REQUIRED_GRADES = ['B', 'C'];

// 아울렛의 탐색 축은 가격이다(설계서 §4-4). 최신순이 기본이 아니다.
const LIST_SORTS = {
    discount: 'p.discount_rate DESC, p.id DESC',
    price_asc: 'p.price ASC, p.id DESC',
    price_desc: 'p.price DESC, p.id DESC',
    latest: 'op.created_at DESC, op.id DESC',
    stock_low: 'p.stock ASC, p.id DESC',   // 마지막 수량
};
const DEFAULT_SORT = 'discount';

const DEFAULT_SETTING = {
    allowed_types: TYPE_CODES.join(','),
    min_discount_rate: 20,
    min_product_count: 30,
    show_in_normal_list: 1,
    notice_html: null,
};

/*
 * 판매중 아울렛 상품의 조건.
 * 기간(started_at/ended_at)·노출 플래그·상품 상태를 모두 만족해야 '고객에게 보이는' 상품이다.
 * GNB 게이트 카운트와 목록 조회가 같은 정의를 써야 "메뉴는 있는데 0건" 이 안 생긴다.
 */
const LIVE_CLAUSE = `
    op.is_visible = 1
    AND (op.started_at IS NULL OR op.started_at <= NOW())
    AND (op.ended_at   IS NULL OR op.ended_at   >= NOW())
    AND p.status IN ('ON', 'SOLD_OUT')
    AND p.visibility = 'PUBLIC'
`;

function typeLabel(code) {
    return TYPE_MAP.get(code)?.label || code;
}

function decorate(row) {
    if (!row) return row;
    row.typeLabel = typeLabel(row.outlet_type);
    row.needsGrade = GRADE_REQUIRED_TYPES.includes(row.outlet_type);
    // 하자 고지는 등급이 아니라 '고지할 내용이 있는가'로 판단한다 — A급인데 하자 설명이 있을 수도 있다.
    row.hasDisclosure = Boolean(row.defect_description) || DEFECT_REQUIRED_GRADES.includes(row.condition_grade);
    return row;
}

async function getSetting(mallId = 1) {
    const [rows] = await pool.query('SELECT * FROM outlet_setting WHERE mall_id = ?', [mallId]);
    // 설정 행이 없는 몰(=갓 만들어진 몰)도 **같은 정규화**를 거쳐야 한다.
    // 예전에는 기본값을 그대로 반환해 allowedTypes(배열)가 없었고,
    // 화면이 `setting.allowedTypes.includes(...)` 에서 터져 아웃렛 관리가 500 이었다.
    const s = rows.length ? rows[0] : { mall_id: mallId, ...DEFAULT_SETTING };
    s.allowedTypes = String(s.allowed_types || '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => TYPE_CODES.includes(v));
    if (!s.allowedTypes.length) s.allowedTypes = TYPE_CODES.slice();
    return s;
}

async function saveSetting(mallId, data) {
    const allowed = (Array.isArray(data.allowedTypes) ? data.allowedTypes : [])
        .filter((v) => TYPE_CODES.includes(v));
    await pool.query(
        `INSERT INTO outlet_setting
            (mall_id, allowed_types, min_discount_rate, min_product_count, show_in_normal_list, notice_html)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            allowed_types = VALUES(allowed_types),
            min_discount_rate = VALUES(min_discount_rate),
            min_product_count = VALUES(min_product_count),
            show_in_normal_list = VALUES(show_in_normal_list),
            notice_html = VALUES(notice_html)`,
        [
            mallId,
            allowed.length ? allowed.join(',') : TYPE_CODES.join(','),
            Number(data.minDiscountRate) || 0,
            Number(data.minProductCount) || 0,
            data.showInNormalList ? 1 : 0,
            data.noticeHtml || null,
        ],
    );
}

/*
 * GNB 게이트용 카운트 (설계서 §4-5).
 * 관리자가 메뉴만 켜고 상품을 안 넣으면 다시 빈 메뉴가 되므로,
 * navigationService 가 이 값으로 아울렛을 GNB 에서 조용히 뺀다.
 */
async function countLiveProducts(mallId = 1) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM outlet_product op
         JOIN products p ON p.id = op.product_id
         WHERE op.mall_id = ? AND ${LIVE_CLAUSE}`,
        [mallId],
    );
    return rows[0]?.cnt || 0;
}

// ---------------------------------------------------------------------------
// 카테고리 — categories.type = 'OUTLET' 를 재사용한다(별도 테이블 아님).
// 모든 조회에 type 스코프를 걸어야 일반 카테고리 드롭다운에 섞이지 않는다.
// ---------------------------------------------------------------------------

async function getCategories(mallId = 1, { activeOnly = true } = {}) {
    const [rows] = await pool.query(
        `SELECT c.id, c.name, c.slug, c.parent_id, c.depth, c.display_order, c.is_active, c.description,
                (SELECT COUNT(*) FROM outlet_product op JOIN products p ON p.id = op.product_id
                 WHERE op.outlet_category_id = c.id AND ${LIVE_CLAUSE}) AS product_count
         FROM categories c
         WHERE c.mall_id = ? AND c.type = 'OUTLET' ${activeOnly ? 'AND c.is_active = 1' : ''}
         ORDER BY c.depth ASC, c.display_order ASC, c.id ASC`,
        [mallId],
    );
    return rows;
}

// ---------------------------------------------------------------------------
// 고객 조회
// ---------------------------------------------------------------------------

/*
 * 아울렛 상품 목록.
 * 가격 컬럼은 전부 products 에서 온다 — outlet_product 에는 가격이 없다.
 */
async function getProducts(mallId, opts = {}) {
    const {
        categoryId = null,
        type = null,
        sort = DEFAULT_SORT,
        page = 1,
        limit = 20,
        maxPrice = null,
    } = opts;

    const where = [`op.mall_id = ?`, LIVE_CLAUSE];
    const params = [mallId];

    if (categoryId) {
        where.push('op.outlet_category_id = ?');
        params.push(categoryId);
    }
    if (type && TYPE_CODES.includes(type)) {
        where.push('op.outlet_type = ?');
        params.push(type);
    }
    if (maxPrice) {
        where.push('p.price <= ?');
        params.push(maxPrice);
    }

    const whereSql = where.join(' AND ');
    const orderSql = LIST_SORTS[sort] || LIST_SORTS[DEFAULT_SORT];
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM outlet_product op JOIN products p ON p.id = op.product_id
         WHERE ${whereSql}`,
        params,
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
        `SELECT op.id AS outlet_id, op.outlet_type, op.outlet_reason, op.condition_grade,
                op.defect_description, op.expiry_at, op.outlet_category_id,
                p.id, p.name, p.slug, p.main_image, p.thumbnail_image,
                p.original_price, p.price, p.discount_rate, p.stock, p.status
         FROM outlet_product op
         JOIN products p ON p.id = op.product_id
         WHERE ${whereSql}
         ORDER BY op.sort_order ASC, ${orderSql}
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, offset],
    );

    return {
        products: rows.map(decorate),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
    };
}

// 사유별 상품 수 — 목록 상단 필터칩에 쓴다.
async function getTypeCounts(mallId) {
    const [rows] = await pool.query(
        `SELECT op.outlet_type, COUNT(*) AS cnt
         FROM outlet_product op JOIN products p ON p.id = op.product_id
         WHERE op.mall_id = ? AND ${LIVE_CLAUSE}
         GROUP BY op.outlet_type`,
        [mallId],
    );
    return rows.reduce((acc, r) => {
        acc[r.outlet_type] = r.cnt;
        return acc;
    }, {});
}

/*
 * 상품 상세(/products/:slug)에 얹을 아울렛 정보.
 * 아울렛 상품은 상세 페이지에서 반드시 사유·상태·하자를 고지해야 한다(설계서 §4-4).
 * 상품 상세를 아울렛용으로 따로 만들지 않고, 이 정보만 주입한다.
 */
async function getOutletInfoByProductId(mallId, productId) {
    const [rows] = await pool.query(
        `SELECT op.outlet_type, op.outlet_reason, op.condition_grade, op.defect_description,
                op.expiry_at, op.outlet_category_id, c.name AS category_name
         FROM outlet_product op
         JOIN products p ON p.id = op.product_id
         LEFT JOIN categories c ON c.id = op.outlet_category_id
         WHERE op.mall_id = ? AND op.product_id = ? AND ${LIVE_CLAUSE}
         LIMIT 1`,
        [mallId, productId],
    );
    return rows.length ? decorate(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// 관리자
// ---------------------------------------------------------------------------

async function getAdminList(mallId, opts = {}) {
    const { type = null, categoryId = null, q = null, page = 1, limit = 30 } = opts;

    const where = ['op.mall_id = ?'];
    const params = [mallId];
    if (type && TYPE_CODES.includes(type)) {
        where.push('op.outlet_type = ?');
        params.push(type);
    }
    if (categoryId) {
        where.push('op.outlet_category_id = ?');
        params.push(categoryId);
    }
    if (q) {
        where.push('(p.name LIKE ? OR p.product_code LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = where.join(' AND ');
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM outlet_product op JOIN products p ON p.id = op.product_id WHERE ${whereSql}`,
        params,
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
        `SELECT op.*, p.name, p.product_code, p.main_image, p.original_price, p.price,
                p.discount_rate, p.stock, p.status, c.name AS category_name
         FROM outlet_product op
         JOIN products p ON p.id = op.product_id
         LEFT JOIN categories c ON c.id = op.outlet_category_id
         WHERE ${whereSql}
         ORDER BY op.sort_order ASC, op.id DESC
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, (safePage - 1) * safeLimit],
    );

    return {
        items: rows.map(decorate),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
    };
}

async function getAdminItem(mallId, id) {
    const [rows] = await pool.query(
        `SELECT op.*, p.name, p.product_code, p.main_image, p.original_price, p.price,
                p.discount_rate, p.stock, p.status
         FROM outlet_product op
         JOIN products p ON p.id = op.product_id
         WHERE op.mall_id = ? AND op.id = ?`,
        [mallId, id],
    );
    return rows.length ? decorate(rows[0]) : null;
}

class OutletValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OutletValidationError';
    }
}

/*
 * 등록·수정 공통 검증.
 * 두 가지를 막는다:
 *   · 허위 할인 — 최소 할인율 미달 상품이 아울렛에 들어오는 것(설정값 기준)
 *   · 고지 누락 — 리퍼브·전시·훼손인데 상태 등급이나 하자 설명이 없는 것
 */
async function validate(mallId, data, product) {
    const setting = await getSetting(mallId);

    if (!TYPE_CODES.includes(data.outletType)) {
        throw new OutletValidationError('할인 사유를 선택하세요.');
    }
    if (!setting.allowedTypes.includes(data.outletType)) {
        throw new OutletValidationError(`이 몰에서 사용하지 않는 할인 사유입니다: ${typeLabel(data.outletType)}`);
    }
    if (setting.min_discount_rate > 0 && (product.discount_rate || 0) < setting.min_discount_rate) {
        throw new OutletValidationError(
            `아울렛 최소 할인율(${setting.min_discount_rate}%)에 미달합니다. `
            + `현재 상품 할인율: ${product.discount_rate || 0}%. 상품 가격을 먼저 조정하세요.`,
        );
    }
    if (GRADE_REQUIRED_TYPES.includes(data.outletType) && !GRADE_CODES.includes(data.conditionGrade)) {
        throw new OutletValidationError(`${typeLabel(data.outletType)} 상품은 상태 등급(A/B/C)이 필수입니다.`);
    }
    if (DEFECT_REQUIRED_GRADES.includes(data.conditionGrade) && !String(data.defectDescription || '').trim()) {
        throw new OutletValidationError('B·C 등급은 하자 고지 내용이 필수입니다. 미고지 시 교환·반품 분쟁이 발생합니다.');
    }
    if (data.outletType === 'EXPIRY_SOON' && !data.expiryAt) {
        throw new OutletValidationError('임박상품은 유통기한을 입력해야 합니다.');
    }
}

async function findProduct(mallId, productId) {
    const [rows] = await pool.query(
        'SELECT id, name, price, original_price, discount_rate FROM products WHERE id = ? AND mall_id = ?',
        [productId, mallId],
    );
    return rows[0] || null;
}

async function addProduct(mallId, data) {
    const product = await findProduct(mallId, data.productId);
    if (!product) throw new OutletValidationError('상품을 찾을 수 없습니다.');

    await validate(mallId, data, product);

    const [dup] = await pool.query(
        'SELECT id FROM outlet_product WHERE mall_id = ? AND product_id = ?',
        [mallId, data.productId],
    );
    if (dup.length) throw new OutletValidationError('이미 아울렛에 등록된 상품입니다.');

    const [result] = await pool.query(
        `INSERT INTO outlet_product
            (mall_id, product_id, outlet_category_id, outlet_type, outlet_reason,
             condition_grade, defect_description, expiry_at, started_at, ended_at, sort_order, is_visible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            mallId, data.productId, data.outletCategoryId || null, data.outletType,
            data.outletReason || null, data.conditionGrade || null, data.defectDescription || null,
            data.expiryAt || null, data.startedAt || null, data.endedAt || null,
            Number(data.sortOrder) || 0, data.isVisible ? 1 : 0,
        ],
    );
    return result.insertId;
}

async function updateProduct(mallId, id, data) {
    const item = await getAdminItem(mallId, id);
    if (!item) throw new OutletValidationError('아울렛 상품을 찾을 수 없습니다.');

    const product = await findProduct(mallId, item.product_id);
    if (!product) throw new OutletValidationError('상품을 찾을 수 없습니다.');

    await validate(mallId, data, product);

    await pool.query(
        `UPDATE outlet_product SET
            outlet_category_id = ?, outlet_type = ?, outlet_reason = ?,
            condition_grade = ?, defect_description = ?, expiry_at = ?,
            started_at = ?, ended_at = ?, sort_order = ?, is_visible = ?
         WHERE mall_id = ? AND id = ?`,
        [
            data.outletCategoryId || null, data.outletType, data.outletReason || null,
            data.conditionGrade || null, data.defectDescription || null, data.expiryAt || null,
            data.startedAt || null, data.endedAt || null, Number(data.sortOrder) || 0,
            data.isVisible ? 1 : 0, mallId, id,
        ],
    );
}

async function removeProduct(mallId, id) {
    await pool.query('DELETE FROM outlet_product WHERE mall_id = ? AND id = ?', [mallId, id]);
}

module.exports = {
    OUTLET_TYPES,
    TYPE_CODES,
    GRADE_REQUIRED_TYPES,
    CONDITION_GRADES,
    GRADE_CODES,
    DEFECT_REQUIRED_GRADES,
    LIST_SORTS,
    DEFAULT_SORT,
    OutletValidationError,
    typeLabel,
    getSetting,
    saveSetting,
    countLiveProducts,
    getCategories,
    getProducts,
    getTypeCounts,
    getOutletInfoByProductId,
    getAdminList,
    getAdminItem,
    addProduct,
    updateProduct,
    removeProduct,
    findProduct,
};
