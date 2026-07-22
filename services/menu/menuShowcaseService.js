const pool = require('../../config/db');
const productGroupService = require('../display/productGroupService');
const bannerService = require('../display/bannerService');

/*
 * 메뉴 쇼케이스 — 각 GNB 메뉴 페이지 **상단에 얹는** 캐러셀.
 *
 * 한 메뉴에 최대 두 개가 순서대로 쌓인다. 둘 다 선택 사항이고, 있는 것만 렌더한다.
 *   1) 배너형 — banners.group_key = 'menu:{feature_code}' 이미지 배너. **위**에 온다.
 *   2) 상품형 — product_group.menu_code = '{feature_code}' 인 그룹의 상품. 배너 **아래**.
 *      (쇼핑특가='추천 특가', 베스트='추천 베스트', 신상품='주목할 신상품')
 *
 * 상품형은 **담긴 상품 우선, 없으면 수집 조건**이다(resolveShowcaseItems). 일반 상품 그룹처럼
 * group_type 으로 둘 중 하나만 고르게 하면, 운영자가 특가 상품을 고르지 않은 몰은 캐러셀이
 * 통째로 비고(수동) 특가와 무관한 상품이 '추천 특가'로 뜬다(조건). 납품 직후 빈 몰에서도
 * 뭔가 보이면서, 운영자가 고른 순간 그게 이기는 게 이 자리에 맞다.
 *
 * 예전에는 상품형이 있으면 배너를 조회조차 하지 않았다(early return). 그래서 베스트·신상품·
 * 쇼핑특가에는 배너를 등록해도 노출될 곳이 없었고, 관리자 화면에서 그 메뉴를 아예 숨겨야 했다.
 * 이제 둘은 공존한다 — 배너는 어느 메뉴에나 걸 수 있다.
 *
 * ⚠️ 페이지를 '교체'하지 않는다. SDUI page(slug) 경로로 붙이면 컨트롤러가 그리던
 *    본문(상품 목록 등)이 통째로 사라진다. 그래서 미들웨어가 res.locals 에 실어
 *    main_layout 이 <%- body %> **위에** 렌더한다 — 기존 화면은 그대로 두고 덧붙이는 방식.
 */

/** 노출될 페이지 자체가 없는 메뉴 — 쇼케이스 대상에서 제외한다. */
const EXCLUDED = new Set([
    'CATEGORY',   // 드롭다운(고정), 자체 페이지 없음
    'RANKING',    // /ranking → /best 로 301. 자체 페이지가 없어 노출될 곳이 없다.
]);

/*
 * 하위 경로에는 붙이지 않는 메뉴 — **목록 화면에만** 배너를 건다.
 *
 * 기획전은 상세(/exhibition/{slug})가 자체 대표 이미지(hero)를 갖는다. 여기에 목록용
 * 메뉴 배너까지 얹으면 배너가 두 장 겹친다. 반면 쇼핑특가(/deals/:code)처럼 하위 경로가
 * 같은 성격의 목록인 메뉴는 지금처럼 이어서 붙어야 하므로 전역으로 바꾸지 않는다.
 */
const EXACT_PATH_ONLY = new Set(['EXHIBITION']);

/*
 * 상품형 쇼케이스를 걸 수 없는 메뉴 — 상품 목록 화면이 아니라 '상품 캐러셀'이 문맥에 맞지 않는다.
 * 이벤트&혜택·쿠폰·멤버십은 혜택 안내 화면이고, 기획전은 기획전마다 자체 상품 구성을 갖는다.
 *
 * EXCLUDED 와 달리 렌더 경로(getPathMap)에는 관여하지 않는다. 이 메뉴들에도 **배너형**
 * 쇼케이스는 계속 걸 수 있어야 하므로, 관리자 상품 그룹 화면의 선택지에서만 뺀다.
 */
const PRODUCT_EXCLUDED = new Set(['EVENT', 'COUPON', 'MEMBERSHIP', 'EXHIBITION']);

/** 상품형 메뉴의 상품 풀. 관리자 상품 피커가 이 풀로만 후보를 좁힌다. */
const PRODUCT_POOLS = {
    SHOPPING_DEAL: 'deal',
    BEST: 'best',
    NEW_PRODUCT: 'new',
};

let pathMapCache = null;

/**
 * feature_menu 의 default_path → feature_code 맵. 메뉴 카탈로그는 거의 바뀌지 않아 프로세스 캐시.
 * @returns {Promise<Map<string,string>>}
 */
async function getPathMap() {
    if (pathMapCache) return pathMapCache;
    const [rows] = await pool.query(`
        SELECT feature_code, default_path
        FROM feature_menu
        WHERE position = 'gnb' AND default_path IS NOT NULL AND default_path <> ''
    `);
    const map = new Map();
    for (const r of rows) {
        if (EXCLUDED.has(r.feature_code)) continue;
        map.set(r.default_path, r.feature_code);
    }
    pathMapCache = map;
    return map;
}

/** 카탈로그가 바뀌었을 때(메뉴 추가/삭제) 캐시를 버린다. */
function clearCache() {
    pathMapCache = null;
}

/**
 * 요청 경로에서 메뉴 feature_code 를 찾는다.
 * default_path 와 정확히 일치하거나, 그 하위 경로(/deals/:code)일 때 매칭한다.
 * @param {string} reqPath req.path
 * @returns {Promise<string|null>}
 */
async function resolveMenuCode(reqPath) {
    if (!reqPath) return null;
    const map = await getPathMap();
    // 정확 일치 우선 — '/new' 가 '/new-xxx' 에 걸리지 않도록 하위 경로는 '/' 구분자를 요구한다.
    if (map.has(reqPath)) return map.get(reqPath);
    for (const [path, code] of map) {
        if (EXACT_PATH_ONLY.has(code)) continue; // 목록 전용 메뉴 — 상세에는 붙이지 않는다
        if (reqPath.startsWith(path + '/')) return code;
    }
    return null;
}

/**
 * 쇼케이스 대상 메뉴 목록 (관리자 선택지). 몰에서 켜져 있는 GNB 메뉴만.
 *
 * @param {number} mallId
 * @param {{ productOnly?: boolean }} [opts] productOnly=true 면 상품형을 걸 수 없는 메뉴
 *        (PRODUCT_EXCLUDED)를 뺀다. 상품 그룹 화면이 쓰고, 배너 화면은 전체를 그대로 쓴다.
 */
async function getMenuTargets(mallId = 1, { productOnly = false } = {}) {
    const [rows] = await pool.query(`
        SELECT f.feature_code, f.default_name, f.default_path, m.display_name
        FROM feature_menu f
        JOIN mall_feature_menu m
          ON m.feature_code = f.feature_code AND m.mall_id = ? AND m.is_enabled = 1
        WHERE f.position = 'gnb' AND f.default_path IS NOT NULL AND f.default_path <> ''
        ORDER BY m.sort_order ASC, f.default_sort_order ASC
    `, [mallId]);

    return rows
        .filter(r => !EXCLUDED.has(r.feature_code))
        .filter(r => !(productOnly && PRODUCT_EXCLUDED.has(r.feature_code)))
        .map(r => ({
            key: r.feature_code,
            name: r.display_name || r.default_name,
            path: r.default_path,
            pool: PRODUCT_POOLS[r.feature_code] || null,
            label: `${r.display_name || r.default_name} (${r.default_path})`,
        }));
}

/**
 * 메뉴에 걸린 상품 쇼케이스 그룹.
 * @returns {Promise<object|null>} product_group 행
 */
async function getProductGroupForMenu(mallId, menuCode) {
    const [rows] = await pool.query(
        'SELECT * FROM product_group WHERE mall_id = ? AND menu_code = ? AND is_active = 1',
        [mallId, menuCode]
    );
    return rows[0] || null;
}

/*
 * 폴백 조건으로 인정할 filter_condition_json 키 — productGroupService.resolve 가 읽는 것과 같다.
 * 여기에 아무것도 없으면 조건 검색은 "몰 전체 상품"을 뜻하게 되므로 폴백하지 않는다.
 * (담긴 상품이 0건이라고 해서 아무 상품이나 '추천 특가'로 올리면 안 된다.)
 */
const CONDITION_KEYS = ['badge', 'isNew', 'category_id', 'min_discount', 'in_stock'];

function parseCond(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;   // mysql2 JSON 컬럼
    try { return JSON.parse(v); } catch (e) { return {}; }
}

function hasFallbackCondition(group) {
    const cond = parseCond(group && group.filter_condition_json);
    return CONDITION_KEYS.some(k => cond[k] !== undefined && cond[k] !== null && cond[k] !== '');
}

/**
 * 쇼케이스 상품 해석 — **운영자가 담은 상품이 우선**, 하나도 없으면 수집 조건.
 *
 * group.group_type 을 보지 않는다. 메뉴에 걸린 그룹은 둘 다 갖고 있고, 그 우선순위가
 * 이 함수의 존재 이유다. 관리자 미리보기도 이 함수를 써야 화면과 어긋나지 않는다.
 *
 * @returns {Promise<{items: Array, source: 'manual'|'condition'|'none'}>}
 */
async function resolveShowcaseItems(group, { hasUser = false, limit = 12 } = {}) {
    if (!group) return { items: [], source: 'none' };

    // 그룹 객체를 복사해 타입만 바꿔 넘긴다 — 호출자의 행을 건드리지 않는다.
    const picked = await productGroupService.resolve(
        Object.assign({}, group, { group_type: 'manual' }), { hasUser, limit }
    );
    if (picked.length > 0) return { items: picked, source: 'manual' };

    if (!hasFallbackCondition(group)) return { items: [], source: 'none' };

    const auto = await productGroupService.resolve(
        Object.assign({}, group, { group_type: 'condition' }), { hasUser, limit }
    );
    return { items: auto, source: 'condition' };
}

/**
 * 경로에 해당하는 쇼케이스들을 렌더 순서대로 조립한다.
 * 배열 순서가 곧 화면 순서다 — 배너가 먼저, 상품 캐러셀이 뒤.
 *
 * @param {string} reqPath
 * @param {{ mallId?: number, hasUser?: boolean }} opts
 * @returns {Promise<Array<{kind:'product'|'banner', menuCode:string, title:string, items:Array, perView:number}>>}
 */
async function getForPath(reqPath, { mallId = 1, hasUser = false } = {}) {
    const menuCode = await resolveMenuCode(reqPath);
    if (!menuCode) return [];

    const showcases = [];

    // 1) 배너형 — group_key='menu:{feature_code}'
    const banners = await bannerService.getByGroup(`menu:${menuCode}`, { limit: 12, mallId });
    if (banners.length > 0) {
        showcases.push({
            kind: 'banner',
            menuCode,
            title: '',
            items: banners,
            perView: 2,
        });
    }

    // 2) 상품형 — 메뉴에 걸린 상품그룹
    const group = await getProductGroupForMenu(mallId, menuCode);
    if (group) {
        const { items } = await resolveShowcaseItems(group, { hasUser, limit: 12 });
        if (items.length > 0) {
            showcases.push({
                kind: 'product',
                menuCode,
                title: group.showcase_title || group.name,
                items,
                perView: 3,
            });
        }
    }

    return showcases;
}

module.exports = {
    getForPath,
    getMenuTargets,
    getProductGroupForMenu,
    resolveShowcaseItems,
    resolveMenuCode,
    clearCache,
    EXCLUDED,
    EXACT_PATH_ONLY,
    PRODUCT_EXCLUDED,
    PRODUCT_POOLS,
};
