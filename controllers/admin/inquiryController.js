const pool = require('../../config/db');

exports.getList = async (req, res) => {
    try {
        const [inquiries] = await pool.query(`
            SELECT i.*, u.name as user_name, u.email as user_email 
            FROM inquiries i 
            JOIN users u ON i.user_id = u.id 
            ORDER BY i.created_at DESC
        `);
        
        res.render('admin/inquiries/list', {
            title: '문의 관리',
            inquiries,
            path: '/admin/inquiries',
            layout: 'layouts/admin_layout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    const id = req.params.id;
    try {
        const [rows] = await pool.query(`
            SELECT i.*, u.name as user_name, u.email as user_email 
            FROM inquiries i 
            JOIN users u ON i.user_id = u.id 
            WHERE i.id = ?
        `, [id]);
        
        if (rows.length === 0) return res.redirect('/admin/inquiries');

        res.render('admin/inquiries/detail', {
            title: '문의 상세',
            inquiry: rows[0],
            path: '/admin/inquiries',
            layout: 'layouts/admin_layout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.postAnswer = async (req, res) => {
    const id = req.params.id;
    const { answer } = req.body;
    
    try {
        await pool.query('UPDATE inquiries SET answer = ?, is_answered = 1, answered_at = NOW() WHERE id = ?', [answer, id]);
        res.redirect(`/admin/inquiries/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
