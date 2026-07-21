const sanitizeHtml = require('sanitize-html');

/*
 * 커스텀 HTML 새니타이저 (CT-9)
 *
 * custom_html 섹션은 운영자가 임의 HTML 을 넣을 수 있으므로 XSS 위험이 있다.
 * 관리자 입력이라도 신뢰하지 않는다(계정 탈취·권한 오용 시 저장형 XSS로 전 사용자에게 전파).
 *
 * 방어:
 *   - 허용 태그/속성 화이트리스트
 *   - <script>, <style>, <iframe>, <object>, <embed>, <form> 등 위험 태그 제거
 *   - on* 이벤트 핸들러 전부 제거 (allowedAttributes 화이트리스트로 자연 차단)
 *   - javascript:, data: 스킴 차단 (http/https/mailto/tel 및 상대경로만 허용)
 *
 * 저장 시(관리자)와 렌더 시(스토어프론트) 모두 통과시킨다(이중 방어).
 */

const OPTIONS = Object.freeze({
    allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr', 'div', 'span', 'section', 'article',
        'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'blockquote', 'pre', 'code',
        'a', 'img', 'picture', 'source', 'figure', 'figcaption',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    ],
    allowedAttributes: {
        // on* 핸들러는 화이트리스트에 없으므로 자동 제거된다.
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
        source: ['srcset', 'media', 'type'],
        '*': ['class', 'style'],
    },
    // 상대경로도 허용하려면 allowProtocolRelative + allowedSchemesByTag 조합을 쓴다.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset'],
    allowProtocolRelative: false,
    // style 속성은 남기되 표현용 속성만 허용 (expression() 등 차단)
    allowedStyles: {
        '*': {
            color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i, /^var\(--[\w-]+\)$/i, /^[a-z]+$/i],
            'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i, /^var\(--[\w-]+\)$/i, /^[a-z]+$/i],
            'text-align': [/^(left|right|center|justify)$/],
            'font-size': [/^\d+(\.\d+)?(px|rem|em|%)$/],
            'font-weight': [/^(normal|bold|[1-9]00)$/],
            margin: [/^[\d.\s a-z%]+$/i],
            padding: [/^[\d.\s a-z%]+$/i],
            width: [/^\d+(\.\d+)?(px|rem|em|%)$/],
            'max-width': [/^\d+(\.\d+)?(px|rem|em|%)$/],
            /*
             * 표 테두리 — 에디터의 [표] 버튼이 만들어 내는 스타일이다.
             * 이게 없으면 표는 저장되는데 화면에서는 선이 사라져 "칸이 안 나뉜 글 뭉치"로 보인다.
             * 값은 표현용이라 위험하지 않다(expression() 등은 아래 패턴에서 걸러진다).
             */
            border: [/^[\d.]+(px|rem|em)?\s+(solid|dashed|dotted|double|none)\s+[#\w(),.\s]+$/i, /^none$/i],
            'border-collapse': [/^(collapse|separate)$/i],
            'border-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i, /^[a-z]+$/i],
            'border-width': [/^[\d.]+(px|rem|em)$/],
            'border-style': [/^(solid|dashed|dotted|double|none)$/i],
            height: [/^\d+(\.\d+)?(px|rem|em|%)$/],
            'vertical-align': [/^(top|middle|bottom|baseline)$/i],
        },
    },
    // 외부 링크는 새 창 + noopener 강제
    transformTags: {
        a: (tagName, attribs) => {
            const href = attribs.href || '';
            const isExternal = /^https?:\/\//i.test(href);
            return {
                tagName: 'a',
                attribs: Object.assign({}, attribs, isExternal
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {}),
            };
        },
    },
    // src 가 비었거나 실제 경로로 보이지 않는 img 는 제거한다.
    // (예: <img src=x onerror=…> 의 onerror 는 속성 화이트리스트로 이미 제거되지만,
    //  깨진 src="x" 가 남아 브라우저에 깨진 이미지 아이콘으로 노출되는 것을 막는다.)
    exclusiveFilter: (frame) => {
        if (frame.tag !== 'img') return false;
        const src = ((frame.attribs && frame.attribs.src) || '').trim();
        if (!src) return true;
        const looksReal = /^(https?:)?\/\//i.test(src)      // http(s):// 또는 //cdn
            || src.startsWith('/')                          // 절대경로 /uploads/…
            || /\.[a-z0-9]{2,5}([?#]|$)/i.test(src);        // 확장자 있는 상대경로
        return !looksReal;
    },
    disallowedTagsMode: 'discard',
});

/**
 * 커스텀 HTML 을 안전한 HTML 로 변환한다.
 * @param {string} html
 * @returns {string} 허용 태그/속성만 남은 HTML
 */
function sanitize(html) {
    if (!html || typeof html !== 'string') return '';
    return sanitizeHtml(html, OPTIONS);
}

module.exports = { sanitize, OPTIONS };
