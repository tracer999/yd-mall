/*
 * 도매꾹 카테고리 트리 — 관리자 화면의 단계별 선택기용.
 *
 * 왜 필요한가: 검색 API 는 `ca` 파라미터로 **카테고리 코드**(예: 12_03_13_00_00)를 받는데,
 * 이 코드는 사용자가 알 수 없다. 그래서 전체 분류를 받아 대분류 → 중분류 → … 로 고르게 한다.
 *
 * 실측(2026-07-20): 1뎁스 13개 / 2뎁스 199개 / 3뎁스 1,871개 / 4뎁스 2,954개, 트림 후 약 216KB.
 * 자주 바뀌지 않으므로 프로세스 메모리에 TTL 캐시한다(별도 테이블을 만들 만큼 크지 않다).
 *
 * ⚠ 검색 제약: **1뎁스(대분류) 코드만으로는 검색이 거부된다**(dcode=NO_SEARCH_OPT).
 *   2뎁스 이상이어야 한다. 화면에서 이를 강제하고, 여기서도 판정 함수를 제공한다.
 */

const client = require('./client');

const TTL_MS = 24 * 60 * 60 * 1000; // 24시간
let _cache = null; // { tree, fetchedAt }

/**
 * 도매꾹 원본 트리(객체 키가 인덱스인 중첩 구조)를 배열 트리로 정규화한다.
 * 원본: { "1": { code, name, locked, int, child: { "7": {...} } }, ... }
 * 결과: [ { c: 코드, n: 이름, k: [자식...] } ]  (전송량을 줄이려 짧은 키를 쓴다)
 */
function normalizeTree(node) {
    if (!node || typeof node !== 'object') return [];
    const keys = Object.keys(node).sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a).localeCompare(String(b));
    });

    const out = [];
    for (const key of keys) {
        const v = node[key];
        if (!v || typeof v !== 'object' || !v.code) continue;
        const entry = { c: String(v.code), n: String(v.name || v.code) };
        const kids = normalizeTree(v.child);
        if (kids.length) entry.k = kids;
        out.push(entry);
    }
    return out;
}

/** 코드의 뎁스를 센다. '12_03_13_00_00' → 3 (00 이 아닌 세그먼트 수) */
function depthOf(code) {
    if (!code) return 0;
    return String(code).split('_').filter((seg) => seg && seg !== '00').length;
}

/** 검색 조건으로 쓸 수 있는 코드인가(2뎁스 이상). */
function isSearchable(code) {
    return depthOf(code) >= 2;
}

/**
 * 전체 트리 반환(캐시). 실패 시 throw — 빈 트리로 위장하지 않는다.
 * @param {object} cred 도매꾹 자격증명
 * @param {boolean} force 캐시 무시하고 다시 받기
 */
async function getTree(cred, force = false) {
    const fresh = _cache && (Date.now() - _cache.fetchedAt) < TTL_MS;
    if (fresh && !force) return _cache.tree;

    const raw = await client.getCategories(cred);
    const tree = normalizeTree(raw);
    if (!tree.length) throw new Error('도매꾹 카테고리 응답이 비어 있습니다.');

    _cache = { tree, fetchedAt: Date.now() };
    return tree;
}

/** 캐시 상태(화면 표시용). */
function getCacheInfo() {
    return _cache ? { cached: true, fetchedAt: new Date(_cache.fetchedAt) } : { cached: false, fetchedAt: null };
}

/** 코드 → 이름 경로(예: ['식품','건강식품','홍삼']). 못 찾으면 null. */
function findPath(tree, code, trail = []) {
    for (const node of tree || []) {
        const next = [...trail, node.n];
        if (node.c === code) return next;
        if (node.k) {
            const found = findPath(node.k, code, next);
            if (found) return found;
        }
    }
    return null;
}

module.exports = { getTree, getCacheInfo, normalizeTree, depthOf, isSearchable, findPath };
