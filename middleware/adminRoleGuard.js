const pool = require('../config/db');

function parseRoles(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

exports.requireMenuAccess = function (menuPath) {
  return async (req, res, next) => {
    try {
      const admin = req.session.admin;
      if (!admin) {
        return res.redirect('/admin/login');
      }

      const role = admin.role;

      // 최고 관리자는 모든 메뉴 접근 가능
      if (role === 'super_admin') {
        return next();
      }

      const [rows] = await pool.query(
        'SELECT visible_roles FROM admin_menus WHERE path = ? AND is_active = 1 LIMIT 1',
        [menuPath]
      );

      if (!rows.length) {
        // 메뉴 정의가 없으면 기본적으로 admin 이상만 허용 (content/customer_admin 은 차단)
        if (role === 'admin') return next();
        return res.status(403).send('접근 권한이 없습니다. (메뉴 정의 없음)');
      }

      const visibleRoles = rows[0].visible_roles;

      // visible_roles 비어 있으면 모든 운영자에게 허용
      if (!visibleRoles || !visibleRoles.trim()) {
        return next();
      }

      const allowed = parseRoles(visibleRoles);
      if (allowed.includes(role)) {
        return next();
      }

      return res.status(403).send('접근 권한이 없습니다.');
    } catch (err) {
      console.error('AdminRoleGuard Error:', err);
      return res.status(500).send('Server Error');
    }
  };
};
