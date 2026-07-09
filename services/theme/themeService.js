const pool = require('../../config/db');

/*
 * 테마 서비스 (P4)
 *
 * 활성 테마의 스타일 토큰을 CSS 커스텀 프로퍼티로 변환한다.
 *
 * 경계:
 *   site_settings   → 브랜드 색상/로고 (기존 유지)
 *   theme.config_json → 버튼/카드 반경, 폰트, 카드 스타일 등 빌더 전용 토큰
 *
 * 값은 CSS 에 직접 삽입되므로 **화이트리스트 + 값 검증**을 반드시 통과시킨다.
 * (관리자 입력이라도 `}` 를 섞어 스타일시트를 탈출하는 CSS 인젝션이 가능하다)
 */

/** 기본값 — 현재 하드코딩 스타일과 동일해야 회귀가 없다. */
const DEFAULTS = Object.freeze({
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
    buttonRadius: '0.5rem',
    cardRadius: '0.5rem',
    pillRadius: '9999px',
    inputRadius: '0.375rem',
    productCardStyle: 'shadow',
    sectionSpacing: '3rem',
    containerWidth: '72rem',
});

/** 토큰 → CSS 변수명 + 값 검증 규칙 */
const TOKENS = Object.freeze({
    fontFamily: { cssVar: '--yd-font-family', test: (v) => /^[\w\s'",\-.]+$/.test(v) && v.length <= 200 },
    buttonRadius: { cssVar: '--yd-radius-button', test: isLength },
    cardRadius: { cssVar: '--yd-radius-card', test: isLength },
    pillRadius: { cssVar: '--yd-radius-pill', test: isLength },
    inputRadius: { cssVar: '--yd-radius-input', test: isLength },
    sectionSpacing: { cssVar: '--yd-section-spacing', test: isLength },
    containerWidth: { cssVar: '--yd-container-width', test: isLength },
});

/** 0.5rem / 12px / 9999px / 0 / 50% 만 허용 */
function isLength(v) {
    return /^(0|\d{1,5}(\.\d{1,3})?(px|rem|em|%|vw))$/.test(String(v).trim());
}

/** 카드 스타일은 열거형 */
const CARD_STYLES = ['shadow', 'border', 'flat'];

function parseConfig(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return {}; }
}

/**
 * 활성 테마를 읽어 정규화한다. 없거나 값이 이상하면 기본값으로 대체한다.
 * @returns {Promise<{ name, tokens, cardStyle, cssVars }>}
 */
async function getActiveTheme(mallId = 1) {
    let raw = {};
    let name = '기본 테마';
    try {
        const [rows] = await pool.query(
            'SELECT name, config_json FROM theme WHERE mall_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
            [mallId]
        );
        if (rows[0]) {
            name = rows[0].name || name;
            raw = parseConfig(rows[0].config_json);
        }
    } catch (err) {
        // theme 테이블이 아직 없을 수 있다(마이그레이션 전) → 기본값으로 동작
        console.warn('[theme] 활성 테마 조회 실패, 기본값 사용:', err.message);
    }

    const tokens = {};
    const cssVars = [];
    for (const [key, spec] of Object.entries(TOKENS)) {
        const candidate = raw[key];
        const value = (candidate != null && spec.test(String(candidate)))
            ? String(candidate).trim()
            : DEFAULTS[key];
        tokens[key] = value;
        cssVars.push(`${spec.cssVar}: ${value};`);
    }

    const cardStyle = CARD_STYLES.includes(raw.productCardStyle)
        ? raw.productCardStyle
        : DEFAULTS.productCardStyle;

    return { name, tokens, cardStyle, cssVars };
}

module.exports = { getActiveTheme, DEFAULTS, TOKENS, CARD_STYLES, isLength };
