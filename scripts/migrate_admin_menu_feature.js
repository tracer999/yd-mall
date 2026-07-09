#!/usr/bin/env node
/**
 * B2 — '일반 메뉴 관리' 관리자 메뉴 등록 (멱등)
 *
 * 실행: node scripts/migrate_admin_menu_feature.js
 *
 * 스토어프론트 GNB/헤더유틸/우측레일 메뉴의 ON/OFF·표시명·순서를 관리하는 화면을
 * '메뉴/카테고리 관리' 그룹에 추가한다.
 */
require('../config/env');
const pool = require('../config/db');

const GROUP_NAME = '메뉴/카테고리 관리';
const MENU = {
    name: '일반 메뉴 관리',
    path: '/admin/feature-menus',
    icon: 'bi bi-list-check',
    order: 2, // 카테고리(1) 다음
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
                [MENU.name, MENU.icon, MENU.order, parentId, MENU.roles, existing[0].id]
            );
            console.log(`  = '${MENU.name}' 갱신 (id=${existing[0].id})`);
        } else {
            const [r] = await conn.query(
                `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
                 VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [MENU.name, MENU.path, MENU.icon, MENU.order, parentId, MENU.roles]
            );
            console.log(`  + '${MENU.name}' 생성 (id=${r.insertId})`);
        }

        const [rows] = await conn.query(
            'SELECT name, path, display_order FROM admin_menus WHERE parent_id = ? ORDER BY display_order', [parentId]
        );
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
