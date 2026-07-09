require('../config/env');
const pool = require('../config/db');

async function migrate() {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query(`
            ALTER TABLE policy_versions
            MODIFY COLUMN content MEDIUMTEXT COLLATE utf8mb4_general_ci NOT NULL COMMENT '약관 내용'
        `);

        await connection.query(`
            ALTER TABLE site_settings
            MODIFY COLUMN terms_of_service MEDIUMTEXT COLLATE utf8mb4_general_ci NULL COMMENT '이용약관',
            MODIFY COLUMN privacy_policy MEDIUMTEXT COLLATE utf8mb4_general_ci NULL COMMENT '개인정보 처리방침'
        `);

        await connection.commit();
        console.log('Migration complete: policy/site_settings columns are MEDIUMTEXT.');
    } catch (err) {
        await connection.rollback();
        console.error('Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        connection.release();
        await pool.end();
    }
}

migrate();
