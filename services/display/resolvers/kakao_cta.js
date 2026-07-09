/** kakao_cta — 카카오 채널이 설정되지 않았으면 섹션 자체를 스킵한다. */
async function resolve({ shared, locals }) {
    if (!shared.kakaoUrl || shared.kakaoUrl === '#') return null;
    locals.kakaoUrl = shared.kakaoUrl;
    return locals;
}

module.exports = { resolve };
