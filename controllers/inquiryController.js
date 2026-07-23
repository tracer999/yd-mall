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
    // 상품 상세의 [문의하기] 에서 넘어오면 제목이 채워져 있다. 손님이 상품명을 다시 적지 않게 한다.
    // 값은 그대로 폼에 들어가므로 길이만 자른다(inquiries.title 은 varchar(100)).
    const subject = String(req.query.subject || '').slice(0, 100);
    res.render('user/inquiries/form', { title: '문의 작성', subject });
};

exports.postInquiry = async (req, res) => {
    const { title, content } = req.body;
    if (!req.user) return res.status(401).send('Login Required');

    try {
        // 손님이 문의를 넣은 몰을 기록한다(관리자 몰별 조회 필터용). req.mallId 는 mallContext 가 주입.
        await pool.query('INSERT INTO inquiries (user_id, mall_id, title, content) VALUES (?, ?, ?, ?)',
            [req.user.id, req.mallId || 1, title, content]);
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
