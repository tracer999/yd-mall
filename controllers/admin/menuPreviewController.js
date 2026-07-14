const pool = require('../../config/db');
const navigationService = require('../../services/menu/navigationService');

/*
 * 메뉴 미리보기 (B7)
 *
 * 설계: docs/사이트개선/admin_dev_plan.md §3.3
 *
 * 조립 로직을 여기서 다시 짜지 않는다. 스토어프론트와 **같은 함수**
 * (`navigationService.getNavigation`)를 호출해야 미리보기와 실제가 어긋나지 않는다.
 * 잘린 개수도 서비스가 돌려주는 `gnbCandidateCount` 를 쓴다(커스텀 메뉴의 링크 해석까지 반영됨).
 *
 * 미리보기의 값은 "무엇이 보이는가" 보다 **"무엇이 왜 안 보이는가"** 에 있다.
 *   - `module_ready = 0`   → 켜도 렌더 제외 (죽은 링크 차단)
 *   - `is_enabled = 0`     → 운영자가 끔
 *   - `login_required`     → 비로그인 사용자에게 숨김
 *   - 노출 기간 밖         → 자동 숨김
 *   - `max_gnb_items` 초과 → 뒤에서 잘림
 *
 * PC/모바일은 서버가 기기 필터를 하지 않는다(같은 HTML 에 함께 렌더되고 뷰가 고른다).
 * 그래서 여기서도 각 항목의 pcVisible/mobileVisible 로 화면에서 거른다.
 */


const POSITION_LABELS = {
    gnb: 'GNB (상단 메뉴)',
    header_util: '헤더 유틸',
    right_rail: '우측 유틸 레일',
};

/** 렌더에서 빠진 기능 메뉴와 그 사유 */
async function findExcluded(isLoggedIn, MALL_ID) {
    const [rows] = await pool.query(`
        SELECT f.feature_code, f.position, f.default_name, f.module_ready,
               COALESCE(m.is_enabled, 0) AS is_enabled,
               COALESCE(m.login_required, 0) AS login_required,
               COALESCE(NULLIF(m.display_name, ''), f.default_name) AS name,
               m.visible_start_at, m.visible_end_at
        FROM feature_menu f
        LEFT JOIN mall_feature_menu m ON m.feature_code = f.feature_code AND m.mall_id = ?
        ORDER BY f.position, f.default_sort_order
    `, [MALL_ID]);

    const now = new Date();
    const excluded = [];
    for (const r of rows) {
        let reason = null;
        if (!Number(r.module_ready)) reason = '모듈 미구현 (켜도 노출되지 않음)';
        else if (!Number(r.is_enabled)) reason = '사용 안 함 (운영자가 끔)';
        else if (Number(r.login_required) && !isLoggedIn) reason = '로그인 필요';
        else if (r.visible_start_at && new Date(r.visible_start_at) > now) reason = '노출 기간 전';
        else if (r.visible_end_at && new Date(r.visible_end_at) < now) reason = '노출 기간 종료';
        /*
         * 콘텐츠 게이트 — 여기까지 통과했는데도 스토어프론트에 없는 유일한 사유다.
         * 이 줄이 없으면 "켜져 있는데 GNB 에 안 뜬다"가 원인 불명이 된다(설계: outlet §4-5).
         */
        else if ((await navigationService.checkContentGate(MALL_ID, r.feature_code)) === false) {
            reason = '콘텐츠 부족 — 채울 내용이 없어 자동으로 숨겨짐';
        }
        if (reason) excluded.push(Object.assign({}, r, {
            reason,
            positionLabel: POSITION_LABELS[r.position] || r.position,
        }));
    }
    return excluded;
}

/*
 * GNB 통합 편집(unified 전용)
 *
 * unified 는 카테고리 1뎁스와 일반 메뉴가 **하나의 순서 축**에 놓인다(navigationService.buildUnified).
 * 그 축이 세 테이블에 흩어져 있어서(categories.display_order / mall_feature_menu.sort_order /
 * custom_menu.sort_order) 화면이 하나가 아니면 운영자가 순서를 맞출 수 없다.
 * → 여기서 셋을 한 목록으로 모아 보여주고, 저장할 때 1..N 을 각 테이블에 되돌려 쓴다.
 *
 * 노출은 기기별 플래그(pc_visible/mobile_visible)로만 다룬다.
 * 카테고리의 is_active 는 건드리지 않는다 — 그건 상품 목록 등 GNB 밖까지 죽인다.
 */
const KEY = {
    category: id => `cat:${id}`,
    feature: code => `feat:${code}`,
    custom: id => `cust:${id}`,
};

async function loadGnbItems(mallId, withCategories) {
    // split(기본형)은 카테고리가 GNB 축이 아니라 **별도 패널**이다 → 이 목록에서 제외한다.
    // 여기서 순서를 매기면 카테고리 관리의 순서를 GNB 기준으로 덮어써 패널 순서가 뒤틀린다.
    const [cats] = withCategories ? await pool.query(`
        SELECT id, name, display_order AS sortOrder, pc_visible AS pcVisible, mobile_visible AS mobileVisible
          FROM categories
         WHERE mall_id = ? AND type = 'NORMAL' AND is_active = 1 AND depth = 1
         ORDER BY display_order ASC, id ASC
    `, [mallId]) : [[]];

    /*
     * CATEGORY 행의 뜻이 모드마다 다르다.
     *   split   — GNB 최좌측 '전체 카테고리' **버튼**. 순서·노출을 정할 실제 메뉴다 → 목록에 넣는다.
     *   unified — 카테고리 1뎁스를 통째로 켜고 끄는 **게이트**. 순서는 카테고리 항목마다 따로 있다 → 뺀다.
     */
    const [feats] = await pool.query(`
        SELECT f.feature_code AS code,
               COALESCE(NULLIF(m.display_name, ''), f.default_name) AS name,
               m.sort_order AS sortOrder, m.is_enabled AS isEnabled,
               m.pc_visible AS pcVisible, m.mobile_visible AS mobileVisible
          FROM mall_feature_menu m
          JOIN feature_menu f ON f.feature_code = m.feature_code
         WHERE m.mall_id = ? AND f.position = 'gnb'
           AND f.module_ready = 1
           ${withCategories ? 'AND f.feature_code <> ?' : ''}
         ORDER BY m.sort_order ASC
    `, withCategories ? [mallId, 'CATEGORY'] : [mallId]);

    const [customs] = await pool.query(`
        SELECT id, display_name AS name, sort_order AS sortOrder, is_enabled AS isEnabled,
               pc_visible AS pcVisible, mobile_visible AS mobileVisible
          FROM custom_menu
         WHERE mall_id = ? AND location = 'gnb'
         ORDER BY sort_order ASC, id ASC
    `, [mallId]);

    const items = [
        ...cats.map(c => ({ key: KEY.category(c.id), kind: 'category', name: c.name,
            sortOrder: Number(c.sortOrder) || 0, isEnabled: 1, canDisable: false,
            pcVisible: Number(c.pcVisible), mobileVisible: Number(c.mobileVisible) })),
        ...feats.map(f => ({ key: KEY.feature(f.code), kind: 'feature', name: f.name, code: f.code,
            sortOrder: Number(f.sortOrder) || 0, isEnabled: Number(f.isEnabled), canDisable: true,
            pcVisible: Number(f.pcVisible), mobileVisible: Number(f.mobileVisible) })),
        ...customs.map(c => ({ key: KEY.custom(c.id), kind: 'custom', name: c.name,
            sortOrder: Number(c.sortOrder) || 0, isEnabled: Number(c.isEnabled), canDisable: true,
            pcVisible: Number(c.pcVisible), mobileVisible: Number(c.mobileVisible) })),
    ];

    // 화면 순서 = 스토어프론트 순서. 같은 규칙(bySortOrder)으로 정렬한다.
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** GET /admin/menu-preview */
exports.getPreview = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    try {
        const opts = {
            isLoggedIn: req.query.login === '1',
            device: req.query.device === 'mobile' ? 'mobile' : 'pc',
        };

        // 스토어프론트와 동일한 경로
        const nav = await navigationService.getNavigation(MALL_ID, { isLoggedIn: opts.isLoggedIn });

        const maxGnb = Number(nav.config.max_gnb_items) || 8;
        const gnbTruncated = Math.max(0, (nav.gnbCandidateCount || 0) - nav.gnb.length);
        const isUnified = nav.config.nav_mode === 'unified';

        res.render('admin/menu-preview/index', {
            layout: 'layouts/admin_layout',
            title: '메뉴 미리보기',
            nav,
            opts,
            excluded: await findExcluded(opts.isLoggedIn, MALL_ID),
            maxGnb,
            gnbTruncated,
            /*
             * GNB 순서·노출 편집. 두 모드 모두 제공하되 담기는 항목이 다르다.
             *   unified — 카테고리 1뎁스 + 일반 메뉴 (하나의 순서 축)
             *   split   — 일반 메뉴만 (카테고리는 별도 패널이라 GNB 순서와 무관)
             * 저장은 원본 테이블(categories / mall_feature_menu / custom_menu)을 직접 고치므로
             * 카테고리 관리·일반 메뉴 관리 화면과 값이 자동으로 연동된다.
             */
            gnbItems: await loadGnbItems(MALL_ID, isUnified),
            saved: req.query.saved === '1',
        });
    } catch (err) {
        console.error('[menuPreview] getPreview:', err.message);
        res.status(500).send('Server Error');
    }
};

/**
 * POST /admin/menu-preview/gnb
 *
 * body: order[] = ['cat:3001', 'feat:BEST', ...]  (화면 표시 순서 그대로)
 *       enabled[key] / pc[key] / mo[key] = '1'    (체크된 것만 온다 → 없으면 0)
 *
 * 순서는 목록 인덱스로 1..N 을 다시 매긴다. 세 테이블이 하나의 축을 공유하므로
 * 값을 그대로 쓰면(예: 카테고리 3, 메뉴 3) 동순위가 생겨 순서가 흔들린다.
 */
exports.postGnb = async (req, res) => {
    const MALL_ID = req.adminMallId || 1;
    const order = [].concat(req.body.order || []).map(String);
    const flag = (bag, key) => (bag && String(bag[key]) === '1' ? 1 : 0);

    const conn = await pool.getConnection();
    try {
        // 화면이 보낸 키를 그대로 믿지 않는다 — 이 몰의 실제 GNB 항목만 갱신한다(타몰 오염 차단).
        // split 에서는 카테고리 키가 아예 유효 목록에 없으므로 조작된 cat: 키가 카테고리 순서를 덮어쓰지 못한다.
        const config = await navigationService.getConfig(MALL_ID);
        const valid = new Set((await loadGnbItems(MALL_ID, config.nav_mode === 'unified')).map(i => i.key));

        await conn.beginTransaction();
        let seq = 0;
        for (const key of order) {
            if (!valid.has(key)) continue;
            seq += 1;

            const pc = flag(req.body.pc, key);
            const mo = flag(req.body.mo, key);
            const [kind, raw] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];

            if (kind === 'cat') {
                await conn.query(
                    `UPDATE categories SET display_order = ?, pc_visible = ?, mobile_visible = ?
                      WHERE id = ? AND mall_id = ?`,
                    [seq, pc, mo, Number(raw), MALL_ID],
                );
            } else if (kind === 'feat') {
                await conn.query(
                    `UPDATE mall_feature_menu SET sort_order = ?, is_enabled = ?, pc_visible = ?, mobile_visible = ?
                      WHERE mall_id = ? AND feature_code = ?`,
                    [seq, flag(req.body.enabled, key), pc, mo, MALL_ID, raw],
                );
            } else if (kind === 'cust') {
                await conn.query(
                    `UPDATE custom_menu SET sort_order = ?, is_enabled = ?, pc_visible = ?, mobile_visible = ?
                      WHERE id = ? AND mall_id = ?`,
                    [seq, flag(req.body.enabled, key), pc, mo, Number(raw), MALL_ID],
                );
            }
        }
        await conn.commit();
        res.redirect(`/admin/menu-preview?device=${req.body.device === 'mobile' ? 'mobile' : 'pc'}&login=${req.body.login === '1' ? 1 : 0}&saved=1`);
    } catch (err) {
        await conn.rollback();
        console.error('[menuPreview] postGnb:', err.message);
        res.status(500).send('Server Error');
    } finally {
        conn.release();
    }
};
