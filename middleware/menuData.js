const pool = require('../config/db');

/*
 * GNB 데이터 주입 (P1.5 — 신세계TV쇼핑/GS SHOP형 헤더·GNB)
 *  - res.locals.gnbMenus     : storefront_menu 기반 상단 메뉴(몰별 가변). 골격은 뷰 고정, 항목은 데이터.
 *  - res.locals.categoryTree : NORMAL 카테고리 재귀 트리(전체 뎁스). "카테고리" 클릭 드롭다운 패널용.
 *  - res.locals.menuCategories: 기존 THEME 카테고리(하위호환/폴백).
 *  - res.locals.currentPath  : 활성 메뉴 밑줄 표시용.
 *  storefront_menu가 비어 있으면 gnbMenus=[] → 뷰가 레거시 렌더로 폴백.
 */

const MALL_ID = 1;

// menu_type + 필드로 최종 href 결정
function resolveHref(m) {
  if (m.url) return m.url;
  switch (m.menu_type) {
    case 'category': return m.target_id ? `/products/category/${m.target_id}` : '/products';
    case 'brand': return m.target_id ? `/brands/${m.target_id}` : '/brands';
    case 'page': return m.target_id ? `/boards/${m.target_id}` : '#';
    case 'promotion': return m.target_id ? `/events/${m.target_id}` : '/products';
    default: return '#';
  }
}

// parent_id 기반 재귀 트리 구성(전체 뎁스 지원)
function buildTree(rows) {
  const byId = {};
  const roots = [];
  rows.forEach((r) => { byId[r.id] = Object.assign({}, r, { children: [] }); });
  rows.forEach((r) => {
    const node = byId[r.id];
    if (r.parent_id && byId[r.parent_id]) byId[r.parent_id].children.push(node);
    else roots.push(node);
  });
  return roots;
}

module.exports = async (req, res, next) => {
    try {
        res.locals.currentPath = req.path;

        // 상단 GNB 메뉴(1뎁스, 활성) — 순서대로
        const [menus] = await pool.query(
            `SELECT id, parent_id, depth, name, menu_type, target_type, target_id, url, is_fixed, sort_order
             FROM storefront_menu
             WHERE mall_id = ? AND is_active = 1 AND (parent_id IS NULL OR depth = 1)
             ORDER BY sort_order ASC, id ASC`,
            [MALL_ID]
        );
        res.locals.gnbMenus = (menus || []).map((m) => Object.assign({}, m, { href: resolveHref(m) }));

        // 카테고리 트리(NORMAL, 전체 뎁스) — 카테고리 드롭다운 패널
        const [cats] = await pool.query(
            "SELECT id, name, parent_id, display_order FROM categories WHERE type = 'NORMAL' ORDER BY display_order ASC, id ASC"
        );
        res.locals.categoryTree = buildTree(cats);

        // 기존 THEME 카테고리(하위호환/폴백)
        const [themeCategories] = await pool.query(
            "SELECT * FROM categories WHERE type = 'THEME' ORDER BY display_order ASC"
        );
        res.locals.menuCategories = themeCategories;
        next();
    } catch (err) {
        console.error('Menu Middleware Error:', err);
        res.locals.gnbMenus = [];
        res.locals.categoryTree = [];
        res.locals.menuCategories = [];
        res.locals.currentPath = req.path;
        next();
    }
};
