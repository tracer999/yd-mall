const pool = require('../config/db');

module.exports = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM admin_menus WHERE is_active = 1 ORDER BY display_order ASC'
    );

    // 관리자 세션 기준으로 역할을 가져오고, 없으면 res.locals.user로 fallback
    const currentUser = (req.session && req.session.admin) || res.locals.user || null;
    const role = currentUser && currentUser.role ? currentUser.role : null;

    const filteredMenus = rows.filter((menu) => {
      // 최고 관리자는 모든 메뉴 노출
      if (role === 'super_admin') {
        return true;
      }

      if (!menu.visible_roles || menu.visible_roles.trim() === '') {
        // visible_roles가 비어 있으면 모든 관리자에게 노출
        return true;
      }
      if (!role) {
        // 역할 정보가 없으면 역할 제한 메뉴는 숨김
        return false;
      }
      const roles = menu.visible_roles.split(',').map((r) => r.trim());
      return roles.includes(role);
    });

    res.locals.adminMenus = filteredMenus;
  } catch (err) {
    console.error('AdminMenu Middleware Error:', err);
    res.locals.adminMenus = [];
  }
  next();
};
