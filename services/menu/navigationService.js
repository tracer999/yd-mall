const pool = require('../../config/db');
const exhibitionService = require('../exhibition/exhibitionService');

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
    // GNB 조립 알고리즘. 'split' = 현행(카테고리 버튼 + 평면 메뉴), 'unified' = 카테고리가 GNB 로 승격.
    // navigation_config 행이 없는 몰도 현행 동작으로 폴백해야 하므로 기본값은 'split' 이다.
    nav_mode: 'split',
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
 *
 * 실제 라우트가 있는 유형만 등록한다(PRODUCT_GROUP 은 모듈 미구현 → 의도적으로 미등록).
 *
 * ⚠️ 대상 id 를 그대로 URL 에 박으면 안 된다. 미발행·삭제·타몰 대상을 가리키는 메뉴가
 * GNB 에 404 링크로 나간다. 그래서 리소스 유형은 `ctx`(사전 조회한 유효 대상)를 통해서만
 * 경로를 만든다 — ctx 에 없으면 null 을 돌려주고 렌더에서 빠진다.
 * feature_menu.module_ready 와 같은 원칙이다(죽은 링크 구조적 차단).
 */
const LINK_RESOLVERS = {
    INTERNAL_PAGE: (m) => m.linkUrl || null,
    EXTERNAL_URL: (m) => m.linkUrl || null,
    CATEGORY: (m, ctx) => {
        const c = ctx.categories.get(Number(m.linkTarget));
        return c && c.type === 'NORMAL' ? `/products/category/${c.id}` : null;
    },
    BRAND: (m, ctx) => {
        const c = ctx.categories.get(Number(m.linkTarget));
        return c && c.type === 'BRAND' ? `/products/brand/${c.id}` : null;
    },
    // 기획전·전문관은 같은 테이블이다. detailPath 가 유형에서 정규 URL 을 파생하므로
    // 전문관은 /specialty/{slug} 로, 기획전은 /exhibition/{slug} 로 나간다(301 없음).
    EXHIBITION: (m, ctx) => {
        const e = ctx.exhibitions.get(Number(m.linkTarget));
        return e ? e.detailPath : null;
    },
};

/** 리소스형 link_type 이 참조하는 대상을 한 번에 조회한다(메뉴 행마다 조인하지 않도록). */
async function loadLinkContext(mallId, rows) {
    const targetsOf = (types) => rows
        .filter(r => types.includes(r.linkType) && r.linkTarget)
        .map(r => Number(r.linkTarget));

    const exhibitionIds = targetsOf(['EXHIBITION']);
    const categoryIds = targetsOf(['CATEGORY', 'BRAND']);

    const [exhibitions, categories] = await Promise.all([
        exhibitionIds.length
            ? exhibitionService.getLinkTargetsByIds(mallId, exhibitionIds)
            : Promise.resolve(new Map()),
        categoryIds.length
            ? loadCategoryTargets(mallId, categoryIds)
            : Promise.resolve(new Map()),
    ]);

    return { exhibitions, categories };
}

/** 활성 카테고리/브랜드만. 비활성·타몰은 돌려주지 않는다(→ 메뉴 미노출). */
async function loadCategoryTargets(mallId, ids) {
    const list = [...new Set(ids.filter(n => Number.isInteger(n) && n > 0))];
    if (!list.length) return new Map();

    const [rows] = await pool.query(`
        SELECT id, type FROM categories
         WHERE mall_id = ? AND is_active = 1
           AND id IN (${list.map(() => '?').join(',')})
    `, [mallId, ...list]);

    return new Map(rows.map(r => [Number(r.id), r]));
}

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

    const menus = rows.map(r => Object.assign({}, r, { badgeType: normalizeBadge(r.badgeType) }));
    return applyContentGates(mallId, menus);
}

/*
 * 콘텐츠 게이트 — is_enabled·module_ready 를 통과했더라도, **채울 콘텐츠가 없으면 메뉴를 뺀다.**
 *
 * 왜 필요한가: module_ready 는 "모듈이 개발됐는가"만 본다. 모듈이 있어도 관리자가 상품을
 * 안 넣으면 메뉴를 눌렀을 때 빈 화면이 나온다. 실제로 아울렛이 그 상태였다(설계서 §1-1).
 * 여기서 막으면 관리자가 메뉴를 켠 채 방치해도 고객은 죽은 링크를 보지 않는다.
 *
 * 게이트가 걸린 메뉴만 카운트 쿼리를 돈다. 메뉴에 없으면 조회 자체를 하지 않는다.
 */
const CONTENT_GATES = {
    // 아울렛 — 판매중 상품이 몰 설정의 최소 노출 수(outlet_setting.min_product_count)에 미달하면 숨긴다.
    OUTLET: async (mallId) => {
        const outletService = require('../outlet/outletService');
        const [setting, count] = await Promise.all([
            outletService.getSetting(mallId),
            outletService.countLiveProducts(mallId),
        ]);
        return count >= (setting.min_product_count || 0);
    },
};

/*
 * 게이트 판정 캐시.
 *
 * menuData 미들웨어는 **모든 페이지**에서 돈다. 캐시가 없으면 홈을 포함한 전 페이지가
 * 매번 COUNT + JOIN 쿼리를 친다 — 메뉴 하나 때문에 사이트 전체에 상시 부하가 걸린다.
 *
 * 상품이 임계치를 넘나드는 순간이 30초 늦게 반영되는 건 문제가 안 된다.
 * 관리자가 상품을 등록·삭제하거나 설정을 바꾸면 invalidateContentGate() 로 즉시 비운다.
 */
const GATE_TTL_MS = 30_000;
const gateCache = new Map();   // `${mallId}:${featureCode}` → { value, expiresAt }

function invalidateContentGate(mallId = null) {
    if (mallId === null) return gateCache.clear();
    [...gateCache.keys()]
        .filter(k => k.startsWith(`${mallId}:`))
        .forEach(k => gateCache.delete(k));
}

async function checkGate(mallId, featureCode) {
    const key = `${mallId}:${featureCode}`;
    const hit = gateCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    let value;
    try {
        value = await CONTENT_GATES[featureCode](mallId);
    } catch (err) {
        // 게이트가 터졌다고 메뉴 전체를 날리지 않는다. 다만 콘텐츠 유무를 모르므로 숨기는 쪽이 안전하다
        // — 빈 메뉴를 보여주느니 메뉴가 없는 편이 낫다. 실패는 캐시하지 않는다(다음 요청에 재시도).
        console.error(`[navigation] 콘텐츠 게이트 실패 (${featureCode}):`, err.message);
        return false;
    }

    gateCache.set(key, { value, expiresAt: Date.now() + GATE_TTL_MS });
    return value;
}

async function applyContentGates(mallId, menus) {
    const gated = menus.filter(m => CONTENT_GATES[m.featureCode]);
    if (!gated.length) return menus;

    const verdicts = await Promise.all(
        gated.map(async m => [m.featureCode, await checkGate(mallId, m.featureCode)]),
    );

    const blocked = new Set(verdicts.filter(([, ok]) => !ok).map(([code]) => code));
    return blocked.size ? menus.filter(m => !blocked.has(m.featureCode)) : menus;
}

/**
 * 몰별 커스텀 메뉴 (위치별 슬롯 제한은 호출부에서 적용)
 *
 * link_type 별로 href 를 파생한다. 라우트가 없는 유형(PRODUCT_GROUP)이거나 대상이
 * 비었거나 **대상이 더 이상 유효하지 않은**(미발행·삭제·비활성·타몰) 행은 렌더에서 제외한다.
 * 관리자가 메뉴를 켜 뒀더라도 링크가 깨졌으면 노출하지 않는다.
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

    if (!rows.length) return []; // 커스텀 메뉴가 없으면 대상 조회도 하지 않는다

    const ctx = await loadLinkContext(mallId, rows);

    const resolved = [];
    for (const r of rows) {
        const resolver = LINK_RESOLVERS[r.linkType];
        if (!resolver) continue; // 모듈 미구현 링크 유형 → 미노출
        const path = resolver(r, ctx);
        if (!path) continue;     // 대상 누락·무효 → 미노출

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

/**
 * 카테고리 트리의 단일 소스.
 *
 * maxDepth 를 주면 그 뎁스까지만(=GNB 표시 규칙), 안 주면 활성 전체를 돌려준다.
 * 상품 집계(서브트리)는 표시 뎁스 상한과 무관해야 하므로 후자를 쓴다 —
 * 상한을 낮췄다고 하위 카테고리 상품이 목록에서 사라지면 안 된다.
 */
async function getCategoryRows(mallId, maxDepth) {
    const hasDepth = Number.isFinite(Number(maxDepth));
    const [rows] = await pool.query(`
        SELECT id, name, slug, parent_id, depth, display_order, pc_visible, mobile_visible,
               logo_image_path, description
        FROM categories
        WHERE type = 'NORMAL' AND mall_id = ? AND is_active = 1
          ${hasDepth ? 'AND depth <= ?' : ''}
        ORDER BY display_order ASC, id ASC
    `, hasDepth ? [mallId, Number(maxDepth)] : [mallId]);
    return rows;
}

/** 카테고리 드롭다운용 트리 (NORMAL, 활성, 최대 뎁스 이내) */
async function getCategoryTree(mallId, maxDepth) {
    return buildTree(await getCategoryRows(mallId, maxDepth));
}

/**
 * 카테고리 목록 페이지가 필요로 하는 문맥.
 *
 * 반환:
 *   current       선택 노드 (트리에 없으면 전체 null 반환 → 호출부가 기존 레이아웃으로 폴백)
 *   ancestors     루트→부모 순서 (브레드크럼)
 *   children      자식 목록
 *   siblings      형제 목록 (자기 포함)
 *   panelItems    패널에 깔 목록. 자식이 있으면 children, **리프면 siblings**.
 *                 리프에서 children 을 쓰면 패널이 통째로 빈다.
 *   panelParent   panelItems 의 부모 (리프일 때 부모, 아니면 current)
 *   descendantIds current + 모든 후손 id — 상품 서브트리 집계용
 */
async function getCategoryContext(mallId, categoryId) {
    const id = Number(categoryId);
    if (!Number.isInteger(id) || id <= 0) return null;

    const rows = await getCategoryRows(mallId);
    const byId = new Map(rows.map(r => [r.id, r]));
    const current = byId.get(id);
    if (!current) return null; // 비활성·타몰·THEME/BRAND → 호출부가 폴백

    const childrenOf = (pid) => rows.filter(r => r.parent_id === pid);

    const ancestors = [];
    for (let p = current.parent_id; p; ) {
        const node = byId.get(p);
        if (!node) break;
        ancestors.unshift(node);
        p = node.parent_id;
    }

    const children = childrenOf(current.id);
    const siblings = current.parent_id ? childrenOf(current.parent_id) : rows.filter(r => !r.parent_id);

    // BFS 로 후손 수집. rows 는 순환이 없다고 보장할 수 없으므로(depthGuard 는 쓰기 경로),
    // 방문 집합으로 무한 루프를 막는다.
    const descendantIds = [];
    const seen = new Set();
    const queue = [current.id];
    while (queue.length) {
        const cur = queue.shift();
        if (seen.has(cur)) continue;
        seen.add(cur);
        descendantIds.push(cur);
        childrenOf(cur).forEach(c => queue.push(c.id));
    }

    const isLeaf = children.length === 0;
    return {
        current,
        ancestors,
        children,
        siblings,
        panelItems: isLeaf ? siblings : children,
        panelParent: isLeaf ? (ancestors[ancestors.length - 1] || null) : current,
        isLeaf,
        descendantIds,
    };
}

/** 로그인 필요 메뉴는 비로그인 사용자에게 감춘다. */
function visibleTo(item, isLoggedIn) {
    return !Number(item.loginRequired) || isLoggedIn;
}

/**
 * 카테고리 트리 노드 → GNB 노드 (unified 전용, 재귀).
 *
 * 기능/커스텀 메뉴와 같은 필드(name·path·sortOrder·pcVisible…)를 갖춰야 뷰가 하나의 코드로
 * 셋을 다 그린다. 링크는 PC 패널과 같은 `/products/category/:id` 로 통일한다
 * (모바일 하단바의 `/products?categoryId=` 와 갈라져 있던 것을 여기서 맞춘다).
 */
function categoryToNode(cat) {
    return {
        kind: 'category',
        categoryId: Number(cat.id),
        name: cat.name,
        path: `/products/category/${cat.id}`,
        featureCode: null,
        isCustom: false,
        newWindow: 0,
        badgeType: null,
        loginRequired: 0,
        pcVisible: cat.pc_visible === undefined ? 1 : Number(cat.pc_visible),
        mobileVisible: cat.mobile_visible === undefined ? 1 : Number(cat.mobile_visible),
        sortOrder: Number(cat.display_order) || 0,
        children: (cat.children || []).map(categoryToNode),
    };
}

/** 기능/커스텀 메뉴 → GNB 노드. 기능·커스텀 메뉴 자체는 평면이다(children 없음). */
function menuToNode(item) {
    return Object.assign({}, item, {
        kind: item.isCustom ? 'custom' : 'feature',
        children: [],
    });
}

/** 카테고리 트리를 id → 노드 로 평탄화 (커스텀 메뉴가 가리키는 카테고리를 O(1) 로 찾기 위해) */
function indexTree(nodes, map = new Map()) {
    (nodes || []).forEach((n) => {
        map.set(Number(n.id), n);
        indexTree(n.children, map);
    });
    return map;
}

/**
 * split — 기본형 스킨. 카테고리는 GNB 최좌측 고정 버튼 하나에 매달린 별도 패널이다.
 * 기존 getNavigation 본문을 그대로 옮긴 것이라 동작이 바뀌지 않는다.
 */
function buildSplit(config, gnbAll, gnbCustoms) {
    const categoryButton = gnbAll.find(f => f.featureCode === CATEGORY_CODE) || null;
    const gnbFeatures = gnbAll.filter(f => f.featureCode !== CATEGORY_CODE);
    const maxGnb = Number(config.max_gnb_items) || 8;

    /*
     * 기능 메뉴와 커스텀 메뉴는 **동등한 GNB 항목**이다. 하나의 sort_order 축으로 병합 정렬한다.
     *
     * 단순 concat 하면 커스텀이 항상 기능 메뉴 뒤로 밀려 원하는 자리에 놓을 수 없고,
     * 총량(max_gnb_items)을 넘길 때 커스텀만 잘려 나간다. 몰마다 기능 메뉴를 끄고 그 자리에
     * 개별 기획전·전문관을 올리는 것이 이 빌더의 정상 구성이므로 순서는 통합되어야 한다.
     *
     * Array#sort 는 안정 정렬이라 sort_order 가 같으면 기능 메뉴가 앞선다.
     */
    const gnbCandidates = gnbFeatures.concat(gnbCustoms)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
        .map(menuToNode);

    return {
        categoryButton, // null 이면 카테고리 버튼 미노출
        gnb: gnbCandidates.slice(0, maxGnb),
        // 자르기 전 후보 수. 관리자 메뉴 미리보기(B7)가 "몇 개가 잘렸는지" 보여주는 데 쓴다.
        // 스토어프론트는 이 값을 읽지 않는다.
        gnbCandidateCount: gnbCandidates.length,
        gnbCategoryCount: 0,
    };
}

/**
 * unified — 드로어형/통합 스킨. 카테고리 1뎁스와 일반 메뉴가 **하나의 순서 축**에 놓인다.
 *
 * 순서 축은 하나다. 카테고리는 `categories.display_order`, 기능/커스텀 메뉴는 `sort_order` —
 * 세 소스의 값을 같은 수직선 위에서 병합 정렬한다. 그래서 운영자는 "카테고리 블록을 통째로
 * 어디에 끼울지"가 아니라 **항목 단위로 순서를 섞을 수 있다**(메뉴 미리보기 화면에서 편집).
 *
 * 카테고리가 메뉴에 들어오는 경로는 두 가지이고, 둘은 함께 쓸 수 있다.
 *
 *  1) **카테고리 1뎁스 전체** — mall_feature_menu 의 CATEGORY 행이 켜져 있으면 1뎁스가
 *     각각 하나의 GNB 항목이 된다(하위 뎁스는 children). 끄면 카테고리가 통째로 빠진다
 *     — 일반 메뉴만 있는 몰. CATEGORY 행의 sort_order 는 더 이상 쓰이지 않는다(항목별 순서가 있다).
 *
 *  2) **개별 카테고리/브랜드 메뉴** — 커스텀 메뉴(link_type='CATEGORY')로 원하는 카테고리만
 *     골라 GNB 에 꽂는다. 이때 **하위 카테고리가 자동으로 하위 메뉴로 붙는다**(뎁스 상속).
 *
 * 기능·커스텀 메뉴 자체는 평면이다. 계층을 갖는 것은 카테고리뿐이다.
 */
function buildUnified(config, gnbAll, gnbCustoms, categoryTree) {
    const categoryEntry = gnbAll.find(f => f.featureCode === CATEGORY_CODE) || null;
    const catById = indexTree(categoryTree);

    const menus = gnbAll.filter(f => f.featureCode !== CATEGORY_CODE)
        .concat(gnbCustoms)
        .sort(bySortOrder)
        .map((item) => {
            const node = menuToNode(item);

            // 카테고리를 가리키는 커스텀 메뉴는 그 카테고리의 하위 트리를 상속한다.
            // (트리는 이미 category_max_depth 로 잘려 있으므로 뎁스 상한이 저절로 지켜진다)
            if (item.isCustom && item.linkType === 'CATEGORY') {
                const cat = catById.get(Number(item.linkTarget));
                if (cat) node.children = (cat.children || []).map(categoryToNode);
            }
            return node;
        });

    const categoryNodes = categoryEntry ? categoryTree.map(categoryToNode) : [];

    /*
     * 절단 규칙이 split 과 다르다. max_gnb_items 로 통째로 자르면 카테고리가 잘려나가
     * **스토어가 반토막 난다**(unified 에선 카테고리가 메뉴의 본체다).
     * → 상한은 **일반 메뉴에만** 적용한다(navigation_config.max_gnb_items 의 주석 그대로:
     *   "카테고리 버튼 제외"). 카테고리 수가 상한과 같아도 일반 메뉴가 통째로 사라지지 않는다.
     */
    const maxGnb = Number(config.max_gnb_items) || 8;
    const keptMenus = menus.slice(0, maxGnb);

    // 통합 정렬 — 카테고리와 일반 메뉴가 같은 sortOrder 축에서 섞인다.
    const gnb = keptMenus.concat(categoryNodes).sort(bySortOrder);

    return {
        categoryButton: null, // unified 엔 별도 카테고리 버튼이 없다
        gnb,
        gnbCandidateCount: menus.length + categoryNodes.length,
        gnbCategoryCount: categoryNodes.length,
    };
}

/** 하나의 순서 축. 동순위는 안정 정렬에 맡긴다(입력 순서 유지). */
function bySortOrder(a, b) {
    return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
}

/**
 * 위치별로 조립된 내비게이션을 돌려준다.
 *
 * GNB 조립 방식은 navigation_config.nav_mode 가 정한다(split=기본형 스킨 / unified=드로어형 스킨).
 * 두 방식 모두 gnb[] 항목이 같은 노드 형태(kind·children 포함)라 뷰가 한 코드로 그린다.
 *
 * @param {number} mallId
 * @param {{ isLoggedIn?: boolean }} opts
 * @returns {Promise<{
 *   config, categoryTree, categoryButton,
 *   gnb, gnbCandidateCount, gnbCategoryCount,
 *   rightRail, headerUtil, footer, mobileQuick
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

    const gnbAll = byPosition('gnb');
    const gnbCustoms = customsAt('gnb', Number(config.max_custom_items) || 0);

    const built = config.nav_mode === 'unified'
        ? buildUnified(config, gnbAll, gnbCustoms, categoryTree)
        : buildSplit(config, gnbAll, gnbCustoms);

    return Object.assign({
        config,
        categoryTree,
        rightRail: byPosition('right_rail'),
        headerUtil: byPosition('header_util'),
        footer: byPosition('footer').concat(customsAt('footer', 20)),
        mobileQuick: byPosition('mobile_quick').concat(customsAt('mobile_quick', 5)),
    }, built);
}

module.exports = {
    getNavigation,
    getConfig,
    getCategoryTree,
    getCategoryRows,
    getCategoryContext,
    buildTree,
    // 아울렛 등 콘텐츠 의존 메뉴의 GNB 노출 판정 캐시를 비운다(관리자가 콘텐츠를 바꿨을 때).
    invalidateContentGate,
    DEFAULT_CONFIG,
    BADGE_TYPES,
    LINK_RESOLVERS,
};
