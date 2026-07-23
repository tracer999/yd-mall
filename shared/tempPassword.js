/*
 * 임시 비밀번호 생성
 *
 * 전화로 불러 주고 받아 적는 일이 대부분이라 **헷갈리는 글자를 뺀다** —
 * 0/O, 1/l/I 는 서로 잘못 듣거나 잘못 옮겨 적혀 "비밀번호가 안 맞는다"는 두 번째 문의를 만든다.
 * 대신 길이(12자)와 문자 종류로 강도를 벌충한다.
 */

const crypto = require('crypto');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // I, O 제외
const LOWER = 'abcdefghijkmnpqrstuvwxyz';   // l, o 제외
const DIGIT = '23456789';                   // 0, 1 제외
const SYMBOL = '!@#$%^&*';
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

/** 암호학적 난수로 문자 하나를 고른다(Math.random 은 예측 가능해 쓰지 않는다). */
function pick(chars) {
    return chars[crypto.randomInt(0, chars.length)];
}

/** 각 종류를 최소 하나씩 포함하는 12자 임시 비밀번호. */
function generateTempPassword(length = 12) {
    const n = Math.max(8, Number(length) || 12);
    const out = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
    while (out.length < n) out.push(pick(ALL));
    // Fisher-Yates — 앞 네 자리가 늘 같은 종류로 나오지 않게 섞는다.
    for (let i = out.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join('');
}

module.exports = { generateTempPassword };
