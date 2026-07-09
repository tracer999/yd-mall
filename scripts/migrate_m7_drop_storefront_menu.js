#!/usr/bin/env node
/**
 * M7 — 레거시 `storefront_menu` 제거
 *
 * 실행: node scripts/migrate_m7_drop_storefront_menu.js [--dry-run]
 *
 * 안전 장치:
 *   1) feature_menu 계열이 실제로 GNB를 그리고 있는지 확인한다.
 *      (mall_feature_menu.is_enabled AND feature_menu.module_ready 인 gnb 항목이 1건 이상)
 *      → 아니면 DROP 을 거부한다. 메뉴가 통째로 사라지는 사고 방지.
 *   2) 삭제 전 전체 행을 scripts/backup_storefront_menu.sql 로 덤프한다(복구용).
 *
 * 멱등: 테이블이 이미 없으면 아무 것도 하지 않는다.
 */
require('../config/env');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const isDryRun = process.argv.includes('--dry-run');
const BACKUP_PATH = path.join(__dirname, 'backup_storefront_menu.sql');

async function tableExists(conn, table) {
    const [r] = await conn.query(
        `SELECT 1 FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
    );
    return r.length > 0;
}

/** 신규 메뉴 시스템이 GNB를 실제로 그리고 있는지 */
async function newSystemIsLive(conn) {
    const [rows] = await conn.query(`
        SELECT COUNT(*) AS n
        FROM mall_feature_menu m
        JOIN feature_menu f ON f.feature_code = m.feature_code
        WHERE m.is_enabled = 1 AND f.module_ready = 1 AND f.position = 'gnb'
    `);
    return Number(rows[0].n) > 0;
}

function sqlLiteral(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function dumpBackup(conn) {
    const [rows] = await conn.query('SELECT * FROM storefront_menu ORDER BY id');
    const [ddlRows] = await conn.query('SHOW CREATE TABLE storefront_menu');
    const ddl = ddlRows[0]['Create Table'];

    const lines = [
        '-- storefront_menu 백업 (M7 제거 직전 자동 생성)',
        `-- 행 수: ${rows.length}`,
        '-- 복구: 아래 DDL 실행 후 INSERT 실행',
        '',
        `${ddl};`,
        '',
    ];
    for (const r of rows) {
        const cols = Object.keys(r).map(c => `\`${c}\``).join(', ');
        const vals = Object.values(r).map(sqlLiteral).join(', ');
        lines.push(`INSERT INTO \`storefront_menu\` (${cols}) VALUES (${vals});`);
    }
    fs.writeFileSync(BACKUP_PATH, lines.join('\n') + '\n', 'utf8');
    return rows.length;
}

(async () => {
    const conn = await pool.getConnection();
    try {
        if (!(await tableExists(conn, 'storefront_menu'))) {
            console.log('✅ storefront_menu 가 이미 없습니다. (멱등 — 할 일 없음)');
            return;
        }

        if (!(await newSystemIsLive(conn))) {
            console.error('❌ 중단: feature_menu 계열에 활성 GNB 항목이 없습니다.');
            console.error('   지금 storefront_menu 를 지우면 GNB가 비게 됩니다.');
            console.error('   먼저 `node scripts/migrate_menu_architecture.js` 를 실행하세요.');
            process.exitCode = 1;
            return;
        }
        console.log('✅ 신규 메뉴 시스템이 GNB를 렌더 중 — 제거 진행 가능');

        const n = await dumpBackup(conn);
        console.log(`✅ 백업 ${n}행 → ${path.relative(process.cwd(), BACKUP_PATH)}`);

        if (isDryRun) {
            console.log('[DRY RUN] DROP TABLE 실행하지 않음');
            return;
        }

        await conn.query('DROP TABLE `storefront_menu`');
        console.log('✅ DROP TABLE storefront_menu 완료');
    } catch (err) {
        console.error('❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
