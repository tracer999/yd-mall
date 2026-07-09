const pool = require('../../config/db');

function ensureMenuAdmin(req, res) {
  const user = req.user || res.locals.user;
  const role = user && user.role;
  if (!role || (role !== 'super_admin' && role !== 'admin')) {
    res.status(403).send('메뉴 관리 권한이 없습니다. (super_admin 또는 admin만 접근 가능)');
    return false;
  }
  return true;
}

exports.getMenus = async (req, res) => {
  if (!ensureMenuAdmin(req, res)) return;

  try {
    const [rows] = await pool.query(
      `SELECT id, name, path, icon_class, display_order, is_active, visible_roles
       FROM admin_menus
       WHERE parent_id IS NULL
       ORDER BY display_order ASC, id ASC`
    );

    res.render('admin/menus/list', {
      layout: 'layouts/admin_layout',
      title: '메뉴 관리',
      menus: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.saveMenus = async (req, res) => {
  if (!ensureMenuAdmin(req, res)) return;

  let { id = [], name = [], path = [], icon_class = [], visible_roles = [], is_active = [], delete_ids = [] } = req.body;

  // 단일 값으로 올 경우 배열로 변환
  if (!Array.isArray(id)) id = [id];
  if (!Array.isArray(name)) name = [name];
  if (!Array.isArray(path)) path = [path];
  if (!Array.isArray(icon_class)) icon_class = [icon_class];
  if (!Array.isArray(visible_roles)) visible_roles = [visible_roles];
  if (!Array.isArray(is_active)) is_active = [is_active];
  if (!Array.isArray(delete_ids)) delete_ids = [delete_ids];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const deleteIds = delete_ids
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (deleteIds.length > 0) {
      await connection.query(
        `DELETE FROM admin_menus WHERE id IN (${deleteIds.map(() => '?').join(',')})`,
        deleteIds
      );
    }

    for (let i = 0; i < name.length; i++) {
      const menuId = id[i];
      const menuName = (name[i] || '').trim();
      const menuPath = (path[i] || '').trim();
      const menuIcon = (icon_class[i] || '').trim();
      const rolesStrRaw = visible_roles[i] || '';
      const rolesStr = rolesStrRaw.trim() === '' ? null : rolesStrRaw.trim();
      const displayOrder = i + 1;
      const activeValue = (is_active[i] === '1' || is_active[i] === 1 || is_active[i] === true) ? 1 : 0;

      if (!menuName || !menuPath) {
        // 이름 또는 경로가 비어 있으면 무시 (미완성 행)
        continue;
      }

      if (menuId) {
        // 기존 메뉴 업데이트
        await connection.query(
          `UPDATE admin_menus
           SET name = ?, path = ?, icon_class = ?, display_order = ?, visible_roles = ?, is_active = ?
           WHERE id = ?`,
          [menuName, menuPath, menuIcon, displayOrder, rolesStr, activeValue, menuId]
        );
      } else {
        // 신규 메뉴 추가 (기본값: 최상위 메뉴, 활성화, 전체 역할 표시)
        await connection.query(
          `INSERT INTO admin_menus
           (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          [menuName, menuPath, menuIcon, displayOrder, activeValue, rolesStr]
        );
      }
    }

    await connection.commit();
    res.redirect('/admin/menus');
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).send('Server Error');
  } finally {
    connection.release();
  }
};
