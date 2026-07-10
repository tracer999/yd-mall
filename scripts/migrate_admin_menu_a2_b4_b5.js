#!/usr/bin/env node
/**
 * A2 · B4 · B5 — 관리자 메뉴 등록/개명 (멱등)
 *
 * 실행: node scripts/migrate_admin_menu_a2_b4_b5.js
 *
 *   A2  '메뉴관리'(/admin/menus) → '관리자 메뉴 관리' 로 개명 (경로·그룹은 그대로)
 *   B4  '시스템 메뉴 설정'(/admin/system-menus)  을 '메뉴/카테고리 관리' 그룹에 추가
 *   B5  'Header 설정'(/admin/header-settings)   을 '쇼핑몰 설정' 그룹에 추가
 *
 * 그룹 배치는 A1(scripts/migrate_admin_menu_groups.js)이 이미 끝냈다.
 * 이 스크립트는 그 위에 화면 2개를 얹고 이름 하나를 고칠 뿐이다.
 */
require('../config/env');
const pool = require('../config/db');

/** A2 — 경로로 찾아 이름만 바꾼다 */
const RENAME = { path: '/admin/menus', to: '관리자 메뉴 관리' };

/** B4·B5 — 그룹 이름으로 부모를 찾아 등록한다 */
const MENUS = [
    {
        group: '메뉴/카테고리 관리',
        name: '시스템 메뉴 설정',
        path: '/admin/system-menus',
        icon: 'bi bi-sliders',
        order: 3, // 카테고리(1) · 일반 메뉴 관리(2) 다음
        roles: 'super_admin,admin',
    },
    {
        group: '쇼핑몰 설정',
        name: 'Header 설정',
        path: '/admin/header-settings',
        icon: 'bi bi-layout-text-window-reverse',
        order: 3, // 사이트 설정(1) · 약관/정책 관리(2) 다음
        roles: 'super_admin,admin',
    },
];

async function findGroupId(conn, name) {
    const [rows] = await conn.query('SELECT id FROM admin_menus WHERE name = ? AND path IS NULL LIMIT 1', [name]);
    return rows.length ? rows[0].id : null;
}

(async () => {
    const conn = await pool.getConnection();
    try {
        // --- A2: 개명 ---
        const [target] = await conn.query('SELECT id, name FROM admin_menus WHERE path = ? LIMIT 1', [RENAME.path]);
        if (target.length === 0) {
            console.log(`  ! '${RENAME.path}' 메뉴가 없습니다 (건너뜀)`);
        } else if (target[0].name === RENAME.to) {
            console.log(`  = A2 '${RENAME.to}' 이미 적용됨 (id=${target[0].id})`);
        } else {
            await conn.query('UPDATE admin_menus SET name = ? WHERE id = ?', [RENAME.to, target[0].id]);
            console.log(`  ~ A2 '${target[0].name}' → '${RENAME.to}' (id=${target[0].id})`);
        }

        // --- B4 · B5: 메뉴 등록 ---
        for (const menu of MENUS) {
            const parentId = await findGroupId(conn, menu.group);
            if (!parentId) {
                console.error(`❌ 그룹 '${menu.group}' 이 없습니다. 먼저 scripts/migrate_admin_menu_groups.js 를 실행하세요.`);
                process.exitCode = 1;
                return;
            }

            const [existing] = await conn.query('SELECT id FROM admin_menus WHERE path = ? LIMIT 1', [menu.path]);
            if (existing.length > 0) {
                await conn.query(
                    `UPDATE admin_menus
                        SET name = ?, icon_class = ?, display_order = ?, parent_id = ?, is_active = 1, visible_roles = ?
                      WHERE id = ?`,
                    [menu.name, menu.icon, menu.order, parentId, menu.roles, existing[0].id]
                );
                console.log(`  = '${menu.name}' 갱신 (id=${existing[0].id})`);
            } else {
                const [r] = await conn.query(
                    `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
                     VALUES (?, ?, ?, ?, ?, 1, ?)`,
                    [menu.name, menu.path, menu.icon, menu.order, parentId, menu.roles]
                );
                console.log(`  + '${menu.name}' 생성 (id=${r.insertId})`);
            }
        }

        // --- 결과 출력 ---
        for (const groupName of ['쇼핑몰 설정', '메뉴/카테고리 관리', '운영/시스템 관리']) {
            const parentId = await findGroupId(conn, groupName);
            if (!parentId) continue;
            const [rows] = await conn.query(
                'SELECT name, path, display_order FROM admin_menus WHERE parent_id = ? ORDER BY display_order', [parentId]
            );
            console.log(`\n  [${groupName}]`);
            rows.forEach(r => console.log(`    ${r.display_order}. ${r.name} → ${r.path}`));
        }

        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
