const pool = require('../config/db');

exports.getList = async (req, res) => {
    if (!req.user) return res.redirect('/auth/login');
    
    try {
        const [inquiries] = await pool.query('SELECT * FROM inquiries WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.render('user/inquiries/list', {
            title: '1:1 문의',
            inquiries
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getForm = (req, res) => {
    if (!req.user) return res.redirect('/auth/login');
    res.render('user/inquiries/form', { title: '문의 작성' });
};

exports.postInquiry = async (req, res) => {
    const { title, content } = req.body;
    if (!req.user) return res.status(401).send('Login Required');

    try {
        await pool.query('INSERT INTO inquiries (user_id, title, content) VALUES (?, ?, ?)', 
            [req.user.id, title, content]);
        res.redirect('/inquiries');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.getDetail = async (req, res) => {
    if (!req.user) return res.redirect('/auth/login');
    const id = req.params.id;

    try {
        const [rows] = await pool.query('SELECT * FROM inquiries WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (rows.length === 0) return res.redirect('/inquiries');

        res.render('user/inquiries/detail', {
            title: '문의 내역',
            inquiry: rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
