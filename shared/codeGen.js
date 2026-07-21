/*
 * 표시명 → 식별 코드 자동 생성
 *
 * 회원등급 `grade_code`, 특가 카테고리 `code`, 기획전 섹션 `section_code` 처럼
 * **영문 코드가 필요한데 사용자가 지어내야 했던** 값들을 서버가 만든다.
 * (CLAUDE.md §33 — 코드·식별자를 사용자에게 입력시키지 않는다)
 *
 * 규칙
 *   1) 이름에서 영문·숫자만 뽑아 대문자 코드로 만든다. ("Gold Member" → GOLD_MEMBER)
 *   2) 한글뿐이라 뽑을 게 없으면 접두어+순번으로 떨어진다. ("골드등급" → GRADE_2)
 *      → 한글 로마자 변환은 하지 않는다. "골드"→"GOLDEU" 같은 값은 아무도 못 읽고,
 *        규칙이 흔들리면 URL 이 예측 불가능해진다. 순번이 정직하다.
 *   3) 이미 쓰는 코드면 _2, _3 … 을 붙인다.
 */

/** 이름에서 영문·숫자만 뽑아 UPPER_SNAKE 코드로. 뽑을 게 없으면 빈 문자열. */
function toCode(name, maxLen = 40) {
    return String(name || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, maxLen);
}

/**
 * 중복되지 않는 코드를 만든다.
 *
 * @param {object}   opts
 * @param {string}   opts.name        표시명 (여기서 코드를 유도)
 * @param {string}   [opts.requested] 사용자가 직접 지정한 코드(있으면 우선)
 * @param {string}   opts.prefix      한글 이름 등으로 코드를 못 뽑을 때 쓸 접두어 (예: 'GRADE')
 * @param {function} opts.exists      async (code) => boolean — 이미 쓰는 코드인지 검사
 * @param {number}   [opts.maxLen=40]
 * @returns {Promise<string>}
 */
async function generateUniqueCode({ name, requested, prefix, exists, maxLen = 40 }) {
    let base = toCode(requested || name, maxLen);

    // 이름이 한글뿐이면 접두어+순번으로. 빈 자리를 찾을 때까지 번호를 올린다.
    if (!base) {
        let n = 1;
        // eslint-disable-next-line no-await-in-loop
        while (await exists(`${prefix}_${n}`)) n += 1;
        return `${prefix}_${n}`;
    }

    if (!(await exists(base))) return base;

    let n = 2;
    // 접미사를 붙여도 최대 길이를 넘지 않게 자른다.
    // eslint-disable-next-line no-await-in-loop
    while (await exists(`${base.slice(0, maxLen - String(n).length - 1)}_${n}`)) n += 1;
    return `${base.slice(0, maxLen - String(n).length - 1)}_${n}`;
}

module.exports = { toCode, generateUniqueCode };
