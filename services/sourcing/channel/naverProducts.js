/*
 * 네이버 커머스 API 상품 오퍼레이션 (얇은 래퍼).
 * 설계: docs/사이트개선/네이버_스마트스토어_연동.md §엔드포인트
 *
 * ⚠ 버전이 섞여 있다 — 이 저장소에서 가장 헷갈리는 지점이다.
 *     상품 등록/조회/수정/삭제 : v2
 *     이미지 업로드            : v1  (naverImages.js)
 *     옵션 재고 변경           : v1
 *     판매상태 변경            : v1
 *     고시 상품군 스키마       : v1
 *     카테고리                 : v1  (naverClient.getCategories)
 *   v1 로 상품을 부르면 308 리다이렉트되고 "지원하지 않는 API Version" 이 뜬다.
 */

const naverClient = require('./naverClient');

/**
 * 상품 등록. 성공하면 원상품번호와 채널상품번호를 돌려준다.
 *
 * ⚠ originProductNo 와 smartstoreChannelProductNo 는 **완전히 다른 번호**다.
 *   스마트스토어 URL 에 보이는 건 채널상품번호이고, 수정·재고 API 는 원상품번호를 쓴다.
 *   어떤 상품의 원상품번호가 다른 상품의 채널상품번호와 우연히 같을 수 있어
 *   혼용하면 조용히 엉뚱한 상품을 건드린다.
 *
 * @returns {Promise<{originProductNo:string, channelProductNo:string|null, raw:object}>}
 */
async function createProduct(cred, payload) {
    const res = await naverClient.apiPost(cred, '/v2/products', payload);
    const originNo = res && (res.originProductNo != null ? String(res.originProductNo) : null);
    if (!originNo) {
        throw new Error('상품 등록 응답에 originProductNo 가 없습니다 — 등록 성공으로 볼 수 없습니다.');
    }
    return {
        originProductNo: originNo,
        channelProductNo: res.smartstoreChannelProductNo != null ? String(res.smartstoreChannelProductNo) : null,
        raw: res,
        traceId: res.__traceId || null,
    };
}

/** 원상품 조회 — 등록 후 실제 상태(강제 카테고리 이동·판매금지) 확인에 쓴다. */
async function getOriginProduct(cred, originProductNo) {
    return naverClient.apiGet(cred, `/v2/products/origin-products/${encodeURIComponent(originProductNo)}`);
}

/** 원상품 수정. 등록과 같은 페이로드 구조를 쓴다. */
async function updateOriginProduct(cred, originProductNo, payload) {
    return naverClient.apiPut(cred, `/v2/products/origin-products/${encodeURIComponent(originProductNo)}`, payload);
}

/** 원상품 삭제. */
async function deleteOriginProduct(cred, originProductNo) {
    return naverClient.apiDelete(cred, `/v2/products/origin-products/${encodeURIComponent(originProductNo)}`);
}

/** 채널상품 조회. */
async function getChannelProduct(cred, channelProductNo) {
    return naverClient.apiGet(cred, `/v2/products/channel-products/${encodeURIComponent(channelProductNo)}`);
}

/**
 * 판매상태 변경 — v1.
 * @param {'SALE'|'SUSPENSION'|'CLOSE'|'OUTOFSTOCK'} statusType
 */
async function changeStatus(cred, originProductNo, statusType, extra = {}) {
    return naverClient.apiPut(
        cred,
        `/v1/products/origin-products/${encodeURIComponent(originProductNo)}/change-status`,
        { statusType, ...extra }
    );
}

/**
 * 옵션별 재고·가격 변경 — v1.
 *
 * ⚠ 옵션을 하나씩 반복 호출하지 말 것(N+1 금지). **배열 전체를 한 번에** 보낸다.
 * ⚠ useStockManagement 를 false 로 보내면 수량이 9,999 로 덮여 버린다.
 */
async function updateOptionStock(cred, originProductNo, optionCombinations, salePrice) {
    const body = {
        optionInfo: {
            useStockManagement: true,
            optionCombinations,
        },
    };
    if (salePrice != null) body.productSalePrice = { salePrice: Number(salePrice) };
    return naverClient.apiPut(
        cred,
        `/v1/products/origin-products/${encodeURIComponent(originProductNo)}/option-stock`,
        body
    );
}

/**
 * 카테고리에 맞는 상품정보제공고시 상품군 목록 — v1.
 * 카테고리를 먼저 확정한 뒤 호출해야 맞는 상품군이 우선 반환된다.
 */
async function getProvidedNoticeTypes(cred, categoryId) {
    const q = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
    return naverClient.apiGet(cred, `/v1/products-for-provided-notice${q}`);
}

/** 특정 상품군의 필드 스키마(필수 항목·최대길이) — 관리자 입력폼 구성용. */
async function getProvidedNoticeSchema(cred, noticeType) {
    return naverClient.apiGet(cred, `/v1/products-for-provided-notice/${encodeURIComponent(noticeType)}`);
}

/**
 * 검수(수정 요청) 목록 — v1. size 는 10/50/100 만 허용된다.
 * 등록은 200 이어도 사후에 반려·판매금지가 될 수 있어 주기적으로 확인해야 한다.
 */
async function getInspections(cred, { page = 1, size = 50 } = {}) {
    return naverClient.apiGet(cred, `/v1/product-inspections/channel-products?page=${page}&size=${size}`);
}

module.exports = {
    createProduct,
    getOriginProduct,
    updateOriginProduct,
    deleteOriginProduct,
    getChannelProduct,
    changeStatus,
    updateOptionStock,
    getProvidedNoticeTypes,
    getProvidedNoticeSchema,
    getInspections,
};
