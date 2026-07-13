/**
 * 한글 초성 유틸 — 브랜드 초성 인덱스/검색용.
 *
 * 브랜드 1,354개(몰2)를 가나다로만 늘어놓으면 탐색이 불가능하다.
 * 초성 인덱스(ㄱㄴㄷ…ABC…#)와 초성 검색(나이키 → ㄴㅇㅋ)이 필요하다.
 */

// 유니코드 한글 음절의 초성 19자 (조합 순서 고정)
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// 인덱스 버킷은 쌍자음을 기본자음으로 접는다 — 사용자는 'ㄲ' 탭을 찾지 않는다
const FOLD = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };

/** 인덱스 탭에 노출할 버킷 목록 */
const INITIAL_BUCKETS = [
    'ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
    'A','B','C','D','E','F','G','H','I','J','K','L','M',
    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
    '#'
];

const SYLLABLE_BASE = 0xAC00;
const SYLLABLE_LAST = 0xD7A3;

/**
 * 브랜드명 앞의 법인 표기를 걷어낸다.
 * "(주)서울제약" 을 '(' 로 색인하면 전부 # 버킷에 몰린다.
 */
function stripCorpPrefix(name) {
    return String(name || '')
        .replace(/^\s*(\(주\)|\(유\)|㈜|㈜\s*|주식회사|유한회사)\s*/g, '')
        .trim();
}

/** 문자 1개의 초성 (한글이 아니면 그대로 대문자 반환) */
function charChosung(ch) {
    const code = ch.charCodeAt(0);
    if (code >= SYLLABLE_BASE && code <= SYLLABLE_LAST) {
        return CHOSUNG[Math.floor((code - SYLLABLE_BASE) / 588)];
    }
    return ch.toUpperCase();
}

/**
 * 초성 문자열 — 검색용. "나이키" → "ㄴㅇㅋ", "LG전자" → "LGㅈㅈ"
 * 공백은 제거한다(사용자가 "ㄴㅇㅋ" 로 붙여 친다).
 */
function toChosung(name) {
    const s = stripCorpPrefix(name).replace(/\s+/g, '');
    let out = '';
    for (const ch of s) out += charChosung(ch);
    return out;
}

/**
 * 인덱스 버킷 — 첫 글자 기준. 한글은 초성(쌍자음 접기), 영문은 대문자, 그 외는 '#'.
 */
function toInitial(name) {
    const s = stripCorpPrefix(name);
    if (!s) return '#';
    const first = charChosung(s[0]);
    const folded = FOLD[first] || first;
    return INITIAL_BUCKETS.includes(folded) ? folded : '#';
}

module.exports = { INITIAL_BUCKETS, toInitial, toChosung, stripCorpPrefix };
