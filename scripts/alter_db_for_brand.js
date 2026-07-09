const pool = require('../config/db');

async function alterDb() {
    try {
        console.log('Adding logo_image_path to categories...');
        await pool.query('ALTER TABLE categories ADD COLUMN logo_image_path VARCHAR(255) DEFAULT NULL COMMENT \'브랜드 로고 이미지 실제 접근 경로 / URL\'');

        console.log('Updating banner_type enum in banners...');
        // Alter enum to include BRAND
        await pool.query('ALTER TABLE banners MODIFY COLUMN banner_type ENUM(\'MAIN\',\'CATEGORY\',\'POPUP\',\'BRAND\') DEFAULT \'MAIN\' COMMENT \'배너 타입 (메인/카테고리/팝업/브랜드)\'');

        console.log('DB Altered successfully.');
    } catch (err) {
        console.error('Error altering DB:', err);
    } finally {
        process.exit(0);
    }
}

alterDb();
