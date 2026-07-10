#!/usr/bin/env node
/**
 * '몰 관리'(/admin/malls) 관리자 메뉴 등록 (멱등) — P5 Phase 2
 *
 * 실행: node scripts/migrate_admin_menu_malls.js
 *
 * ⚠️ 라우트(routes/admin/malls.js)가 운영에 배포된 **뒤에** 실행한다.
 *    dev·prod 공용 DB + adminMenu 가 라우트 존재를 확인하지 않으므로,
 *    먼저 올리면 운영 사이드바에 404 링크가 뜬다.
 *
 * '운영/시스템 관리' 그룹 최상단(운영자 관리 앞)에 둔다 — 몰이 가장 상위 개념.
 */
require('../config/env');
const pool = require('../config/db');

const GROUP_NAME = '운영/시스템 관리';
const MENU = {
    name: '몰 관리',
    path: '/admin/malls',
    icon: 'bi bi-shop',
    order: 0, // 운영자 관리(1)보다 앞
    roles: 'super_admin,admin',
};

(async () => {
    const conn = await pool.getConnection();
    try {
        const [g] = await conn.query('SELECT id FROM admin_menus WHERE name = ? AND path IS NULL LIMIT 1', [GROUP_NAME]);
        if (g.length === 0) {
            console.error(`❌ 그룹 '${GROUP_NAME}' 이 없습니다. 먼저 scripts/migrate_admin_menu_groups.js 를 실행하세요.`);
            process.exitCode = 1;
            return;
        }
        const parentId = g[0].id;

        const [existing] = await conn.query('SELECT id FROM admin_menus WHERE path = ? LIMIT 1', [MENU.path]);
        if (existing.length > 0) {
            await conn.query(
                'UPDATE admin_menus SET name = ?, icon_class = ?, display_order = ?, parent_id = ?, is_active = 1, visible_roles = ? WHERE id = ?',
                [MENU.name, MENU.icon, MENU.order, parentId, MENU.roles, existing[0].id]);
            console.log(`  = '${MENU.name}' 갱신 (id=${existing[0].id})`);
        } else {
            const [r] = await conn.query(
                `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
                 VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [MENU.name, MENU.path, MENU.icon, MENU.order, parentId, MENU.roles]);
            console.log(`  + '${MENU.name}' 생성 (id=${r.insertId})`);
        }

        const [rows] = await conn.query(
            'SELECT name, path, display_order FROM admin_menus WHERE parent_id = ? ORDER BY display_order', [parentId]);
        console.log(`\n  [${GROUP_NAME}]`);
        rows.forEach(r => console.log(`    ${r.display_order}. ${r.name} → ${r.path}`));
        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
