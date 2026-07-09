const pool = require('./config/db');

async function migrate() {
    try {
        console.log('Migrating Banner Structure...');

        console.log('Modifying banner_type column...');
        await pool.query(`
            ALTER TABLE banners
            MODIFY COLUMN banner_type ENUM('MAIN','CATEGORY','POPUP') NULL DEFAULT 'MAIN' COMMENT '배너 타입 (메인/카테고리/팝업)'
        `);
        console.log('PASS: banner_type column updated.');

        const [mobileImageColumnRows] = await pool.query(`
            SELECT COUNT(*) AS count
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'banners'
              AND COLUMN_NAME = 'mobile_image_url'
        `);

        if (!mobileImageColumnRows[0].count) {
            console.log('Adding mobile_image_url column...');
            await pool.query(`
                ALTER TABLE banners
                ADD COLUMN mobile_image_url VARCHAR(255) NULL COMMENT '모바일 배너 이미지 URL' AFTER image_url
            `);
            console.log('PASS: mobile_image_url column added.');
        } else {
            console.log('SKIP: mobile_image_url column already exists.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
