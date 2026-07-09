const { sanitize } = require('../htmlSanitizer');

/*
 * custom_html — 제한적 커스텀 HTML (CT-9)
 *
 * config:
 *   html  운영자가 입력한 원본 HTML
 *
 * 렌더 직전에 반드시 새니타이즈한다(저장 시 검증과 이중 방어).
 * 새니타이즈 후 내용이 비면 섹션 스킵.
 */
async function resolve({ config, locals }) {
    const safeHtml = sanitize(config.html);
    if (!safeHtml || !safeHtml.trim()) return null;

    locals.safeHtml = safeHtml;
    // 원본 html 이 뷰로 새어나가지 않도록 제거
    delete locals.html;
    return locals;
}

module.exports = { resolve };
