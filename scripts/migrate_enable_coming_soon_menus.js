#!/usr/bin/env node
/**
 * 미구현 모듈 4종(RANKING · OUTLET · COUPON · MEMBERSHIP)을 GNB 에 노출 (멱등)
 *
 * 실행:   node scripts/migrate_enable_coming_soon_menus.js
 * 되돌림: node scripts/migrate_enable_coming_soon_menus.js --revert
 *
 * ⚠️ **`routes/feature.js` 의 랜딩 라우트가 운영에 배포된 뒤에** 실행할 것.
 *    dev·prod 가 같은 DB 라, 먼저 올리면 운영 GNB 에 404 링크가 뜬다.
 *
 * 하는 일
 *   1) `feature_menu.module_ready = 1` — 렌더 게이트를 연다.
 *      (`navigationService` 의 렌더 조건이 `is_enabled AND module_ready` 이므로 둘 다 필요)
 *   2) `mall_feature_menu.is_enabled = 1` — 몰에서 켠다.
 *   3) `navigation_config.max_gnb_items` 를 필요한 만큼 올린다.
 *      GNB 는 상한을 넘으면 **뒤에서 잘린다**. 4종을 켜고 상한을 그대로 두면
 *      기존 메뉴가 조용히 사라진다.
 *
 * 이 4종은 실제 기능이 아니라 '준비 중' 랜딩(200, noindex)이다.
 * `#` 죽은 링크가 아니라 실제 페이지이므로 `module_ready = 1` 이 정당하다
 * (기획전·공동구매·쇼핑라이브와 같은 처리).
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 1;
const CODES = ['RANKING', 'OUTLET', 'COUPON', 'MEMBERSHIP'];
const isRevert = process.argv.includes('--revert');

(async () => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        if (isRevert) {
            await conn.query(
                `UPDATE feature_menu SET module_ready = 0 WHERE feature_code IN (?, ?, ?, ?)`, CODES
            );
            await conn.query(
                `UPDATE mall_feature_menu SET is_enabled = 0 WHERE mall_id = ? AND feature_code IN (?, ?, ?, ?)`,
                [MALL_ID, ...CODES]
            );
            console.log(`  ~ ${CODES.join(', ')} → module_ready=0, is_enabled=0`);
        } else {
            await conn.query(
                `UPDATE feature_menu SET module_ready = 1 WHERE feature_code IN (?, ?, ?, ?)`, CODES
            );
            // mall_feature_menu 행이 없을 수도 있으므로 upsert
            for (const code of CODES) {
                const [[f]] = await conn.query(
                    'SELECT default_sort_order FROM feature_menu WHERE feature_code = ?', [code]
                );
                await conn.query(`
                    INSERT INTO mall_feature_menu (mall_id, feature_code, sort_order, is_enabled, pc_visible, mobile_visible)
                    VALUES (?, ?, ?, 1, 1, 1)
                    ON DUPLICATE KEY UPDATE is_enabled = 1, pc_visible = 1, mobile_visible = 1
                `, [MALL_ID, code, f ? f.default_sort_order : 0]);
            }
            console.log(`  ~ ${CODES.join(', ')} → module_ready=1, is_enabled=1`);
        }

        // GNB 후보 수를 세어 상한을 맞춘다 (CATEGORY 는 고정 버튼이라 제외 — navigationService 와 같은 기준)
        const [[cnt]] = await conn.query(`
            SELECT COUNT(*) AS n
            FROM mall_feature_menu m JOIN feature_menu f ON f.feature_code = m.feature_code
            WHERE m.mall_id = ? AND m.is_enabled = 1 AND f.module_ready = 1
              AND f.position = 'gnb' AND f.feature_code <> 'CATEGORY'
        `, [MALL_ID]);
        const [[custom]] = await conn.query(
            "SELECT COUNT(*) AS n FROM custom_menu WHERE mall_id = ? AND is_enabled = 1 AND location = 'gnb'", [MALL_ID]
        );
        const [[cfg]] = await conn.query(
            'SELECT max_gnb_items, max_custom_items FROM navigation_config WHERE mall_id = ?', [MALL_ID]
        );

        const needed = Number(cnt.n) + Math.min(Number(custom.n), Number(cfg.max_custom_items));
        if (needed > cfg.max_gnb_items) {
            const next = Math.min(needed, 20); // Header 설정(B5)의 상한과 동일
            await conn.query('UPDATE navigation_config SET max_gnb_items = ? WHERE mall_id = ?', [next, MALL_ID]);
            console.log(`  ~ max_gnb_items ${cfg.max_gnb_items} → ${next} (GNB 후보 ${needed}개, 잘림 방지)`);
        } else {
            console.log(`  = max_gnb_items ${cfg.max_gnb_items} 유지 (GNB 후보 ${needed}개)`);
        }

        await conn.commit();

        const [rows] = await conn.query(`
            SELECT f.feature_code, f.default_name, f.default_path, f.module_ready, m.is_enabled, m.sort_order
            FROM feature_menu f
            LEFT JOIN mall_feature_menu m ON m.feature_code = f.feature_code AND m.mall_id = ?
            WHERE f.position = 'gnb'
            ORDER BY m.sort_order, f.default_sort_order
        `, [MALL_ID]);
        console.log('\n  [GNB]');
        rows.forEach(r => {
            const on = Number(r.module_ready) && Number(r.is_enabled);
            console.log(`    ${on ? '✓' : '·'} ${r.default_name} → ${r.default_path || '(드롭다운)'}`);
        });

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
