require('../config/env');
const pool = require('../config/db');

async function migrate() {
    const connection = await pool.getConnection();
    try {
        console.log('[migrate_kakao_share_image] started');
        await connection.beginTransaction();

        const [columns] = await connection.query("SHOW COLUMNS FROM site_settings LIKE 'kakao_share_image_url'");
        if (columns.length === 0) {
            await connection.query(
                `ALTER TABLE site_settings
                 ADD COLUMN kakao_share_image_url VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL
                 COMMENT '카카오/OG 기본 공유 이미지 URL'
                 AFTER kakao_channel_url`
            );
            console.log('[migrate_kakao_share_image] added column kakao_share_image_url');
        } else {
            console.log('[migrate_kakao_share_image] column already exists');
        }

        await connection.commit();
        console.log('[migrate_kakao_share_image] done');
    } catch (err) {
        await connection.rollback();
        console.error('[migrate_kakao_share_image] failed:', err.message);
        process.exitCode = 1;
    } finally {
        connection.release();
        await pool.end();
    }
}

migrate();
