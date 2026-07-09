/** value_proposition — 카카오 상담 링크만 필요. 링크가 없으면 '#'(섹션은 유지). */
async function resolve({ shared, locals }) {
    locals.kakaoUrl = shared.kakaoUrl || '#';
    return locals;
}

module.exports = { resolve };
