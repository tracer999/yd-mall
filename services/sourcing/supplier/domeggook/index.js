/*
 * 도매꾹·도매매 공급처 어댑터.
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §8
 *
 * SupplierAdapter 계약(자격증명 주입형):
 *   - capabilities : 이 어댑터가 실제로 지원하는 기능(선언만 하고 미구현 금지)
 *   - search(cred, opts)  → { items(정규화 요약), total, page, totalPages }
 *   - detail(cred, itemNo, supplier) → { product, variants }
 *   - verify(cred) → true | throw
 *
 * 1차(계획서 §0.2.1)는 "가져오기"까지다. 주문 생성(ORDER_CREATE)은 도매꾹 Private API
 * 승인이 필요해 여기서 선언하지 않는다 — 승인 확인 후 2차에서 추가한다.
 */

const client = require('./client');
const normalize = require('./normalize');

const SUPPLIERS = ['DOMEGGOOK', 'DOMEME'];

// 실제로 동작하는 것만 선언한다(adapters.CAPABILITIES 부분집합).
const capabilities = [
    'PRODUCT_SEARCH',
    'PRODUCT_DETAIL',
    'INVENTORY_READ',
    'PRICE_READ',
];

/** 상품 검색 — 목록 요약만 반환(재고·옵션은 상세에만 있다). */
async function search(cred, opts = {}) {
    const supplier = opts.supplier || 'DOMEGGOOK';
    const res = await client.searchItems(cred, { ...opts, supplier });
    return {
        ...res,
        items: res.items
            .map((it) => normalize.normalizeListItem(it, supplier))
            .filter(Boolean),
    };
}

/** 상품 상세 — 중간 테이블 적재용 정규화 모델. */
async function detail(cred, itemNo, supplier = 'DOMEGGOOK') {
    const root = await client.getItemDetail(cred, itemNo);
    return normalize.normalizeDetail(root, supplier);
}

/** 카테고리 트리(참조용). */
function categories(cred) {
    return client.getCategories(cred);
}

/** 연결 검증 — 실 호출로 키 유효성 확인. */
function verify(cred) {
    return client.verify(cred);
}

module.exports = {
    key: 'DOMEGGOOK',
    label: '도매꾹·도매매',
    SUPPLIERS,
    capabilities,
    search,
    detail,
    categories,
    verify,
};
