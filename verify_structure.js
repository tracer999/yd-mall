const pool = require('./config/db');

async function verify() {
    try {
        console.log('Verifying Product Structure Changes...');

        // 1. Check columns
        const [columns] = await pool.query('SHOW COLUMNS FROM products LIKE "short_description"');
        if (columns.length > 0) {
            console.log('PASS: short_description column exists.');
        } else {
            console.error('FAIL: short_description column MISSING.');
        }

        // 2. Check product_themes table
        const [tables] = await pool.query('SHOW TABLES LIKE "product_themes"');
        if (tables.length > 0) {
            console.log('PASS: product_themes table exists.');
        } else {
            console.error('FAIL: product_themes table MISSING.');
        }

        // 3. Test Insert (Simulating Controller Logic)
        const testName = 'Test Product ' + Date.now();
        const [res] = await pool.query(`
            INSERT INTO products (name, price, short_description) VALUES (?, 1000, 'Short Desc Test')
        `, [testName]);
        const newId = res.insertId;
        console.log(`Created test product ID: ${newId}`);

        // 4. Test Theme Insert
        // Assuming category ID 1 exists (usually does)
        try {
            await pool.query('INSERT INTO product_themes (product_id, category_id) VALUES (?, 1)', [newId]);
            console.log('PASS: Inserted into product_themes.');
        } catch (e) {
            console.error('FAIL: Insert into product_themes failed:', e.message);
        }

        // 5. Cleanup
        await pool.query('DELETE FROM products WHERE id = ?', [newId]);
        console.log('Cleanup done.');

        process.exit(0);
    } catch (err) {
        console.error('Verification failed:', err);
        process.exit(1);
    }
}

verify();
