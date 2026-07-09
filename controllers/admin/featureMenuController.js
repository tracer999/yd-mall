const pool = require('../../config/db');

/*
 * 일반/시스템 메뉴 관리 (B2)
 *
 * 스토어프론트 메뉴(feature_menu + mall_feature_menu)의 ON/OFF · 표시명 · 순서를 관리한다.
 *
 * 설계 원칙 (docs/사이트개선/admin_dev_plan.md §4.2):
 *   - 운영자는 **URL 과 위치(position)를 바꿀 수 없다.** 표준 URL 은 코드가 고정한다.
 *   - `module_ready = 0` 인 메뉴는 켜도 노출되지 않으므로 **토글을 잠근다.**
 *   - `is_required = 1` 인 메뉴(로그인/장바구니/검색/TOP 등)는 **끌 수 없다.**
 *   - 배지는 NEW/HOT/SALE 화이트리스트만 허용한다(자유 입력 금지).
 */

const MALL_ID = 1;

/** 위치별 표기 (코드 고정) */
const POSITIONS = [
    { key: 'gnb', label: 'GNB (상단 메뉴)', hint: '카테고리 버튼은 항상 최좌측 고정입니다.' },
    { key: 'header_util', label: '헤더 유틸', hint: '로그인·마이쇼핑·장바구니·검색은 끌 수 없습니다.' },
    { key: 'right_rail', label: '우측 유틸 레일', hint: '넓은 화면(≥1600px)에서만 노출됩니다.' },
];

const BADGE_TYPES = ['NEW', 'HOT', 'SALE'];

function normalizeBadge(v) {
    const b = String(v || '').trim().toUpperCase();
    return BADGE_TYPES.includes(b) ? b : null;
}

function toArray(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

/** GET /admin/feature-menus */
exports.getList = async (req, res) => {
    try {
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
            ORDER BY f.position ASC, sort_order ASC, f.default_sort_order ASC
        `, [MALL_ID]);

        const groups = POSITIONS.map(p => Object.assign({}, p, {
            items: rows.filter(r => r.position === p.key),
        })).filter(g => g.items.length > 0);

        const [[cfg]] = await pool.query(
            'SELECT max_gnb_items, max_custom_items FROM navigation_config WHERE mall_id = ?', [MALL_ID]
        );

        res.render('admin/feature-menus/list', {
            layout: 'layouts/admin_layout',
            title: '일반 메뉴 관리',
            groups,
            badgeTypes: BADGE_TYPES,
            config: cfg || { max_gnb_items: 8, max_custom_items: 3 },
            saved: req.query.saved === '1',
        });
    } catch (err) {
        console.error('[featureMenu] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/feature-menus */
exports.postSave = async (req, res) => {
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

        // 서버가 다시 조회한다. 폼 값(module_ready/is_required)은 신뢰하지 않는다.
        const [meta] = await conn.query('SELECT feature_code, module_ready, is_required FROM feature_menu');
        const metaBy = new Map(meta.map(m => [m.feature_code, m]));

        for (let i = 0; i < codes.length; i++) {
            const code = String(codes[i] || '').trim();
            const m = metaBy.get(code);
            if (!m) continue; // 알 수 없는 코드는 무시

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
        res.redirect('/admin/feature-menus?saved=1');
    } catch (err) {
        await conn.rollback();
        console.error('[featureMenu] postSave:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};
