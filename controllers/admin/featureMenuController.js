const pool = require('../../config/db');

/*
 * 일반 메뉴 관리 (B2) / 시스템 메뉴 설정 (B4)
 *
 * 스토어프론트 메뉴(feature_menu + mall_feature_menu)의 ON/OFF · 표시명 · 순서를 관리한다.
 * 두 화면은 다루는 position 만 다르고 편집 규칙과 저장 로직은 동일하다.
 *
 *   /admin/feature-menus  일반 메뉴 관리   → position = gnb
 *   /admin/system-menus   시스템 메뉴 설정 → position = header_util, right_rail
 *
 * 설계 원칙 (docs/사이트개선/admin_dev_plan.md §4.2, §4.4):
 *   - 운영자는 **URL 과 위치(position)를 바꿀 수 없다.** 표준 URL 은 코드가 고정한다.
 *   - `module_ready = 0` 인 메뉴는 켜도 노출되지 않으므로 **토글을 잠근다.**
 *   - `is_required = 1` 인 메뉴(로그인/장바구니/검색/TOP 등)는 **끌 수 없다.**
 *   - 배지는 NEW/HOT/SALE 화이트리스트만 허용한다(자유 입력 금지).
 *
 * 화면 분리 필터는 `position` 이다. `is_system` 이 아니다 —
 * CATEGORY(gnb)가 is_system=1 이고 RAIL_BRAND_WISHLIST·RAIL_RECENT 는 is_system=0 이라
 * is_system 으로 가르면 GNB 버튼이 시스템 화면에 끌려오고 레일 2종이 빠진다.
 */


/** 위치별 표기 (코드 고정) */
const POSITION_META = {
    gnb: { key: 'gnb', label: 'GNB (상단 메뉴)', hint: '카테고리 버튼은 항상 최좌측 고정입니다.' },
    header_util: { key: 'header_util', label: '헤더 유틸', hint: '로그인·마이쇼핑·장바구니·검색은 끌 수 없습니다.' },
    right_rail: { key: 'right_rail', label: '우측 유틸 레일', hint: '넓은 화면(≥1600px)에서만 노출됩니다.' },
};

/** 화면별 담당 position (편집 범위이자 저장 시 허용 목록) */
const SCREENS = {
    feature: {
        positions: ['gnb'],
        path: '/admin/feature-menus',
        view: 'admin/feature-menus/list',
        title: '일반 메뉴 관리',
        description: '스토어프론트 상단 GNB 에 노출되는 <strong>기능 메뉴</strong>의 사용 여부·표시 명칭·순서를 관리합니다. 표준 URL 과 위치는 기능 모듈에 고정되어 변경할 수 없습니다.',
        showGnbLimit: true,
    },
    system: {
        positions: ['header_util', 'right_rail'],
        path: '/admin/system-menus',
        view: 'admin/system-menus/list',
        title: '시스템 메뉴 설정',
        description: '로그인·장바구니·검색처럼 쇼핑몰에 <strong>고정된 기능 메뉴</strong>입니다. 추가·삭제할 수 없고 노출 여부·표시 명칭·순서만 조정합니다.',
        showGnbLimit: false,
    },
};

const BADGE_TYPES = ['NEW', 'HOT', 'SALE'];

function normalizeBadge(v) {
    const b = String(v || '').trim().toUpperCase();
    return BADGE_TYPES.includes(b) ? b : null;
}

function toArray(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

/** 화면 하나를 렌더한다. */
async function renderScreen(screen, req, res) {
    const MALL_ID = req.adminMallId || 1;
    const placeholders = screen.positions.map(() => '?').join(',');

    const [rows] = await pool.query(`
        SELECT
            f.feature_code, f.default_name, f.default_path, f.position,
            f.module_ready, f.is_system, f.is_required, f.required_module, f.description,
            COALESCE(m.is_enabled, 0)      AS is_enabled,
            m.display_name,
            COALESCE(m.sort_order, f.default_sort_order) AS sort_order,
            COALESCE(m.pc_visible, 1)      AS pc_visible,
            COALESCE(m.mobile_visible, 1)  AS mobile_visible,
            COALESCE(m.login_required, 0)  AS login_required,
            m.badge_type
        FROM feature_menu f
        LEFT JOIN mall_feature_menu m
               ON m.feature_code = f.feature_code AND m.mall_id = ?
        WHERE f.position IN (${placeholders})
        ORDER BY f.position ASC, sort_order ASC, f.default_sort_order ASC
    `, [MALL_ID, ...screen.positions]);

    const groups = screen.positions
        .map(pos => Object.assign({}, POSITION_META[pos], {
            items: rows.filter(r => r.position === pos),
        }))
        .filter(g => g.items.length > 0);

    const [[cfg]] = await pool.query(
        'SELECT max_gnb_items, max_custom_items FROM navigation_config WHERE mall_id = ?', [MALL_ID]
    );

    res.render(screen.view, {
        layout: 'layouts/admin_layout',
        title: screen.title,
        screen,
        groups,
        badgeTypes: BADGE_TYPES,
        config: cfg || { max_gnb_items: 8, max_custom_items: 3 },
        saved: req.query.saved === '1',
    });
}

/**
 * 화면 하나를 저장한다.
 *
 * 폼이 보낸 feature_code 라도 그 화면이 담당하지 않는 position 이면 건너뛴다.
 * (일반 메뉴 화면에서 시스템 메뉴를 조작하는 요청 위조 차단)
 */
async function saveScreen(screen, req, res) {
    const MALL_ID = req.adminMallId || 1;
    const codes = toArray(req.body.feature_code);
    const displayNames = toArray(req.body.display_name);
    const sortOrders = toArray(req.body.sort_order);
    const badges = toArray(req.body.badge_type);

    // 체크박스는 켜진 것만 전송되므로 별도 배열로 받는다.
    const enabled = new Set(toArray(req.body.enabled).map(String));
    const pcVisible = new Set(toArray(req.body.pc_visible).map(String));
    const mobileVisible = new Set(toArray(req.body.mobile_visible).map(String));
    const loginRequired = new Set(toArray(req.body.login_required).map(String));

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 서버가 다시 조회한다. 폼 값(position/module_ready/is_required)은 신뢰하지 않는다.
        const [meta] = await conn.query('SELECT feature_code, position, module_ready, is_required FROM feature_menu');
        const metaBy = new Map(meta.map(m => [m.feature_code, m]));

        for (let i = 0; i < codes.length; i++) {
            const code = String(codes[i] || '').trim();
            const m = metaBy.get(code);
            if (!m) continue; // 알 수 없는 코드는 무시
            if (!screen.positions.includes(m.position)) continue; // 이 화면 소관이 아니다

            let isEnabled = enabled.has(code) ? 1 : 0;

            // 필수 메뉴는 끌 수 없다.
            if (Number(m.is_required) === 1) isEnabled = 1;
            // 모듈이 없는 메뉴는 켤 수 없다(켜도 렌더에서 제외되므로 상태를 정직하게 유지).
            if (Number(m.module_ready) === 0) isEnabled = 0;

            const displayName = String(displayNames[i] || '').trim() || null;
            const sortOrder = Number(sortOrders[i]);

            await conn.query(`
                INSERT INTO mall_feature_menu
                    (mall_id, feature_code, display_name, sort_order, is_enabled,
                     pc_visible, mobile_visible, login_required, badge_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    display_name = VALUES(display_name),
                    sort_order = VALUES(sort_order),
                    is_enabled = VALUES(is_enabled),
                    pc_visible = VALUES(pc_visible),
                    mobile_visible = VALUES(mobile_visible),
                    login_required = VALUES(login_required),
                    badge_type = VALUES(badge_type)
            `, [
                MALL_ID, code, displayName,
                Number.isFinite(sortOrder) ? sortOrder : 0,
                isEnabled,
                pcVisible.has(code) ? 1 : 0,
                mobileVisible.has(code) ? 1 : 0,
                loginRequired.has(code) ? 1 : 0,
                normalizeBadge(badges[i]),
            ]);
        }

        await conn.commit();
        res.redirect(`${screen.path}?saved=1`);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** GET /admin/feature-menus — 일반 메뉴 관리 (GNB) */
exports.getList = async (req, res) => {
    try {
        await renderScreen(SCREENS.feature, req, res);
    } catch (err) {
        console.error('[featureMenu] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/feature-menus */
exports.postSave = async (req, res) => {
    try {
        await saveScreen(SCREENS.feature, req, res);
    } catch (err) {
        console.error('[featureMenu] postSave:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/system-menus — 시스템 메뉴 설정 (헤더 유틸 + 우측 레일) */
exports.getSystemList = async (req, res) => {
    try {
        await renderScreen(SCREENS.system, req, res);
    } catch (err) {
        console.error('[featureMenu] getSystemList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/system-menus */
exports.postSystemSave = async (req, res) => {
    try {
        await saveScreen(SCREENS.system, req, res);
    } catch (err) {
        console.error('[featureMenu] postSystemSave:', err.message);
        res.status(500).send('Server Error');
    }
};
