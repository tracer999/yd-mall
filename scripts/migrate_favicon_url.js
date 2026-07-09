require('../config/env');
const pool = require('../config/db');

async function migrate() {
    const connection = await pool.getConnection();
    try {
        console.log('[migrate_favicon_url] started');
        await connection.beginTransaction();

        const [columns] = await connection.query("SHOW COLUMNS FROM site_settings LIKE 'favicon_url'");
        if (columns.length === 0) {
            await connection.query(
                `ALTER TABLE site_settings
                 ADD COLUMN favicon_url VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL
                 COMMENT '파비콘 URL'
                 AFTER logo_url`
            );
            console.log('[migrate_favicon_url] added column favicon_url');
        } else {
            console.log('[migrate_favicon_url] column already exists');
        }

        await connection.commit();
        console.log('[migrate_favicon_url] done');
    } catch (err) {
        await connection.rollback();
        console.error('[migrate_favicon_url] failed:', err.message);
        process.exitCode = 1;
    } finally {
        connection.release();
        await pool.end();
    }
}

migrate();
