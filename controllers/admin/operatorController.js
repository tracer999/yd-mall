const pool = require('../../config/db');
const bcrypt = require('bcrypt');

exports.getList = async (req, res) => {
    try {
        const [operators] = await pool.query('SELECT id, username, role, created_at FROM admins ORDER BY created_at DESC');
        res.render('admin/operators/list', {
            layout: 'layouts/admin_layout',
            title: '운영자 관리',
            operators
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getForm = async (req, res) => {
    const id = req.query.id;
    let operator = null;

    if (id) {
        try {
            const [rows] = await pool.query('SELECT id, username, email, use_2fa, role FROM admins WHERE id = ?', [id]);
            operator = rows[0];
        } catch (err) {
            console.error(err);
            return res.status(500).send('Server Error');
        }
    }

    res.render('admin/operators/form', {
        layout: 'layouts/admin_layout',
        title: operator ? '운영자 수정' : '운영자 등록',
        operator,
        isEdit: !!operator
    });
};

exports.postAdd = async (req, res) => {
    const { username, email, password, password_confirm, role, use_2fa } = req.body;

    // Basic Validation
    if (!username || !password || !role) {
        return res.status(400).send('모든 필수 항목을 입력하세요.');
    }
    if (password !== password_confirm) {
        return res.status(400).send('비밀번호가 일치하지 않습니다.');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const emailVal = (email && String(email).trim()) || null;
        const use2fa = (use_2fa === 'on' || use_2fa === '1' || use_2fa === true) ? 1 : 0;
        await pool.query('INSERT INTO admins (username, email, use_2fa, password, role) VALUES (?, ?, ?, ?, ?)', [username, emailVal, use2fa, hashedPassword, role]);
        res.redirect('/admin/operators');
    } catch (err) {
        console.error(err);
        // Duplicate entry check
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).send('Username already exists');
        }
        res.status(500).send('Server Error');
    }
};

exports.postEdit = async (req, res) => {
    const { id, username, email, password, password_confirm, role, use_2fa } = req.body;

    // 비밀번호 변경 시 일치 여부 확인
    if (password && password.trim() !== '') {
        if (password !== password_confirm) {
            return res.status(400).send('비밀번호가 일치하지 않습니다.');
        }
    }

    try {
        const emailVal = (email && String(email).trim()) || null;
        const use2fa = (use_2fa === 'on' || use_2fa === '1' || use_2fa === true) ? 1 : 0;
        let query = 'UPDATE admins SET username = ?, email = ?, use_2fa = ?, role = ?';
        let params = [username, emailVal, use2fa, role];

        // Update password only if provided
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await pool.query(query, params);
        res.redirect('/admin/operators');
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).send('Username already exists');
        }
        res.status(500).send('Server Error');
    }
};

exports.deleteOperator = async (req, res) => {
    const { id } = req.body; // or params, assuming form post with hidden id or fetch

    // Prevent deleting self? (Optional safety)
    if (req.session.admin && req.session.admin.id == id) {
        // Ideally show error message, for now just redirect
        console.log('Cannot delete self');
        return res.redirect('/admin/operators');
    }

    try {
        await pool.query('DELETE FROM admins WHERE id = ?', [id]);
        res.redirect('/admin/operators');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
