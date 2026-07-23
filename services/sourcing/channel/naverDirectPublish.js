/*
 * 가져온 상품(중간 테이블) → **스마트스토어 바로 전송**.
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §17
 *
 * 화면의 [스마트스토어로 바로 전송] 버튼 하나로 두 단계를 연달아 수행한다.
 *
 *     supplier_product  ──①──▶  products (우리 몰 상품)  ──②──▶  네이버
 *                     publishService            naverPublishService
 *
 * ★ **중간 테이블에서 네이버로 곧장 쏘지 않는다.** 우리 몰 상품을 반드시 거친다. 이유:
 *
 *   1. `channel_product_mapping.product_id` 가 NOT NULL 이고 `channel_sku_mapping.sku_id` 는
 *      `product_sku` 를 가리킨다. 상품 행을 건너뛰면 **매핑을 만들 수 없고**, 그러면
 *      재고 전송(naverStockSync)·주문 역추적이 통째로 동작하지 않는다.
 *   2. 네이버 페이로드는 옵션 축·조합·SKU 코드·정제된 상세HTML을 요구하는데, 그 정규화가
 *      바로 ① 단계다. 중간 테이블에는 공급처 원문(`supplier_variant`)만 있다.
 *   3. 등록 파이프라인이 두 벌이 되면 가격·재고 규칙이 갈라진다. 이 저장소가 계속 피해 온 것이다.
 *
 *   즉 이 기능은 "우리 몰을 건너뛰는 경로"가 아니라 **두 버튼을 한 번에 누르는 편의**다.
 *   사용자에게는 한 번의 동작이고, 데이터 모델은 그대로다.
 *
 * ⚠ 한 건이 실패해도 나머지는 계속한다. ①에서 실패한 건은 ②를 시도하지 않는다.
 */

const pool = require('../../../config/db');
const publishService = require('../../sourcing/publishService');
const naverPublishService = require('./naverPublishService');
const categoryInherit = require('./naverCategoryInherit');

/*
 * 1회 실행 상한. ②가 건당 2~4초(이미지 업로드 포함, 2 RPS)라 이 선에서 끊는다.
 * ①은 훨씬 빠르지만 상한을 둘로 나누면 "①은 됐는데 ②는 안 된" 건이 생겨 혼란스럽다.
 */
const DIRECT_LIMIT = 10;


/**
 * 우리 카테고리에 연결된 네이버 **리프**를 방금 만든 상품들에만 상속한다.
 *
 * `naverCategoryInherit.applyInherit()` 는 **몰 전체**를 대상으로 돈다. 여기서 그걸 쓰면
 * 이번에 선택하지도 않은 수천 건의 상품에 카테고리가 조용히 박힌다 — 사용자가 누른 버튼의
 * 범위를 넘는 부작용이라 쓰지 않는다. 규칙(리프만·빈 값만)은 같고 범위만 좁혔다.
 *
 * ⚠ collation 드리프트 — categories 는 general_ci, naver_category 는 unicode_ci 라
 *   COLLATE 를 명시하지 않으면 조인 자체가 실패한다(문서 §8).
 */
async function inheritForProducts(mallId, productIds) {
    if (!productIds.length) return 0;
    const [ret] = await pool.query(
        `UPDATE products p
           JOIN categories c ON c.id = p.category_id
           JOIN naver_category n
             ON n.naver_category_id = c.naver_category_id COLLATE utf8mb4_unicode_ci
            SET p.naver_category_id = n.naver_category_id
          WHERE p.mall_id = ?
            AND p.id IN (?)
            AND p.naver_category_id IS NULL
            AND n.is_leaf = 1`,
        [mallId, productIds]
    );
    return ret.affectedRows || 0;
}

/**
 * 선택한 중간 테이블 상품을 우리 몰에 등록한 뒤 곧바로 네이버로 보낸다.
 *
 * @param {number} mallId
 * @param {Array<number>} supplierProductIds
 * @param {object} opts
 *   categoryId       우리 몰 카테고리(필수 — publishService 요구)
 *   marginRate       마진율(%). 없으면 몰 기본값
 *   naverCategoryId  네이버 **리프** 카테고리. 없으면 우리 카테고리에 연결된 값을 상속
 *   status/visibility 우리 몰 상품 상태(기본 OFF/HIDDEN)
 *   actor
 * @returns {Promise<object>} 단계별 집계
 */
async function publishStagingToNaver(mallId, supplierProductIds, opts = {}) {
    const list = [...new Set((Array.isArray(supplierProductIds) ? supplierProductIds : [supplierProductIds])
        .map(Number).filter(Boolean))];
    if (!list.length) throw new Error('전송할 상품을 선택하세요.');

    const overLimit = list.length > DIRECT_LIMIT;
    const targets = list.slice(0, DIRECT_LIMIT);

    /*
     * 네이버 리프 카테고리를 먼저 검증한다. ① 을 다 돌린 뒤 ② 에서 전량 막히면
     * 우리 몰에는 상품이 생기고 네이버에는 아무것도 안 올라간 어정쩡한 상태가 된다.
     */
    const naverCategoryId = String(opts.naverCategoryId || '').trim();
    if (naverCategoryId) {
        const [cat] = await pool.query(
            'SELECT naver_category_id, whole_category_name, is_leaf FROM naver_category WHERE naver_category_id = ? LIMIT 1',
            [naverCategoryId]
        );
        if (!cat.length) throw new Error(`수집된 네이버 카테고리가 아닙니다: ${naverCategoryId}`);
        if (!cat[0].is_leaf) {
            throw new Error(`네이버는 리프(최하위) 카테고리만 받습니다: ${cat[0].whole_category_name}`);
        }
    }

    /*
     * 재판매 금지 상품은 **여기서 잘라 낸다.** 공급처가 오픈마켓 재판매를 막은 상품이라
     * 스마트스토어에 올리면 제재 대상이다.
     *
     * ⚠ 화면 가드만으로는 부족하다 — 폼 값은 조작될 수 있고, 이 경로는 외부몰에 실제로
     *   등록하는 쓰기 작업이다. ① 을 돌리기 **전에** 빼야 "우리 몰에는 만들어졌는데
     *   네이버엔 못 보낸" 어정쩡한 상태도 생기지 않는다.
     *   resale_allowed 는 0=금지 / 1=가능 / NULL=미확인 이므로 **0만** 뺀다.
     */
    const [blockedRows] = await pool.query(
        `SELECT id, title FROM supplier_product
          WHERE mall_id = ? AND id IN (?) AND resale_allowed = 0`,
        [mallId, targets]
    );
    const blockedIds = new Set(blockedRows.map((r) => Number(r.id)));
    const sendable = targets.filter((id) => !blockedIds.has(id));

    if (!sendable.length) {
        throw new Error(
            `선택한 ${targets.length}건이 모두 재판매 금지 상품입니다 — 스마트스토어로 보낼 수 없습니다. `
            + '목록 필터의 [재판매 금지 제외]로 대상을 고르세요.'
        );
    }

    // ① 우리 몰 상품으로 등록
    const mall = await publishService.publishMany(mallId, sendable, {
        categoryId: opts.categoryId,
        marginRate: opts.marginRate,
        status: opts.status,
        visibility: opts.visibility,
        actor: opts.actor,
    });

    const created = mall.results.filter((r) => r.ok && r.productId);
    const productIds = created.map((r) => r.productId);

    if (!productIds.length) {
        return {
            requested: list.length, processed: sendable.length,
            resaleBlocked: blockedRows.length,
            overLimit, limit: DIRECT_LIMIT,
            mall, naver: null,
            success: 0, failed: mall.failed, skipped: mall.skipped,
        };
    }

    /*
     * 네이버 리프 카테고리 지정.
     * 명시 선택이 있으면 그것을, 없으면 우리 카테고리에 연결된 리프를 상속한다.
     * 상속으로도 못 채운 상품은 ② 에서 "네이버 카테고리 없음"으로 걸러진다(전송 전 검증).
     */
    let categoryAssigned = 0;
    if (naverCategoryId) {
        const r = await categoryInherit.assignCategory(mallId, productIds, naverCategoryId);
        categoryAssigned = r.updated;
    } else {
        categoryAssigned = await inheritForProducts(mallId, productIds);
    }

    /*
     * ② 네이버 등록.
     *
     * ⚠ publishMany 는 **전제 조건이 없으면 통째로 throw** 한다(자격증명 없음·등록 기본값
     *   미작성 등). 그대로 흘려보내면 "①에서 상품은 이미 만들어졌다"는 사실이 사용자에게
     *   전달되지 않아, 화면에는 오류만 뜨고 몰에는 상품이 조용히 쌓인다.
     *   그래서 여기서 잡아 두 단계의 결과를 함께 돌려준다.
     */
    let naver = null;
    let naverError = null;
    try {
        naver = await naverPublishService.publishMany(mallId, productIds, { actor: opts.actor });
    } catch (e) {
        naverError = e.message;
    }

    return {
        requested: list.length,
        processed: sendable.length,
        resaleBlocked: blockedRows.length,
        overLimit, limit: DIRECT_LIMIT,
        mall,
        naver,
        naverError,
        createdProductIds: productIds,
        categoryAssigned,
        // 두 단계를 다 통과한 것만 성공으로 센다 — ①만 된 건 사용자에겐 실패다.
        success: naver ? naver.success : 0,
        failed: mall.failed + (naver ? naver.failed : productIds.length),
        skipped: mall.skipped + (naver ? naver.skipped : 0),
    };
}

module.exports = { publishStagingToNaver, DIRECT_LIMIT };
