const pool = require('../../config/db');

/*
 * 내비게이션 조립 서비스 (M4)
 *
 * 통제된 동적 메뉴 시스템의 읽기 경로.
 *   feature_menu      기능/시스템 메뉴 카탈로그 (position 고정, module_ready 게이트)
 *   mall_feature_menu 몰별 ON/OFF·표시명·순서
 *   custom_menu       몰별 커스텀 메뉴 (위치 선택 가능, 슬롯 제한)
 *   navigation_config 몰별 정책 (커스텀 슬롯 수, 카테고리 최대 뎁스 등)
 *
 * 렌더 조건은 항상 `is_enabled AND module_ready` 다.
 * → 모듈 미구현 메뉴는 관리자가 켜도 노출되지 않는다(죽은 링크 구조적 차단).
 *
 * PC/모바일은 같은 HTML 에 함께 렌더되므로 서버에서 기기 필터를 하지 않는다.
 * 대신 각 항목에 pcVisible/mobileVisible 을 담아 뷰가 선택하게 한다.
 *
 * 자세한 설계: docs/사이트개선/frontend_dev_plan.md §5
 */

const DEFAULT_CONFIG = Object.freeze({
    mall_id: 1,
    header_layout_type: 'main_right_utility_v1',
    category_display_type: 'dropdown',
    max_gnb_items: 8,
    max_custom_items: 3,
    category_max_depth: 3,
    use_mega_menu: 0,
    use_search_bar: 1,
});

/** 노출 기간 조건. 로그인 조건은 앱 레이어에서 건다. */
function periodClause(alias) {
    const a = alias ? `${alias}.` : '';
    return `AND (${a}visible_start_at IS NULL OR ${a}visible_start_at <= NOW())
            AND (${a}visible_end_at   IS NULL OR ${a}visible_end_at   >= NOW())`;
}

/** GNB 최좌측 고정 버튼(전체 카테고리 드롭다운) */
const CATEGORY_CODE = 'CATEGORY';

/** 강조 배지 화이트리스트 — 그 외 값은 무시한다(뷰에 임의 문자열이 새어나가지 않도록) */
const BADGE_TYPES = ['NEW', 'HOT', 'SALE'];

/**
 * 커스텀 메뉴 link_type → href 해석기.
 * 실제 라우트가 있는 유형만 등록한다. 미등록 유형(EXHIBITION/PRODUCT_GROUP)은
 * 모듈이 없으므로 렌더에서 제외한다 — feature_menu.module_ready 와 같은 원칙(죽은 링크 차단).
 */
const LINK_RESOLVERS = {
    INTERNAL_PAGE: (m) => m.linkUrl || null,
    EXTERNAL_URL: (m) => m.linkUrl || null,
    CATEGORY: (m) => (m.linkTarget ? `/products/category/${m.linkTarget}` : null),
    BRAND: (m) => (m.linkTarget ? `/products/brand/${m.linkTarget}` : null),
    // EXHIBITION, PRODUCT_GROUP: 모듈 미구현 → 의도적으로 미등록
};

function normalizeBadge(v) {
    const b = String(v || '').trim().toUpperCase();
    return BADGE_TYPES.includes(b) ? b : null;
}

async function getConfig(mallId) {
    const [rows] = await pool.query('SELECT * FROM navigation_config WHERE mall_id = ? LIMIT 1', [mallId]);
    return Object.assign({}, DEFAULT_CONFIG, rows[0] || {});
}

/** 몰에서 켜져 있고 모듈이 구현된 기능/시스템 메뉴 */
async function getFeatureMenus(mallId) {
    const [rows] = await pool.query(`
        SELECT
            f.feature_code                                   AS featureCode,
            f.position                                       AS position,
            f.default_path                                   AS path,
            f.is_system                                      AS isSystem,
            f.is_required                                    AS isRequired,
            COALESCE(NULLIF(m.display_name, ''), f.default_name) AS name,
            m.sort_order                                     AS sortOrder,
            m.login_required                                 AS loginRequired,
            m.pc_visible                                     AS pcVisible,
            m.mobile_visible                                 AS mobileVisible,
            m.badge_type                                     AS badgeType
        FROM mall_feature_menu m
        JOIN feature_menu f ON f.feature_code = m.feature_code
        WHERE m.mall_id = ?
          AND m.is_enabled = 1
          AND f.module_ready = 1
          ${periodClause('m')}
        ORDER BY f.position ASC, m.sort_order ASC, f.default_sort_order ASC
    `, [mallId]);
    return rows.map(r => Object.assign({}, r, { badgeType: normalizeBadge(r.badgeType) }));
}

/**
 * 몰별 커스텀 메뉴 (위치별 슬롯 제한은 호출부에서 적용)
 *
 * link_type 별로 href 를 파생한다. 라우트가 없는 유형(EXHIBITION/PRODUCT_GROUP)이나
 * 대상이 비어 href 를 만들 수 없는 행은 **렌더에서 제외**한다(죽은 링크 차단).
 */
async function getCustomMenus(mallId) {
    const [rows] = await pool.query(`
        SELECT
            id, display_name AS name, link_type AS linkType, link_url AS linkUrl,
            link_target AS linkTarget, badge_type AS badgeType,
            location, sort_order AS sortOrder, login_required AS loginRequired,
            pc_visible AS pcVisible, mobile_visible AS mobileVisible,
            new_window AS newWindow
        FROM custom_menu
        WHERE mall_id = ? AND is_enabled = 1
        ${periodClause()}
        ORDER BY location ASC, sort_order ASC, id ASC
    `, [mallId]);

    const resolved = [];
    for (const r of rows) {
        const resolver = LINK_RESOLVERS[r.linkType];
        if (!resolver) continue; // 모듈 미구현 링크 유형 → 미노출
        const path = resolver(r);
        if (!path) continue;     // 대상 누락 → 미노출

        resolved.push(Object.assign({}, r, {
            path,
            isCustom: true,
            badgeType: normalizeBadge(r.badgeType),
            // 외부 링크는 항상 새 창 (관리자 설정과 무관하게 강제)
            newWindow: r.linkType === 'EXTERNAL_URL' ? 1 : r.newWindow,
        }));
    }
    return resolved;
}

/**
 * parent_id 기반 재귀 트리.
 *
 * rows 는 이미 필터링된 목록(활성 + 뎁스 이내)이다. 부모가 필터에서 빠졌다면
 * 자식도 함께 숨긴다 — 최상위로 승격시키면 부모를 비활성화했을 때 자식이
 * 갑자기 GNB 최상위에 튀어나온다.
 */
function buildTree(rows) {
    const byId = {};
    const roots = [];
    rows.forEach((r) => { byId[r.id] = Object.assign({}, r, { children: [] }); });
    rows.forEach((r) => {
        const node = byId[r.id];
        if (!r.parent_id) { roots.push(node); return; } // 최상위
        const parent = byId[r.parent_id];
        if (parent) parent.children.push(node); // 부모가 없으면 이 노드는 렌더하지 않는다
    });
    return roots;
}

/** 카테고리 드롭다운용 트리 (NORMAL, 활성, 최대 뎁스 이내) */
async function getCategoryTree(mallId, maxDepth) {
    const [rows] = await pool.query(`
        SELECT id, name, slug, parent_id, depth, display_order, pc_visible, mobile_visible
        FROM categories
        WHERE type = 'NORMAL' AND mall_id = ? AND is_active = 1 AND depth <= ?
        ORDER BY display_order ASC, id ASC
    `, [mallId, maxDepth]);
    return buildTree(rows);
}

/** 로그인 필요 메뉴는 비로그인 사용자에게 감춘다. */
function visibleTo(item, isLoggedIn) {
    return !Number(item.loginRequired) || isLoggedIn;
}

/**
 * 위치별로 조립된 내비게이션을 돌려준다.
 *
 * @param {number} mallId
 * @param {{ isLoggedIn?: boolean }} opts
 * @returns {Promise<{
 *   config, categoryTree, categoryButton,
 *   gnb, rightRail, headerUtil, footer, mobileQuick
 * }>}
 */
async function getNavigation(mallId = 1, opts = {}) {
    const isLoggedIn = Boolean(opts.isLoggedIn);
    const config = await getConfig(mallId);

    const [features, customs, categoryTree] = await Promise.all([
        getFeatureMenus(mallId),
        getCustomMenus(mallId),
        getCategoryTree(mallId, Number(config.category_max_depth) || 3),
    ]);

    const byPosition = (pos) => features.filter(f => f.position === pos && visibleTo(f, isLoggedIn));

    // 커스텀 메뉴는 위치별 슬롯 제한을 서버에서 강제한다.
    const customsAt = (location, limit) =>
        customs.filter(c => c.location === location && visibleTo(c, isLoggedIn)).slice(0, limit);

    // GNB = [고정 카테고리 버튼] + [기능 메뉴] + [커스텀 슬롯]
    const gnbAll = byPosition('gnb');
    const categoryButton = gnbAll.find(f => f.featureCode === CATEGORY_CODE) || null;
    const gnbFeatures = gnbAll.filter(f => f.featureCode !== CATEGORY_CODE);
    const gnbCustoms = customsAt('gnb', Number(config.max_custom_items) || 0);
    const maxGnb = Number(config.max_gnb_items) || 8;

    return {
        config,
        categoryTree,
        categoryButton, // null 이면 카테고리 버튼 미노출
        gnb: gnbFeatures.concat(gnbCustoms).slice(0, maxGnb),
        rightRail: byPosition('right_rail'),
        headerUtil: byPosition('header_util'),
        footer: byPosition('footer').concat(customsAt('footer', 20)),
        mobileQuick: byPosition('mobile_quick').concat(customsAt('mobile_quick', 5)),
    };
}

module.exports = {
    getNavigation,
    getConfig,
    getCategoryTree,
    buildTree,
    DEFAULT_CONFIG,
    BADGE_TYPES,
    LINK_RESOLVERS,
};
