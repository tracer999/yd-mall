const pool = require('../config/db');

/*
 * 관리자 사이드바 메뉴 주입 (A1 — 8그룹 2뎁스)
 *
 * res.locals.adminMenuTree : [{ ...group, isGroup, children: [...] }]  사이드바 렌더용
 * res.locals.adminMenus    : 권한 통과한 **잎 메뉴 평면 목록** (하위호환)
 *
 * 구조:
 *   - 그룹 행은 `path IS NULL` 로 식별한다.
 *   - 권한(visible_roles)은 **잎 메뉴에만** 적용한다. 그룹의 visible_roles 는 비워 둔다.
 *   - 보이는 자식이 하나도 없는 그룹은 통째로 숨긴다(빈 껍데기 방지).
 *   - 최상위 잎(대시보드)은 그룹 없이 그대로 노출한다.
 *
 * 권한 검사 자체는 라우트의 requireMenuAccess(path) 가 담당한다. 여기는 **노출**만 다룬다.
 */

/** 이 역할이 이 메뉴를 볼 수 있는가 */
function isVisibleTo(menu, role) {
    if (role === 'super_admin') return true;                            // 최고 관리자는 전부
    if (!menu.visible_roles || !menu.visible_roles.trim()) return true; // 제한 없음
    if (!role) return false;                                            // 역할 없으면 제한 메뉴 숨김
    return menu.visible_roles.split(',').map(r => r.trim()).includes(role);
}

module.exports = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM admin_menus WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
        );

        const currentUser = (req.session && req.session.admin) || res.locals.user || null;
        const role = currentUser && currentUser.role ? currentUser.role : null;

        const roots = rows.filter(m => !m.parent_id);
        const childrenOf = (parentId) =>
            rows.filter(m => m.parent_id === parentId && isVisibleTo(m, role));

        const tree = [];
        for (const root of roots) {
            const isGroup = !root.path;

            if (isGroup) {
                const children = childrenOf(root.id);
                if (children.length === 0) continue; // 보이는 자식 없으면 그룹 숨김
                tree.push(Object.assign({}, root, { isGroup: true, children }));
                continue;
            }

            // 최상위 잎(대시보드 등)
            if (!isVisibleTo(root, role)) continue;
            tree.push(Object.assign({}, root, { isGroup: false, children: [] }));
        }

        res.locals.adminMenuTree = tree;
        // 하위호환: 실제로 접근 가능한 잎 메뉴만 평면으로
        res.locals.adminMenus = tree.flatMap(n => (n.isGroup ? n.children : [n]));
    } catch (err) {
        console.error('AdminMenu Middleware Error:', err);
        res.locals.adminMenuTree = [];
        res.locals.adminMenus = [];
    }
    next();
};
