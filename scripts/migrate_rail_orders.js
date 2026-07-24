#!/usr/bin/env node
/**
 * 우측레일 바로가기: 「찜한 브랜드」 → 「주문내역」 교체 (멱등)
 *
 * 실행:   node scripts/migrate_rail_orders.js
 * 되돌림: node scripts/migrate_rail_orders.js --revert
 *
 * 왜 삭제+삽입이 아니라 **같은 행을 UPDATE** 하는가:
 *   몰별 행(`mall_feature_menu`)은 `sort_order`·`is_enabled`·`pc/mobile_visible` 같은
 *   운영자 설정을 들고 있다. 지우고 새로 만들면 그 슬롯이 초기화되고, 새 행은
 *   `featureMenuSync` 백필이 카탈로그 기본값으로 다시 만들어 순서가 뒤로 밀린다.
 *   feature_code 만 갈아끼우면 레일 3번째 자리가 그대로 유지된다.
 *
 * 찜한 브랜드는 사라지는 게 아니라 **찜 화면(`/mypage/likes`)의 탭**으로 들어간다.
 * `/mypage/brand-likes` 라우트는 살아 있고(리다이렉트) `brand_likes` 테이블도 그대로다.
 */
require('../config/env');
const pool = require('../config/db');

const OLD = 'RAIL_BRAND_WISHLIST';
const NEW = 'RAIL_ORDERS';
const isRevert = process.argv.includes('--revert');

// 카탈로그 행의 교체 후/전 모습. required_module 은 주문 모듈이 항상 있으므로 NULL.
const CATALOG = {
    [NEW]: {
        default_name: '주문내역',
        default_path: '/mypage/orders',
        required_module: null,
        module_ready: 1,
        is_system: 1,
        description: '주문내역 바로가기',
    },
    [OLD]: {
        default_name: '찜한 브랜드',
        default_path: '/mypage/brand-likes',
        required_module: 'brand_like',
        module_ready: 1,
        is_system: 0,
        description: '찜한 브랜드',
    },
};

(async () => {
    const from = isRevert ? NEW : OLD;
    const to = isRevert ? OLD : NEW;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [[src]] = await conn.query(
            'SELECT id FROM feature_menu WHERE feature_code = ?', [from]);
        if (!src) {
            console.log(`  = ${from} 없음 — 이미 적용된 상태로 보고 건너뜁니다.`);
            await conn.rollback();
            return;
        }

        // uk_mall_feature(mall_id, feature_code) 충돌 방지: 목적지 코드 행이 이미 있는 몰은
        // 그 행을 남기고 원본 행을 지운다(중복 버튼을 만들지 않는다).
        const [dupes] = await conn.query(`
            SELECT o.id
              FROM mall_feature_menu o
              JOIN mall_feature_menu n
                ON n.mall_id = o.mall_id AND n.feature_code = ?
             WHERE o.feature_code = ?
        `, [to, from]);
        if (dupes.length) {
            await conn.query(
                `DELETE FROM mall_feature_menu WHERE id IN (${dupes.map(() => '?').join(',')})`,
                dupes.map(r => r.id));
            console.log(`  - 중복 몰별 행 ${dupes.length}건 정리`);
        }

        // 몰별 행은 직접 옮기지 않는다 — fk_mfm_feature 가 ON UPDATE CASCADE 라
        // 부모(feature_menu.feature_code)를 바꾸면 자식이 따라온다.
        // 자식을 먼저 건드리면 부모에 없는 코드라 FK 위반이 난다.
        const [[{ n: moved }]] = await conn.query(
            'SELECT COUNT(*) AS n FROM mall_feature_menu WHERE feature_code = ?', [from]);

        const c = CATALOG[to];
        await conn.query(`
            UPDATE feature_menu
               SET feature_code = ?, default_name = ?, default_path = ?,
                   required_module = ?, module_ready = ?, is_system = ?, description = ?
             WHERE id = ?
        `, [to, c.default_name, c.default_path, c.required_module,
            c.module_ready, c.is_system, c.description, src.id]);

        // 운영자가 바꾼 표시명이 옛 이름으로 남으면 버튼 라벨이 그대로 「찜한 브랜드」다.
        const [renamed] = await conn.query(
            'UPDATE mall_feature_menu SET display_name = NULL WHERE feature_code = ? AND display_name IS NOT NULL',
            [to]);

        await conn.commit();
        console.log(`  ~ feature_menu#${src.id}: ${from} → ${to} (${c.default_name} ${c.default_path})`);
        console.log(`  ~ mall_feature_menu ${moved}건 CASCADE 이관, 표시명 초기화 ${renamed.affectedRows}건`);
    } catch (err) {
        await conn.rollback();
        console.error('실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
