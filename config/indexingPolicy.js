/**
 * 검색엔진 색인 정책 — 단일 소스 오브 트루스.
 *
 * 기본값은 "전면 차단"이며, 색인을 허용하려면 ALLOW_SEARCH_INDEXING=true 를
 * 명시적으로 지정해야 한다(fail-closed). 값이 없거나 오타면 차단 쪽으로 떨어진다.
 */

// 차단 시 meta robots / X-Robots-Tag 에 동일하게 사용하는 지시자.
// noarchive·nosnippet 은 캐시 페이지·검색 스니펫 노출까지 막는다.
const BLOCK_DIRECTIVE = 'noindex, nofollow, noarchive, nosnippet';

function isIndexingAllowed() {
    return String(process.env.ALLOW_SEARCH_INDEXING || '').trim().toLowerCase() === 'true';
}

module.exports = { isIndexingAllowed, BLOCK_DIRECTIVE };
