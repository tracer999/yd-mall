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
 * @param {number} mallId
 */
async function getMenuTargets(mallId = 1) {
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
        const items = await productGroupService.resolve(group, { hasUser, limit: 12 });
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
    resolveMenuCode,
    clearCache,
    EXCLUDED,
    EXACT_PATH_ONLY,
    PRODUCT_POOLS,
};
