#!/usr/bin/env node
/**
 * A3 — 필수 관리자 메뉴 활성화 + Shopify 메뉴 숨김 (멱등)
 *
 * 실행: node scripts/migrate_admin_menu_activate.js
 *
 * 사용자 확정(2026-07-09):
 *   - 쿠폰 / 포인트 / 판매 / 배송 / 문의 는 "비활성"이 아니라 **필수 기능**이다 → 활성화
 *   - Shopify 는 현재 사용하지 않는다 → 기능(라우트·서비스·웹훅)은 그대로 두고 **UI 만 숨김**
 *     · 관리자 'Shopify 주문' 메뉴 비활성화
 *     · 뷰의 Shopify 버튼/선택기는 res.locals.shopifyEnabled 로 숨김 (middleware/shopifyFlag.js)
 *     · 동기화 실동작 차단은 system_settings.shopify_sync_enabled = 0 이 담당
 *
 * 사전 검증(2026-07-09): 5개 화면의 목록 핸들러를 모의 req/res 로 호출해
 *   SQL 오류 없이 render 까지 도달함을 확인했다. 참조 테이블(point_transactions,
 *   shipments, coupons, user_coupons, inquiries)도 모두 실재한다.
 */
require('../config/env');
const pool = require('../config/db');

/**
 * 활성화 대상. visible_roles 가 비어 있으면 **역할 없는 사용자에게도 노출**되므로
 * 반드시 명시한다(운영자 관리 화면의 기존 역할 체계를 따른다).
 */
const ACTIVATE = [
    { path: '/admin/coupons', roles: 'super_admin,admin' },
    { path: '/admin/points', roles: 'super_admin,admin' },
    { path: '/admin/sales', roles: 'super_admin,admin,customer_admin' },
    { path: '/admin/shipping', roles: 'super_admin,customer_admin' },
    { path: '/admin/inquiries', roles: 'super_admin,admin,customer_admin' },
];

/** 숨김 대상 (기능은 유지, 메뉴만 비노출) */
const DEACTIVATE = [
    { path: '/admin/shopify-orders', roles: 'super_admin,admin' },
];

async function apply(conn, rows, isActive, label) {
    console.log(`\n[${label}]`);
    for (const r of rows) {
        const [res] = await conn.query(
            'UPDATE admin_menus SET is_active = ?, visible_roles = ? WHERE path = ?',
            [isActive, r.roles, r.path]
        );
        const state = res.affectedRows ? (res.changedRows ? '변경' : '동일') : '대상 없음';
        console.log(`  ${res.affectedRows ? '·' : '!'} ${r.path.padEnd(24)} is_active=${isActive} roles=${r.roles} (${state})`);
    }
}

async function ensureShopifyOff(conn) {
    console.log('\n[3] system_settings.shopify_sync_enabled');
    const [rows] = await conn.query("SELECT setting_value FROM system_settings WHERE setting_key = 'shopify_sync_enabled'");
    const current = rows[0] && rows[0].setting_value;
    if (current === '0') {
        console.log('  = 이미 0 (미사용)');
        return;
    }
    await conn.query(
        `INSERT INTO system_settings (setting_key, setting_value, description)
         VALUES ('shopify_sync_enabled', '0', 'Shopify 동기화 사용 여부 (1=사용, 0=미사용)')
         ON DUPLICATE KEY UPDATE setting_value = '0'`
    );
    console.log(`  ~ '${current}' → '0' (미사용)`);
}

async function report(conn) {
    console.log('\n[4] 최종 메뉴 트리');
    const [rows] = await conn.query(
        'SELECT id, name, path, parent_id, display_order, is_active FROM admin_menus ORDER BY display_order, id'
    );
    const roots = rows.filter(r => !r.parent_id);
    for (const root of roots) {
        console.log(`  ■ ${root.name}${root.path ? ' → ' + root.path : ''}${root.is_active ? '' : ' (비활성)'}`);
        rows.filter(c => c.parent_id === root.id)
            .sort((a, b) => a.display_order - b.display_order)
            .forEach(c => console.log(`      └ ${c.name} → ${c.path}${c.is_active ? '' : '  ⛔ 비활성'}`));
    }
    const [[a]] = await conn.query('SELECT COUNT(*) AS n FROM admin_menus WHERE path IS NOT NULL AND is_active = 1');
    const [[i]] = await conn.query('SELECT COUNT(*) AS n FROM admin_menus WHERE path IS NOT NULL AND is_active = 0');
    console.log(`\n  활성 잎 메뉴 ${a.n}건 / 비활성 ${i.n}건`);
}

(async () => {
    const conn = await pool.getConnection();
    try {
        await apply(conn, ACTIVATE, 1, '1] 필수 기능 활성화');
        await apply(conn, DEACTIVATE, 0, '2] Shopify 메뉴 숨김 (기능은 유지)');
        await ensureShopifyOff(conn);
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
