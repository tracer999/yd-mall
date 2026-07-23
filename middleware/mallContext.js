const pool = require('../config/db');

/*
 * 몰 컨텍스트 해석기 (P5 멀티몰 기반)
 *
 * 요청이 어느 몰(mall_id)을 보는지 결정해 `req.mallId` / `res.locals.mallId` 에 싣는다.
 * 이후 스토어프론트 미들웨어·컨트롤러는 이 값을 쓴다(하드코딩 1 대신).
 *
 * 해석 규칙:
 *   1) `?mall=<id|code>` 쿼리가 오면 유효성 검사 후 세션에 저장한다.
 *   2) 요청 호스트가 어느 몰의 `mall.domain` 과 일치하면 그 몰로 고정한다.
 *   3) 세션에 저장된 몰이 있으면 그것을 쓴다.
 *   4) 없으면 기본 몰(mall.is_default=1)을 쓴다.
 *
 * 2)가 3)보다 먼저인 이유 — A몰 도메인으로 들어온 손님에게 세션에 남은 B몰을 보여주면
 * "내 쇼핑몰 주소로 들어갔는데 남의 몰이 뜬다"가 된다. 도메인은 세션보다 강한 신호이므로
 * 매칭되는 순간 세션도 그 몰로 덮어쓴다. 단 `?mall=` 명시 전환은 개발·검수용으로 계속 허용한다.
 *
 * 관리자(/admin)는 이 해석에 영향받지 않는다. 관리자 컨트롤러는 여전히 mall 1 을 관리한다
 * (관리자 멀티몰은 이번 스코프 밖).
 *
 * 몰 목록은 자주 바뀌지 않으므로 프로세스 메모리에 캐시한다.
 */

const TTL_MS = 60 * 1000;
let cache = null;      // { byId: Map, byCode: Map, defaultId: number }
let cachedAt = 0;

/**
 * 호스트 문자열을 비교 가능한 형태로 정규화한다.
 * 운영자는 도메인 칸에 `https://shop.example.com/` 처럼 붙여 넣기 마련이라
 * 스킴·포트·경로·www· 대소문자를 모두 걷어내고 비교한다.
 */
function normalizeHost(raw) {
    if (!raw) return '';
    return String(raw)
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/[/?#].*$/, '')
        .replace(/:\d+$/, '')
        .replace(/^www\./, '');
}

async function loadMalls() {
    const [rows] = await pool.query('SELECT id, code, name, domain, is_active, is_default FROM mall WHERE is_active = 1');
    const byId = new Map();
    const byCode = new Map();
    const byDomain = new Map();
    let defaultId = 1;
    for (const m of rows) {
        byId.set(Number(m.id), m);
        byCode.set(String(m.code), m);
        const host = normalizeHost(m.domain);
        // 같은 도메인을 두 몰에 적어 두면 먼저 등록된 쪽이 이긴다(뒤엣것을 조용히 덮어쓰지 않는다).
        if (host && !byDomain.has(host)) byDomain.set(host, m);
        if (Number(m.is_default) === 1) defaultId = Number(m.id);
    }
    // mall 테이블이 비어 있어도(마이그레이션 전) 최소한 1 로 동작하도록 폴백
    if (byId.size === 0) { byId.set(1, { id: 1, code: 'default', name: '기본몰' }); defaultId = 1; }
    return { byId, byCode, byDomain, defaultId };
}

async function getMalls() {
    const now = Date.now();
    if (!cache || now - cachedAt > TTL_MS) {
        cache = await loadMalls();
        cachedAt = now;
    }
    return cache;
}

function invalidate() { cache = null; cachedAt = 0; }

/** `?mall=` 값(숫자 id 또는 code)을 유효한 mall id 로 해석한다. 실패 시 null. */
function resolveParam(raw, malls) {
    if (raw == null || raw === '') return null;
    const asNum = Number.parseInt(raw, 10);
    if (Number.isFinite(asNum) && malls.byId.has(asNum)) return asNum;
    const byCode = malls.byCode.get(String(raw).trim());
    return byCode ? Number(byCode.id) : null;
}

module.exports = async (req, res, next) => {
    try {
        const malls = await getMalls();

        // 1) 쿼리로 몰 전환 요청이 오면 세션에 고정한다.
        let explicit = null;
        if (Object.prototype.hasOwnProperty.call(req.query, 'mall')) {
            explicit = resolveParam(req.query.mall, malls);
            if (explicit && req.session) req.session.mallId = explicit;
        }

        // 2) 요청 호스트가 어느 몰의 도메인인가. 맞으면 세션보다 우선하고 세션도 그 몰로 맞춘다.
        //    (`?mall=` 로 방금 명시 전환한 요청은 그 의사를 존중해 건너뛴다)
        const hostMall = malls.byDomain ? malls.byDomain.get(normalizeHost(req.hostname || req.headers.host)) : null;
        if (!explicit && hostMall) {
            const hostMallId = Number(hostMall.id);
            if (req.session && Number(req.session.mallId) !== hostMallId) req.session.mallId = hostMallId;
        }

        // 3) 세션 → 4) 기본 몰
        let mallId = (req.session && Number(req.session.mallId))
            || (hostMall ? Number(hostMall.id) : 0)
            || malls.defaultId;
        if (!malls.byId.has(mallId)) mallId = malls.defaultId; // 비활성/삭제된 몰이 세션에 남은 경우

        req.mallId = mallId;
        res.locals.mallId = mallId;
        res.locals.mall = malls.byId.get(mallId) || null;
        // 헤더 Top Bar 의 몰 선택 셀렉트가 쓴다. 활성 몰만, 기본 몰이 먼저.
        res.locals.malls = [...malls.byId.values()]
            .sort((a, b) => Number(b.is_default || 0) - Number(a.is_default || 0) || Number(a.id) - Number(b.id));
    } catch (err) {
        // 해석 실패해도 화면은 떠야 한다 → 기본 몰 1
        console.warn('[mallContext] 해석 실패, mall 1 폴백:', err.message);
        req.mallId = 1;
        res.locals.mallId = 1;
        res.locals.mall = null;
        res.locals.malls = [];
    }
    next();
};

module.exports.invalidate = invalidate;
// 관리자 몰 해석기(adminMallContext)가 같은 캐시를 재사용한다.
module.exports.getMalls = getMalls;
// 몰 관리 화면이 도메인을 저장할 때 같은 규칙으로 정규화·중복 검사한다.
module.exports.normalizeHost = normalizeHost;
