const pool = require('../config/db');

/*
 * 몰 컨텍스트 해석기 (P5 멀티몰 기반)
 *
 * 요청이 어느 몰(mall_id)을 보는지 결정해 `req.mallId` / `res.locals.mallId` 에 싣는다.
 * 이후 스토어프론트 미들웨어·컨트롤러는 이 값을 쓴다(하드코딩 1 대신).
 *
 * 해석 규칙 (데모 단계):
 *   1) `?mall=<id|code>` 쿼리가 오면 유효성 검사 후 세션에 저장한다.
 *   2) 세션에 저장된 몰이 있으면 그것을 쓴다.
 *   3) 없으면 기본 몰(mall.is_default=1)을 쓴다.
 * → 도메인 기반 라우팅은 향후 확장(mall.domain 컬럼은 미리 만들어 둠).
 *
 * 관리자(/admin)는 이 해석에 영향받지 않는다. 관리자 컨트롤러는 여전히 mall 1 을 관리한다
 * (관리자 멀티몰은 이번 스코프 밖).
 *
 * 몰 목록은 자주 바뀌지 않으므로 프로세스 메모리에 캐시한다.
 */

const TTL_MS = 60 * 1000;
let cache = null;      // { byId: Map, byCode: Map, defaultId: number }
let cachedAt = 0;

async function loadMalls() {
    const [rows] = await pool.query('SELECT id, code, name, is_active, is_default FROM mall WHERE is_active = 1');
    const byId = new Map();
    const byCode = new Map();
    let defaultId = 1;
    for (const m of rows) {
        byId.set(Number(m.id), m);
        byCode.set(String(m.code), m);
        if (Number(m.is_default) === 1) defaultId = Number(m.id);
    }
    // mall 테이블이 비어 있어도(마이그레이션 전) 최소한 1 로 동작하도록 폴백
    if (byId.size === 0) { byId.set(1, { id: 1, code: 'default', name: '기본몰' }); defaultId = 1; }
    return { byId, byCode, defaultId };
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
        if (Object.prototype.hasOwnProperty.call(req.query, 'mall')) {
            const picked = resolveParam(req.query.mall, malls);
            if (picked && req.session) req.session.mallId = picked;
        }

        // 2) 세션 → 3) 기본 몰
        let mallId = (req.session && Number(req.session.mallId)) || malls.defaultId;
        if (!malls.byId.has(mallId)) mallId = malls.defaultId; // 비활성/삭제된 몰이 세션에 남은 경우

        req.mallId = mallId;
        res.locals.mallId = mallId;
        res.locals.mall = malls.byId.get(mallId) || null;
    } catch (err) {
        // 해석 실패해도 화면은 떠야 한다 → 기본 몰 1
        console.warn('[mallContext] 해석 실패, mall 1 폴백:', err.message);
        req.mallId = 1;
        res.locals.mallId = 1;
        res.locals.mall = null;
    }
    next();
};

module.exports.invalidate = invalidate;
