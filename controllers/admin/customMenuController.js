const pool = require('../../config/db');
const exhibitionSvc = require('../../services/exhibition/exhibitionService');
const navigationService = require('../../services/menu/navigationService');

/*
 * 커스텀 메뉴 관리 (B3) — `custom_menu` CRUD
 *
 * 설계: docs/사이트개선/admin_dev_plan.md §4.3
 *
 * ── 이 화면이 있는 이유 ────────────────────────────────
 * 기능 메뉴(feature_menu)는 "전문관 목록"·"기획전 목록"처럼 **모듈 단위**로 고정돼 있다.
 * 몰마다 성격이 다른 진입점 — "건강식품관", "○○ 콜라보" 같은 **개별 인스턴스** — 은
 * 여기서 만든다. 기획전/전문관을 새로 개발하는 게 아니라, 이미 만들어 둔 기획전 하나를
 * 골라 GNB 슬롯에 꽂는 것이다.
 *
 * 커스텀 메뉴는 기능 메뉴와 **동등한 GNB 항목**이다(navigationService 가 sort_order 로
 * 통합 정렬한다). 개별 전문관을 GNB 에 올리는 몰은 보통 일반 메뉴 관리에서 '전문관'
 * 목록 메뉴를 끄고 그 자리를 쓴다.
 *
 * ── 저장 규칙 ─────────────────────────────────────────
 *   link_type 은 화이트리스트. 리소스형(CATEGORY/BRAND/EXHIBITION)은 대상 id 를
 *   **서버가 다시 조회해** 같은 몰의 유효한 대상인지 확인한다(폼 값을 신뢰하지 않는다).
 *   URL 형(INTERNAL_PAGE/EXTERNAL_URL)은 형식을 강제한다.
 *   GNB 활성 개수는 navigation_config.max_custom_items 를 넘길 수 없다.
 */

/** 위치 화이트리스트. navigationService 가 실제로 소비하는 것만 연다. */
const LOCATIONS = [
    { value: 'gnb', label: 'GNB (상단 메뉴)', slotted: true },
    { value: 'footer', label: '푸터', slotted: false },
    { value: 'mobile_quick', label: '모바일 퀵 메뉴', slotted: false },
];

/**
 * 링크 유형 화이트리스트.
 *   kind: 'resource' → link_target 필수 (picker 에서 선택)
 *         'url'      → link_url 필수 (직접 입력)
 * PRODUCT_GROUP 은 렌더 resolver 가 없어(모듈 미구현) 목록에 넣지 않는다.
 */
const LINK_TYPES = [
    { value: 'EXHIBITION', label: '기획전 · 전문관', kind: 'resource', hint: '발행된 기획전/전문관 하나를 골라 상세로 바로 보냅니다.' },
    // 드로어형 스킨(nav_mode='unified')에서는 카테고리 메뉴가 **하위 카테고리를 자동으로 상속**한다
    // — 운영자가 하위 메뉴를 따로 만들지 않아도 [+] 로 펼쳐진다(navigationService.buildUnified).
    { value: 'CATEGORY', label: '카테고리', kind: 'resource', hint: '카테고리 상품 목록으로 보냅니다. 드로어형 스킨에서는 하위 카테고리가 자동으로 하위 메뉴로 붙습니다.' },
    { value: 'BRAND', label: '브랜드', kind: 'resource', hint: '브랜드 상품 목록으로 보냅니다.' },
    { value: 'INTERNAL_PAGE', label: '내부 페이지 (직접 입력)', kind: 'url', hint: '/ 로 시작하는 이 쇼핑몰 내부 경로.' },
    { value: 'EXTERNAL_URL', label: '외부 링크', kind: 'url', hint: 'http(s):// 주소. 항상 새 창으로 열립니다.' },
];

const BADGE_TYPES = navigationService.BADGE_TYPES;

const linkTypeOf = (v) => LINK_TYPES.find(t => t.value === String(v)) || null;

function normalizeBadge(v) {
    const b = String(v || '').trim().toUpperCase();
    return BADGE_TYPES.includes(b) ? b : null;
}

const bool = (v) => (v ? 1 : 0);

function toDatetime(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : s.replace('T', ' ');
}

/** 폼·목록이 함께 쓰는 대상 선택지 */
async function loadTargetOptions(mallId) {
    const [exhibitions, categories] = await Promise.all([
        exhibitionSvc.getLinkableList(mallId),
        pool.query(`
            SELECT id, name, type FROM categories
             WHERE mall_id = ? AND is_active = 1 AND type IN ('NORMAL', 'BRAND')
             ORDER BY type ASC, display_order ASC, name ASC
        `, [mallId]).then(([rows]) => rows),
    ]);

    return {
        // 전문관/기획전은 같은 테이블이라 유형으로 갈라 보여준다(운영자 혼동 방지).
        specialties: exhibitions.filter(e => e.isSpecialty),
        exhibitions: exhibitions.filter(e => !e.isSpecialty),
        categories: categories.filter(c => c.type === 'NORMAL'),
        brands: categories.filter(c => c.type === 'BRAND'),
    };
}

/** 저장 전 대상 유효성 — 폼이 보낸 id 가 이 몰의 살아있는 리소스인지 서버가 확인한다. */
async function resolveTarget(mallId, linkType, rawTarget) {
    const id = Number(rawTarget);
    if (!Number.isInteger(id) || id <= 0) return null;

    if (linkType === 'EXHIBITION') {
        const found = await exhibitionSvc.getLinkTargetsByIds(mallId, [id]);
        return found.has(id) ? id : null;
    }

    const wantType = linkType === 'BRAND' ? 'BRAND' : 'NORMAL';
    const [[row]] = await pool.query(
        'SELECT id FROM categories WHERE id = ? AND mall_id IN (0, ?) AND is_active = 1 AND type = ? LIMIT 1',
        [id, mallId, wantType]
    );
    return row ? id : null;
}

/**
 * 폼 → 저장할 필드. 실패하면 { error } 를 돌려준다.
 * 링크 유형에 안 맞는 필드는 **NULL 로 지운다** — EXHIBITION 으로 바꿨는데 예전 link_url 이
 * 남아 있으면 나중에 유형만 되돌렸을 때 유령 링크가 살아난다.
 */
async function buildPayload(mallId, body) {
    const name = String(body.display_name || '').trim();
    if (!name) return { error: '메뉴 이름을 입력하세요.' };
    if (name.length > 20) return { error: '메뉴 이름은 20자 이내로 입력하세요.' };

    const type = linkTypeOf(body.link_type);
    if (!type) return { error: '링크 유형을 선택하세요.' };

    const location = LOCATIONS.find(l => l.value === String(body.location));
    if (!location) return { error: '노출 위치를 선택하세요.' };

    let linkTarget = null;
    let linkUrl = null;

    if (type.kind === 'resource') {
        linkTarget = await resolveTarget(mallId, type.value, body.link_target);
        if (!linkTarget) return { error: '연결할 대상을 선택하세요. (삭제되었거나 발행되지 않은 대상은 선택할 수 없습니다)' };
    } else {
        linkUrl = String(body.link_url || '').trim();
        if (!linkUrl) return { error: '링크 주소를 입력하세요.' };
        if (linkUrl.length > 500) return { error: '링크 주소가 너무 깁니다.' };

        if (type.value === 'EXTERNAL_URL') {
            if (!/^https?:\/\//i.test(linkUrl)) return { error: '외부 링크는 http:// 또는 https:// 로 시작해야 합니다.' };
        } else if (!linkUrl.startsWith('/')) {
            return { error: '내부 페이지 경로는 / 로 시작해야 합니다.' };
        }
    }

    return {
        payload: {
            display_name: name,
            link_type: type.value,
            link_target: linkTarget,
            link_url: linkUrl,
            location: location.value,
            sort_order: Number.parseInt(body.sort_order, 10) || 0,
            is_enabled: bool(body.is_enabled),
            pc_visible: bool(body.pc_visible),
            mobile_visible: bool(body.mobile_visible),
            login_required: bool(body.login_required),
            badge_type: normalizeBadge(body.badge_type),
            // 외부 링크는 렌더가 어차피 새 창을 강제한다. 저장값도 맞춰 둔다(화면과 DB 불일치 방지).
            new_window: type.value === 'EXTERNAL_URL' ? 1 : bool(body.new_window),
        },
    };
}

/**
 * GNB 슬롯 초과 검사. 켜져 있는 GNB 커스텀 메뉴만 센다.
 * @param {number|null} excludeId 수정 중인 자기 자신
 */
async function wouldExceedSlots(mallId, payload, excludeId = null) {
    if (payload.location !== 'gnb' || !payload.is_enabled) return null;

    const [[cfg]] = await pool.query('SELECT max_custom_items FROM navigation_config WHERE mall_id = ?', [mallId]);
    const limit = Number(cfg ? cfg.max_custom_items : navigationService.DEFAULT_CONFIG.max_custom_items);

    const [[cnt]] = await pool.query(
        "SELECT COUNT(*) AS n FROM custom_menu WHERE mall_id = ? AND location = 'gnb' AND is_enabled = 1 AND id <> ?",
        [mallId, excludeId || 0]
    );

    return Number(cnt.n) + 1 > limit
        ? `GNB 커스텀 메뉴 슬롯(${limit}개)을 초과했습니다. Header 설정에서 슬롯 수를 늘리거나 다른 커스텀 메뉴를 끄세요.`
        : null;
}

/** 목록 행에 "이 메뉴가 실제로 노출되는가"를 붙인다. */
function decorateRows(rows, resolvedPaths) {
    return rows.map(r => {
        const type = linkTypeOf(r.link_type);
        const path = resolvedPaths.get(Number(r.id)) || null;
        return Object.assign({}, r, {
            typeLabel: type ? type.label : r.link_type,
            path,
            // 켜져 있는데 경로가 안 잡히면 대상이 깨진 것이다 — 스토어프론트에서 조용히 빠진다.
            broken: Boolean(r.is_enabled) && !path,
        });
    });
}

/** GET /admin/custom-menus */
exports.getList = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM custom_menu WHERE mall_id = ? ORDER BY location ASC, sort_order ASC, id ASC',
            [MALL_ID]
        );

        // 렌더와 같은 경로로 해석해 "지금 실제로 노출되는 링크"를 보여준다.
        const nav = await navigationService.getNavigation(MALL_ID, { isLoggedIn: true });
        const resolvedPaths = new Map(
            [].concat(nav.gnb, nav.footer, nav.mobileQuick)
                .filter(m => m.isCustom)
                .map(m => [Number(m.id), m.path])
        );

        const [[cfg]] = await pool.query(
            'SELECT max_gnb_items, max_custom_items FROM navigation_config WHERE mall_id = ?', [MALL_ID]
        );

        res.render('admin/custom-menus/list', {
            layout: 'layouts/admin_layout',
            title: '커스텀 메뉴 관리',
            items: decorateRows(rows, resolvedPaths),
            locations: LOCATIONS,
            config: cfg || navigationService.DEFAULT_CONFIG,
            gnbEnabledCount: rows.filter(r => r.location === 'gnb' && r.is_enabled).length,
            saved: req.query.saved === '1',
            error: req.query.error || null,
        });
    } catch (err) {
        console.error('[customMenu] getList:', err.message);
        res.status(500).send('Server Error');
    }
};

async function renderForm(req, res, { item, error }) {
    const MALL_ID = req.adminMallId || 1;
    const [[cfg]] = await pool.query(
        'SELECT max_gnb_items, max_custom_items FROM navigation_config WHERE mall_id = ?', [MALL_ID]
    );

    res.render('admin/custom-menus/form', {
        layout: 'layouts/admin_layout',
        title: item && item.id ? '커스텀 메뉴 수정' : '커스텀 메뉴 추가',
        item,
        targets: await loadTargetOptions(MALL_ID),
        linkTypes: LINK_TYPES,
        locations: LOCATIONS,
        badgeTypes: BADGE_TYPES,
        config: cfg || navigationService.DEFAULT_CONFIG,
        error: error || null,
    });
}

/** 새 메뉴의 기본값 — GNB 맨 뒤로 간다. */
async function blankItem(mallId) {
    const [[r]] = await pool.query(
        "SELECT COALESCE(MAX(sort_order), 0) AS n FROM custom_menu WHERE mall_id = ? AND location = 'gnb'",
        [mallId]
    );
    return {
        id: null,
        display_name: '',
        link_type: 'EXHIBITION',
        link_target: null,
        link_url: '',
        location: 'gnb',
        sort_order: Number(r.n) + 1,
        is_enabled: 1,
        pc_visible: 1,
        mobile_visible: 1,
        login_required: 0,
        badge_type: null,
        new_window: 0,
        visible_start_at: null,
        visible_end_at: null,
    };
}

/** GET /admin/custom-menus/add */
exports.getAdd = async (req, res) => {
    try {
        await renderForm(req, res, { item: await blankItem(req.adminMallId || 1) });
    } catch (err) {
        console.error('[customMenu] getAdd:', err.message);
        res.status(500).send('Server Error');
    }
};

/** GET /admin/custom-menus/:id/edit */
exports.getEdit = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const [[row]] = await pool.query(
            'SELECT * FROM custom_menu WHERE id = ? AND mall_id = ? LIMIT 1',
            [Number(req.params.id), MALL_ID]
        );
        if (!row) return res.redirect('/admin/custom-menus?error=' + encodeURIComponent('메뉴를 찾을 수 없습니다.'));

        await renderForm(req, res, { item: row });
    } catch (err) {
        console.error('[customMenu] getEdit:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/custom-menus (추가) / POST /admin/custom-menus/:id (수정) */
exports.postSave = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = req.params.id ? Number(req.params.id) : null;

    try {
        const { payload, error } = await buildPayload(MALL_ID, req.body);
        if (error) {
            return renderForm(req, res, {
                item: Object.assign({ id }, req.body), // 입력값을 그대로 되돌려준다
                error,
            });
        }

        const slotError = await wouldExceedSlots(MALL_ID, payload, id);
        if (slotError) {
            return renderForm(req, res, { item: Object.assign({ id }, req.body), error: slotError });
        }

        const period = {
            visible_start_at: toDatetime(req.body.visible_start_at),
            visible_end_at: toDatetime(req.body.visible_end_at),
        };

        if (id) {
            const [r] = await pool.query(
                'UPDATE custom_menu SET ? WHERE id = ? AND mall_id = ?',
                [Object.assign({}, payload, period), id, MALL_ID]
            );
            if (!r.affectedRows) {
                return res.redirect('/admin/custom-menus?error=' + encodeURIComponent('메뉴를 찾을 수 없습니다.'));
            }
        } else {
            await pool.query(
                'INSERT INTO custom_menu SET ?',
                [Object.assign({ mall_id: MALL_ID }, payload, period)]
            );
        }

        res.redirect('/admin/custom-menus?saved=1');
    } catch (err) {
        console.error('[customMenu] postSave:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/custom-menus/:id/toggle — 목록에서 사용 여부만 뒤집는다. */
exports.postToggle = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const id = Number(req.params.id);

    try {
        const [[row]] = await pool.query(
            'SELECT * FROM custom_menu WHERE id = ? AND mall_id = ? LIMIT 1', [id, MALL_ID]
        );
        if (!row) return res.redirect('/admin/custom-menus?error=' + encodeURIComponent('메뉴를 찾을 수 없습니다.'));

        // 끄는 건 언제나 가능하고, 켤 때만 슬롯을 검사한다.
        if (!row.is_enabled) {
            const slotError = await wouldExceedSlots(
                MALL_ID, { location: row.location, is_enabled: 1 }, id
            );
            if (slotError) return res.redirect('/admin/custom-menus?error=' + encodeURIComponent(slotError));
        }

        await pool.query(
            'UPDATE custom_menu SET is_enabled = ? WHERE id = ? AND mall_id = ?',
            [row.is_enabled ? 0 : 1, id, MALL_ID]
        );
        res.redirect('/admin/custom-menus?saved=1');
    } catch (err) {
        console.error('[customMenu] postToggle:', err.message);
        res.status(500).send('Server Error');
    }
};

/** POST /admin/custom-menus/:id/delete */
exports.postDelete = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        await pool.query('DELETE FROM custom_menu WHERE id = ? AND mall_id = ?', [Number(req.params.id), MALL_ID]);
        res.redirect('/admin/custom-menus?saved=1');
    } catch (err) {
        console.error('[customMenu] postDelete:', err.message);
        res.status(500).send('Server Error');
    }
};
