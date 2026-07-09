const pool = require('../../config/db');

function handlePolicyError(err, res) {
    if (err && err.code === 'ER_DATA_TOO_LONG') {
        return res.status(400).send('약관 내용이 너무 깁니다. 관리자에게 문의하세요.');
    }
    return res.status(500).send('Server Error');
}


// List all versions
exports.getPolicies = async (req, res) => {
    try {
        const [termsVersions] = await pool.query('SELECT * FROM policy_versions WHERE type = "TERMS" ORDER BY created_at DESC');
        const [privacyVersions] = await pool.query('SELECT * FROM policy_versions WHERE type = "PRIVACY" ORDER BY created_at DESC');

        res.render('admin/policies/list', {
            layout: 'layouts/admin_layout',
            title: '약관 및 정책 관리',
            termsVersions,
            privacyVersions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// View single policy version detail
exports.getPolicyDetail = async (req, res) => {
    const id = req.params.id;
    try {
        const [rows] = await pool.query('SELECT * FROM policy_versions WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Policy not found');
        }
        const policy = rows[0];

        res.render('admin/policies/detail', {
            layout: 'layouts/admin_layout',
            title: '약관/정책 상세 보기',
            policy
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Show create form
exports.createPolicyForm = (req, res) => {
    res.render('admin/policies/create', {
        layout: 'layouts/admin_layout',
        title: '새 약관 등록',
        tinymceKey: process.env.TINYMCE_KEY
    });
};

// Edit form for existing policy
exports.editPolicyForm = async (req, res) => {
    const id = req.params.id;
    try {
        const [rows] = await pool.query('SELECT * FROM policy_versions WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Policy not found');
        }
        const policy = rows[0];

        res.render('admin/policies/edit', {
            layout: 'layouts/admin_layout',
            title: '약관/정책 수정',
            policy,
            tinymceKey: process.env.TINYMCE_KEY
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Create new version
exports.createPolicy = async (req, res) => {
    const { type, version, effective_date, content, is_active } = req.body;
    const activeFlag = is_active === 'on' ? 1 : 0;

    const connection = await pool.getConnection(); // Use transaction for safe activation switch
    try {
        await connection.beginTransaction();

        // If new one is active, deactivate others of same type
        if (activeFlag) {
            await connection.query('UPDATE policy_versions SET is_active = 0 WHERE type = ?', [type]);
        }

        await connection.query(`
            INSERT INTO policy_versions (type, version, effective_date, content, is_active)
            VALUES (?, ?, ?, ?, ?)
        `, [type, version, effective_date, content, activeFlag]);

        // Also update the legacy site_settings table for backward compatibility if needed, 
        // OR we just switch frontend to look at active version.
        // For now, let's keep site_settings in sync for the user-facing pages if they still use it.
        // Or assume we will update user-facing logic later. 
        // Let's create an implicit syncing:
        if (activeFlag) {
            const field = type === 'TERMS' ? 'terms_of_service' : 'privacy_policy';
            await connection.query(`UPDATE site_settings SET ${field} = ? WHERE id = 1`, [content]);
        }

        await connection.commit();
        res.redirect('/admin/policies');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        handlePolicyError(err, res);
    } finally {
        connection.release();
    }
};

// Update existing policy version (content, version name, effective date)
exports.updatePolicy = async (req, res) => {
    const id = req.params.id;
    const { version, effective_date, content } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query('SELECT * FROM policy_versions WHERE id = ?', [id]);
        if (rows.length === 0) {
            throw new Error('Policy not found');
        }
        const policy = rows[0];

        await connection.query(
            'UPDATE policy_versions SET version = ?, effective_date = ?, content = ? WHERE id = ?',
            [version, effective_date, content, id]
        );

        // If this version is active, keep site_settings in sync
        if (policy.is_active) {
            const field = policy.type === 'TERMS' ? 'terms_of_service' : 'privacy_policy';
            await connection.query(`UPDATE site_settings SET ${field} = ? WHERE id = 1`, [content]);
        }

        await connection.commit();
        res.redirect('/admin/policies');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        handlePolicyError(err, res);
    } finally {
        connection.release();
    }
};

// Activate specific version
exports.activatePolicy = async (req, res) => {
    const id = req.params.id;
    const type = req.body.type; // Passed from hidden input or determined by querying ID first. 
    // To be safe, let's query the type first.

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query('SELECT type, content FROM policy_versions WHERE id = ?', [id]);
        if (rows.length === 0) {
            throw new Error('Policy not found');
        }
        const policy = rows[0];

        // Deactivate all of this type
        await connection.query('UPDATE policy_versions SET is_active = 0 WHERE type = ?', [policy.type]);

        // Activate target
        await connection.query('UPDATE policy_versions SET is_active = 1 WHERE id = ?', [id]);

        // Sync legacy site_settings
        const field = policy.type === 'TERMS' ? 'terms_of_service' : 'privacy_policy';
        await connection.query(`UPDATE site_settings SET ${field} = ? WHERE id = 1`, [policy.content]);

        await connection.commit();
        res.redirect('/admin/policies');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server Error');
    } finally {
        connection.release();
    }
};
