#!/usr/bin/env node
/**
 * mall 2 (종합관) 브랜딩 site_settings 행 시드 (멱등)
 *
 * 실행:  node scripts/seed_mall2_branding.js
 * 제거:  node scripts/seed_mall2_branding.js --remove
 *
 * site_settings 를 몰별 행으로 만든 뒤(P5), 종합관 브랜딩을 넣는다.
 * 기본몰(mall 1) 행을 복사해 모든 필드를 채우고, 종합관에 맞게 몇 개만 덮어쓴다.
 *
 * ⚠️ hero_variant 는 site_settings 에 있다. mall 2 홈 히어로(product_showcase)가
 *    계속 돌려면 이 행에 반드시 'product_showcase' 를 넣어야 한다(빼면 히어로 회귀).
 */
require('../config/env');
const pool = require('../config/db');

const MALL_ID = 2;

const OVERRIDES = {
    company_name: '와이디몰 종합관',
    header_slogan: '패션·뷰티·리빙·가전 — 오늘의 쇼핑',
    slogan: '당신의 일상을 채우는 모든 것',
    company_intro: '패션부터 리빙·가전·식품까지, 매일의 쇼핑을 한 곳에서.',
    hero_variant: 'product_showcase',
    // 건강식품몰(초록)과 시각적으로 구분되도록 인디고 계열
    brand_main_color: '#5B5BD6',
    brand_dark_color: '#4548B5',
    brand_light_color: '#EEF0FB',
};

const isRemove = process.argv.includes('--remove');

(async () => {
    const conn = await pool.getConnection();
    try {
        if (isRemove) {
            const [r] = await conn.query('DELETE FROM site_settings WHERE mall_id = ?', [MALL_ID]);
            console.log(`  - site_settings mall 2 행 ${r.affectedRows}개 삭제`);
            console.log('\n✅ 완료');
            return;
        }

        // 기본몰(mall 1) 행을 원본으로
        const [[base]] = await conn.query('SELECT * FROM site_settings WHERE mall_id = 1 LIMIT 1');
        if (!base) { console.error('❌ 기본몰(mall 1) site_settings 행이 없습니다.'); process.exitCode = 1; return; }

        // 복사본 만들기: id 제거(auto_increment), mall_id=2, 오버라이드 적용
        const row = Object.assign({}, base, OVERRIDES, { mall_id: MALL_ID });
        delete row.id;
        delete row.updated_at;

        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const updates = cols.filter(c => c !== 'mall_id').map(c => `${c} = VALUES(${c})`).join(', ');
        await conn.query(
            `INSERT INTO site_settings (${cols.join(', ')}) VALUES (${placeholders})
             ON DUPLICATE KEY UPDATE ${updates}`,
            cols.map(c => row[c])
        );

        const [[check]] = await conn.query(
            'SELECT company_name, header_slogan, hero_variant, brand_main_color FROM site_settings WHERE mall_id = ?', [MALL_ID]);
        console.log('  mall 2 브랜딩:');
        console.log(`    company_name : ${check.company_name}`);
        console.log(`    header_slogan: ${check.header_slogan}`);
        console.log(`    hero_variant : ${check.hero_variant}  (product_showcase 여야 함)`);
        console.log(`    brand_main   : ${check.brand_main_color}`);

        console.log('\n✅ 완료');
    } catch (err) {
        console.error('\n❌ 실패:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await pool.end();
    }
})();
