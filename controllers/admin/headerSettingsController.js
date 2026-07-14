const pool = require('../../config/db');

/*
 * Header 설정 (B5) — `navigation_config` 편집
 *
 * 몰별 내비게이션 정책(GNB 슬롯 수, 카테고리 최대 뎁스, 헤더 레이아웃)을 관리한다.
 * 설계: docs/사이트개선/admin_dev_plan.md §3.2 (쇼핑몰 설정 > Header 설정)
 *
 * 저장 시 폼 값을 신뢰하지 않고 서버가 화이트리스트·범위로 재검증한다.
 * 특히 `category_max_depth` 는 낮추면 이미 존재하는 하위 카테고리가
 * 스토어프론트에서 조용히 사라지므로(navigationService 가 `depth <= maxDepth` 로 필터),
 * 현재 데이터의 최대 depth 미만으로는 내릴 수 없다.
 */


/**
 * 화이트리스트.
 *
 * `supported: false` 는 컬럼은 있으나 렌더가 아직 소비하지 않는 값이다.
 * feature_menu.module_ready 와 같은 원칙으로 UI 에서 잠근다 — 켜도 안 바뀌는 스위치를
 * 운영자에게 내주면 설정과 화면이 어긋난다.
 */
const HEADER_LAYOUT_TYPES = [
    {
        value: 'main_right_utility_v1', supported: true,
        label: '기본형 — 카테고리 버튼 + 평면 GNB (3단 헤더)',
        hint: '상단 유틸바 + 로고/검색 + GNB 3단. 카테고리는 [☰ 카테고리] 버튼의 드롭다운 패널(3단 캐스케이드)로 열리고, 일반 메뉴는 그 옆에 한 줄로 놓입니다.',
        navMode: 'split',
    },
    {
        value: 'compact_drawer_v1', supported: true,
        label: '드로어형 — 햄버거 전체메뉴 + 아코디언 카테고리',
        hint: '헤더에는 [☰]·로고·장바구니만 두고 메뉴 전체를 좌측 슬라이드 드로어에 담습니다. 카테고리 1뎁스가 일반 메뉴와 같은 목록에 놓이고, 하위 뎁스는 [+] 로 펼칩니다. 검색창도 드로어 안에 있습니다.',
        navMode: 'unified',
    },
];

/**
 * 레이아웃 ↔ nav_mode 는 짝이다. 레이아웃만 바꾸고 nav_mode 를 그대로 두면
 * "드로어 헤더인데 카테고리가 메뉴 목록에 없는" 깨진 조합이 나온다(반대도 마찬가지).
 * → 레이아웃을 저장할 때 nav_mode 를 함께 맞춘다. 운영자가 깨진 조합을 만들 수 없다.
 */
function navModeOf(layoutValue) {
    const hit = HEADER_LAYOUT_TYPES.find(o => o.value === layoutValue);
    return (hit && hit.navMode) || 'split';
}

/** 정수 필드의 허용 범위 */
const LIMITS = {
    max_gnb_items: { min: 1, max: 20 },
    max_custom_items: { min: 0, max: 10 },
    // 프론트(GNB 드롭다운)가 3뎁스까지만 렌더한다. 상한을 올리려면 프론트를 먼저 확장할 것.
    category_max_depth: { min: 1, max: 3 },
};

function clampInt(raw, { min, max }, fallback) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function pickWhitelisted(raw, list, fallback) {
    const hit = list.find(o => o.value === raw && o.supported);
    return hit ? hit.value : fallback;
}

async function loadConfig(mallId) {
    const [[row]] = await pool.query('SELECT * FROM navigation_config WHERE mall_id = ? LIMIT 1', [mallId]);
    return row || null;
}

/** 현재 카테고리 데이터의 최대 depth (없으면 1) */
async function currentMaxCategoryDepth(mallId) {
    const [[r]] = await pool.query('SELECT COALESCE(MAX(depth), 1) AS d FROM categories WHERE mall_id = ?', [mallId]);
    return Number(r.d) || 1;
}

/** GET /admin/header-settings */
exports.getEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const config = await loadConfig(MALL_ID);
        if (!config) {
            return res.status(500).send('navigation_config 행이 없습니다. scripts/migrate_menu_architecture.js 를 실행하세요.');
        }

        res.render('admin/header-settings/edit', {
            layout: 'layouts/admin_layout',
            title: 'Header 설정',
            config,
            headerLayoutTypes: HEADER_LAYOUT_TYPES,
            limits: LIMITS,
            maxCategoryDepth: await currentMaxCategoryDepth(MALL_ID),
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[headerSettings] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/header-settings */
exports.postUpdate = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const config = await loadConfig(MALL_ID);
        if (!config) return res.status(500).send('navigation_config 행이 없습니다.');

        const headerLayout = pickWhitelisted(req.body.header_layout_type, HEADER_LAYOUT_TYPES, config.header_layout_type);

        const maxGnb = clampInt(req.body.max_gnb_items, LIMITS.max_gnb_items, config.max_gnb_items);
        let maxCustom = clampInt(req.body.max_custom_items, LIMITS.max_custom_items, config.max_custom_items);
        const maxDepth = clampInt(req.body.category_max_depth, LIMITS.category_max_depth, config.category_max_depth);

        // 커스텀 슬롯은 GNB 총량 안에서 잘린다. 총량보다 크면 의미가 없다.
        if (maxCustom > maxGnb) maxCustom = maxGnb;

        // 뎁스를 낮추면 기존 하위 카테고리가 스토어프론트에서 사라진다.
        const existingDepth = await currentMaxCategoryDepth(MALL_ID);
        if (maxDepth < existingDepth) {
            const msg = `카테고리 최대 뎁스를 ${maxDepth} 로 낮출 수 없습니다. 현재 ${existingDepth}뎁스 카테고리가 있어 스토어프론트에서 사라집니다.`;
            return res.redirect(`/admin/header-settings?error=${encodeURIComponent(msg)}`);
        }

        await pool.query(`
            UPDATE navigation_config
               SET header_layout_type = ?, nav_mode = ?,
                   max_gnb_items = ?, max_custom_items = ?, category_max_depth = ?,
                   use_mega_menu = ?, use_search_bar = ?
             WHERE mall_id = ?
        `, [
            headerLayout,
            navModeOf(headerLayout),   // 레이아웃과 GNB 조립 방식을 항상 짝으로 저장한다
            maxGnb, maxCustom, maxDepth,
            // 메가 메뉴는 렌더 미지원이므로 항상 0 으로 고정한다.
            0,
            req.body.use_search_bar ? 1 : 0,
            MALL_ID,
        ]);

        res.redirect('/admin/header-settings?saved=1');
    } catch (err) {
        console.error('[headerSettings] postUpdate:', err.message);
        res.status(500).send('Server Error');
    }
};
