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

/**
 * 최상위 → 자식 순서로 평탄화한다 (A1: 8그룹 2뎁스).
 * 그룹 행은 `path IS NULL` 이며, 자식은 바로 뒤에 이어 붙는다.
 */
function flattenTree(rows) {
  const roots = rows.filter(r => !r.parent_id);
  const out = [];
  for (const root of roots) {
    out.push(Object.assign({}, root, { isGroup: !root.path, depth: 0, groupName: null }));
    rows
      .filter(c => c.parent_id === root.id)
      .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
      .forEach(c => out.push(Object.assign({}, c, { isGroup: false, depth: 1, groupName: root.name })));
  }
  return out;
}

exports.getMenus = async (req, res) => {
  if (!ensureMenuAdmin(req, res)) return;

  try {
    // A1 이전에는 `WHERE parent_id IS NULL` 이었다. 그룹화 후에는 그러면 자식 19건이
    // 관리 화면에서 사라진다. 전체를 트리 순서로 내려준다.
    const [rows] = await pool.query(
      `SELECT id, name, path, icon_class, display_order, parent_id, is_active, visible_roles
       FROM admin_menus
       ORDER BY display_order ASC, id ASC`
    );

    res.render('admin/menus/list', {
      layout: 'layouts/admin_layout',
      title: '메뉴 관리',
      menus: flattenTree(rows)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.saveMenus = async (req, res) => {
  if (!ensureMenuAdmin(req, res)) return;

  let { id = [], name = [], path = [], icon_class = [], visible_roles = [], is_active = [], parent_id = [], delete_ids = [] } = req.body;

  // 단일 값으로 올 경우 배열로 변환
  if (!Array.isArray(id)) id = [id];
  if (!Array.isArray(name)) name = [name];
  if (!Array.isArray(path)) path = [path];
  if (!Array.isArray(icon_class)) icon_class = [icon_class];
  if (!Array.isArray(visible_roles)) visible_roles = [visible_roles];
  if (!Array.isArray(is_active)) is_active = [is_active];
  if (!Array.isArray(parent_id)) parent_id = [parent_id];
  if (!Array.isArray(delete_ids)) delete_ids = [delete_ids];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const deleteIds = delete_ids
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);

    if (deleteIds.length > 0) {
      // 자식이 남아 있는 그룹을 지우면 자식들이 고아가 되어 사이드바에서 통째로 사라진다.
      const [orphans] = await connection.query(
        `SELECT DISTINCT parent_id FROM admin_menus
         WHERE parent_id IN (${deleteIds.map(() => '?').join(',')})
           AND id NOT IN (${deleteIds.map(() => '?').join(',')})`,
        [...deleteIds, ...deleteIds]
      );
      if (orphans.length > 0) {
        await connection.rollback();
        const [names] = await connection.query(
          `SELECT name FROM admin_menus WHERE id IN (${orphans.map(() => '?').join(',')})`,
          orphans.map(o => o.parent_id)
        );
        return res.status(400).send(
          `하위 메뉴가 있는 그룹은 삭제할 수 없습니다: ${names.map(n => n.name).join(', ')}\n` +
          `먼저 하위 메뉴를 다른 그룹으로 옮기거나 삭제하세요.`
        );
      }

      await connection.query(
        `DELETE FROM admin_menus WHERE id IN (${deleteIds.map(() => '?').join(',')})`,
        deleteIds
      );
    }

    // display_order 는 그룹(부모) 단위로 매긴다. 전역 i+1 로 매기면 그룹 간 순서가 뒤섞인다.
    const orderByParent = new Map();
    const nextOrder = (parentKey) => {
      const n = (orderByParent.get(parentKey) || 0) + 1;
      orderByParent.set(parentKey, n);
      return n;
    };

    for (let i = 0; i < name.length; i++) {
      const menuId = id[i];
      const menuName = (name[i] || '').trim();
      const rawPath = (path[i] || '').trim();
      const menuIcon = (icon_class[i] || '').trim();
      const rolesStrRaw = visible_roles[i] || '';
      const rolesStr = rolesStrRaw.trim() === '' ? null : rolesStrRaw.trim();
      const activeValue = (is_active[i] === '1' || is_active[i] === 1 || is_active[i] === true) ? 1 : 0;

      // 이름은 필수. path 가 비면 **그룹 행**(path IS NULL)으로 저장한다.
      // 예전 코드는 path 없는 행을 통째로 건너뛰어 그룹을 편집할 수 없었다.
      if (!menuName) continue;
      const menuPath = rawPath === '' ? null : rawPath;

      const rawParent = Number(parent_id[i]);
      const parentValue = Number.isFinite(rawParent) && rawParent > 0 ? rawParent : null;
      const displayOrder = nextOrder(parentValue === null ? 'root' : parentValue);

      if (menuId) {
        await connection.query(
          `UPDATE admin_menus
           SET name = ?, path = ?, icon_class = ?, display_order = ?, parent_id = ?, visible_roles = ?, is_active = ?
           WHERE id = ?`,
          [menuName, menuPath, menuIcon, displayOrder, parentValue, rolesStr, activeValue, menuId]
        );
      } else {
        await connection.query(
          `INSERT INTO admin_menus
           (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [menuName, menuPath, menuIcon, displayOrder, parentValue, activeValue, rolesStr]
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
