#!/usr/bin/env node
/**
 * GNB 기본 메뉴 구성 (멱등)
 *
 * 실행: node scripts/seed_gnb_menus.js
 *
 * 사용자 확정(2026-07-09) — 기본 GNB 메뉴 8종과 순서:
 *   오늘특가 · 베스트 · 기획전 · 이벤트 · 브랜드 · 신상품 · 공동구매 · 라이브
 *
 * 이 스크립트는 **초기값**만 세팅한다. 이후 ON/OFF·순서·표시명은
 * 관리자 > 메뉴/카테고리 관리 > 일반 메뉴 관리 (/admin/feature-menus) 에서 조정한다.
 *
 * 주의: 기획전/공동구매/라이브는 전용 모듈이 없어 '준비 중' 랜딩 페이지로 연결된다
 *      (routes/feature.js). 죽은 링크가 아니라 실제 200 페이지다.
 */
require('../config/env');
const pool = require('../config/db');

/** [feature_code, sort_order] — CATEGORY(고정 버튼)는 sort_order 1 */
const GNB_ORDER = [
    ['TODAY_DEAL', 2],
    ['BEST', 3],
    ['EXHIBITION', 4],
    ['EVENT', 5],
    ['BRAND', 6],
    ['NEW_PRODUCT', 7],
    ['GROUP_BUY', 8],
    ['LIVE', 9],
];

/** GNB 최대 노출 수 = 기능 메뉴 8 + 커스텀 슬롯 3 (navigationService 가 총량으로 자른다) */
const MAX_GNB_ITEMS = 11;

(async () => {
    const conn = await pool.getConnection();
    try {
        const enabled = new Set(GNB_ORDER.map(([code]) => code));

        console.log('\n[1] 요청된 8종 활성화 + 순서 지정');
        for (const [code, order] of GNB_ORDER) {
            const [f] = await conn.query('SELECT module_ready, default_path FROM feature_menu WHERE feature_code = ?', [code]);
            if (f.length === 0) { console.log(`  ! ${code}: feature_menu 에 없음 — 건너뜀`); continue; }
            if (!f[0].module_ready) {
                console.log(`  ⚠ ${code}: module_ready=0 → 켜도 노출되지 않는다. migrate_menu_architecture.js 를 먼저 실행하세요.`);
            }
            await conn.query(
                `INSERT INTO mall_feature_menu (mall_id, feature_code, sort_order, is_enabled)
                 VALUES (1, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order), is_enabled = 1`,
                [code, order]
            );
            console.log(`  · ${String(order).padStart(2)}. ${code.padEnd(12)} → ${f[0].default_path || '(드롭다운)'}`);
        }

        console.log('\n[2] 카테고리 버튼 고정(sort 1)');
        await conn.query(
            `INSERT INTO mall_feature_menu (mall_id, feature_code, sort_order, is_enabled)
             VALUES (1, 'CATEGORY', 1, 1)
             ON DUPLICATE KEY UPDATE sort_order = 1, is_enabled = 1`
        );
        console.log('  · CATEGORY 활성');

        console.log('\n[3] 요청되지 않은 GNB 메뉴는 비활성');
        const [others] = await conn.query(
            "SELECT feature_code FROM feature_menu WHERE position = 'gnb' AND feature_code <> 'CATEGORY'"
        );
        for (const { feature_code } of others) {
            if (enabled.has(feature_code)) continue;
            await conn.query(
                `INSERT INTO mall_feature_menu (mall_id, feature_code, is_enabled)
                 VALUES (1, ?, 0)
                 ON DUPLICATE KEY UPDATE is_enabled = 0`,
                [feature_code]
            );
            console.log(`  · ${feature_code} 비활성`);
        }

        console.log('\n[4] navigation_config.max_gnb_items');
        // 기능 8종이 슬롯을 다 채우면 커스텀 메뉴가 잘린다. 커스텀 3슬롯을 위해 총량을 늘린다.
        const [[cfg]] = await conn.query('SELECT max_gnb_items FROM navigation_config WHERE mall_id = 1');
        if (cfg && Number(cfg.max_gnb_items) === MAX_GNB_ITEMS) {
            console.log(`  = 이미 ${MAX_GNB_ITEMS}`);
        } else {
            await conn.query('UPDATE navigation_config SET max_gnb_items = ? WHERE mall_id = 1', [MAX_GNB_ITEMS]);
            console.log(`  ~ ${cfg ? cfg.max_gnb_items : '?'} → ${MAX_GNB_ITEMS} (기능 8 + 커스텀 슬롯 3)`);
        }

        console.log('\n[5] 최종 GNB (is_enabled AND module_ready)');
        const [rows] = await conn.query(`
            SELECT m.sort_order, f.feature_code, COALESCE(NULLIF(m.display_name,''), f.default_name) AS name,
                   f.default_path, f.module_ready
            FROM mall_feature_menu m JOIN feature_menu f ON f.feature_code = m.feature_code
            WHERE m.mall_id = 1 AND m.is_enabled = 1 AND f.position = 'gnb'
            ORDER BY m.sort_order`);
        rows.forEach(r => console.log(
            `  ${String(r.sort_order).padStart(2)}. ${r.name.padEnd(12)} ${String(r.default_path || '(드롭다운)').padEnd(14)} ${r.module_ready ? '' : '⛔ module_ready=0 → 미노출'}`
        ));

        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
