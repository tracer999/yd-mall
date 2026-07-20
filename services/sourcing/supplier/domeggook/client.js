/*
 * 도매꾹·도매매 Open API 클라이언트.
 * 설계: docs/사이트개선/도매꾹_온채널_스마트스토어_연동_상세설계.md §3.2
 *
 * 엔드포인트는 https://domeggook.com/ssl/api/ 이며 REST 쿼리스트링 방식이다.
 * (openapi.domeggook.com 은 문서 사이트이고 API 호출은 308 리다이렉트된다 — 혼동 주의)
 *
 * naverClient.js 와 동일하게 **자격증명 객체를 주입**받는다(env 아님).
 * 자격증명은 몰별 mall_channel_credential 에 있고, 도매꾹·도매매는 키를 공유하되
 * 어느 마켓을 볼지는 market 파라미터(dome|supply)로 정한다(adapters.CHANNEL_META 주석 참고).
 *
 * 호출 제한: 아이디당 분당 180회 · 하루 15,000회.
 * → 프로세스 내 최소 호출 간격(MIN_INTERVAL_MS)으로 분당 한도를 넘지 않게 직렬화한다.
 */

const BASE_URL = 'https://domeggook.com/ssl/api/';

// 목록/상세 API 버전 — 상세는 옵션(selectOpt) 포함 버전이 필요하다.
const VER_LIST = '4.1';
const VER_VIEW = '4.4';

// 분당 180회 = 333ms 간격. 여유를 둬 350ms 로 직렬화한다.
const MIN_INTERVAL_MS = 350;
const TIMEOUT_MS = 20_000;

const MARKETS = { DOMEGGOOK: 'dome', DOMEME: 'supply' };

// 호출 게이트 — 마지막 호출 시각 기준으로 최소 간격을 강제(단일 프로세스 기준).
let _lastCallAt = 0;
let _chain = Promise.resolve();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** 최소 간격을 지키며 fn 을 직렬 실행한다. */
function throttle(fn) {
    const run = async () => {
        const wait = MIN_INTERVAL_MS - (Date.now() - _lastCallAt);
        if (wait > 0) await sleep(wait);
        _lastCallAt = Date.now();
        return fn();
    };
    // 체인에 물려 동시 호출도 직렬화한다. 앞 호출 실패가 뒤를 막지 않도록 catch 로 끊는다.
    const result = _chain.then(run, run);
    _chain = result.then(() => {}, () => {});
    return result;
}

/** cred 에서 API Key 추출. 도매매도 도매꾹 키를 그대로 쓴다. */
function apiKeyOf(cred) {
    const key = cred && (cred.clientId || cred.client_id);
    if (!key) {
        throw new Error('도매꾹 Open API Key 가 없습니다 — [공급처/채널 연결]에서 등록하세요.');
    }
    return String(key).trim();
}

/** supplier 코드(DOMEGGOOK/DOMEME) → 도매꾹 market 파라미터. */
function marketOf(supplier) {
    const m = MARKETS[String(supplier || '').toUpperCase()];
    if (!m) throw new Error('도매꾹 어댑터가 지원하지 않는 공급처: ' + supplier);
    return m;
}

/**
 * 공통 요청. 실패는 항상 Error 로 정규화한다(가짜 성공 금지).
 * @param {object} params 쿼리 파라미터(aid/om 은 여기서 채운다)
 */
async function request(cred, params) {
    const qs = new URLSearchParams({ ...params, aid: apiKeyOf(cred), om: 'json' });
    const url = `${BASE_URL}?${qs.toString()}`;

    return throttle(async () => {
        let res;
        try {
            res = await fetch(url, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { 'User-Agent': 'yd-mall-sourcing/1.0' },
            });
        } catch (e) {
            const reason = e.name === 'TimeoutError' ? '응답 시간 초과' : e.message;
            throw new Error(`도매꾹 API 호출 실패(${params.mode}): ${reason}`);
        }

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // HTML 이 돌아오면 엔드포인트/파라미터 문제다.
            throw new Error(`도매꾹 API 응답이 JSON 이 아닙니다(${params.mode}, HTTP ${res.status}).`);
        }

        // 도매꾹 오류 규약: { errors: { code, message, dcode, dmessage } }
        if (data && data.errors) {
            const e = data.errors;
            let detail = e.dmessage || e.message || '알 수 없는 오류';
            // 도매꾹은 검색 조건이 없거나 너무 넓으면(대분류 1뎁스만) 같은 코드를 준다.
            // 원문만으로는 원인을 알기 어려워 실제 제약을 덧붙인다.
            if (e.dcode === 'NO_SEARCH_OPT') {
                detail += ' (검색어를 입력하거나, 카테고리는 대분류가 아닌 중분류 이상을 선택하세요)';
            }
            const err = new Error(`도매꾹 API 오류 [${e.dcode || e.code}] ${detail}`);
            err.dcode = e.dcode;
            err.code = e.code;
            throw err;
        }
        if (!res.ok) {
            throw new Error(`도매꾹 API HTTP ${res.status}`);
        }
        return data;
    });
}

/**
 * 상품 목록 검색.
 * @param {object} cred 자격증명
 * @param {object} opts { supplier, keyword, categoryCode, page, size, sort }
 * @returns {Promise<{items:Array, total:number, page:number, totalPages:number, size:number}>}
 */
async function searchItems(cred, opts = {}) {
    const {
        supplier = 'DOMEGGOOK',
        keyword = '',
        categoryCode = '',
        page = 1,
        size = 20,
        sort = 'rd', // rd=등록일순(도매꾹 기본)
    } = opts;

    if (!keyword && !categoryCode) {
        throw new Error('검색어 또는 카테고리 중 하나는 지정해야 합니다.');
    }

    const params = {
        ver: VER_LIST,
        mode: 'getItemList',
        market: marketOf(supplier),
        sz: Math.min(Math.max(Number(size) || 20, 1), 100),
        pg: Math.max(Number(page) || 1, 1),
        sort,
    };
    if (keyword) params.kw = keyword;
    if (categoryCode) params.ca = categoryCode;

    const data = await request(cred, params);
    const root = (data && data.domeggook) || {};
    const header = root.header || {};

    // item 은 1건이면 객체, 여러 건이면 배열 — 항상 배열로 정규화한다.
    let items = (root.list && root.list.item) || [];
    if (!Array.isArray(items)) items = [items];

    return {
        items,
        total: Number(header.numberOfItems) || 0,
        page: Number(header.currentPage) || params.pg,
        totalPages: Number(header.numberOfPages) || 0,
        size: Number(header.itemsPerPage) || params.sz,
    };
}

/**
 * 상품 상세 조회(옵션 포함).
 * @returns {Promise<object>} domeggook 하위 객체
 */
async function getItemDetail(cred, itemNo) {
    if (!itemNo) throw new Error('상품번호가 없습니다.');
    const data = await request(cred, {
        ver: VER_VIEW,
        mode: 'getItemView',
        no: String(itemNo).trim(),
    });
    const root = data && data.domeggook;
    if (!root || !root.basis) {
        throw new Error(`도매꾹 상세 응답 형식 오류(상품번호 ${itemNo})`);
    }
    return root;
}

/** 전체 카테고리 트리 조회(참조용). */
async function getCategories(cred) {
    const data = await request(cred, { ver: '1.0', mode: 'getCategoryList' });
    return (data && data.domeggook && data.domeggook.items) || {};
}

/**
 * 연결 검증 — 실제로 1건 조회해 키 유효성을 확인한다.
 * adapters.validateConnection 에서 호출. 형식 검사만 하고 성공 표시하지 않는다.
 */
async function verify(cred) {
    // 가장 가벼운 호출(1건짜리 목록)로 인증만 확인한다.
    await searchItems(cred, { supplier: 'DOMEGGOOK', keyword: '테스트', size: 1, page: 1 });
    return true;
}

module.exports = {
    BASE_URL,
    MARKETS,
    marketOf,
    request,
    searchItems,
    getItemDetail,
    getCategories,
    verify,
};
