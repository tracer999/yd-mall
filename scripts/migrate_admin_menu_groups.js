#!/usr/bin/env node
/**
 * A1 — 관리자 사이드바 메뉴 8그룹 재편 (멱등)
 *
 * 실행: node scripts/migrate_admin_menu_groups.js [--reset]
 *   --reset  그룹을 해제하고 평면 구조로 되돌린다(그룹 행 삭제 + parent_id NULL).
 *
 * 배경: admin_menus 는 19건이 전부 최상위였다. `parent_id` 컬럼은 있는데 미사용.
 *       그룹 행(path IS NULL)을 추가하고 기존 메뉴의 parent_id 를 채운다.
 *
 * ⚠️ 스키마 변경 1건 필요: `path` 가 NOT NULL 이라 그룹 행을 만들 수 없다.
 *    (문서에는 "스키마 변경 불필요"로 적혀 있었으나 실측 결과 틀림)
 *    → `path` 를 NULL 허용으로 바꾼다. 그룹은 링크가 없으므로 path 가 없는 게 맞다.
 *
 * 주의:
 *   - 그룹 행은 `path IS NULL` 로 식별한다. `requireMenuAccess` 는 path 로 조회하므로
 *     그룹 행은 권한 검사에 영향을 주지 않는다.
 *   - 그룹의 visible_roles 는 비워 둔다. 실제 노출 여부는 **자식의 권한**으로 결정되고,
 *     보이는 자식이 하나도 없으면 미들웨어가 그룹을 통째로 숨긴다.
 *   - 멱등 키는 `name` + `path IS NULL` 이다(admin_menus 에 code 컬럼이 없음).
 *     그룹명을 바꾸면 새 그룹이 생기므로, 이름 변경은 이 스크립트에서 해야 한다.
 *
 * 설계: docs/사이트개선/admin_dev_plan.md §2.1
 */
require('../config/env');
const pool = require('../config/db');

const doReset = process.argv.includes('--reset');

/** 8그룹 (대시보드는 그룹 없이 최상위 유지) */
const GROUPS = [
    { name: '쇼핑몰 설정', icon: 'bi bi-building', order: 20 },
    { name: '메뉴/카테고리 관리', icon: 'bi bi-diagram-3', order: 30 },
    { name: '페이지/전시 관리', icon: 'bi bi-columns-gap', order: 40 },
    { name: '상품 관리', icon: 'bi bi-box-seam-fill', order: 50 },
    { name: '프로모션 관리', icon: 'bi bi-ticket-perforated-fill', order: 60 },
    { name: '주문/회원 관리', icon: 'bi bi-receipt', order: 70 },
    { name: '운영/시스템 관리', icon: 'bi bi-gear-fill', order: 80 },
];

/** path → { group, order }. 그룹 내 정렬 순서. */
const ASSIGN = {
    // 최상위 유지 (그룹 없음)
    '/admin': { group: null, order: 0 },

    // 2. 쇼핑몰 설정
    '/admin/site-settings': { group: '쇼핑몰 설정', order: 1 },
    '/admin/policies': { group: '쇼핑몰 설정', order: 2 },

    // 3. 메뉴/카테고리 관리
    '/admin/categories': { group: '메뉴/카테고리 관리', order: 1 },

    // 4. 페이지/전시 관리
    '/admin/page-builder': { group: '페이지/전시 관리', order: 1 },
    '/admin/banners': { group: '페이지/전시 관리', order: 2 },
    '/admin/display': { group: '페이지/전시 관리', order: 3 }, // 레거시 — §11 A-1 에서 제거 예정

    // 5. 상품 관리
    '/admin/products': { group: '상품 관리', order: 1 },

    // 6. 프로모션 관리
    '/admin/coupons': { group: '프로모션 관리', order: 1 },
    '/admin/points': { group: '프로모션 관리', order: 2 },

    // 7. 주문/회원 관리
    '/admin/sales': { group: '주문/회원 관리', order: 1 },
    '/admin/shipping': { group: '주문/회원 관리', order: 2 },
    '/admin/shopify-orders': { group: '주문/회원 관리', order: 3 },
    '/admin/users': { group: '주문/회원 관리', order: 4 },
    '/admin/inquiries': { group: '주문/회원 관리', order: 5 },

    // 8. 운영/시스템 관리
    '/admin/operators': { group: '운영/시스템 관리', order: 1 },
    '/admin/menus': { group: '운영/시스템 관리', order: 2 }, // A2 에서 '관리자 메뉴 관리'로 개명
    '/admin/notices': { group: '운영/시스템 관리', order: 3 },
    '/admin/sys-settings': { group: '운영/시스템 관리', order: 4 },
};

/** 그룹 행은 링크가 없으므로 path 가 NULL 이어야 한다. */
async function relaxPathColumn(conn) {
    console.log('\n[0] admin_menus.path 널 허용');
    const [r] = await conn.query(
        `SELECT IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_menus' AND COLUMN_NAME = 'path'`
    );
    if (r[0] && r[0].IS_NULLABLE === 'YES') {
        console.log('  = 이미 NULL 허용');
        return;
    }
    await conn.query(
        "ALTER TABLE `admin_menus` MODIFY COLUMN `path` VARCHAR(255) NULL COMMENT '클릭 시 이동 URL. NULL = 그룹 행(링크 없음)'"
    );
    console.log('  ~ path → NULL 허용');
}

async function findGroup(conn, name) {
    const [r] = await conn.query(
        'SELECT id FROM admin_menus WHERE name = ? AND path IS NULL LIMIT 1', [name]
    );
    return r[0] || null;
}

async function upsertGroups(conn) {
    console.log('\n[1] 그룹 행 생성/갱신');
    const idByName = {};
    for (const g of GROUPS) {
        const existing = await findGroup(conn, g.name);
        if (existing) {
            await conn.query(
                'UPDATE admin_menus SET icon_class = ?, display_order = ?, is_active = 1, parent_id = NULL WHERE id = ?',
                [g.icon, g.order, existing.id]
            );
            idByName[g.name] = existing.id;
            console.log(`  = '${g.name}' 갱신 (id=${existing.id})`);
        } else {
            const [r] = await conn.query(
                `INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles)
                 VALUES (?, NULL, ?, ?, NULL, 1, NULL)`,
                [g.name, g.icon, g.order]
            );
            idByName[g.name] = r.insertId;
            console.log(`  + '${g.name}' 생성 (id=${r.insertId})`);
        }
    }
    return idByName;
}

async function assignParents(conn, idByName) {
    console.log('\n[2] 기존 메뉴 그룹 배치');
    const [menus] = await conn.query('SELECT id, name, path FROM admin_menus WHERE path IS NOT NULL');

    let moved = 0;
    const unmapped = [];
    for (const m of menus) {
        const spec = ASSIGN[m.path];
        if (!spec) { unmapped.push(m); continue; }

        const parentId = spec.group ? idByName[spec.group] : null;
        await conn.query(
            'UPDATE admin_menus SET parent_id = ?, display_order = ? WHERE id = ?',
            [parentId, spec.order, m.id]
        );
        moved++;
        console.log(`  · [${m.id}] ${m.name.padEnd(14)} → ${spec.group || '(최상위)'}`);
    }
    console.log(`  총 ${moved}건 배치`);

    if (unmapped.length) {
        console.log('\n  ⚠️ 매핑되지 않은 메뉴 (최상위로 남음 — ASSIGN 에 추가 필요):');
        unmapped.forEach(m => console.log(`    [${m.id}] ${m.name} → ${m.path}`));
    }
}

async function reset(conn) {
    console.log('\n[reset] 평면 구조로 복구');
    const [r1] = await conn.query('UPDATE admin_menus SET parent_id = NULL WHERE parent_id IS NOT NULL');
    console.log(`  · parent_id 해제 ${r1.affectedRows}건`);
    const names = GROUPS.map(g => g.name);
    const [r2] = await conn.query('DELETE FROM admin_menus WHERE path IS NULL AND name IN (?)', [names]);
    console.log(`  · 그룹 행 삭제 ${r2.affectedRows}건`);
}

async function report(conn) {
    console.log('\n[3] 최종 트리');
    const [rows] = await conn.query(
        'SELECT id, name, path, parent_id, display_order, is_active FROM admin_menus ORDER BY display_order, id'
    );
    const roots = rows.filter(r => !r.parent_id);
    for (const root of roots) {
        const mark = root.is_active ? '' : ' (비활성)';
        console.log(`  ■ ${root.name}${root.path ? ' → ' + root.path : ''}${mark}`);
        rows.filter(c => c.parent_id === root.id)
            .sort((a, b) => a.display_order - b.display_order)
            .forEach(c => console.log(`      └ ${c.name} → ${c.path}${c.is_active ? '' : ' (비활성)'}`));
    }
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (doReset) {
            await reset(conn);
            await report(conn);
            console.log('\n✅ 복구 완료');
            return;
        }
        await relaxPathColumn(conn);
        const idByName = await upsertGroups(conn);
        await assignParents(conn, idByName);
        await report(conn);
        console.log('\n✅ 마이그레이션 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
