#!/usr/bin/env node
/**
 * 관리자 대메뉴 재편 — '몰 관리' + '쇼핑몰 관리' 병합 + '시스템 관리' 대메뉴 신설 (멱등)
 *
 * 실행:
 *   node scripts/migrate_admin_menu_system_group.js          # 적용
 *   node scripts/migrate_admin_menu_system_group.js --reset  # 원복(= service_group 적용 상태로)
 *
 * 배경:
 *   직전 단계(migrate_admin_menu_service_group.js)에서 '몰 관리' 대메뉴 아래에
 *   [몰 리스트 관리 · 운영자 관리 · 관리자 메뉴 관리 · 시스템 설정] 을 모아 두었다.
 *   그런데 '몰 관리'와 '쇼핑몰 관리'가 성격이 겹쳐(둘 다 몰 스코프 설정) 나뉘어 있으니
 *   찾기 혼란스러웠다. 이번에 정리한다.
 *
 * 적용 후 트리(관련 부분만):
 *   ■ 쇼핑몰 관리 (기존 그룹 유지, 최상단)
 *      └ 몰 리스트 관리 (/admin/malls, ← '몰 관리'에서 이관, super_admin)
 *      └ 사이트 설정 · 약관/정책 관리 · Header 설정 · 디자인 스타일 · 대시보드 (기존)
 *   ■ … (외부몰 연동 · 카테고리 · 상품 · 프로모션 · 멤버십 · 주문/회원 · 고객지원 관리) …
 *   ■ 시스템 관리 (대메뉴 신설, super_admin 전용) — '고객지원 관리' 바로 아래(order 76)
 *      └ 운영자 관리 (/admin/operators) · 관리자 메뉴 관리 (/admin/menus)
 *      └ 시스템 설정 (/admin/sys-settings)
 *   ■ 서비스 관리 (기존)
 *
 *   → 비워진 '몰 관리' 그룹은 비활성화(is_active=0)한다. 라우트는 모두 기존 것이라 404 없음.
 */
require('../config/env');
const pool = require('../config/db');

const RESET = process.argv.includes('--reset');

const MALL_GROUP = '몰 관리';
const SHOPPING_GROUP = '쇼핑몰 관리';
const SYSTEM_GROUP = '시스템 관리';
const SUPPORT_GROUP = '고객지원 관리';

// '시스템 관리' 대메뉴 하위 (모두 super_admin 전용) — '몰 관리'에서 이관.
const SYSTEM_LEAVES = [
    { path: '/admin/operators', name: '운영자 관리', icon: 'bi bi-person-badge', order: 10 },
    { path: '/admin/menus', name: '관리자 메뉴 관리', icon: 'bi bi-list-nested', order: 20 },
    { path: '/admin/sys-settings', name: '시스템 설정', icon: 'bi bi-sliders2', order: 30 },
];

// --reset 시 되돌릴 상태(= service_group 적용 직후, '몰 관리' 대메뉴 하위 배치).
const MALL_LEAVES_ORIGINAL = [
    { path: '/admin/malls', name: '몰 리스트 관리', icon: 'bi bi-shop-window', order: 10 },
    { path: '/admin/operators', name: '운영자 관리', icon: 'bi bi-person-badge', order: 20 },
    { path: '/admin/menus', name: '관리자 메뉴 관리', icon: 'bi bi-list-nested', order: 30 },
    { path: '/admin/sys-settings', name: '시스템 설정', icon: 'bi bi-sliders2', order: 40 },
];

async function findGroupId(conn, name) {
    const [rows] = await conn.query(
        'SELECT id FROM admin_menus WHERE name = ? AND path IS NULL LIMIT 1', [name]);
    return rows.length ? rows[0].id : null;
}

/** 그룹(대메뉴) 행 upsert. 그룹 노출은 자식 권한으로 결정되므로 visible_roles 는 비운다. */
async function upsertGroup(conn, name, order, icon) {
    let id = await findGroupId(conn, name);
    if (id) {
        await conn.query(
            'UPDATE admin_menus SET display_order = ?, icon_class = ?, visible_roles = NULL, is_active = 1 WHERE id = ?',
            [order, icon, id]);
        console.log(`  = 그룹 '${name}' 갱신 (id=${id})`);
    } else {
        const [r] = await conn.query(
            `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
             VALUES (?, NULL, ?, ?, NULL, 1, NULL)`,
            [name, icon, order]);
        id = r.insertId;
        console.log(`  + 그룹 '${name}' 생성 (id=${id})`);
    }
    return id;
}

/** path 로 잎 메뉴를 찾아 이름/부모/순서/역할/노출을 upsert. 없으면 새로 만든다. */
async function upsertLeaf(conn, { path, name, icon, order }, parentId, roles) {
    const [existing] = await conn.query('SELECT id FROM admin_menus WHERE path = ? LIMIT 1', [path]);
    if (existing.length) {
        await conn.query(
            'UPDATE admin_menus SET name = ?, icon_class = ?, display_order = ?, parent_id = ?, visible_roles = ?, is_active = 1 WHERE id = ?',
            [name, icon, order, parentId, roles, existing[0].id]);
        console.log(`    = '${name}' 배치 (${path}, id=${existing[0].id})`);
    } else {
        const [r] = await conn.query(
            `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
             VALUES (?, ?, ?, ?, ?, 1, ?)`,
            [name, path, icon, order, parentId, roles]);
        console.log(`    + '${name}' 신설 (${path}, id=${r.insertId})`);
    }
}

async function apply(conn) {
    console.log('\n▶ 대메뉴 재편 — 몰 관리↔쇼핑몰 관리 병합 + 시스템 관리 신설\n');

    const shoppingId = await findGroupId(conn, SHOPPING_GROUP);
    if (!shoppingId) {
        throw new Error(`그룹 '${SHOPPING_GROUP}' 가 없습니다. migrate_admin_menu_service_group.js 를 먼저 실행하세요.`);
    }

    // 1) '몰 리스트 관리' → '쇼핑몰 관리' 그룹 최상단(order 0)으로 이관. 권한(super_admin) 유지.
    await upsertLeaf(conn,
        { path: '/admin/malls', name: '몰 리스트 관리', icon: 'bi bi-shop-window', order: 0 },
        shoppingId, 'super_admin');

    // 2) '시스템 관리' 대메뉴 신설 — '고객지원 관리'(75) 바로 아래(76). super_admin 전용.
    const systemGroupId = await upsertGroup(conn, SYSTEM_GROUP, 76, 'bi bi-gear-wide-connected');
    for (const leaf of SYSTEM_LEAVES) {
        await upsertLeaf(conn, leaf, systemGroupId, 'super_admin');
    }

    // 3) 비워진 '몰 관리' 그룹 비활성화(남은 활성 자식이 없을 때만).
    const mallGroupId = await findGroupId(conn, MALL_GROUP);
    if (mallGroupId) {
        const [[cnt]] = await conn.query(
            'SELECT COUNT(*) AS n FROM admin_menus WHERE parent_id = ? AND is_active = 1', [mallGroupId]);
        if (Number(cnt.n) === 0) {
            await conn.query('UPDATE admin_menus SET is_active = 0 WHERE id = ?', [mallGroupId]);
            console.log(`  - 빈 그룹 '${MALL_GROUP}' 비활성화 (id=${mallGroupId})`);
        } else {
            console.log(`  · 그룹 '${MALL_GROUP}' 에 활성 자식 ${cnt.n}개 남아 유지 (id=${mallGroupId})`);
        }
    }
}

async function reset(conn) {
    console.log('\n◀ 원복 (service_group 적용 상태로 — 몰 관리 대메뉴 복원)\n');

    // 1) '몰 관리' 그룹 재활성/복원 (order 5, 최상단).
    const mallGroupId = await upsertGroup(conn, MALL_GROUP, 5, 'bi bi-shop');

    // 2) 몰 리스트·운영자·메뉴·시스템 설정 → '몰 관리' 하위로 환원.
    for (const leaf of MALL_LEAVES_ORIGINAL) {
        await upsertLeaf(conn, leaf, mallGroupId, 'super_admin');
    }

    // 3) '시스템 관리' 그룹 제거(자식은 위에서 몰 관리로 옮겨졌으므로 그룹만 삭제).
    const systemGroupId = await findGroupId(conn, SYSTEM_GROUP);
    if (systemGroupId) {
        await conn.query('DELETE FROM admin_menus WHERE id = ?', [systemGroupId]);
        console.log(`  - 그룹 '${SYSTEM_GROUP}' 삭제 (id=${systemGroupId})`);
    }
}

async function dumpTree(conn) {
    const [rows] = await conn.query(
        `SELECT id, parent_id, display_order, name, path, visible_roles, is_active
         FROM admin_menus WHERE is_active = 1 ORDER BY COALESCE(parent_id, id), display_order`);
    const roots = rows.filter(r => r.parent_id == null);
    console.log('\n  현재 활성 메뉴 트리:');
    for (const root of roots.sort((a, b) => a.display_order - b.display_order)) {
        const tag = root.path ? `→ ${root.path}` : '(그룹)';
        console.log(`   ■ ${root.name} ${tag}  [${root.visible_roles || '전체'}]`);
        rows.filter(r => r.parent_id === root.id)
            .sort((a, b) => a.display_order - b.display_order)
            .forEach(c => console.log(`      └ ${c.name} → ${c.path}  [${c.visible_roles || '전체'}]`));
    }
}

(async () => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        if (RESET) await reset(conn);
        else await apply(conn);
        await conn.commit();
        await dumpTree(conn);
        console.log('\n✅ 완료');
    } catch (err) {
        await conn.rollback();
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
