/*
 * 우리 카테고리 → 상품 네이버 리프 카테고리 일괄 상속.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §12 "현재 데이터 상태"
 *
 * 왜 필요한가:
 *   네이버 상품등록은 `leafCategoryId` 가 필수인데, 우리 `products.naver_category_id` 는
 *   상품 수정 화면에서 한 건씩 검색해 넣는 수동 값이라 대량 등록에서 사실상 채워지지 않는다.
 *   반면 `categories.naver_category_id` 는 카테고리 반영(categoryReflect)으로 이미 채워져 있다.
 *   그래서 "상품이 속한 카테고리의 네이버 ID" 를 상품으로 내려 주면 대량 등록이 열린다.
 *
 * ★ 리프 게이트가 이 모듈의 핵심이다.
 *   `categories.naver_category_id` 를 그대로 복사하면 **비리프**(대/중분류) ID 가 상품에 박힌다.
 *   네이버는 리프만 받으므로 그런 상품은 전량 400/반려가 되고, 호출 한도만 태운 뒤
 *   원인 추적도 어렵다. 그래서 `naver_category.is_leaf = 1` 인 것만 내려보내고,
 *   나머지는 "더 깊은 매핑 필요" 로 **정직하게 스킵 집계**한다.
 *
 * ⚠ collation 드리프트: products/categories 는 utf8mb4_general_ci, naver_category 는
 *   utf8mb4_unicode_ci 라 COLLATE 를 명시하지 않으면 "Illegal mix of collations" 로
 *   쿼리 자체가 죽는다.
 */

const pool = require('../../../config/db');

/**
 * 상속 가능/불가 건수를 미리 센다(쓰기 없음).
 *
 * @returns {Promise<{eligible:number, nonLeaf:number, noCategoryMap:number, alreadySet:number, total:number}>}
 *   eligible       - 지금 채울 수 있는 상품 수 (카테고리의 네이버 ID 가 리프)
 *   nonLeaf        - 카테고리에 네이버 ID 는 있으나 리프가 아니라 못 채우는 수
 *   noCategoryMap  - 카테고리 자체에 네이버 ID 가 없어 못 채우는 수
 *   alreadySet     - 이미 상품에 값이 있어 건드리지 않는 수
 */
async function previewInherit(mallId) {
    const [rows] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            SUM(p.naver_category_id IS NOT NULL) AS alreadySet,
            SUM(p.naver_category_id IS NULL AND n.is_leaf = 1) AS eligible,
            SUM(p.naver_category_id IS NULL AND n.is_leaf = 0) AS nonLeaf,
            SUM(p.naver_category_id IS NULL AND n.naver_category_id IS NULL) AS noCategoryMap
           FROM products p
           LEFT JOIN categories c
                  ON c.id = p.category_id
           LEFT JOIN naver_category n
                  ON n.naver_category_id = c.naver_category_id COLLATE utf8mb4_unicode_ci
          WHERE p.mall_id = ?`,
        [mallId]
    );
    const r = rows[0] || {};
    return {
        total: Number(r.total || 0),
        alreadySet: Number(r.alreadySet || 0),
        eligible: Number(r.eligible || 0),
        nonLeaf: Number(r.nonLeaf || 0),
        noCategoryMap: Number(r.noCategoryMap || 0),
    };
}

/**
 * 실제로 채운다. **NULL 인 상품만** 채운다 —
 * 상품 수정 화면에서 사람이 직접 고른 값을 일괄 작업이 덮어쓰면 안 된다.
 *
 * @returns {Promise<{updated:number} & Awaited<ReturnType<typeof previewInherit>>>}
 */
async function applyInherit(mallId) {
    const before = await previewInherit(mallId);

    const [ret] = await pool.query(
        `UPDATE products p
           JOIN categories c
             ON c.id = p.category_id
           JOIN naver_category n
             ON n.naver_category_id = c.naver_category_id COLLATE utf8mb4_unicode_ci
            SET p.naver_category_id = n.naver_category_id
          WHERE p.mall_id = ?
            AND p.naver_category_id IS NULL
            AND n.is_leaf = 1`,
        [mallId]
    );

    return { ...before, updated: ret.affectedRows || 0 };
}

/**
 * 선택한 상품들에 네이버 카테고리를 직접 지정한다.
 *
 * 상속(applyInherit)으로 못 채우는 상품 — 우리 카테고리가 네이버 **대·중분류**에 걸려
 * 있는 것들 — 을 위한 경로다. 사람이 리프를 하나 골라 여러 건에 한 번에 박는다.
 *
 * 상속과 다른 점:
 *   - 사람이 명시적으로 고른 값이므로 **이미 값이 있어도 덮어쓴다**(재지정이 목적).
 *   - 리프 검증은 여기서도 한다. 화면 검색이 리프만 주지만, 폼 값은 조작될 수 있고
 *     비리프가 박히면 등록 때 전량 400 이 난다.
 *
 * @param {number} mallId
 * @param {Array<number|string>} productIds
 * @param {string} naverCategoryId
 */
async function assignCategory(mallId, productIds, naverCategoryId) {
    const ids = [...new Set((productIds || []).map(Number).filter(Number.isFinite))];
    if (!ids.length) throw new Error('상품을 선택하세요.');

    const catId = String(naverCategoryId || '').trim();
    if (!catId) throw new Error('네이버 카테고리를 선택하세요.');

    const [cat] = await pool.query(
        `SELECT naver_category_id, whole_category_name, is_leaf, is_active
           FROM naver_category WHERE naver_category_id = ? LIMIT 1`,
        [catId]
    );
    if (!cat.length) throw new Error(`수집된 네이버 카테고리가 아닙니다: ${catId}`);
    if (!cat[0].is_leaf) {
        throw new Error(`네이버는 리프(최하위) 카테고리만 받습니다: ${cat[0].whole_category_name}`);
    }

    const [ret] = await pool.query(
        `UPDATE products SET naver_category_id = ?
          WHERE mall_id = ? AND id IN (?)`,
        [catId, mallId, ids]
    );

    return {
        updated: ret.affectedRows || 0,
        selected: ids.length,
        categoryPath: cat[0].whole_category_name,
    };
}

/**
 * 우리 카테고리 하나에 네이버 카테고리를 연결한다(카테고리 관리 화면).
 *
 * 여기가 **사용자가 의식적으로 입력하는 유일한 지점**이다. 카테고리당 한 번만 하면
 * 그 아래 상품들은 상속으로 따라온다(§상속). 상품 9,680건을 개별 입력할 수는 없다.
 *
 * 리프 검증을 여기서도 한다 — 비리프를 카테고리에 박아 두면 상속받은 상품이
 * 전부 등록 실패한다. 실패를 상품 단계가 아니라 **지정 단계에서** 막는다.
 *
 * @param {object} opts
 * @param {boolean} opts.applyToProducts  이 카테고리 상품의 빈 값을 즉시 채울지
 */
async function setCategoryMapping(mallId, categoryId, naverCategoryId, opts = {}) {
    const catId = Number(categoryId);
    if (!Number.isFinite(catId)) throw new Error('카테고리를 찾을 수 없습니다.');

    const code = String(naverCategoryId || '').trim();
    let path = null;

    if (code) {
        const [nc] = await pool.query(
            `SELECT naver_category_id, whole_category_name, is_leaf
               FROM naver_category WHERE naver_category_id = ? LIMIT 1`,
            [code]
        );
        if (!nc.length) throw new Error(`수집된 네이버 카테고리가 아닙니다: ${code}`);
        if (!nc[0].is_leaf) {
            throw new Error(`네이버는 리프(최하위)만 받습니다. 더 깊은 카테고리를 고르세요: ${nc[0].whole_category_name}`);
        }
        path = nc[0].whole_category_name;
    }

    // 글로벌(mall_id=0) 카테고리도 편집 몰에서 손댈 수 있어야 한다 — 목록 조회와 같은 범위.
    const [r] = await pool.query(
        'UPDATE categories SET naver_category_id = ? WHERE id = ? AND mall_id IN (0, ?)',
        [code || null, catId, mallId]
    );
    if (!r.affectedRows) throw new Error('카테고리를 찾을 수 없습니다.');

    let applied = 0;
    if (code && opts.applyToProducts) {
        // 이미 지정된 상품은 덮지 않는다(수동 지정 보호) — 상속과 같은 규칙.
        const [u] = await pool.query(
            `UPDATE products SET naver_category_id = ?
              WHERE mall_id = ? AND category_id = ? AND naver_category_id IS NULL`,
            [code, mallId, catId]
        );
        applied = u.affectedRows || 0;
    }

    return { categoryId: catId, naverCategoryId: code || null, categoryPath: path, applied };
}

/** 카테고리 화면이 보여 줄 현재 매핑 + 상속 대상 수. */
async function categoryMappingInfo(mallId, categoryId) {
    const [rows] = await pool.query(
        `SELECT c.naver_category_id,
                nc.whole_category_name, nc.is_leaf, nc.notice_type,
                ns.label AS notice_label
           FROM categories c
           LEFT JOIN naver_category nc
                  ON nc.naver_category_id = c.naver_category_id COLLATE utf8mb4_unicode_ci
           LEFT JOIN naver_notice_schema ns
                  ON ns.notice_type = nc.notice_type
          WHERE c.id = ? LIMIT 1`,
        [Number(categoryId)]
    );
    const row = rows[0] || {};

    const [[cnt]] = await pool.query(
        `SELECT COUNT(*) AS total,
                SUM(naver_category_id IS NULL) AS pending
           FROM products WHERE mall_id = ? AND category_id = ?`,
        [mallId, Number(categoryId)]
    );

    return {
        naver_category_id: row.naver_category_id || null,
        path: row.whole_category_name || null,
        isLeaf: row.is_leaf == null ? null : !!row.is_leaf,
        noticeType: row.notice_type || null,
        noticeLabel: row.notice_label || null,
        productTotal: Number(cnt.total || 0),
        productPending: Number(cnt.pending || 0),
    };
}

/** 화면 문구용 한 줄 요약. */
function summarize(r) {
    const parts = [`${r.updated != null ? r.updated : r.eligible}건 지정`];
    if (r.nonLeaf) parts.push(`${r.nonLeaf}건 스킵(카테고리가 네이버 리프가 아님 — 더 깊은 매핑 필요)`);
    if (r.noCategoryMap) parts.push(`${r.noCategoryMap}건 스킵(카테고리에 네이버 매핑 없음)`);
    if (r.alreadySet) parts.push(`${r.alreadySet}건 유지(이미 지정됨)`);
    return parts.join(' / ');
}

module.exports = {
    previewInherit, applyInherit, assignCategory,
    setCategoryMapping, categoryMappingInfo, summarize,
};
