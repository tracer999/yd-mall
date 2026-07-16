#!/usr/bin/env node
/**
 * 관리자 대메뉴 재편 — '몰 관리' / '서비스 관리' 대메뉴 신설 + 제공자 기능 이관 (멱등)
 *
 * 실행:
 *   node scripts/migrate_admin_menu_service_group.js          # 적용
 *   node scripts/migrate_admin_menu_service_group.js --reset  # 원복
 *
 * 배경 (몰 빌더 성격):
 *   이 앱은 "몰 하나를 운영"하는 게 아니라, 고객에게 몰을 찍어내 납품하는 몰 빌더다.
 *   납품받은 몰 운영자(admin/customer_admin/content_admin)에게 **보이면 안 되는**
 *   서비스 제공자(super_admin) 전용 기능을 대메뉴로 모으고 super_admin 에게만 노출한다.
 *   (추후 별도 서비스로 완전 분리하기 위한 1단계 — 인스턴스는 아직 나누지 않는다.)
 *
 * 적용 후 트리:
 *   ■ 몰 관리 (대메뉴, super_admin) — 이 인스턴스/몰을 운영하는 제공자 기능(메인 관리자에 잔류)
 *      └ 몰 리스트 관리 (/admin/malls) · 운영자 관리 (/admin/operators)
 *      └ 관리자 메뉴 관리 (/admin/menus) · 시스템 설정 (/admin/sys-settings)
 *   ■ 쇼핑몰 관리 (← '쇼핑몰 설정' 개명)
 *      └ 대시보드 (/admin/dashboard, 이동) + 기존 항목
 *   ■ 서비스 관리 (대메뉴, super_admin) — 향후 완전 분리된 독립 인스턴스로 뺄 수 있는 것만.
 *      납품 고객이 쓰는 메뉴는 넣지 않는다(순수 서비스 제공자/SaaS 제어판 기능만).
 *      └ 배포·포팅 관리 (/admin/service/porting) · 등급별 기능 설정 (/admin/service/features)
 *
 * ⚠️ 라우트(routes/admin/service.js)가 운영에 배포된 **뒤에** 실행한다.
 *    dev·prod 공용 DB + adminMenu 가 라우트 존재를 확인하지 않으므로,
 *    먼저 올리면 운영 사이드바에 404 링크가 뜬다. (기존 이관 항목은 라우트가 이미 있어 영향 없음)
 */
require('../config/env');
const pool = require('../config/db');

const RESET = process.argv.includes('--reset');

const MALL_GROUP = '몰 관리';
const SERVICE_GROUP = '서비스 관리';
const LEGACY_GROUP = '운영/시스템 관리';
const SHOPPING_GROUP_OLD = '쇼핑몰 설정';
const SHOPPING_GROUP_NEW = '쇼핑몰 관리';

// '몰 관리' 대메뉴 하위 (모두 super_admin 전용) — 이 인스턴스/몰을 운영하는 제공자 기능.
// 분리된 서비스 인스턴스로는 빠지지 않고 메인 관리자에 남는다. 시스템 설정(인프라 시크릿)도
// 개별 몰 앱 인스턴스가 계속 들고 있어야 할 런타임 설정이라 여기 둔다.
const MALL_LEAVES = [
    { path: '/admin/malls', name: '몰 리스트 관리', icon: 'bi bi-shop-window', order: 10 },
    { path: '/admin/operators', name: '운영자 관리', icon: 'bi bi-person-badge', order: 20 },
    { path: '/admin/menus', name: '관리자 메뉴 관리', icon: 'bi bi-list-nested', order: 30 },
    { path: '/admin/sys-settings', name: '시스템 설정', icon: 'bi bi-sliders2', order: 40 },
];

// '서비스 관리' 대메뉴 하위 (모두 super_admin 전용) — 향후 **완전 분리된 독립 인스턴스**로
// 뺄 수 있는 서비스 제어판 기능만 넣는다(몰들을 가로질러 제어하는 SaaS 성격).
const SERVICE_LEAVES = [
    { path: '/admin/service/porting', name: '배포·포팅 관리', icon: 'bi bi-box-seam', order: 10 },
    { path: '/admin/service/features', name: '등급별 기능 설정', icon: 'bi bi-toggles', order: 20 },
    // 몰 생성 시 새 몰로 복제되는 샘플 리소스(sample_category/product/hero_slide) 편집.
    // 몰과 무관한 전역 데이터 = 몰들을 가로지르는 제어판 성격이라 여기에 둔다.
    { path: '/admin/service/samples', name: '샘플 데이터 관리', icon: 'bi bi-collection', order: 30 },
];

// --reset 시 되돌릴 원래 상태 (운영/시스템 관리 그룹으로 복귀 / 몰 관리는 최상위 잎)
const ORIGINAL_STATE = {
    '/admin/malls': { toTopLevel: true, order: -10, roles: 'super_admin,admin', name: '몰 관리' },
    '/admin/operators': { group: LEGACY_GROUP, order: 1, roles: 'super_admin', name: '운영자 관리' },
    '/admin/menus': { group: LEGACY_GROUP, order: 3, roles: 'super_admin,admin', name: '관리자 메뉴 관리' },
    '/admin/sys-settings': { group: LEGACY_GROUP, order: 4, roles: 'super_admin,admin', name: '시스템 설정' },
};

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

/** path 로 잎 메뉴를 찾아 이름/부모/순서/역할/노출을 upsert. 없으면 새로 만든다. parentId=null 이면 최상위 잎. */
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
    console.log('\n▶ 대메뉴 재편 — 몰 관리 / 서비스 관리 (super_admin 전용)\n');

    // 0) '쇼핑몰 설정' → '쇼핑몰 관리' 그룹명 변경
    const [rn] = await conn.query('UPDATE admin_menus SET name = ? WHERE name = ? AND path IS NULL',
        [SHOPPING_GROUP_NEW, SHOPPING_GROUP_OLD]);
    if (rn.affectedRows) console.log(`  = 그룹명 '${SHOPPING_GROUP_OLD}' → '${SHOPPING_GROUP_NEW}'`);
    const shoppingId = await findGroupId(conn, SHOPPING_GROUP_NEW);

    // 1) '몰 관리' 대메뉴(최상단) + 하위
    const mallGroupId = await upsertGroup(conn, MALL_GROUP, 5, 'bi bi-shop');
    for (const leaf of MALL_LEAVES) {
        await upsertLeaf(conn, leaf, mallGroupId, 'super_admin');
    }

    // 2) '서비스 관리' 대메뉴(하단) + 하위
    const serviceGroupId = await upsertGroup(conn, SERVICE_GROUP, 90, 'bi bi-hdd-network');
    for (const leaf of SERVICE_LEAVES) {
        await upsertLeaf(conn, leaf, serviceGroupId, 'super_admin');
    }

    // 3) 대시보드 → '쇼핑몰 관리' 그룹 하위로 이동. 역할은 기존 유지.
    if (shoppingId) {
        await conn.query("UPDATE admin_menus SET parent_id = ?, display_order = 5, is_active = 1 WHERE path = '/admin/dashboard'", [shoppingId]);
        console.log(`  = '대시보드' → '${SHOPPING_GROUP_NEW}' 하위로 이동`);
    }

    // 4) 비워진 '운영/시스템 관리' 그룹은 남은 활성 자식이 없으면 숨긴다.
    const legacyId = await findGroupId(conn, LEGACY_GROUP);
    if (legacyId) {
        const [[cnt]] = await conn.query(
            'SELECT COUNT(*) AS n FROM admin_menus WHERE parent_id = ? AND is_active = 1', [legacyId]);
        if (Number(cnt.n) === 0) {
            await conn.query('UPDATE admin_menus SET is_active = 0 WHERE id = ?', [legacyId]);
            console.log(`  - 빈 그룹 '${LEGACY_GROUP}' 비활성화 (id=${legacyId})`);
        } else {
            console.log(`  · 그룹 '${LEGACY_GROUP}' 에 활성 자식 ${cnt.n}개 남아 유지 (id=${legacyId})`);
        }
    }
}

async function reset(conn) {
    console.log('\n◀ 원복 (운영/시스템 관리로 환원 + 쇼핑몰 설정 개명 복구)\n');

    // '쇼핑몰 관리' → '쇼핑몰 설정' 그룹명 환원
    await conn.query('UPDATE admin_menus SET name = ? WHERE name = ? AND path IS NULL',
        [SHOPPING_GROUP_OLD, SHOPPING_GROUP_NEW]);

    // 운영/시스템 관리 그룹 재활성(있으면). 없으면 만들지 않는다.
    let legacyId = await findGroupId(conn, LEGACY_GROUP);
    if (legacyId) {
        await conn.query('UPDATE admin_menus SET is_active = 1 WHERE id = ?', [legacyId]);
    }

    for (const [path, st] of Object.entries(ORIGINAL_STATE)) {
        const [rows] = await conn.query('SELECT id FROM admin_menus WHERE path = ? LIMIT 1', [path]);
        if (!rows.length) continue;
        if (st.toTopLevel) {
            await conn.query('UPDATE admin_menus SET parent_id = NULL, display_order = ?, visible_roles = ?, name = ?, is_active = 1 WHERE id = ?',
                [st.order, st.roles, st.name, rows[0].id]);
        } else if (legacyId) {
            await conn.query('UPDATE admin_menus SET parent_id = ?, display_order = ?, visible_roles = ?, name = ?, is_active = 1 WHERE id = ?',
                [legacyId, st.order, st.roles, st.name, rows[0].id]);
        }
        console.log(`  = '${path}' 원복`);
    }

    // 대시보드는 운영/시스템 관리 그룹으로 환원.
    if (legacyId) {
        await conn.query("UPDATE admin_menus SET parent_id = ?, display_order = 0, is_active = 1 WHERE path = '/admin/dashboard'", [legacyId]);
    }

    // 서비스 전용 신설 잎/그룹 제거.
    await conn.query("DELETE FROM admin_menus WHERE path IN ('/admin/service/porting', '/admin/service/features', '/admin/service/samples')");
    for (const g of [SERVICE_GROUP, MALL_GROUP]) {
        const id = await findGroupId(conn, g);
        if (id) {
            await conn.query('DELETE FROM admin_menus WHERE id = ?', [id]);
            console.log(`  - 그룹 '${g}' 삭제`);
        }
    }
    console.log('  = 신설 서비스 메뉴 제거');
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
