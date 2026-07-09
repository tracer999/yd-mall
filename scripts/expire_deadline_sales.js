/**
 * 기간임박할인 만료 처리 스크립트
 * - badge_expire_date가 지난 상품을 SOLD_OUT으로 변경하고 DEADLINE_SALE 뱃지 제거
 * - cron으로 매일 00:05에 실행 권장
 *
 * 사용: node scripts/expire_deadline_sales.js
 * cron: 5 0 * * * cd /home/bsfkorea/greengub && node scripts/expire_deadline_sales.js >> logs/cron.log 2>&1
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production') });
const mysql = require('mysql2/promise');

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 2
    });

    try {
        const today = new Date().toISOString().split('T')[0];
        console.log(`[${new Date().toISOString()}] 기간임박할인 만료 체크 (기준일: ${today})`);

        // badge_expire_date가 오늘 이전이고 DEADLINE_SALE 뱃지가 있는 상품 조회
        const [expired] = await pool.query(`
            SELECT id, name, product_badge, status, badge_expire_date
            FROM products
            WHERE badge_expire_date IS NOT NULL
              AND badge_expire_date < ?
              AND FIND_IN_SET('DEADLINE_SALE', product_badge)
        `, [today]);

        if (expired.length === 0) {
            console.log('만료된 기간임박할인 상품 없음');
        } else {
            for (const p of expired) {
                // DEADLINE_SALE 뱃지 제거
                const badges = p.product_badge.split(',').filter(b => b !== 'DEADLINE_SALE');
                const newBadge = badges.length > 0 ? badges.join(',') : null;

                await pool.query(`
                    UPDATE products
                    SET product_badge = ?, status = 'SOLD_OUT', badge_expire_date = NULL
                    WHERE id = ?
                `, [newBadge, p.id]);

                console.log(`[만료] id=${p.id} "${p.name}" → SOLD_OUT (기존뱃지: ${p.product_badge} → ${newBadge || 'NULL'})`);
            }
            console.log(`총 ${expired.length}개 상품 만료 처리 완료`);
        }
    } catch (err) {
        console.error('에러:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
