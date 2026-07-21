const pool = require('../../config/db');
const themeService = require('../../services/theme/themeService');
const themeData = require('../../middleware/themeData');

/*
 * 디자인 스타일 (쇼핑몰 관리 > 디자인 스타일)
 *
 * 메뉴명은 '디자인 스타일'이다. 페이지 빌더의 [테마 설정] 탭(히어로 배치·테마 1·2·3 적용)과
 * 이름이 겹쳐 혼동을 부르던 것을 분리했다. URL·테이블(`theme`)은 그대로 둔다.
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


/*
 * 선택지 정의 — 사용자는 CSS 를 쓰지 않는다.
 *
 * 화면은 "각지게 / 보통 / 둥글게" 같은 **말**로 고르고, `0.5rem` 같은 CSS 문자열은
 * 여기 value 에만 존재한다. 값 자체는 예전 자유 입력과 동일한 형식이라
 * `themeService.TOKENS[].test` 검증·기존 저장값과 100% 호환된다.
 */

/** 모서리 — 버튼·카드·입력창 공용 */
const RADIUS_OPTIONS = [
    { value: '0', label: '각지게' },
    { value: '0.25rem', label: '아주 살짝 둥글게' },
    { value: '0.375rem', label: '살짝 둥글게' },
    { value: '0.5rem', label: '보통' },
    { value: '0.75rem', label: '둥글게' },
    { value: '1rem', label: '많이 둥글게' },
    { value: '1.5rem', label: '아주 많이 둥글게' },
];

/** 알약형(태그·필터칩) — 완전 둥근 형태가 기본이라 목록을 따로 둔다 */
const PILL_OPTIONS = [
    { value: '9999px', label: '완전 둥글게 (알약형)' },
    { value: '0.5rem', label: '조금 둥근 사각형' },
    { value: '0.25rem', label: '거의 각진 사각형' },
    { value: '0', label: '각지게' },
];

/*
 * 폰트 — **레이아웃이 실제로 불러오는 폰트만** 노출한다.
 * `views/layouts/main_layout.ejs` 가 Pretendard(로컬) + Google Fonts 로
 * Nanum Myeongjo·Playfair Display 를 로드한다. 그 밖의 이름을 고르게 하면
 * 저장은 되는데 화면은 안 바뀌는 "먹통 설정"이 된다.
 */
const FONT_OPTIONS = [
    { value: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", label: '프리텐다드 (기본 · 고딕)' },
    { value: "'Nanum Myeongjo', serif", label: '나눔명조 (명조 · 고급스러운 느낌)' },
    { value: "'Playfair Display', serif", label: 'Playfair Display (영문 세리프)' },
    { value: 'system-ui, -apple-system, sans-serif', label: '기기 기본 폰트' },
];

/** 섹션 간격 — 세로 여백 */
const SPACING_OPTIONS = [
    { value: '1.5rem', label: '아주 좁게' },
    { value: '2rem', label: '좁게' },
    { value: '3rem', label: '보통' },
    { value: '4rem', label: '넓게' },
    { value: '5rem', label: '아주 넓게' },
];

/** 본문 최대 너비 */
const WIDTH_OPTIONS = [
    { value: '64rem', label: '좁게 (1024px)' },
    { value: '72rem', label: '보통 (1152px)' },
    { value: '80rem', label: '넓게 (1280px)' },
    { value: '90rem', label: '아주 넓게 (1440px)' },
    { value: '100%', label: '화면 전체' },
];

/** 폼에 노출할 토큰 (themeService.TOKENS 와 1:1) */
const FIELDS = [
    { key: 'fontFamily', label: '본문 폰트', options: FONT_OPTIONS, hint: '쇼핑몰 전체 글꼴입니다.' },
    { key: 'buttonRadius', label: '버튼 모서리', options: RADIUS_OPTIONS, hint: '' },
    { key: 'cardRadius', label: '카드 모서리', options: RADIUS_OPTIONS, hint: '상품 카드·배너 등의 모서리입니다.' },
    { key: 'pillRadius', label: '태그·칩 모서리', options: PILL_OPTIONS, hint: '' },
    { key: 'inputRadius', label: '입력창 모서리', options: RADIUS_OPTIONS, hint: '' },
    { key: 'sectionSpacing', label: '섹션 간격', options: SPACING_OPTIONS, hint: '메인 화면 섹션 사이의 세로 여백입니다.' },
    { key: 'containerWidth', label: '본문 최대 너비', options: WIDTH_OPTIONS, hint: '넓을수록 한 줄에 상품이 더 많이 들어갑니다.' },
];

/** 카드 스타일 — 열거값에 사람이 읽는 이름을 붙인다 */
const CARD_STYLE_LABELS = { shadow: '그림자', border: '테두리', flat: '민무늬' };

function parseConfig(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return {}; }
}

async function loadTheme(mallId) {
    const [[row]] = await pool.query(
        'SELECT id, name, config_json FROM theme WHERE mall_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1', [mallId]
    );
    if (row) return row;
    // P5: 이 몰에 테마가 없으면 기본 테마를 만들어 편집 가능하게 한다(새 몰 대응).
    // 값이 없는 토큰은 themeService 가 DEFAULTS 로 폴백하므로 config_json 은 비워도 안전하다.
    const [r] = await pool.query(
        "INSERT INTO theme (mall_id, name, config_json, is_active) VALUES (?, '기본 테마', JSON_OBJECT(), 1)", [mallId]
    );
    const [[created]] = await pool.query('SELECT id, name, config_json FROM theme WHERE id = ?', [r.insertId]);
    return created || null;
}

/** GET /admin/theme-settings */
exports.getEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const row = await loadTheme(MALL_ID);
        if (!row) return res.status(500).send('활성 테마가 없습니다. scripts/migrate_theme.js 를 실행하세요.');

        // 화면에는 **저장된 원본 값**을 보여준다(정규화된 값이 아니라).
        // 그래야 운영자가 자기가 넣은 이상값을 보고 고칠 수 있다.
        const raw = parseConfig(row.config_json);
        const active = await themeService.getActiveTheme(MALL_ID); // 실제 적용 중인 값

        res.render('admin/theme-settings/edit', {
            layout: 'layouts/admin_layout',
            title: '디자인 스타일',
            theme: row,
            raw,
            active,
            fields: FIELDS,
            defaults: themeService.DEFAULTS,
            cardStyles: themeService.CARD_STYLES,
            cardStyleLabels: CARD_STYLE_LABELS,
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
    const MALL_ID = req.adminMallId || 1;
    try {
        const row = await loadTheme(MALL_ID);
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
