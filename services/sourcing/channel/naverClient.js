/*
 * 네이버 커머스 API 클라이언트 (스마트스토어).
 * 설계: docs/사이트개선/네이버_카테고리_리소스_설계.md
 *
 * 인증: 전자서명 OAuth2 (client_credentials).
 *   client_secret_sign = base64( bcrypt( `${clientId}_${timestamp}`, clientSecret ) )
 *   - clientSecret 은 네이버가 주는 bcrypt salt 문자열($2a$…)이며 그대로 salt 로 쓴다.
 *   - timestamp 는 ms. 서명·요청의 timestamp 가 같아야 한다.
 *
 * Shopify adminClient.js 와 달리 env 가 아니라 **자격증명 객체를 주입**받는다
 * (자격증명이 몰별 mall_channel_credential 에 있기 때문). 액세스 토큰은 DB 에
 * 저장하지 않고 clientId 기준 메모리 캐시만 한다(credential.js §7 원칙).
 *
 * 실 호출은 발급된 client_id/secret 이 있어야 동작한다. 없으면 명확히 throw 한다
 * (가짜 성공 금지 — adapters.validateConnection 규칙과 동일).
 */

const bcrypt = require('bcrypt');

const BASE_URL = 'https://api.commerce.naver.com/external';

// clientId → { token, expiresAt(ms) }
const _tokenCache = new Map();

/** 전자서명 생성: base64(bcrypt(`${clientId}_${timestamp}`, clientSecret)). */
function sign(clientId, clientSecret, timestamp) {
    const password = `${clientId}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, clientSecret);
    return Buffer.from(hashed, 'utf-8').toString('base64');
}

/**
 * 액세스 토큰 발급(+캐시). 만료 1분 전이면 재사용.
 * @param {{clientId:string, secret:string}} cred
 * @returns {Promise<string>}
 */
async function getAccessToken(cred) {
    const clientId = cred && cred.clientId;
    const clientSecret = cred && cred.secret;
    if (!clientId || !clientSecret) {
        throw new Error('네이버 자격증명(client_id/client_secret) 이 없습니다 — 커머스 API 센터에서 발급 후 등록하세요.');
    }

    const cached = _tokenCache.get(clientId);
    const now = Date.now();
    if (cached && now < cached.expiresAt - 60_000) {
        return cached.token;
    }

    const timestamp = now;
    const body = new URLSearchParams({
        client_id: clientId,
        timestamp: String(timestamp),
        grant_type: 'client_credentials',
        client_secret_sign: sign(clientId, clientSecret, timestamp),
        type: 'SELF',
    });

    const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`네이버 토큰 발급 실패: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (!data.access_token) {
        throw new Error('네이버 토큰 발급 응답에 access_token 이 없습니다.');
    }
    _tokenCache.set(clientId, {
        token: data.access_token,
        expiresAt: now + (Number(data.expires_in) || 10800) * 1000, // 기본 3h
    });
    return data.access_token;
}

/*
 * ---------------------------------------------------------------------------
 * 호출 게이트 — 스로틀 + 재시도
 *
 * 네이버는 초당 호출 제한이 있고 초과 시 429 를 준다. 대량 등록은 수백 건을
 * 연속 호출하므로, domeggook/client.js 와 같은 "프로세스 내 직렬 스로틀" 을 쓴다.
 * (PM2 fork·instances:1 전제 — cluster 로 늘리면 이 게이트는 프로세스마다 따로 논다.)
 * ---------------------------------------------------------------------------
 */

/*
 * 호출 제한(공식): "내 스토어" 애플리케이션은 **API 엔드포인트별 초당 2회(2 RPS)** 고정이며
 * 사용자가 늘릴 수 없다. Burst 로 순간 4 RPS 가 되지만 연속 사용은 불가하므로
 * 가용 자원으로 계산하지 않는다.
 *   → 500ms(=2 RPS)는 한도에 정확히 붙어 429 를 유발한다. 20% 여유를 둬 600ms.
 * 도매꾹의 350ms(≈2.8 RPS)를 그대로 가져오면 즉시 429 다 — 수치를 공유하지 말 것.
 */
const MIN_INTERVAL_MS = 600;
const TIMEOUT_MS = 30_000;

/*
 * 재시도: 네이버는 **Retry-After 를 주지 않는다.** 공식 답변의 권고 대기가 "3~5초"라
 * 3초를 최소값으로 잡고 2배씩 늘린다(3→6→12→24→48).
 */
const MAX_RETRY = 5;
const RETRY_BASE_MS = 3_000;

// 429 가 연속되면 스로틀을 늘려 스스로 물러선다(Retry-After 가 없으니 적응형이 필요).
const ADAPTIVE_MAX_MS = 3_000;
let _adaptiveExtraMs = 0;
let _consecutive429 = 0;
let _successSinceBackoff = 0;

let _lastCallAt = 0;
let _chain = Promise.resolve();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** 최소 간격을 지키며 fn 을 직렬 실행한다(도매꾹 클라이언트와 동일 패턴). */
function throttle(fn) {
    const run = async () => {
        const wait = (MIN_INTERVAL_MS + _adaptiveExtraMs) - (Date.now() - _lastCallAt);
        if (wait > 0) await sleep(wait);
        _lastCallAt = Date.now();
        return fn();
    };
    const result = _chain.then(run, run);
    _chain = result.then(() => {}, () => {});
    return result;
}

/** 429 를 맞을 때마다 간격을 벌리고, 성공이 쌓이면 원래대로 되돌린다. */
function note429() {
    _consecutive429++;
    _successSinceBackoff = 0;
    if (_consecutive429 >= 3 && _adaptiveExtraMs < ADAPTIVE_MAX_MS) {
        _adaptiveExtraMs = Math.min(ADAPTIVE_MAX_MS, Math.round((_adaptiveExtraMs || MIN_INTERVAL_MS) * 1.5));
        console.warn(`[naver] 429 연속 ${_consecutive429}회 — 스로틀 +${_adaptiveExtraMs}ms 로 상향`);
    }
}

function noteSuccess() {
    _consecutive429 = 0;
    if (_adaptiveExtraMs > 0 && ++_successSinceBackoff >= 10) {
        _adaptiveExtraMs = 0;
        _successSinceBackoff = 0;
        console.info('[naver] 성공 10건 — 스로틀 원복');
    }
}

/**
 * 상태코드와 응답 본문을 들고 다니는 에러 — 호출부가 재시도/로그를 판단한다.
 *
 * traceId(GNCP-GW-Trace-ID)는 반드시 보존한다. 네이버 기술지원에 문의할 때
 * 이 값이 없으면 원인 확인이 사실상 불가능하다.
 */
class NaverApiError extends Error {
    constructor(message, { status = null, body = null, path = null, traceId = null, rateRemaining = null } = {}) {
        super(message);
        this.name = 'NaverApiError';
        this.status = status;
        this.body = body;
        this.path = path;
        this.traceId = traceId;
        this.rateRemaining = rateRemaining;
    }

    /**
     * 일시적 오류인가 — 재시도해 볼 가치가 있는지.
     * ⚠ 4xx 검증 오류(필수값 누락·카테고리 오류 등)는 **재시도하면 안 된다.**
     *   고쳐지지 않는 요청을 반복해 호출 한도만 태우고, 정작 유효한 상품이 밀린다.
     */
    get retryable() {
        if (this.status === 429) return true;
        if (this.status >= 500 && this.status < 600) return true;
        return false;
    }

    /** 토큰 만료(게이트웨이 인증 오류) — 재발급 후 1회만 다시 시도한다. */
    get isAuthExpired() {
        if (this.status !== 401) return false;
        const code = this.body && (this.body.code || this.body.errorCode);
        // 코드가 없어도 401 이면 만료로 간주한다(응답 형태가 일정하지 않다).
        return code ? String(code).includes('GW.AUTHN') : true;
    }

    /** 쿼터 소진인가, 서비스 혼잡인가 — 잔여 헤더로만 구분된다. */
    get is429Congestion() {
        return this.status === 429 && this.rateRemaining !== '0';
    }
}

/** 네이버 오류 응답에서 사람이 읽을 메시지를 뽑는다(형태가 여러 가지다). */
function extractMessage(body) {
    if (!body) return '';
    if (typeof body === 'string') return body.slice(0, 500);
    const parts = [];
    if (body.message) parts.push(body.message);
    if (Array.isArray(body.invalidInputs)) {
        for (const iv of body.invalidInputs) {
            parts.push(`${iv.name || iv.field || ''}: ${iv.message || ''}`.trim());
        }
    }
    if (Array.isArray(body.errors)) {
        for (const e of body.errors) parts.push(e.message || JSON.stringify(e));
    }
    return parts.filter(Boolean).join(' / ').slice(0, 1000) || JSON.stringify(body).slice(0, 500);
}

/**
 * 공통 요청. 실패는 항상 NaverApiError 로 정규화한다(가짜 성공 금지).
 * @param {object} cred
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path  BASE_URL 뒤에 붙는 경로
 * @param {object} [opts] { body, formData, attempt }
 */
async function request(cred, method, path, opts = {}) {
    const attempt = opts.attempt || 1;
    const token = await getAccessToken(cred);

    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (opts.formData) {
        // multipart — Content-Type 은 fetch 가 boundary 와 함께 채우게 둔다.
        payload = opts.formData;
    } else if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(opts.body);
    }

    const res = await throttle(async () => {
        try {
            return await fetch(`${BASE_URL}${path}`, {
                method,
                headers,
                body: payload,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (e) {
            const reason = e.name === 'TimeoutError' ? '응답 시간 초과' : e.message;
            throw new NaverApiError(`네이버 API ${method} ${path} 호출 실패: ${reason}`, { path });
        }
    });

    const text = await res.text().catch(() => '');
    let body = null;
    if (text) {
        try { body = JSON.parse(text); } catch (e) { body = text; }
    }

    // 네이버 지원 문의 시 필수인 추적 ID. 성공/실패 모두 남길 수 있게 뽑아 둔다.
    const traceId = res.headers.get('gncp-gw-trace-id');
    const rateRemaining = res.headers.get('gncp-gw-ratelimit-remaining');

    if (!res.ok) {
        const err = new NaverApiError(
            `네이버 API ${method} ${path} 실패(${res.status}): ${extractMessage(body)}`,
            { status: res.status, body, path, traceId, rateRemaining }
        );

        /*
         * 401 — 토큰 만료. 캐시를 버리고 딱 한 번만 재발급해 다시 시도한다.
         * 재시도 횟수는 429 백오프와 별도로 센다(만료는 백오프 대상이 아니다).
         */
        if (err.isAuthExpired && !opts.reauthed) {
            _tokenCache.delete(cred && cred.clientId);
            return request(cred, method, path, { ...opts, reauthed: true });
        }

        if (err.status === 429) note429();

        // 429·5xx 는 잠깐 쉬고 다시 — 대량 등록 도중 한 건 때문에 전체가 죽지 않게 한다.
        // ⚠ 네이버는 Retry-After 를 주지 않으므로 자체 백오프(3→6→12→24→48초)를 쓴다.
        if (err.retryable && attempt <= MAX_RETRY) {
            const base = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            // 여러 건이 동시에 풀려 같은 순간 몰리지 않도록 ±20% 흔든다.
            const jitter = base * 0.2 * (Math.random() * 2 - 1);
            await sleep(Math.round(base + jitter));
            return request(cred, method, path, { ...opts, attempt: attempt + 1 });
        }
        throw err;
    }

    noteSuccess();
    // 호출부가 로그에 남길 수 있도록 추적 ID 를 응답에 얹어 준다(원본은 건드리지 않는다).
    if (body && typeof body === 'object' && traceId) {
        Object.defineProperty(body, '__traceId', { value: traceId, enumerable: false });
    }
    return body;
}

/** 인증된 GET 요청. */
async function apiGet(cred, path) {
    return request(cred, 'GET', path);
}

/** 인증된 POST 요청(JSON). */
async function apiPost(cred, path, body) {
    return request(cred, 'POST', path, { body });
}

/** 인증된 PUT 요청(JSON). */
async function apiPut(cred, path, body) {
    return request(cred, 'PUT', path, { body });
}

/** 인증된 DELETE 요청. */
async function apiDelete(cred, path) {
    return request(cred, 'DELETE', path);
}

/** multipart 업로드(이미지). formData 는 호출부에서 구성해 넘긴다. */
async function apiPostForm(cred, path, formData) {
    return request(cred, 'POST', path, { formData });
}

/**
 * 전체 카테고리 조회 — GET /v1/categories.
 * 응답은 전체 트리 배열. 항목 형태(네이버 스펙):
 *   { id, name, wholeCategoryName, wholeCategoryId?, last, categoryLevel? }
 * 필드명이 버전에 따라 다를 수 있어 sync 계층에서 방어적으로 매핑한다.
 * @param {{clientId:string, secret:string}} cred
 * @returns {Promise<Array<object>>}
 */
async function getCategories(cred) {
    const data = await apiGet(cred, '/v1/categories');
    // 응답이 배열이거나 { ... , contents:[] } 형태일 수 있어 둘 다 수용.
    if (Array.isArray(data)) return data;
    if (Array.isArray(data && data.contents)) return data.contents;
    if (Array.isArray(data && data.data)) return data.data;
    throw new Error('네이버 카테고리 응답 형식을 해석할 수 없습니다.');
}

/** 연결 검증용 — 토큰만 실제로 발급해 본다(카테고리 조회까지 하지 않음). */
async function verify(cred) {
    await getAccessToken(cred);
    return true;
}

/** 테스트/운영에서 캐시 비우기. */
function clearTokenCache() {
    _tokenCache.clear();
}

module.exports = {
    getAccessToken, getCategories, verify, sign, clearTokenCache, BASE_URL,
    request, apiGet, apiPost, apiPut, apiDelete, apiPostForm,
    NaverApiError, extractMessage,
    MIN_INTERVAL_MS, MAX_RETRY,
};
