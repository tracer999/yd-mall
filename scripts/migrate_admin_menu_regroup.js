#!/usr/bin/env node
/**
 * 관리자 사이드바 메뉴 그룹 재배치 (멱등)
 *
 * 실행: node scripts/migrate_admin_menu_regroup.js
 *
 * 변경 내용
 *   1. 이벤트 관리      : 페이지/전시 관리 → 프로모션 관리   (판매촉진 성격)
 *   2. 상품 그룹 관리   : 페이지/전시 관리 → 상품 관리       (상품 큐레이션 성격)
 *   3. '고객지원 관리' 그룹 신설 → 문의 관리(주문/회원) + 공지사항·고객센터(운영/시스템) 이관
 *   4. 위 이동으로 생긴 그룹 내 순번 공백 재정렬
 *
 * 유지(사용자 결정)
 *   - 기획전 관리 / 공동구매 관리 → 페이지/전시 관리 그대로
 *   - 배송비 정책              → 주문/회원 관리 그대로
 *
 * 멱등 키는 그룹 = `name` + `path IS NULL`, 메뉴 = `path` 이다(admin_menus 에 code 컬럼 없음).
 * 참고: scripts/migrate_admin_menu_groups.js (최초 8그룹 편성)
 */
require('../config/env');
const pool = require('../config/db');

/** 신설 그룹. 주문/회원(70) 과 운영/시스템(80) 사이. */
const NEW_GROUPS = [
    { name: '고객지원 관리', icon: 'bi bi-headset', order: 75 },
];

/** path → { group, order }. 이동·재정렬 대상만 나열한다. */
const ASSIGN = {
    // 페이지/전시 관리 — 상품그룹·이벤트가 빠진 뒤 재정렬
    '/admin/page-builder': { group: '페이지/전시 관리', order: 1 },
    '/admin/banners': { group: '페이지/전시 관리', order: 2 },
    '/admin/exhibitions': { group: '페이지/전시 관리', order: 3 },
    '/admin/group-buys': { group: '페이지/전시 관리', order: 4 },

    // 상품 관리 — 상품 그룹 관리 편입
    '/admin/products': { group: '상품 관리', order: 1 },
    '/admin/product-groups': { group: '상품 관리', order: 2 },

    // 프로모션 관리 — 이벤트 관리 편입
    '/admin/coupons': { group: '프로모션 관리', order: 1 },
    '/admin/points': { group: '프로모션 관리', order: 2 },
    '/admin/events': { group: '프로모션 관리', order: 3 },

    // 주문/회원 관리 — 문의 관리 이관 후 재정렬
    '/admin/sales': { group: '주문/회원 관리', order: 1 },
    '/admin/shipping': { group: '주문/회원 관리', order: 2 },
    '/admin/shipping-policy': { group: '주문/회원 관리', order: 3 },
    '/admin/claims': { group: '주문/회원 관리', order: 4 },
    '/admin/shopify-orders': { group: '주문/회원 관리', order: 5 },
    '/admin/users': { group: '주문/회원 관리', order: 6 },

    // 고객지원 관리 (신설)
    '/admin/inquiries': { group: '고객지원 관리', order: 1 },
    '/admin/faqs': { group: '고객지원 관리', order: 2 },
    '/admin/notices': { group: '고객지원 관리', order: 3 },

    // 운영/시스템 관리 — 공지사항·고객센터 이관 후 재정렬
    '/admin/malls': { group: '운영/시스템 관리', order: 1 },
    '/admin/operators': { group: '운영/시스템 관리', order: 2 },
    '/admin/menus': { group: '운영/시스템 관리', order: 3 },
    '/admin/sys-settings': { group: '운영/시스템 관리', order: 4 },
};

async function main() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        console.log('[1] 그룹 행 확보');
        for (const g of NEW_GROUPS) {
            const [rows] = await conn.query(
                'SELECT id FROM admin_menus WHERE name = ? AND path IS NULL LIMIT 1',
                [g.name]
            );
            if (rows.length) {
                await conn.query('UPDATE admin_menus SET icon_class = ?, display_order = ?, is_active = 1 WHERE id = ?', [g.icon, g.order, rows[0].id]);
                console.log(`    = ${g.name} (id=${rows[0].id}) 갱신`);
            } else {
                const [r] = await conn.query(
                    'INSERT INTO admin_menus (name, path, icon_class, display_order, parent_id, is_active, visible_roles) VALUES (?, NULL, ?, ?, NULL, 1, NULL)',
                    [g.name, g.icon, g.order]
                );
                console.log(`    + ${g.name} (id=${r.insertId}) 생성`);
            }
        }

        // 그룹명 → id
        const [groupRows] = await conn.query('SELECT id, name FROM admin_menus WHERE path IS NULL');
        const groupId = Object.fromEntries(groupRows.map((r) => [r.name, r.id]));

        console.log('[2] 메뉴 재배치');
        for (const [path, { group, order }] of Object.entries(ASSIGN)) {
            const pid = groupId[group];
            if (!pid) throw new Error(`그룹 없음: ${group}`);
            const [r] = await conn.query(
                'UPDATE admin_menus SET parent_id = ?, display_order = ? WHERE path = ?',
                [pid, order, path]
            );
            if (!r.affectedRows) console.warn(`    ! 대상 없음: ${path}`);
            else if (r.changedRows) console.log(`    → ${path} : ${group} #${order}`);
        }

        await conn.commit();
        console.log('\n완료.');
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
