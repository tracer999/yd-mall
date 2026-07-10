const pool = require('../../config/db');
const themeService = require('../../services/theme/themeService');
const themeData = require('../../middleware/themeData');

/*
 * 테마 설정 (쇼핑몰 설정 > 테마)
 *
 * `theme.config_json` 의 스타일 토큰을 편집한다. 값은 `main_layout` 의 <head> 에서
 * CSS 커스텀 프로퍼티로 **직접 삽입**되므로 CSS 인젝션 방어가 필수다.
 * (관리자 입력이라도 `}` 를 섞으면 스타일시트를 탈출할 수 있다)
 *
 * 검증은 새로 짜지 않고 `themeService` 가 export 하는 규칙을 그대로 재사용한다 —
 * 렌더 시 검증과 저장 시 검증이 어긋나면 "저장은 됐는데 반영이 안 되는" 상태가 된다.
 * themeService 는 이상값을 조용히 기본값으로 폴백하지만, 여기서는 **거부하고 사유를 알린다.**
 *
 * 저장 후 `themeData.invalidate()` 로 60초 메모리 캐시를 비운다.
 * (PM2 가 fork·instances=1 이라 프로세스가 하나이므로 유효하다. cluster 로 늘리면
 *  다른 워커의 캐시는 최대 60초 뒤에 만료된다.)
 */

const MALL_ID = 1;

/** 폼에 노출할 토큰 (themeService.TOKENS 와 1:1) */
const FIELDS = [
    { key: 'fontFamily', label: '폰트 패밀리', hint: '예: \'Pretendard\', sans-serif — 따옴표·쉼표·하이픈·점만 허용, 200자 이내' },
    { key: 'buttonRadius', label: '버튼 모서리', hint: '예: 0.5rem, 8px, 0' },
    { key: 'cardRadius', label: '카드 모서리', hint: '예: 0.5rem' },
    { key: 'pillRadius', label: '알약형 모서리', hint: '예: 9999px' },
    { key: 'inputRadius', label: '입력창 모서리', hint: '예: 0.375rem' },
    { key: 'sectionSpacing', label: '섹션 간격', hint: '예: 3rem' },
    { key: 'containerWidth', label: '본문 최대 너비', hint: '예: 72rem' },
];

function parseConfig(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return {}; }
}

async function loadTheme() {
    const [[row]] = await pool.query(
        'SELECT id, name, config_json FROM theme WHERE mall_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1', [MALL_ID]
    );
    return row || null;
}

/** GET /admin/theme-settings */
exports.getEdit = async (req, res) => {
    try {
        const row = await loadTheme();
        if (!row) return res.status(500).send('활성 테마가 없습니다. scripts/migrate_theme.js 를 실행하세요.');

        // 화면에는 **저장된 원본 값**을 보여준다(정규화된 값이 아니라).
        // 그래야 운영자가 자기가 넣은 이상값을 보고 고칠 수 있다.
        const raw = parseConfig(row.config_json);
        const active = await themeService.getActiveTheme(MALL_ID); // 실제 적용 중인 값

        res.render('admin/theme-settings/edit', {
            layout: 'layouts/admin_layout',
            title: '테마 설정',
            theme: row,
            raw,
            active,
            fields: FIELDS,
            defaults: themeService.DEFAULTS,
            cardStyles: themeService.CARD_STYLES,
            saved: req.query.saved === '1',
            errors: req.query.errors ? String(req.query.errors).split('|') : [],
        });
    } catch (err) {
        console.error('[themeSettings] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/theme-settings */
exports.postUpdate = async (req, res) => {
    try {
        const row = await loadTheme();
        if (!row) return res.status(500).send('활성 테마가 없습니다.');

        const errors = [];
        // UI 밖 키를 보존한다 (read-modify-write).
        const next = Object.assign({}, parseConfig(row.config_json));

        for (const f of FIELDS) {
            const spec = themeService.TOKENS[f.key];
            const value = String(req.body[f.key] || '').trim();

            if (!value) {                       // 비우면 기본값으로 되돌린다
                next[f.key] = themeService.DEFAULTS[f.key];
                continue;
            }
            if (!spec.test(value)) {            // 렌더와 같은 규칙으로 거부
                errors.push(`${f.label}: "${value}" 는 허용되지 않는 값입니다.`);
                continue;
            }
            next[f.key] = value;
        }

        const cardStyle = String(req.body.productCardStyle || '').trim();
        if (cardStyle && !themeService.CARD_STYLES.includes(cardStyle)) {
            errors.push(`상품 카드 스타일: "${cardStyle}" 은 허용되지 않는 값입니다.`);
        } else {
            next.productCardStyle = cardStyle || themeService.DEFAULTS.productCardStyle;
        }

        if (errors.length) {
            return res.redirect('/admin/theme-settings?errors=' + encodeURIComponent(errors.join('|')));
        }

        const name = String(req.body.name || '').trim().slice(0, 100) || row.name;
        await pool.query('UPDATE theme SET name = ?, config_json = ? WHERE id = ?', [name, JSON.stringify(next), row.id]);

        themeData.invalidate(); // 스토어프론트에 즉시 반영
        res.redirect('/admin/theme-settings?saved=1');
    } catch (err) {
        console.error('[themeSettings] postUpdate:', err.message);
        res.status(500).send('Server Error');
    }
};
