#!/usr/bin/env node
/**
 * P4 — 테마 시스템 (멱등)
 *
 * 실행: node scripts/migrate_theme.js
 *
 * 생성: theme (mall_id, name, config_json, is_active)
 *
 * 경계 설정 (site_settings 와 중복 최소화):
 *   site_settings  → 브랜드 색상(brand_*_color), 로고, 파비콘  ... 기존 유지
 *   theme.config_json → 레이아웃/카드/버튼/타이포 등 **빌더 전용 스타일 토큰**
 *
 * 설계: docs/사이트개선/frontend_dev_plan.md §7
 */
require('../config/env');
const pool = require('../config/db');

/** 기본 테마 — 현재 하드코딩된 값과 동일해야 회귀가 없다. */
const DEFAULT_THEME = {
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
    buttonRadius: '0.5rem',
    cardRadius: '0.5rem',
    pillRadius: '9999px',
    inputRadius: '0.375rem',
    productCardStyle: 'shadow', // shadow | border | flat
    sectionSpacing: '3rem',
    containerWidth: '72rem',    // max-w-6xl
};

(async () => {
    const conn = await pool.getConnection();
    try {
        console.log('\n[1] theme 테이블');
        await conn.query(`
      CREATE TABLE IF NOT EXISTS \`theme\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`mall_id\` BIGINT NOT NULL DEFAULT 1,
        \`name\` VARCHAR(100) NOT NULL DEFAULT '기본 테마',
        \`config_json\` JSON NULL COMMENT '스타일 토큰(버튼/카드 반경, 폰트, 카드 스타일 등)',
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_theme_mall_active\` (\`mall_id\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='몰별 테마(스타일 토큰)'`);
        console.log('  + theme');

        console.log('\n[2] 기본 테마 시드');
        const [rows] = await conn.query('SELECT id FROM theme WHERE mall_id = 1 AND is_active = 1 LIMIT 1');
        if (rows.length > 0) {
            console.log(`  = 활성 테마 이미 존재 (id=${rows[0].id})`);
        } else {
            const [r] = await conn.query(
                'INSERT INTO theme (mall_id, name, config_json, is_active) VALUES (1, ?, ?, 1)',
                ['기본 테마', JSON.stringify(DEFAULT_THEME)]
            );
            console.log(`  + 기본 테마 생성 (id=${r.insertId})`);
        }

        console.log('\n✅ 마이그레이션 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
