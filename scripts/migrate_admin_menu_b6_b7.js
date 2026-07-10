#!/usr/bin/env node
/**
 * B6 · B7 — 관리자 메뉴 등록 (멱등)
 *
 * 실행: node scripts/migrate_admin_menu_b6_b7.js
 *
 *   B6  '상품 그룹 관리'(/admin/product-groups) → '페이지/전시 관리' 그룹
 *   B7  '메뉴 미리보기'(/admin/menu-preview)   → '메뉴/카테고리 관리' 그룹
 *
 * ⚠️ 실행 순서 주의. dev·prod 가 같은 DB 를 보고, `middleware/adminMenu.js` 는
 * 매 요청 DB 를 읽어 사이드바를 그린다(라우트 존재 여부는 확인하지 않는다).
 * 따라서 **라우트 코드를 먼저 배포한 뒤** 이 스크립트를 실행해야 한다.
 * 반대로 하면 운영 사이드바에 링크가 뜨는데 클릭하면 404 인 구간이 생긴다.
 */
require('../config/env');
const pool = require('../config/db');

const MENUS = [
    {
        group: '페이지/전시 관리',
        name: '상품 그룹 관리',
        path: '/admin/product-groups',
        icon: 'bi bi-collection',
        order: 4, // 페이지 빌더(1) · 배너 관리(2) · 전시관리(3, 폐기 예정) 다음
        roles: 'super_admin,admin,content_admin',
    },
    {
        group: '메뉴/카테고리 관리',
        name: '메뉴 미리보기',
        path: '/admin/menu-preview',
        icon: 'bi bi-eye',
        order: 4, // 카테고리(1) · 일반 메뉴 관리(2) · 시스템 메뉴 설정(3) 다음
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

        for (const groupName of ['메뉴/카테고리 관리', '페이지/전시 관리']) {
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
